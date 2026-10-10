//! Screenshots the game saves into the instance (F2): the album lists them straight from disk,
//! and opens, reveals, copies or deletes one by its bare file name — never by a path from the UI.
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Serialize)]
pub struct Shot {
    file: String,
    path: String,
    size: u64,
    taken_ms: u64,
}

/// `<instance>/screenshots` — where Minecraft puts F2 shots for this game directory.
pub fn dir(instance: &Path) -> PathBuf {
    instance.join("screenshots")
}

/// Newest first. A missing folder just means there are no screenshots yet.
pub fn list(instance: &Path) -> Vec<Shot> {
    let mut out: Vec<Shot> = fs::read_dir(dir(instance))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().into_owned();
            if !is_png(&file) {
                return None;
            }
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let taken_ms = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
            Some(Shot { path: e.path().display().to_string(), file, size: meta.len(), taken_ms })
        })
        .collect();
    out.sort_by(|a, b| b.taken_ms.cmp(&a.taken_ms).then_with(|| b.file.cmp(&a.file)));
    out
}

fn is_png(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".png")
}

/// The path of a screenshot named in the album; refuses anything that isn't a plain file name
/// inside the screenshots folder.
pub fn resolve(instance: &Path, file: &str) -> Result<PathBuf, String> {
    if file.is_empty() || file.contains(['/', '\\', ':']) || file.contains("..") || !is_png(file) {
        return Err("неверное имя скриншота".into());
    }
    let path = dir(instance).join(file);
    if !path.is_file() {
        return Err("скриншот не найден — возможно, его уже удалили".into());
    }
    Ok(path)
}

pub fn delete(instance: &Path, file: &str) -> Result<(), String> {
    fs::remove_file(resolve(instance, file)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_refuses_paths() {
        let base = std::env::temp_dir().join(format!("luma-shots-{}", std::process::id()));
        fs::create_dir_all(dir(&base)).unwrap();
        fs::write(dir(&base).join("2026-10-10_18.21.03.png"), b"png").unwrap();
        assert!(resolve(&base, "2026-10-10_18.21.03.png").is_ok());
        for bad in ["", "../settings.json", "..\\x.png", "a/b.png", "C:x.png", "notes.txt", "missing.png"] {
            assert!(resolve(&base, bad).is_err(), "{bad} should be refused");
        }
        assert_eq!(list(&base).len(), 1);
        fs::remove_dir_all(&base).unwrap();
    }
}
