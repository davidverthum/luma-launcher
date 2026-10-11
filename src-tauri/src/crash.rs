//! What happened when Minecraft quit badly: the crash report written during this run (or, with
//! none, the tail of the launch log), a one-line reason, and which of the player's own mods the
//! stack trace mentions — the pack's mods are tested together, the player's are the usual suspects.
use serde::Serialize;
use std::{
    fs,
    path::Path,
    time::SystemTime,
};

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Crash {
    /// Exit code; None when the process was killed without one.
    pub code: Option<i32>,
    /// Crash report file name in `<instance>/crash-reports`, if the game wrote one.
    pub report: Option<String>,
    /// One line for the dialog: the report's Description plus the exception, or the last error.
    pub summary: String,
    /// The text to copy and send to whoever helps: the crash report, or the log's last lines.
    pub details: String,
    /// The player's own (enabled) mod files the error part of the text mentions.
    pub suspects: Vec<String>,
}

const MAX_TEXT: usize = 256 * 1024;

fn read_capped(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let start = bytes.len().saturating_sub(MAX_TEXT);
    Some(String::from_utf8_lossy(&bytes[start..]).into_owned())
}

/// The newest crash report written at or after `since`.
fn new_report(instance: &Path, since: SystemTime) -> Option<(String, String)> {
    let mut newest: Option<(SystemTime, std::path::PathBuf)> = None;
    for e in fs::read_dir(instance.join("crash-reports")).ok()?.flatten() {
        let modified = e.metadata().and_then(|m| m.modified()).ok()?;
        if modified >= since && newest.as_ref().is_none_or(|(t, _)| modified > *t) {
            newest = Some((modified, e.path()));
        }
    }
    let (_, path) = newest?;
    Some((path.file_name()?.to_string_lossy().into_owned(), read_capped(&path)?))
}

/// "Description: …" and the first exception line after it.
fn report_summary(text: &str) -> String {
    let mut lines = text.lines();
    let description = lines.by_ref().find_map(|l| l.strip_prefix("Description: ")).unwrap_or("").trim().to_string();
    let exception = lines.map(str::trim).find(|l| !l.is_empty()).unwrap_or("").to_string();
    match (description.is_empty(), exception.is_empty()) {
        (false, false) => format!("{description}: {exception}"),
        (false, true) => description,
        _ => exception,
    }
}

fn is_error_line(l: &str) -> bool {
    let low = l.to_ascii_lowercase();
    l.trim_start().starts_with("at ") || ["exception", "error", "caused by", "mixin", "suspected"].iter().any(|k| low.contains(k))
}

/// Error-ish lines only: crash reports and logs also list every loaded mod, which would make
/// every mod look guilty.
fn error_part(text: &str) -> String {
    let head = text.split("-- System Details --").next().unwrap_or(text);
    head.lines().filter(|l| is_error_line(l)).collect::<Vec<_>>().join("\n").to_ascii_lowercase()
}

/// Names a mod's code is likely to appear under: `sodium-extra-0.5.4+mc1.21.jar` →
/// `sodium-extra`, `sodium_extra`, `sodiumextra` (and the same without a `-fabric` suffix).
fn mod_names(file: &str) -> Vec<String> {
    let stem = file.to_ascii_lowercase();
    let stem = stem.trim_end_matches(".disabled").trim_end_matches(".jar");
    let bytes = stem.as_bytes();
    let cut = (1..bytes.len())
        .find(|&i| matches!(bytes[i - 1], b'-' | b'_' | b'+') && bytes[i].is_ascii_digit())
        .map_or(stem.len(), |i| i - 1);
    let base = stem[..cut].trim_end_matches("-fabric").trim_end_matches("_fabric").trim_end_matches("-mc");
    let mut out = vec![base.to_string(), base.replace('-', "_"), base.replace(['-', '_'], "")];
    out.retain(|n| n.len() >= 4);
    out.dedup();
    out
}

/// None for a clean exit (code 0, no new crash report).
pub fn analyze(instance: &Path, since: SystemTime, code: Option<i32>, local_mods: &[String]) -> Option<Crash> {
    let (report, text, summary) = match new_report(instance, since) {
        Some((name, text)) => {
            let summary = report_summary(&text);
            (Some(name), text, summary)
        }
        None if code == Some(0) => return None,
        None => {
            let log = read_capped(&instance.join("luma-last-launch.log")).unwrap_or_default();
            let tail = log.lines().rev().take(150).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            let last_error = tail.lines().rev().find(|l| is_error_line(l) && !l.trim_start().starts_with("at ")).map(str::trim).unwrap_or("").to_string();
            let summary = if last_error.is_empty() { format!("Игра закрылась с кодом {}", code.map_or("—".into(), |c| c.to_string())) } else { last_error };
            (None, tail, summary)
        }
    };
    let errors = error_part(&text);
    let suspects = local_mods.iter().filter(|f| mod_names(f).iter().any(|n| errors.contains(n.as_str()))).cloned().collect();
    Some(Crash { code, report, summary, details: text, suspects })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mod_names_from_file() {
        assert_eq!(mod_names("sodium-extra-fabric-0.5.4+mc1.21.jar"), vec!["sodium-extra", "sodium_extra", "sodiumextra"]);
        assert_eq!(mod_names("Xaeros_Minimap_24.1.1_Fabric_1.21.jar.disabled"), vec!["xaeros_minimap", "xaerosminimap"]);
        assert!(mod_names("ok-1.0.jar").is_empty());
    }

    #[test]
    fn report_points_at_local_mod() {
        let dir = std::env::temp_dir().join(format!("luma-crash-{}", std::process::id()));
        fs::create_dir_all(dir.join("crash-reports")).unwrap();
        let since = SystemTime::now() - std::time::Duration::from_secs(5);
        let report = "---- Minecraft Crash Report ----\nTime: now\nDescription: Ticking entity\n\njava.lang.NullPointerException: boom\n\tat net.coolmod.CoolThing.tick(CoolThing.java:10)\n\n-- System Details --\nFabric Mods:\n\tcoolmod 1.0\n\tothermod 2.0\n";
        fs::write(dir.join("crash-reports").join("crash-2026-10-10_15.00.00-client.txt"), report).unwrap();
        let mods = vec!["coolmod-1.0.jar".to_string(), "othermod-2.0.jar".to_string()];
        let c = analyze(&dir, since, Some(-1), &mods).unwrap();
        assert_eq!(c.summary, "Ticking entity: java.lang.NullPointerException: boom");
        assert_eq!(c.suspects, vec!["coolmod-1.0.jar"]);
        assert_eq!(analyze(&dir, SystemTime::now() + std::time::Duration::from_secs(60), Some(0), &mods), None);
        fs::remove_dir_all(&dir).unwrap();
    }
}
