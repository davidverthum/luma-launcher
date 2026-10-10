//! Direct Minecraft launch: just enough of the official launcher's job — version
//! resolution, libraries, assets, classpath, process — to start the game ourselves with
//! an Ely.by session instead of a Microsoft one. Shares `versions/`, `libraries/` and
//! `assets/` with the official launcher; never touches its `launcher_profiles.json`.
use crate::elyby::Session;
use crate::game::{self, Modpack};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tauri::{AppHandle, Emitter, Manager};

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const INJECTOR_RELEASE_API: &str = "https://api.github.com/repos/yushijinhun/authlib-injector/releases/latest";
const JAVA_RUNTIME_MANIFEST_URL: &str = "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

fn os_name() -> &'static str {
    if cfg!(target_os = "macos") { "osx" } else if cfg!(target_os = "windows") { "windows" } else { "linux" }
}
fn os_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") { "arm64" } else if cfg!(target_arch = "x86") { "x86" } else { "x86_64" }
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn file_sha1(path: &Path) -> Option<String> {
    fs::read(path).ok().map(|b| sha1_hex(&b))
}

/// Mojang's rule format (`{action, os?}`) and the argument-list format (`{action, os?, features?}`)
/// share the same evaluation: last matching rule wins; we never satisfy a `features` requirement.
fn rule_matches(rule: &Value) -> bool {
    if let Some(features) = rule.get("features").and_then(|f| f.as_object()) {
        if features.values().any(|v| v.as_bool() == Some(true)) {
            return false;
        }
    }
    if let Some(os) = rule.get("os") {
        let name_ok = os.get("name").and_then(|v| v.as_str()).map(|n| n == os_name()).unwrap_or(true);
        let arch_ok = os.get("arch").and_then(|v| v.as_str()).map(|a| a == os_arch()).unwrap_or(true);
        if !(name_ok && arch_ok) {
            return false;
        }
    }
    true
}

fn allowed_by_rules(rules: Option<&Vec<Value>>) -> bool {
    match rules {
        None => true,
        Some(list) => {
            let mut allowed = false;
            for r in list {
                let action = r.get("action").and_then(|v| v.as_str()).unwrap_or("allow");
                if rule_matches(r) {
                    allowed = action == "allow";
                }
            }
            allowed
        }
    }
}

fn rules_of(v: &Value) -> Option<Vec<Value>> {
    v.get("rules").and_then(|r| r.as_array()).cloned()
}

// ── version resolution ──────────────────────────────────────────────────────

async fn fetch_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    client.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
        .json::<Value>().await.map_err(|e| e.to_string())
}

/// Vanilla version JSON, cached under `versions/<id>/<id>.json` — the same place the
/// official launcher keeps it, so both ever only fetch it once.
async fn vanilla_version(client: &reqwest::Client, mc: &Path, version: &str) -> Result<Value, String> {
    let path = mc.join("versions").join(version).join(format!("{version}.json"));
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
            return Ok(v);
        }
    }
    let manifest = fetch_json(client, MANIFEST_URL).await?;
    let entry_url = manifest["versions"].as_array().and_then(|list| {
        list.iter().find(|e| e["id"] == version).and_then(|e| e["url"].as_str())
    }).ok_or_else(|| format!("версия {version} не найдена в манифесте Mojang"))?.to_string();
    let v = fetch_json(client, &entry_url).await?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::to_vec_pretty(&v).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(v)
}

/// Merges the Fabric child profile (from `modpack.json`) onto the vanilla parent, the way
/// `inheritsFrom` works in the real launcher: child libraries/args are added on top, child
/// overrides win for scalar fields.
fn merge_fabric(vanilla: &Value, fabric: &Value) -> Value {
    let mut libs = fabric["libraries"].as_array().cloned().unwrap_or_default();
    libs.extend(vanilla["libraries"].as_array().cloned().unwrap_or_default());

    let merge_args = |key: &str| -> Value {
        let mut a = vanilla["arguments"][key].as_array().cloned().unwrap_or_default();
        a.extend(fabric["arguments"][key].as_array().cloned().unwrap_or_default());
        Value::Array(a)
    };

    json!({
        "id": fabric["id"].as_str().unwrap_or_else(|| vanilla["id"].as_str().unwrap_or("unknown")),
        "mainClass": fabric["mainClass"].as_str().or_else(|| vanilla["mainClass"].as_str()),
        "libraries": libs,
        "arguments": { "game": merge_args("game"), "jvm": merge_args("jvm") },
        "downloads": vanilla["downloads"].clone(),
        "assetIndex": vanilla["assetIndex"].clone(),
        "assets": vanilla["assets"].clone(),
        "javaVersion": vanilla["javaVersion"].clone(),
    })
}

// ── maven coordinates (Fabric's own libraries, which give a repo base, not a resolved URL) ──

fn maven_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    let (group, artifact, version) = (parts.first()?, parts.get(1)?, parts.get(2)?);
    let file = match parts.get(3) {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Some(format!("{}/{artifact}/{version}/{file}", group.replace('.', "/")))
}

struct DownloadSpec {
    rel_path: String,
    url: String,
    sha1: Option<String>,
}

fn resolve_library(lib: &Value) -> Option<DownloadSpec> {
    if !allowed_by_rules(rules_of(lib).as_ref()) {
        return None;
    }
    if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
        // Vanilla-style: fully resolved path + URL + checksum.
        return Some(DownloadSpec {
            rel_path: artifact["path"].as_str()?.to_string(),
            url: artifact["url"].as_str()?.to_string(),
            sha1: artifact["sha1"].as_str().map(str::to_string),
        });
    }
    // Fabric-style: `name` is a Maven coordinate, `url` is the repo base.
    let name = lib["name"].as_str()?;
    let base = lib["url"].as_str()?.trim_end_matches('/');
    let rel_path = maven_path(name)?;
    Some(DownloadSpec { url: format!("{base}/{rel_path}"), rel_path, sha1: lib["sha1"].as_str().map(str::to_string) })
}

async fn download_checked(client: &reqwest::Client, url: &str, dest: &Path, sha1: Option<&str>) -> Result<(), String> {
    if let Some(expected) = sha1 {
        if file_sha1(dest).as_deref() == Some(expected) {
            return Ok(());
        }
    } else if dest.exists() {
        return Ok(());
    }
    let bytes = client.get(url).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .bytes().await.map_err(|e| e.to_string())?;
    if let Some(expected) = sha1 {
        let got = sha1_hex(&bytes);
        if got != expected {
            return Err(format!("{url}: контрольная сумма не совпала"));
        }
    }
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = dest.with_extension("luma-tmp");
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

// ── progress (reuses the launcher's existing `luma://progress` event) ──────

fn emit(app: &AppHandle, stage: &'static str, done: usize, total: usize, current: &str) {
    let _ = app.emit("luma://progress", &game::Progress {
        stage, done_files: done, total_files: total, done_bytes: 0, total_bytes: 0, current: current.to_string(),
    });
}

async fn download_libraries(app: &AppHandle, client: &reqwest::Client, mc: &Path, libs: &[Value]) -> Result<Vec<PathBuf>, String> {
    let specs: Vec<DownloadSpec> = libs.iter().filter_map(resolve_library).collect();
    let mut paths = Vec::with_capacity(specs.len());
    for (i, spec) in specs.iter().enumerate() {
        emit(app, "libraries", i, specs.len(), &spec.rel_path);
        let dest = mc.join("libraries").join(&spec.rel_path);
        download_checked(client, &spec.url, &dest, spec.sha1.as_deref()).await
            .map_err(|e| format!("библиотека {}: {e}", spec.rel_path))?;
        paths.push(dest);
    }
    emit(app, "libraries", specs.len(), specs.len(), "");
    Ok(paths)
}

async fn download_client_jar(app: &AppHandle, client: &reqwest::Client, mc: &Path, merged: &Value) -> Result<PathBuf, String> {
    let id = merged["id"].as_str().unwrap_or("unknown");
    let dl = &merged["downloads"]["client"];
    let url = dl["url"].as_str().ok_or("в версии нет client.jar")?;
    let sha1 = dl["sha1"].as_str();
    // The vanilla id, not the Fabric child id — Fabric's profile has no own client jar.
    let vanilla_id = url.rsplit('/').nth(1).unwrap_or(id);
    let dest = mc.join("versions").join(vanilla_id).join(format!("{vanilla_id}.jar"));
    emit(app, "client", 0, 1, "client.jar");
    download_checked(client, url, &dest, sha1).await?;
    emit(app, "client", 1, 1, "client.jar");
    Ok(dest)
}

async fn download_assets(app: &AppHandle, client: &reqwest::Client, mc: &Path, merged: &Value) -> Result<(), String> {
    let index_url = merged["assetIndex"]["url"].as_str().ok_or("в версии нет assetIndex")?;
    let index_id = merged["assetIndex"]["id"].as_str().unwrap_or("legacy");
    let assets_dir = mc.join("assets");
    let index_path = assets_dir.join("indexes").join(format!("{index_id}.json"));
    let index: Value = match fs::read(&index_path).ok().and_then(|b| serde_json::from_slice(&b).ok()) {
        Some(v) => v,
        None => {
            let v = fetch_json(client, index_url).await?;
            fs::create_dir_all(index_path.parent().unwrap()).map_err(|e| e.to_string())?;
            fs::write(&index_path, serde_json::to_vec(&v).unwrap_or_default()).map_err(|e| e.to_string())?;
            v
        }
    };
    let objects = index["objects"].as_object().cloned().unwrap_or_default();
    let total = objects.len();
    for (i, (name, obj)) in objects.into_iter().enumerate() {
        if i % 25 == 0 || i + 1 == total {
            emit(app, "assets", i, total, &name);
        }
        let hash = obj["hash"].as_str().unwrap_or_default().to_string();
        if hash.len() < 2 {
            continue;
        }
        let dest = assets_dir.join("objects").join(&hash[..2]).join(&hash);
        let url = format!("https://resources.download.minecraft.net/{}/{hash}", &hash[..2]);
        download_checked(client, &url, &dest, Some(&hash)).await.map_err(|e| format!("ресурс {name}: {e}"))?;
    }
    Ok(())
}

async fn ensure_injector(client: &reqwest::Client, app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest = dir.join("authlib-injector.jar");
    if dest.exists() {
        return Ok(dest);
    }
    let release = fetch_json(client, INJECTOR_RELEASE_API).await.map_err(|e| format!("authlib-injector: {e}"))?;
    let asset_url = release["assets"].as_array()
        .and_then(|a| a.iter().find(|x| x["name"].as_str().map(|n| n.ends_with(".jar")).unwrap_or(false)))
        .and_then(|x| x["browser_download_url"].as_str())
        .ok_or("не нашли authlib-injector.jar в релизе GitHub")?;
    let bytes = client.get(asset_url).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(dest)
}

// ── Java runtime (Mojang's own managed JRE — the same one the official launcher uses, so
// players never need Java installed or JAVA_HOME set themselves) ──────────────────────────

fn java_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "mac-os-arm64" } else { "mac-os" }
    } else if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") { "windows-arm64" } else { "windows-x64" }
    } else if cfg!(target_arch = "x86") {
        "linux-i386"
    } else {
        "linux"
    }
}

/// The `java` binary's path relative to the runtime root — Mojang packages macOS as a
/// `.bundle`, everyone else flat under `bin/`.
fn java_binary_rel() -> &'static str {
    if cfg!(target_os = "macos") { "jre.bundle/Contents/Home/bin/java" } else if cfg!(target_os = "windows") { "bin/java.exe" } else { "bin/java" }
}

/// Downloads Mojang's managed JRE for `component` (e.g. `java-runtime-delta`, from the
/// version JSON's `javaVersion.component`) and returns the path to its `java` binary.
/// Cached under the app data dir; a no-op once already downloaded.
async fn ensure_java(client: &reqwest::Client, app: &AppHandle, component: &str) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("java").join(component);
    let java_bin = root.join(java_binary_rel());
    if java_bin.exists() {
        return Ok(java_bin);
    }
    emit(app, "java", 0, 1, "Mojang Java");
    let all = fetch_json(client, JAVA_RUNTIME_MANIFEST_URL).await.map_err(|e| format!("манифест Java: {e}"))?;
    let manifest_url = all[java_platform()][component][0]["manifest"]["url"].as_str()
        .ok_or_else(|| format!("нет рантайма Java {component} для {}", java_platform()))?.to_string();
    let manifest = fetch_json(client, &manifest_url).await.map_err(|e| format!("манифест Java: {e}"))?;
    let files = manifest["files"].as_object().cloned().ok_or("пустой манифест Java")?;
    let total = files.len();
    for (i, (rel, entry)) in files.iter().enumerate() {
        if i % 20 == 0 || i + 1 == total {
            emit(app, "java", i, total, rel);
        }
        let dest = root.join(rel);
        match entry["type"].as_str() {
            Some("directory") => {
                fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            }
            Some("file") => {
                let raw = &entry["downloads"]["raw"];
                let url = raw["url"].as_str().ok_or("файл Java без url")?;
                let sha1 = raw["sha1"].as_str();
                download_checked(client, url, &dest, sha1).await.map_err(|e| format!("java {rel}: {e}"))?;
                #[cfg(unix)]
                if entry["executable"].as_bool() == Some(true) {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(meta) = fs::metadata(&dest) {
                        let mut perm = meta.permissions();
                        perm.set_mode(perm.mode() | 0o111);
                        let _ = fs::set_permissions(&dest, perm);
                    }
                }
            }
            #[cfg(unix)]
            Some("link") => {
                if let Some(target) = entry["target"].as_str() {
                    if let Some(dir) = dest.parent() {
                        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                    }
                    let _ = fs::remove_file(&dest);
                    std::os::unix::fs::symlink(target, &dest).map_err(|e| format!("symlink {rel}: {e}"))?;
                }
            }
            _ => {}
        }
    }
    emit(app, "java", total, total, "");
    if !java_bin.exists() {
        return Err("скачали Java, но не нашли бинарник java — сообщи об этом".into());
    }
    Ok(java_bin)
}

// ── argument templating ─────────────────────────────────────────────────────

fn substitute(template: &str, map: &HashMap<&str, String>) -> String {
    let mut out = template.to_string();
    for (k, v) in map {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

fn collect_args(list: &Value, map: &HashMap<&str, String>) -> Vec<String> {
    let mut out = Vec::new();
    for item in list.as_array().unwrap_or(&Vec::new()) {
        if let Some(s) = item.as_str() {
            out.push(substitute(s, map));
            continue;
        }
        if !allowed_by_rules(rules_of(item).as_ref()) {
            continue;
        }
        match item.get("value") {
            Some(Value::String(s)) => out.push(substitute(s, map)),
            Some(Value::Array(arr)) => out.extend(arr.iter().filter_map(|v| v.as_str()).map(|s| substitute(s, map))),
            _ => {}
        }
    }
    out
}

fn classpath(libs: &[PathBuf], client_jar: &Path) -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = libs.iter().map(|p| p.display().to_string()).collect();
    parts.push(client_jar.display().to_string());
    parts.join(sep)
}

// ── entry point ──────────────────────────────────────────────────────────────

/// Downloads everything a direct launch needs — including Java itself, Mojang's own managed
/// runtime, so players never install anything — and starts the game, handing it an Ely.by
/// session through authlib-injector instead of a Microsoft login. Never blocks on the game
/// process — once it's spawned, this returns.
pub async fn play(app: &AppHandle, ram_gb: u32, session: &Session, instance: &Path) -> Result<(), String> {
    let client = game::http()?;
    let pack: &Modpack = game::modpack();

    emit(app, "version", 0, 1, pack.minecraft.as_str());
    let vanilla = vanilla_version(&client, &game::minecraft_dir(app)?, &pack.minecraft).await?;
    let merged = merge_fabric(&vanilla, &pack.profile);
    emit(app, "version", 1, 1, "");

    let java_component = merged["javaVersion"]["component"].as_str().unwrap_or("java-runtime-delta").to_string();
    let java_path = ensure_java(&client, app, &java_component).await?;

    let mc = game::minecraft_dir(app)?;
    let client_jar = download_client_jar(app, &client, &mc, &merged).await?;
    let lib_paths = download_libraries(app, &client, &mc, merged["libraries"].as_array().unwrap_or(&Vec::new())).await?;
    download_assets(app, &client, &mc, &merged).await?;
    let injector = ensure_injector(&client, app).await?;

    let natives = instance.join("natives");
    fs::create_dir_all(&natives).map_err(|e| e.to_string())?;
    let assets_root = mc.join("assets");
    let version_name = merged["id"].as_str().unwrap_or(&pack.minecraft).to_string();

    let mut map: HashMap<&str, String> = HashMap::new();
    map.insert("auth_player_name", session.selected_profile.name.clone());
    map.insert("version_name", version_name.clone());
    map.insert("game_directory", instance.display().to_string());
    map.insert("assets_root", assets_root.display().to_string());
    map.insert("assets_index_name", merged["assetIndex"]["id"].as_str().unwrap_or("legacy").to_string());
    map.insert("auth_uuid", session.selected_profile.id.clone());
    map.insert("auth_access_token", session.access_token.clone());
    map.insert("clientid", String::new());
    map.insert("auth_xuid", String::new());
    map.insert("user_type", "mojang".to_string());
    map.insert("version_type", "Luma".to_string());
    map.insert("natives_directory", natives.display().to_string());
    map.insert("launcher_name", "Luma".to_string());
    map.insert("launcher_version", env!("CARGO_PKG_VERSION").to_string());
    map.insert("classpath", classpath(&lib_paths, &client_jar));
    map.insert("classpath_separator", (if cfg!(windows) { ";" } else { ":" }).to_string());
    map.insert("library_directory", mc.join("libraries").display().to_string());

    let mut jvm_args = vec![format!("-javaagent:{}=ely.by", injector.display())];
    jvm_args.extend(collect_args(&merged["arguments"]["jvm"], &map));
    jvm_args.push(format!("-Xmx{}G", ram_gb.clamp(2, 32)));
    let game_args = collect_args(&merged["arguments"]["game"], &map);
    let main_class = merged["mainClass"].as_str().ok_or("в версии нет mainClass")?;

    emit(app, "launch", 0, 1, main_class);
    let log = fs::File::create(instance.join("luma-last-launch.log")).ok();
    let mut cmd = Command::new(java_path);
    cmd.current_dir(instance).args(&jvm_args).arg(main_class).args(&game_args);
    if let Some(f) = log.as_ref().and_then(|f| f.try_clone().ok()) {
        cmd.stdout(Stdio::from(f));
    }
    if let Some(f) = log {
        cmd.stderr(Stdio::from(f));
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let started = std::time::SystemTime::now();
    let mut child = cmd.spawn().map_err(|e| format!("не запустили java: {e}"))?;
    emit(app, "launch", 1, 1, "");

    // Watch the game from the side: a bad exit becomes `luma://game-crash` for the crash dialog.
    let (app, instance) = (app.clone(), instance.to_path_buf());
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        let local = crate::mods::enabled_local_jars(game::modpack(), &instance);
        if let Some(crash) = crate::crash::analyze(&instance, started, code, &local) {
            let _ = app.emit("luma://game-crash", &crash);
        }
    });
    Ok(())
}
