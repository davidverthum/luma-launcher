//! Luma launcher core: system info, Java detection, settings, the server's live status,
//! and getting players into the server (modpack sync + profile in the official launcher).

mod admin;
mod elyby;
mod game;
mod launch;
mod mods;
mod nbt;
mod rcon;
mod shots;
mod slp;
mod updates;

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
struct SystemInfo {
    os: String,
    os_version: String,
    arch: String,
    cpu: String,
    cores: usize,
    memory_gb: f64,
    hostname: String,
}

#[tauri::command]
fn system_info() -> SystemInfo {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let cpu = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    SystemInfo {
        os: sysinfo::System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
        os_version: sysinfo::System::os_version().unwrap_or_default(),
        arch: std::env::consts::ARCH.to_string(),
        cpu,
        cores: sys.cpus().len(),
        memory_gb: sys.total_memory() as f64 / 1024f64.powi(3),
        hostname: sysinfo::System::host_name().unwrap_or_default(),
    }
}

#[derive(Serialize)]
struct JavaInfo {
    found: bool,
    path: Option<String>,
    version: Option<String>,
}

fn java_command(path: &PathBuf) -> Command {
    let mut cmd = Command::new(path);
    cmd.arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Looks for Java in JAVA_HOME, then on PATH. `java -version` prints to stderr.
#[tauri::command]
fn detect_java() -> JavaInfo {
    let exe = if cfg!(windows) { "java.exe" } else { "java" };
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(home) = std::env::var("JAVA_HOME") {
        candidates.push(PathBuf::from(home).join("bin").join(exe));
    }
    candidates.push(PathBuf::from(exe));
    for c in candidates {
        if let Ok(out) = java_command(&c).output() {
            if !out.status.success() {
                continue;
            }
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&out.stderr),
                String::from_utf8_lossy(&out.stdout)
            );
            let first = text.lines().next().unwrap_or("").to_string();
            if !first.contains("version") {
                continue;
            }
            let version = first.split('"').nth(1).map(|s| s.to_string()).unwrap_or(first);
            return JavaInfo { found: true, path: Some(c.display().to_string()), version: Some(version) };
        }
    }
    JavaInfo { found: false, path: None, version: None }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = settings_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({}))),
        Err(_) => Ok(serde_json::json!({})),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn realm_path(app: &AppHandle, realm: &str) -> Result<PathBuf, String> {
    if realm.is_empty() || !realm.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("bad realm id".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("realms").join(realm);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Creates the realm's game folder if needed and opens it in the file manager.
#[tauri::command]
fn open_realm_dir(app: AppHandle, realm: String) -> Result<String, String> {
    let dir = realm_path(&app, &realm)?;
    let shown = dir.display().to_string();
    app.opener().open_path(shown.clone(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(shown)
}

#[tauri::command]
fn modpack_info() -> game::PackInfo {
    game::info()
}

/// Live status of the Luma server (Server List Ping), never an error: offline comes back as data.
#[tauri::command]
async fn server_status() -> slp::Status {
    let address = game::modpack().server.address.clone();
    tauri::async_runtime::spawn_blocking(move || slp::query(&address, Duration::from_secs(5)))
        .await
        .map_err(|e| e.to_string())
        .and_then(|r| r)
        .unwrap_or_else(|e| slp::Status { error: Some(e), ..Default::default() })
}

#[derive(Serialize)]
struct PrepareReport {
    sync: game::SyncReport,
    game_dir: String,
    version_id: String,
}

/// Syncs the modpack and sets up the «Luma» profile + server entry. Progress goes out as
/// `luma://progress` events.
#[tauri::command]
async fn prepare_game(app: AppHandle, ram_gb: u32) -> Result<PrepareReport, String> {
    let ram_gb = if ram_gb == 0 { auto_ram_gb() } else { ram_gb };
    let pack = game::modpack();
    let instance = game::instance_dir(&app)?;
    let sync = game::sync_mods(&app, pack, &instance).await?;
    let mc = game::minecraft_dir(&app)?;
    let inst = instance.clone();
    tauri::async_runtime::spawn_blocking(move || game::install_profile(game::modpack(), &mc, &inst, ram_gb))
        .await
        .map_err(|e| e.to_string())??;
    Ok(PrepareReport { sync, game_dir: instance.display().to_string(), version_id: pack.version_id() })
}

/// Half the computer's memory, kept within 3–6 GB — plenty for this modpack.
fn auto_ram_gb() -> u32 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    ((sys.total_memory() / 1024u64.pow(3)) as u32 / 2).clamp(3, 6)
}

#[tauri::command]
fn open_minecraft_launcher() -> Result<String, String> {
    game::open_launcher()
}

#[tauri::command]
fn open_game_dir(app: AppHandle) -> Result<String, String> {
    let dir = game::instance_dir(&app)?.display().to_string();
    app.opener().open_path(dir.clone(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize, Deserialize, Clone)]
struct AuthProfile {
    name: String,
    rank: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct AuthResponse {
    token: String,
    profile: AuthProfile,
}

#[derive(Deserialize)]
struct ApiError {
    error: String,
}

fn auth_base() -> String {
    game::modpack().auth.url.trim_end_matches('/').to_string()
}

async fn parse_auth(resp: reqwest::Response) -> Result<AuthResponse, String> {
    if resp.status().is_success() {
        resp.json::<AuthResponse>().await.map_err(|e| e.to_string())
    } else {
        let status = resp.status();
        match resp.json::<ApiError>().await {
            Ok(e) => Err(e.error),
            Err(_) => Err(format!("сервер аккаунтов ответил {status}")),
        }
    }
}

/// Registers a Luma account (nick + password) against the auth service; never Minecraft/Mojang.
#[tauri::command]
async fn auth_register(name: String, password: String) -> Result<AuthResponse, String> {
    let client = game::http()?;
    let resp = client
        .post(format!("{}/api/register", auth_base()))
        .json(&serde_json::json!({ "name": name, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_auth(resp).await
}

#[tauri::command]
async fn auth_login(name: String, password: String) -> Result<AuthResponse, String> {
    let client = game::http()?;
    let resp = client
        .post(format!("{}/api/login", auth_base()))
        .json(&serde_json::json!({ "name": name, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    parse_auth(resp).await
}

/// Revalidates a stored session token and returns the fresh profile (rank may have changed).
#[tauri::command]
async fn auth_me(token: String) -> Result<AuthProfile, String> {
    let client = game::http()?;
    let resp = client
        .get(format!("{}/api/me", auth_base()))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        resp.json::<AuthProfile>().await.map_err(|e| e.to_string())
    } else {
        Err("unauthorized".into())
    }
}

/// Authenticates against Ely.by (never Microsoft/Mojang) to join the server without a
/// premium account. On a first login `client_token` is `None`; the caller should persist
/// the one that comes back and reuse it on every later call.
#[tauri::command]
async fn ely_login(username: String, password: String, client_token: Option<String>) -> Result<elyby::Session, String> {
    let client = game::http()?;
    let token = client_token.unwrap_or_else(elyby::new_client_token);
    elyby::authenticate(&client, &username, &password, &token).await
}

/// Extends a stored Ely.by session; call on launcher boot the same way `auth_me` revalidates
/// the Luma account.
#[tauri::command]
async fn ely_refresh(access_token: String, client_token: String) -> Result<elyby::Session, String> {
    let client = game::http()?;
    elyby::refresh(&client, &access_token, &client_token).await
}

/// The player's real skin/cape from Ely.by's skin system, as data URIs — no auth needed,
/// this is the same texture the server itself sees.
#[tauri::command]
async fn ely_textures(name: String) -> Result<elyby::Textures, String> {
    let client = game::http()?;
    Ok(elyby::textures(&client, &name).await)
}

/// Any player's Ely.by skin as a data URI (None: no skin set) — the heads in player lists.
#[tauri::command]
async fn ely_skin(name: String) -> Result<Option<String>, String> {
    let client = game::http()?;
    Ok(elyby::skin(&client, &name).await)
}

/// Syncs mods, then launches Minecraft directly (no official launcher) using an Ely.by
/// session so non-premium accounts can join the server. Progress goes out as `luma://progress`.
#[tauri::command]
async fn play_direct(app: AppHandle, ram_gb: u32, session: elyby::Session) -> Result<(), String> {
    let ram_gb = if ram_gb == 0 { auto_ram_gb() } else { ram_gb };
    let instance = game::instance_dir(&app)?;
    game::sync_mods(&app, game::modpack(), &instance).await?;
    launch::play(&app, ram_gb, &session, &instance).await
}

#[tauri::command]
fn list_shaders() -> Vec<game::ShaderFile> {
    game::modpack().shaders.clone()
}

#[tauri::command]
fn list_local_mods(app: AppHandle) -> Result<Vec<String>, String> {
    mods::list_local(game::modpack(), &game::instance_dir(&app)?)
}

/// `path` is a real filesystem path — from the file-picker dialog or a window drag-drop event.
#[tauri::command]
fn add_local_mod(app: AppHandle, path: String) -> Result<String, String> {
    mods::add_local(&game::instance_dir(&app)?, std::path::Path::new(&path))
}

#[tauri::command]
fn remove_local_mod(app: AppHandle, filename: String) -> Result<(), String> {
    mods::remove_local(game::modpack(), &game::instance_dir(&app)?, &filename)
}

#[tauri::command]
async fn set_shader(app: AppHandle, slug: Option<String>) -> Result<(), String> {
    let client = game::http()?;
    mods::set_shader(&client, game::modpack(), &game::instance_dir(&app)?, slug.as_deref()).await
}

#[tauri::command]
async fn apply_perf_preset(app: AppHandle, preset: String) -> Result<(), String> {
    let client = game::http()?;
    mods::apply_preset(&client, game::modpack(), &game::instance_dir(&app)?, &preset).await
}

#[tauri::command]
fn list_screenshots(app: AppHandle) -> Result<Vec<shots::Shot>, String> {
    Ok(shots::list(&game::instance_dir(&app)?))
}

#[tauri::command]
fn open_screenshots_dir(app: AppHandle) -> Result<String, String> {
    let dir = shots::dir(&game::instance_dir(&app)?);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let shown = dir.display().to_string();
    app.opener().open_path(shown.clone(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(shown)
}

/// Opens the screenshot in the system's image viewer.
#[tauri::command]
fn open_screenshot(app: AppHandle, file: String) -> Result<(), String> {
    let path = shots::resolve(&game::instance_dir(&app)?, &file)?;
    app.opener().open_path(path.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_screenshot(app: AppHandle, file: String) -> Result<(), String> {
    let path = shots::resolve(&game::instance_dir(&app)?, &file)?;
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

/// Puts the screenshot on the clipboard as an image — ready to paste into Discord or Telegram.
/// Decoding a big PNG takes a moment, so it runs off the main thread.
#[tauri::command]
async fn copy_screenshot(app: AppHandle, file: String) -> Result<(), String> {
    let path = shots::resolve(&game::instance_dir(&app)?, &file)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let image = tauri::image::Image::from_bytes(&bytes).map_err(|e| e.to_string())?;
        app.clipboard().write_image(&image).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn delete_screenshot(app: AppHandle, file: String) -> Result<(), String> {
    shots::delete(&game::instance_dir(&app)?, &file)
}

#[derive(Serialize)]
struct AdminStatus {
    configured: bool,
    has_password: bool,
}

#[tauri::command]
fn admin_status() -> AdminStatus {
    AdminStatus { configured: admin::configured(), has_password: admin::has_password() }
}

/// Checks the RCON password against the server, then keeps it in the OS credential store.
#[tauri::command]
async fn admin_login(password: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || admin::login(&password)).await.map_err(|e| e.to_string())?
}

/// Runs one console command on the server over RCON and returns its reply.
#[tauri::command]
async fn admin_exec(command: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || admin::exec(&command)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn admin_logout() -> Result<(), String> {
    admin::logout()
}

/// "yug" | "sever" — the update channel this build was released on.
#[tauri::command]
fn build_channel() -> &'static str {
    updates::BUILD_CHANNEL
}

/// `channel`: "yug" | "sever", or null for the build's own. Null result: already up to date.
#[tauri::command]
async fn check_update(app: AppHandle, channel: Option<String>) -> Result<Option<updates::UpdateInfo>, String> {
    updates::check(&app, channel.as_deref()).await
}

/// Downloads and installs the channel's update; the frontend restarts the app afterwards.
#[tauri::command]
async fn install_update(app: AppHandle, channel: Option<String>) -> Result<(), String> {
    updates::install(&app, channel.as_deref()).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // reqwest is built without a bundled crypto provider; ring keeps every target buildable.
    let _ = rustls::crypto::ring::default_provider().install_default();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // The album shows screenshots straight from disk via the asset protocol — only that folder.
            // A failure here only leaves the album without previews; it must not stop the launcher.
            if let Ok(instance) = game::instance_dir(app.handle()) {
                let dir = shots::dir(&instance);
                let _ = fs::create_dir_all(&dir);
                let _ = app.asset_protocol_scope().allow_directory(&dir, false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system_info,
            detect_java,
            load_settings,
            save_settings,
            open_realm_dir,
            modpack_info,
            server_status,
            prepare_game,
            open_minecraft_launcher,
            open_game_dir,
            auth_register,
            auth_login,
            auth_me,
            ely_login,
            ely_refresh,
            ely_textures,
            ely_skin,
            play_direct,
            list_shaders,
            list_local_mods,
            add_local_mod,
            remove_local_mod,
            set_shader,
            apply_perf_preset,
            list_screenshots,
            open_screenshots_dir,
            open_screenshot,
            reveal_screenshot,
            copy_screenshot,
            delete_screenshot,
            admin_status,
            admin_login,
            admin_exec,
            admin_logout,
            build_channel,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running Luma");
}
