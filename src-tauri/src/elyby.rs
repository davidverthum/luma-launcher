//! Ely.by account auth (a Yggdrasil-compatible service): lets a non-premium account join
//! an online-mode server through authlib-injector, without the official Minecraft Launcher
//! or a Microsoft account. https://docs.ely.by/en/minecraft-auth.html
use crate::game;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const AUTH_BASE: &str = "https://authserver.ely.by";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "clientToken")]
    pub client_token: String,
    #[serde(rename = "selectedProfile")]
    pub selected_profile: MinecraftProfile,
}

#[derive(Deserialize)]
struct ApiError {
    error: String,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
}

fn friendly(status: reqwest::StatusCode, body: &str) -> String {
    match serde_json::from_str::<ApiError>(body) {
        Ok(e) => e.error_message.unwrap_or(e.error),
        Err(_) => format!("Ely.by ответил {status}"),
    }
}

/// A fresh per-install identifier Ely.by asks launchers to keep stable; not a secret.
pub fn new_client_token() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let seed = format!("{nanos}-{}-{}", std::process::id(), COUNTER.fetch_add(1, Ordering::Relaxed));
    game::sha512_hex(seed.as_bytes())[..32].to_string()
}

async fn post(client: &reqwest::Client, path: &str, body: serde_json::Value) -> Result<serde_json::Value, String> {
    let resp = client.post(format!("{AUTH_BASE}{path}")).json(&body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        if text.contains("two factor") {
            return Err("2fa_required".into());
        }
        return Err(friendly(status, &text));
    }
    if text.trim().is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// `password` may carry a `:totp` suffix when retrying after a `2fa_required` error.
pub async fn authenticate(client: &reqwest::Client, username: &str, password: &str, client_token: &str) -> Result<Session, String> {
    let body = json!({ "username": username, "password": password, "clientToken": client_token, "requestUser": false });
    let v = post(client, "/auth/authenticate", body).await?;
    serde_json::from_value(v).map_err(|e| e.to_string())
}

pub async fn refresh(client: &reqwest::Client, access_token: &str, client_token: &str) -> Result<Session, String> {
    let body = json!({ "accessToken": access_token, "clientToken": client_token, "requestUser": false });
    let v = post(client, "/auth/refresh", body).await?;
    serde_json::from_value(v).map_err(|e| e.to_string())
}

/// Fetches a PNG texture from the skin system (plain, unauthenticated) as a data URI;
/// `None` when the player has no texture of that kind set.
async fn fetch_texture_data_uri(client: &reqwest::Client, url: String) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    use base64::Engine;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[derive(Serialize)]
pub struct Textures {
    pub skin: Option<String>,
    pub cape: Option<String>,
}

/// The player's real, currently-set Ely.by skin and cape — the same textures the server sees.
pub async fn textures(client: &reqwest::Client, name: &str) -> Textures {
    let name = urlencoding_minimal(name);
    let skin = fetch_texture_data_uri(client, format!("https://skinsystem.ely.by/skins/{name}.png")).await;
    let cape = fetch_texture_data_uri(client, format!("https://skinsystem.ely.by/cloaks/{name}.png")).await;
    Textures { skin, cape }
}

/// Just the skin — for the small heads in player lists, where the cape isn't needed.
pub async fn skin(client: &reqwest::Client, name: &str) -> Option<String> {
    fetch_texture_data_uri(client, format!("https://skinsystem.ely.by/skins/{}.png", urlencoding_minimal(name))).await
}

/// Minimal percent-encoding for a path segment, byte-wise (so multi-byte UTF-8 stays correct).
/// Nicknames are already Yggdrasil-safe (letters, digits, `_`); this is just a defensive fallback.
fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
