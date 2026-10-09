//! Player-facing customization that sits on top of the pinned modpack: local jars the
//! player drops in themselves, shader packs, and the performance presets that tie render
//! settings + shaders together. Never touches the pack's own mods — `game::sync_mods`
//! still owns those.
use crate::game::{self, Modpack, ShaderFile};
use std::{collections::BTreeMap, fs, path::Path};

// ── local mods ───────────────────────────────────────────────────────────

/// Jars in `mods/` that aren't part of the pinned pack — the ones the player added.
pub fn list_local(pack: &Modpack, instance: &Path) -> Result<Vec<String>, String> {
    let known: std::collections::HashSet<&str> = pack.mods.iter().map(|m| m.file.as_str()).collect();
    let dir = instance.join("mods");
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with(".jar") && !known.contains(name.as_str()) {
                out.push(name);
            }
        }
    }
    out.sort();
    Ok(out)
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

/// Removes a player-added jar. Refuses to touch a pack mod, even if asked — `sync_mods` owns those.
pub fn remove_local(pack: &Modpack, instance: &Path, filename: &str) -> Result<(), String> {
    if pack.mods.iter().any(|m| m.file == filename) {
        return Err("это мод сборки — его снимают обновлением сборки, не отсюда".into());
    }
    let path = instance.join("mods").join(filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
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
