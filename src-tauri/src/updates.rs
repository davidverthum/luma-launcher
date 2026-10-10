//! Update channels. «Юг» is the main line: tags `v*`, normal releases — the repo's "latest"
//! release, the same feed launchers without channels follow. «Север» is the `sever` branch: tags
//! `sever-v*`, published as prereleases so "latest" stays Юг; its newest release is found
//! through the GitHub API. Either way the updater gets that release's latest.json.
use crate::game;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const REPO: &str = "davidverthum/luma-launcher";

/// The channel this build came from: CI sets `LUMA_CHANNEL` from the tag; local builds count as Юг.
pub const BUILD_CHANNEL: &str = match option_env!("LUMA_CHANNEL") {
    Some(c) => c,
    None => "yug",
};

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    channel: String,
    /// The running build's channel — differs from `channel` when the player switched.
    from_channel: &'static str,
    version: String,
    current_version: String,
    notes: Option<String>,
}

/// latest.json of the channel's newest release. The API lists releases newest first.
async fn manifest_url(client: &reqwest::Client, channel: &str) -> Result<Url, String> {
    if channel == "yug" {
        return Url::parse(&format!("https://github.com/{REPO}/releases/latest/download/latest.json")).map_err(|e| e.to_string());
    }
    let releases: Vec<Release> = client
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=30"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let url = newest_sever(releases).ok_or("в ветке «Север» пока нет выпусков")?;
    Url::parse(&url).map_err(|e| e.to_string())
}

/// `sever-v0.1.10` → (0, 1, 10).
fn sever_version(tag: &str) -> Option<(u64, u64, u64)> {
    let mut parts = tag.strip_prefix("sever-v")?.split('.').map(|p| p.parse::<u64>().ok());
    Some((parts.next()??, parts.next()??, parts.next()??))
}

/// latest.json of the highest Север version — by number, not by the order the API lists them in.
fn newest_sever(releases: Vec<Release>) -> Option<String> {
    releases
        .into_iter()
        .filter(|r| !r.draft)
        .filter_map(|r| Some((sever_version(&r.tag_name)?, r.assets.into_iter().find(|a| a.name == "latest.json")?)))
        .max_by_key(|(v, _)| *v)
        .map(|(_, a)| a.browser_download_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, draft: bool) -> Release {
        Release { tag_name: tag.into(), draft, assets: vec![Asset { name: "latest.json".into(), browser_download_url: format!("https://x/{tag}") }] }
    }

    #[test]
    fn picks_highest_sever_version() {
        let list = vec![release("v0.1.9", false), release("sever-v0.1.9", false), release("sever-v0.1.10", false), release("sever-v0.2.0", true)];
        assert_eq!(newest_sever(list).as_deref(), Some("https://x/sever-v0.1.10"));
        assert_eq!(newest_sever(vec![release("v0.1.4", false)]), None);
    }
}

/// `None` picks the build's own channel. Within one channel only a newer version counts; when
/// the player has switched channels, the other channel's newest build counts even if its
/// version number is lower — that is the whole point of switching.
async fn find(app: &AppHandle, channel: Option<&str>) -> Result<(String, Option<Update>), String> {
    let channel = channel.unwrap_or(BUILD_CHANNEL).to_string();
    if channel != "yug" && channel != "sever" {
        return Err(format!("неизвестная ветка {channel}"));
    }
    let url = manifest_url(&game::http()?, &channel).await?;
    let switching = channel != BUILD_CHANNEL;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .version_comparator(move |current, remote| switching || remote.version > current)
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok((channel, update))
}

pub async fn check(app: &AppHandle, channel: Option<&str>) -> Result<Option<UpdateInfo>, String> {
    let (channel, update) = find(app, channel).await?;
    Ok(update.map(|u| UpdateInfo {
        channel,
        from_channel: BUILD_CHANNEL,
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone(),
    }))
}

#[derive(Serialize, Clone)]
struct Progress {
    /// "download" while bytes arrive, then "install".
    stage: &'static str,
    done: u64,
    total: Option<u64>,
}

/// Checks again (the found update isn't kept between calls), then downloads and installs it,
/// reporting `luma://update` events for the launcher's own update screen. On Windows the
/// installer runs silently (installMode "quiet") and starts Luma again by itself; elsewhere the
/// caller restarts the app.
pub async fn install(app: &AppHandle, channel: Option<&str>) -> Result<(), String> {
    let (_, update) = find(app, channel).await?;
    let update = update.ok_or("уже стоит последняя версия этой ветки")?;
    let (on_chunk, on_done) = (app.clone(), app.clone());
    let (mut done, mut reported) = (0u64, 0u64);
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                // Every 256 KB, not every chunk — a few dozen events for the whole download.
                if done - reported >= 256 * 1024 || total == Some(done) {
                    reported = done;
                    let _ = on_chunk.emit("luma://update", Progress { stage: "download", done, total });
                }
            },
            move || {
                let _ = on_done.emit("luma://update", Progress { stage: "install", done: 0, total: None });
            },
        )
        .await
        .map_err(|e| e.to_string())
}
