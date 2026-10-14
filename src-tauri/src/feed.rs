//! What the server publishes for the launcher, without anyone playing: Luma Cosmetics writes small
//! JSON files into BlueMap's web folder (luma/*.json) and BlueMap serves them on the map's port —
//! the chronicle, places on the map, who's online (and away), the leaderboard, which map shows
//! which dimension. Plus the game's own Russian words (ru_ru.json from the game's assets), to show
//! the chronicle's lines the way Minecraft says them.
use crate::game;
use serde_json::Value;
use std::{
    fs,
    path::Path,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const FEEDS: [&str; 5] = ["chronicle", "places", "online", "board", "maps"];

/// luma/<name>.json from the server; None while the server doesn't publish it (no Luma Cosmetics
/// 1.2 there yet, or not that file). Test hook: LUMA_FEED_DIR reads the files from a folder.
pub async fn fetch(name: &str) -> Result<Option<Value>, String> {
    if !FEEDS.contains(&name) {
        return Err(format!("неизвестная лента {name}"));
    }
    if let Ok(dir) = std::env::var("LUMA_FEED_DIR") {
        return Ok(fs::read_to_string(Path::new(&dir).join(format!("{name}.json"))).ok().and_then(|t| serde_json::from_str(&t).ok()));
    }
    let base = game::modpack().server.map.as_deref().ok_or("у сервера нет карты")?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    // A fresh query each time: no cache in between keeps an old chronicle.
    let url = format!("{}/luma/{name}.json?t={now}", base.trim_end_matches('/'));
    let resp = game::http()?.get(url).timeout(Duration::from_secs(8)).send().await.map_err(|e| e.to_string())?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let resp = resp.error_for_status().map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(serde_json::from_str::<Value>(&text).ok().filter(Value::is_object))
}

/// The game's Russian translations (minecraft/lang/ru_ru.json) from the assets the launcher
/// downloaded; None before the first game launch. Kept once found.
pub fn ru_lang(mc: &Path) -> Option<Value> {
    static LANG: OnceLock<Value> = OnceLock::new();
    if let Some(v) = LANG.get() {
        return Some(v.clone());
    }
    let found = find_lang(mc)?;
    Some(LANG.get_or_init(|| found).clone())
}

/// assets/indexes/<newest>.json → the object hash of ru_ru.json → assets/objects/<ab>/<hash>.
fn find_lang(mc: &Path) -> Option<Value> {
    let assets = mc.join("assets");
    let mut indexes: Vec<_> = fs::read_dir(assets.join("indexes")).ok()?.flatten().filter(|e| e.path().extension().is_some_and(|x| x == "json")).collect();
    indexes.sort_by_key(|e| std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok()));
    for index in indexes {
        let Ok(text) = fs::read_to_string(index.path()) else { continue };
        let Ok(json) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(hash) = json["objects"]["minecraft/lang/ru_ru.json"]["hash"].as_str() else { continue };
        if hash.len() < 2 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
            continue;
        }
        let file = assets.join("objects").join(&hash[..2]).join(hash);
        if let Some(lang) = fs::read_to_string(file).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).filter(Value::is_object) {
            return Some(lang);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_ru_lang_through_the_index() {
        let mc = std::env::temp_dir().join(format!("luma-lang-{}", std::process::id()));
        let hash = "ab12cd";
        fs::create_dir_all(mc.join("assets/indexes")).unwrap();
        fs::create_dir_all(mc.join("assets/objects/ab")).unwrap();
        fs::write(mc.join("assets/indexes/17.json"), format!(r#"{{"objects":{{"minecraft/lang/ru_ru.json":{{"hash":"{hash}","size":1}}}}}}"#)).unwrap();
        fs::write(mc.join("assets/objects/ab").join(hash), r#"{"death.attack.lava":"%1$s попытался поплавать в лаве"}"#).unwrap();
        let lang = find_lang(&mc).unwrap();
        assert_eq!(lang["death.attack.lava"], "%1$s попытался поплавать в лаве");
        let _ = fs::remove_dir_all(&mc);
    }
}
