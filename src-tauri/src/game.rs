//! Getting a player into the Luma server: modpack sync, a Fabric profile in the official
//! Minecraft Launcher, the server in the multiplayer list, and opening the launcher.

use crate::nbt;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ModFile {
    pub slug: String,
    pub name: String,
    pub version: String,
    pub file: String,
    pub url: String,
    pub sha512: String,
    pub size: u64,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Loader {
    #[serde(rename = "type")]
    pub kind: String,
    pub version: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ServerInfo {
    pub name: String,
    pub address: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct AuthInfo {
    pub url: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ShaderFile {
    pub slug: String,
    pub name: String,
    /// light | balanced | heavy — maps to the performance presets.
    pub tier: String,
    pub version: String,
    pub file: String,
    pub url: String,
    pub sha512: String,
    pub size: u64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Modpack {
    pub name: String,
    pub minecraft: String,
    pub loader: Loader,
    pub server: ServerInfo,
    pub auth: AuthInfo,
    /// The Fabric loader version JSON, as meta.fabricmc.net serves it for the official launcher.
    pub profile: serde_json::Value,
    pub mods: Vec<ModFile>,
    pub shaders: Vec<ShaderFile>,
}

pub fn modpack() -> &'static Modpack {
    static PACK: OnceLock<Modpack> = OnceLock::new();
    PACK.get_or_init(|| serde_json::from_str(include_str!("../modpack.json")).expect("modpack.json"))
}

impl Modpack {
    pub fn version_id(&self) -> String {
        self.profile["id"].as_str().unwrap_or("fabric-loader").to_string()
    }
    pub fn total_bytes(&self) -> u64 {
        self.mods.iter().map(|m| m.size).sum()
    }
}

#[derive(Serialize, Clone)]
pub struct PackInfo {
    pub name: String,
    pub minecraft: String,
    pub loader: Loader,
    pub server: ServerInfo,
    pub mods: Vec<String>,
    pub total_mb: f64,
}

pub fn info() -> PackInfo {
    let p = modpack();
    PackInfo {
        name: p.name.clone(),
        minecraft: p.minecraft.clone(),
        loader: p.loader.clone(),
        server: p.server.clone(),
        mods: p.mods.iter().map(|m| m.name.clone()).collect(),
        total_mb: (p.total_bytes() as f64 / 1e6 * 10.0).round() / 10.0,
    }
}

// ── paths ────────────────────────────────────────────────────────────────

pub fn minecraft_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(if cfg!(target_os = "windows") {
        app.path().data_dir().map_err(|e| e.to_string())?.join(".minecraft")
    } else if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support").join("minecraft")
    } else {
        home.join(".minecraft")
    })
}

pub fn instance_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("instances").join("luma");
    fs::create_dir_all(dir.join("mods")).map_err(|e| e.to_string())?;
    Ok(dir)
}

// ── helpers ──────────────────────────────────────────────────────────────

pub fn sha512_hex(bytes: &[u8]) -> String {
    Sha512::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn file_sha512(path: &Path) -> Option<String> {
    fs::read(path).ok().map(|b| sha512_hex(&b))
}

/// Writes through a temp file so a crash never leaves half a jar or half a JSON.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("luma-tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("{}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("{}: {e}", path.display()))
}

/// ISO-8601 UTC timestamp, the format launcher_profiles.json uses.
pub fn iso_now() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

// ── mods ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct Progress {
    pub stage: &'static str,
    pub done_files: usize,
    pub total_files: usize,
    pub done_bytes: u64,
    pub total_bytes: u64,
    pub current: String,
}

#[derive(Serialize, Clone, Default)]
pub struct SyncReport {
    pub downloaded: usize,
    pub kept: usize,
    pub removed: usize,
    pub downloaded_mb: f64,
}

const STATE_FILE: &str = ".luma-mods.json";

#[derive(Deserialize, Serialize, Default)]
struct SyncState {
    files: Vec<String>,
}

pub fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("LumaLauncher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}

/// Brings `<instance>/mods` to exactly the modpack: verified downloads, nothing half-written,
/// and jars a previous Luma sync put there but the pack no longer lists are removed.
/// Jars the player added by hand are left alone.
pub async fn sync_mods(app: &AppHandle, pack: &Modpack, instance: &Path) -> Result<SyncReport, String> {
    let mods_dir = instance.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let state_path = instance.join(STATE_FILE);
    let previous: SyncState = fs::read(&state_path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();

    let total_bytes = pack.total_bytes();
    let mut progress = Progress { stage: "mods", done_files: 0, total_files: pack.mods.len(), done_bytes: 0, total_bytes, current: String::new() };
    let mut report = SyncReport::default();
    let client = http()?;

    for m in &pack.mods {
        progress.current = m.name.clone();
        let _ = app.emit("luma://progress", &progress);
        let path = mods_dir.join(&m.file);
        if file_sha512(&path).as_deref() == Some(m.sha512.as_str()) {
            report.kept += 1;
        } else {
            let fail = |e: reqwest::Error| {
                let why = if e.is_timeout() { "сервер с модами не ответил вовремя".to_string() } else if e.is_status() { format!("ответ {}", e.status().map(|s| s.as_u16()).unwrap_or(0)) } else { "нет соединения".to_string() };
                format!("{} не скачался: {why}. Проверь интернет и нажми «Играть» ещё раз. ({})", m.name, e.without_url())
            };
            let bytes = client
                .get(&m.url)
                .send()
                .await
                .and_then(|r| r.error_for_status())
                .map_err(fail)?
                .bytes()
                .await
                .map_err(fail)?;
            if sha512_hex(&bytes) != m.sha512 {
                return Err(format!("{}: файл повреждён при загрузке, попробуй ещё раз", m.name));
            }
            write_atomic(&path, &bytes)?;
            report.downloaded += 1;
            report.downloaded_mb += bytes.len() as f64 / 1e6;
        }
        progress.done_files += 1;
        progress.done_bytes += m.size;
        let _ = app.emit("luma://progress", &progress);
    }

    let current: Vec<String> = pack.mods.iter().map(|m| m.file.clone()).collect();
    for old in previous.files.iter().filter(|f| !current.contains(f)) {
        // Only plain file names we wrote ourselves; never follow paths out of the folder.
        if !old.contains('/') && !old.contains('\\') && fs::remove_file(mods_dir.join(old)).is_ok() {
            report.removed += 1;
        }
    }
    let body = serde_json::to_vec_pretty(&SyncState { files: current }).map_err(|e| e.to_string())?;
    write_atomic(&state_path, &body)?;
    report.downloaded_mb = (report.downloaded_mb * 10.0).round() / 10.0;
    Ok(report)
}

// ── official launcher profile ────────────────────────────────────────────

const ICON: &[u8] = include_bytes!("../icons/128x128.png");

pub fn java_args(ram_gb: u32) -> String {
    let ram = ram_gb.clamp(2, 32);
    format!(
        "-Xmx{ram}G -Xms{}G -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M",
        ram.min(2)
    )
}

/// Adds or refreshes the «Luma» profile; marks it last used so the launcher opens on it.
pub fn merge_profiles(existing: Option<&[u8]>, version_id: &str, game_dir: &Path, ram_gb: u32, now: &str) -> Vec<u8> {
    let mut root: serde_json::Value = existing
        .and_then(|b| serde_json::from_slice(b).ok())
        .filter(|v: &serde_json::Value| v.is_object())
        .unwrap_or_else(|| serde_json::json!({ "profiles": {}, "settings": {}, "version": 3 }));
    if !root["profiles"].is_object() {
        root["profiles"] = serde_json::json!({});
    }
    let created = root["profiles"]["luma"]["created"].as_str().unwrap_or(now).to_string();
    root["profiles"]["luma"] = serde_json::json!({
        "name": "Luma",
        "type": "custom",
        "created": created,
        "lastUsed": now,
        "lastVersionId": version_id,
        "gameDir": game_dir.to_string_lossy(),
        "javaArgs": java_args(ram_gb),
        "icon": format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(ICON)),
    });
    serde_json::to_vec_pretty(&root).unwrap_or_default()
}

pub fn install_profile(pack: &Modpack, mc: &Path, instance: &Path, ram_gb: u32) -> Result<(), String> {
    let id = pack.version_id();
    let version_json = serde_json::to_vec_pretty(&pack.profile).map_err(|e| e.to_string())?;
    let version_path = mc.join("versions").join(&id).join(format!("{id}.json"));
    if fs::read(&version_path).ok().as_deref() != Some(version_json.as_slice()) {
        write_atomic(&version_path, &version_json)?;
    }
    let now = iso_now();
    for name in ["launcher_profiles.json", "launcher_profiles_microsoft_store.json"] {
        let path = mc.join(name);
        // The Microsoft Store launcher keeps its own copy; touch it only when it exists.
        if name.contains("store") && !path.exists() {
            continue;
        }
        let existing = fs::read(&path).ok();
        write_atomic(&path, &merge_profiles(existing.as_deref(), &id, instance, ram_gb, &now))?;
    }

    let servers = instance.join("servers.dat");
    let existing = fs::read(&servers).ok();
    let updated = nbt::upsert_server(existing.as_deref(), &pack.server.name, &pack.server.address);
    if existing.as_deref() != Some(updated.as_slice()) {
        write_atomic(&servers, &updated)?;
    }
    let options = instance.join("options.txt");
    if !options.exists() {
        write_atomic(&options, b"lang:ru_ru\n")?;
    }
    Ok(())
}

// ── opening the official launcher ────────────────────────────────────────

#[allow(dead_code)]
fn spawn_ok(cmd: &mut Command) -> bool {
    cmd.spawn().is_ok()
}

#[cfg(target_os = "windows")]
fn windows_launcher() -> Option<Command> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let candidates = [
        env("ProgramFiles(x86)").map(|p| p.join("Minecraft Launcher").join("MinecraftLauncher.exe")),
        env("ProgramFiles").map(|p| p.join("Minecraft Launcher").join("MinecraftLauncher.exe")),
        env("LOCALAPPDATA").map(|p| p.join("Programs").join("Minecraft Launcher").join("MinecraftLauncher.exe")),
    ];
    if let Some(exe) = candidates.into_iter().flatten().find(|p| p.exists()) {
        return Some(Command::new(exe));
    }
    // Xbox app / Microsoft Store edition.
    let store = env("LOCALAPPDATA")?.join("Packages").join("Microsoft.4297127D64EC6_8wekyb3d8bbwe");
    if store.exists() {
        let mut c = Command::new("explorer.exe");
        c.arg(r"shell:AppsFolder\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft").creation_flags(CREATE_NO_WINDOW);
        return Some(c);
    }
    None
}

/// Opens the official launcher. Err("not_found") when it isn't installed.
pub fn open_launcher() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        for args in [["-b", "com.mojang.minecraftlauncher"], ["-a", "Minecraft"]] {
            if Command::new("open").args(args).status().map(|s| s.success()).unwrap_or(false) {
                return Ok("macos".into());
            }
        }
        return Err("not_found".into());
    }
    #[cfg(target_os = "windows")]
    {
        return match windows_launcher() {
            Some(mut c) => match c.spawn() {
                Ok(_) => Ok("windows".into()),
                Err(_) => Err("not_found".into()),
            },
            None => Err("not_found".into()),
        };
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        for bin in ["minecraft-launcher", "/opt/minecraft-launcher/minecraft-launcher"] {
            if spawn_ok(&mut Command::new(bin)) {
                return Ok("linux".into());
            }
        }
        Err("not_found".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_is_consistent() {
        let p = modpack();
        assert_eq!(p.version_id(), "fabric-loader-0.19.5-1.21.1");
        assert_eq!(p.profile["inheritsFrom"], "1.21.1");
        assert!(p.mods.len() >= 20);
        let mut files: Vec<_> = p.mods.iter().map(|m| m.file.as_str()).collect();
        files.sort();
        files.dedup();
        assert_eq!(files.len(), p.mods.len(), "duplicate jar names");
        for m in &p.mods {
            assert_eq!(m.sha512.len(), 128, "{}", m.slug);
            assert!(m.url.starts_with("https://cdn.modrinth.com/"), "{}", m.slug);
            assert!(m.file.ends_with(".jar") && !m.file.contains('/'), "{}", m.slug);
        }
        assert!(p.mods.iter().any(|m| m.slug == "touhoulittlemaid-orihime"));
    }

    #[test]
    fn iso_dates() {
        let s = iso_now();
        assert_eq!(s.len(), 24);
        assert!(s.starts_with("20") && s.ends_with(".000Z"));
    }

    #[test]
    fn profiles_merge_keeps_others() {
        let existing = br#"{"profiles":{"abc":{"name":"Vanilla","type":"latest-release"}},"settings":{"locale":"ru-ru"},"version":3,"clientToken":"x"}"#;
        let out = merge_profiles(Some(existing), "fabric-loader-0.19.5-1.21.1", Path::new("/tmp/luma"), 6, "2026-10-09T13:00:00.000Z");
        let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["profiles"]["abc"]["name"], "Vanilla");
        assert_eq!(v["clientToken"], "x");
        assert_eq!(v["settings"]["locale"], "ru-ru");
        let l = &v["profiles"]["luma"];
        assert_eq!(l["lastVersionId"], "fabric-loader-0.19.5-1.21.1");
        assert_eq!(l["gameDir"], "/tmp/luma");
        assert!(l["javaArgs"].as_str().unwrap().starts_with("-Xmx6G -Xms2G"));
        assert!(l["icon"].as_str().unwrap().starts_with("data:image/png;base64,iVBOR"));
        // A second run keeps the creation date.
        let again = merge_profiles(Some(&out), "fabric-loader-0.19.5-1.21.1", Path::new("/tmp/luma"), 4, "2027-01-01T00:00:00.000Z");
        let v2: serde_json::Value = serde_json::from_slice(&again).unwrap();
        assert_eq!(v2["profiles"]["luma"]["created"], "2026-10-09T13:00:00.000Z");
        assert_eq!(v2["profiles"]["luma"]["lastUsed"], "2027-01-01T00:00:00.000Z");
        // Missing or broken files start fresh.
        let fresh: serde_json::Value = serde_json::from_slice(&merge_profiles(Some(b"{oops"), "x", Path::new("/g"), 4, "t")).unwrap();
        assert_eq!(fresh["version"], 3);
    }

    #[test]
    fn install_writes_launcher_files() {
        let root = std::env::temp_dir().join(format!("luma-test-{}", std::process::id()));
        let (mc, inst) = (root.join("minecraft"), root.join("instance"));
        fs::create_dir_all(&inst).unwrap();
        install_profile(modpack(), &mc, &inst, 6).unwrap();
        let id = modpack().version_id();
        let vj: serde_json::Value = serde_json::from_slice(&fs::read(mc.join("versions").join(&id).join(format!("{id}.json"))).unwrap()).unwrap();
        assert_eq!(vj["mainClass"], "net.fabricmc.loader.impl.launch.knot.KnotClient");
        let lp: serde_json::Value = serde_json::from_slice(&fs::read(mc.join("launcher_profiles.json")).unwrap()).unwrap();
        assert_eq!(lp["profiles"]["luma"]["lastVersionId"], id.as_str());
        assert!(!mc.join("launcher_profiles_microsoft_store.json").exists());
        let (_, servers) = nbt::read(&fs::read(inst.join("servers.dat")).unwrap()).unwrap();
        let Some(nbt::Tag::List(10, list)) = servers.get("servers") else { panic!() };
        assert_eq!(list[0].get("ip").and_then(nbt::Tag::as_str), Some("x1.qwertyx.host:28828"));
        assert_eq!(fs::read_to_string(inst.join("options.txt")).unwrap(), "lang:ru_ru\n");
        // Idempotent.
        install_profile(modpack(), &mc, &inst, 6).unwrap();
        fs::remove_dir_all(&root).ok();
    }
}

#[cfg(test)]
mod net_tests {
    /// Real HTTPS through reqwest + rustls/ring + the platform verifier. `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn https_download_works() {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let rt = tauri::async_runtime::block_on(async {
            let r = super::http().unwrap().get("https://index.crates.io/config.json").send().await.unwrap();
            (r.status().as_u16(), r.bytes().await.unwrap().len())
        });
        assert_eq!(rt.0, 200);
        assert!(rt.1 > 10);
    }
}
