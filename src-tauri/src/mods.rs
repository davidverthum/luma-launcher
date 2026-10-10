//! Player-facing customization that sits on top of the pinned modpack: local jars the
//! player drops in themselves, shader packs, and the performance presets that tie render
//! settings + shaders together. Never touches the pack's own mods — `game::sync_mods`
//! still owns those.
use crate::game::{self, Modpack, ShaderFile};
use serde::Serialize;
use std::{collections::BTreeMap, fs, path::Path};

// ── local mods ───────────────────────────────────────────────────────────

/// Fabric only loads `*.jar`; a player's mod is switched off by renaming it to `*.jar.disabled`.
const DISABLED: &str = ".disabled";

#[derive(Serialize)]
pub struct LocalMod {
    /// The jar's name without `.disabled` — the id the UI uses for every action.
    file: String,
    enabled: bool,
}

/// Mods in `mods/` that aren't part of the pinned pack — the ones the player added, on or off.
pub fn list_local(pack: &Modpack, instance: &Path) -> Result<Vec<LocalMod>, String> {
    let known: std::collections::HashSet<&str> = pack.mods.iter().map(|m| m.file.as_str()).collect();
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(instance.join("mods")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let (file, enabled) = match name.strip_suffix(DISABLED) {
                Some(jar) => (jar.to_string(), false),
                None => (name, true),
            };
            if file.ends_with(".jar") && !known.contains(file.as_str()) {
                out.push(LocalMod { file, enabled });
            }
        }
    }
    out.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
    Ok(out)
}

/// The player's mods that the game will actually load (for the crash helper's suspects).
pub fn enabled_local_jars(pack: &Modpack, instance: &Path) -> Vec<String> {
    list_local(pack, instance).map(|l| l.into_iter().filter(|m| m.enabled).map(|m| m.file).collect()).unwrap_or_default()
}

/// A bare jar name from the UI, never a path and never one of the pack's own mods.
fn local_name<'a>(pack: &Modpack, file: &'a str) -> Result<&'a str, String> {
    if file.is_empty() || file.contains(['/', '\\', ':']) || file.contains("..") || !file.ends_with(".jar") {
        return Err("неверное имя мода".into());
    }
    if pack.mods.iter().any(|m| m.file == file) {
        return Err("это мод сборки — его снимают обновлением сборки, не отсюда".into());
    }
    Ok(file)
}

/// Switches a player's mod on or off without deleting it.
pub fn set_local_enabled(pack: &Modpack, instance: &Path, file: &str, enabled: bool) -> Result<(), String> {
    let file = local_name(pack, file)?;
    let on = instance.join("mods").join(file);
    let off = instance.join("mods").join(format!("{file}{DISABLED}"));
    let (from, to) = if enabled { (off, on) } else { (on, off) };
    if !from.exists() {
        return if to.exists() { Ok(()) } else { Err("мод не найден — возможно, его уже убрали".into()) };
    }
    fs::rename(&from, &to).map_err(|e| format!("{file}: {e}"))
}

/// Copies a jar the player picked (file dialog or drag-drop) into `mods/`.
pub fn add_local(instance: &Path, src: &Path) -> Result<String, String> {
    let name = src.file_name().ok_or("пустое имя файла")?.to_string_lossy().into_owned();
    if !name.to_lowercase().ends_with(".jar") {
        return Err("это не .jar — выбери файл мода".into());
    }
    let dest = instance.join("mods").join(&name);
    fs::create_dir_all(instance.join("mods")).map_err(|e| e.to_string())?;
    fs::copy(src, &dest).map_err(|e| format!("{name}: {e}"))?;
    Ok(name)
}

/// Removes a player-added jar, on or off. Refuses to touch a pack mod, even if asked — `sync_mods` owns those.
pub fn remove_local(pack: &Modpack, instance: &Path, filename: &str) -> Result<(), String> {
    let filename = local_name(pack, filename)?;
    for path in [instance.join("mods").join(filename), instance.join("mods").join(format!("{filename}{DISABLED}"))] {
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

// ── Modrinth cards ───────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ModCard {
    title: String,
    description: String,
    icon: Option<String>,
    url: String,
}

#[derive(Serialize, Default)]
pub struct ModCards {
    /// Pack mod slug → card.
    pack: BTreeMap<String, ModCard>,
    /// Player mod file → card, for the jars Modrinth recognises by hash.
    local: BTreeMap<String, ModCard>,
}

const MODRINTH: &str = "https://api.modrinth.com/v2";

fn card(p: &serde_json::Value) -> Option<(String, String, ModCard)> {
    let id = p["id"].as_str()?.to_string();
    let slug = p["slug"].as_str()?.to_string();
    let kind = p["project_type"].as_str().unwrap_or("mod");
    Some((id, slug.clone(), ModCard {
        title: p["title"].as_str().unwrap_or(&slug).to_string(),
        description: p["description"].as_str().unwrap_or("").to_string(),
        icon: p["icon_url"].as_str().filter(|u| !u.is_empty()).map(str::to_string),
        url: format!("https://modrinth.com/{kind}/{slug}"),
    }))
}

async fn projects(client: &reqwest::Client, ids: &[String]) -> Result<Vec<serde_json::Value>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let list = serde_json::to_string(ids).map_err(|e| e.to_string())?;
    let url = tauri::Url::parse_with_params(&format!("{MODRINTH}/projects"), &[("ids", list)]).map_err(|e| e.to_string())?;
    client.get(url).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())
}

/// Titles, descriptions and icons from Modrinth: the pack's mods by slug, the player's own jars
/// by file hash (so even a renamed jar is recognised). Best effort — what Modrinth doesn't know
/// stays a plain file name in the UI.
pub async fn cards(client: &reqwest::Client, pack: &Modpack, instance: &Path) -> Result<ModCards, String> {
    let mut out = ModCards::default();
    let slugs: Vec<String> = pack.mods.iter().map(|m| m.slug.clone()).collect();
    for p in projects(client, &slugs).await? {
        if let Some((_, slug, c)) = card(&p) {
            out.pack.insert(slug, c);
        }
    }

    // Local jars: sha512 → Modrinth version → project.
    let mut by_hash: BTreeMap<String, String> = BTreeMap::new();
    for m in list_local(pack, instance)? {
        let path = instance.join("mods").join(if m.enabled { m.file.clone() } else { format!("{}{DISABLED}", m.file) });
        if let Some(h) = game::file_sha512(&path) {
            by_hash.insert(h, m.file);
        }
    }
    if by_hash.is_empty() {
        return Ok(out);
    }
    let versions: serde_json::Value = client
        .post(format!("{MODRINTH}/version_files"))
        .json(&serde_json::json!({ "hashes": by_hash.keys().collect::<Vec<_>>(), "algorithm": "sha512" }))
        .send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let mut file_of_project: BTreeMap<String, String> = BTreeMap::new();
    if let Some(map) = versions.as_object() {
        for (hash, v) in map {
            if let (Some(project), Some(file)) = (v["project_id"].as_str(), by_hash.get(hash)) {
                file_of_project.insert(project.to_string(), file.clone());
            }
        }
    }
    let ids: Vec<String> = file_of_project.keys().cloned().collect();
    for p in projects(client, &ids).await? {
        if let Some((id, _, c)) = card(&p) {
            if let Some(file) = file_of_project.get(&id) {
                out.local.insert(file.clone(), c);
            }
        }
    }
    Ok(out)
}

// ── shaders ──────────────────────────────────────────────────────────────

/// Downloads the shader pack if it isn't already cached, verified by sha512.
async fn ensure_shader(client: &reqwest::Client, instance: &Path, shader: &ShaderFile) -> Result<(), String> {
    let dest = instance.join("shaderpacks").join(&shader.file);
    if game::file_sha512(&dest).as_deref() == Some(shader.sha512.as_str()) {
        return Ok(());
    }
    let bytes = client.get(&shader.url).send().await.map_err(|e| e.to_string())?
        .error_for_status().map_err(|e| e.to_string())?
        .bytes().await.map_err(|e| e.to_string())?;
    if game::sha512_hex(&bytes) != shader.sha512 {
        return Err(format!("{}: файл повреждён при загрузке", shader.name));
    }
    game::write_atomic(&dest, &bytes)
}

/// `None` turns shaders off (keeps the pack downloaded for next time); `Some(slug)` downloads
/// it if needed and switches Iris to it.
pub async fn set_shader(client: &reqwest::Client, pack: &Modpack, instance: &Path, slug: Option<&str>) -> Result<(), String> {
    let path = instance.join("config").join("iris.properties");
    let mut props = read_properties(&path);
    match slug {
        None => {
            props.insert("enableShaders".into(), "false".into());
        }
        Some(slug) => {
            let shader = pack.shaders.iter().find(|s| s.slug == slug).ok_or("неизвестный шейдерпак")?;
            ensure_shader(client, instance, shader).await?;
            props.insert("enableShaders".into(), "true".into());
            props.insert("shaderPack".into(), shader.file.clone());
        }
    }
    write_properties(&path, &props)
}

// ── performance presets ─────────────────────────────────────────────────

/// Render-affecting `options.txt` keys for each preset; `None` means "don't touch this key".
fn preset_options(preset: &str) -> Result<Vec<(&'static str, &'static str)>, String> {
    Ok(match preset {
        "low" => vec![
            ("renderDistance", "6"), ("simulationDistance", "5"), ("particles", "2"),
            ("graphicsMode", "0"), ("ao", "0"), ("maxFps", "60"), ("entityShadows", "false"),
        ],
        "medium" => vec![
            ("renderDistance", "10"), ("simulationDistance", "8"), ("particles", "1"),
            ("graphicsMode", "1"), ("ao", "1"), ("maxFps", "120"), ("entityShadows", "true"),
        ],
        "high" => vec![
            ("renderDistance", "16"), ("simulationDistance", "10"), ("particles", "0"),
            ("graphicsMode", "2"), ("ao", "2"), ("maxFps", "260"), ("entityShadows", "true"),
        ],
        other => return Err(format!("неизвестный пресет {other}")),
    })
}

/// low | medium | high — sets render/simulation distance, particles, AO and fps cap together.
/// Shaders are left as the player set them; `high` just makes sure a shader is picked if none is.
pub async fn apply_preset(client: &reqwest::Client, pack: &Modpack, instance: &Path, preset: &str) -> Result<(), String> {
    let options_path = instance.join("options.txt");
    let mut options = read_options(&options_path);
    for (k, v) in preset_options(preset)? {
        options.insert(k.to_string(), v.to_string());
    }
    write_options(&options_path, &options)?;

    if preset == "high" {
        let props = read_properties(&instance.join("config").join("iris.properties"));
        if props.get("enableShaders").map(String::as_str) != Some("true") {
            if let Some(balanced) = pack.shaders.iter().find(|s| s.tier == "balanced") {
                set_shader(client, pack, instance, Some(&balanced.slug)).await?;
            }
        }
    } else if preset == "low" {
        set_shader(client, pack, instance, None).await?;
    }
    Ok(())
}

// ── tiny key=value file helpers (java .properties and options.txt share the shape) ──────

fn read_properties(path: &Path) -> BTreeMap<String, String> {
    parse_kv(&fs::read_to_string(path).unwrap_or_default(), '=')
}

fn write_properties(path: &Path, map: &BTreeMap<String, String>) -> Result<(), String> {
    write_kv(path, map, '=')
}

/// `options.txt` uses `key:value`, one per line, no particular order the game cares about.
fn read_options(path: &Path) -> BTreeMap<String, String> {
    parse_kv(&fs::read_to_string(path).unwrap_or_default(), ':')
}

fn write_options(path: &Path, map: &BTreeMap<String, String>) -> Result<(), String> {
    write_kv(path, map, ':')
}

fn parse_kv(text: &str, sep: char) -> BTreeMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (k, v) = line.split_once(sep)?;
            Some((k.trim().to_string(), v.trim().to_string()))
        })
        .collect()
}

fn write_kv(path: &Path, map: &BTreeMap<String, String>, sep: char) -> Result<(), String> {
    let body = map.iter().map(|(k, v)| format!("{k}{sep}{v}\n")).collect::<String>();
    game::write_atomic(path, body.as_bytes())
}
