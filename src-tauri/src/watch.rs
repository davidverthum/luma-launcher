//! «X теперь на сервере», watched from the core. The window's own timers get slowed or paused by
//! the OS while the launcher is minimized or behind the game — exactly when a join alert matters —
//! so the polling lives here, on its own thread, and only hands the result to the window.
use serde::Serialize;
use std::{
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

const EVERY: Duration = Duration::from_secs(20);

struct Prefs {
    enabled: bool,
    me: String,
}

fn prefs() -> &'static Mutex<Prefs> {
    static P: OnceLock<Mutex<Prefs>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(Prefs { enabled: true, me: String::new() }))
}

/// The settings toggle and the player's own nick (never announced to themselves).
pub fn configure(enabled: bool, me: Option<String>) {
    if let Ok(mut p) = prefs().lock() {
        p.enabled = enabled;
        p.me = me.unwrap_or_default();
    }
}

#[derive(Serialize, Clone)]
struct Joins {
    names: Vec<String>,
    players: i64,
    max: i64,
}

/// Names in `now` that weren't in `prev`, leaving out the player themself.
pub fn newcomers(prev: &[String], now: &[String], me: &str) -> Vec<String> {
    now.iter().filter(|n| !prev.contains(n) && !n.eq_ignore_ascii_case(me)).cloned().collect()
}

pub fn title(names: &[String]) -> String {
    let who = match names {
        [one] => one.clone(),
        [rest @ .., last] => format!("{} и {last}", rest.join(", ")),
        [] => String::new(),
    };
    format!("{who} теперь на сервере")
}

pub fn start(app: AppHandle) {
    thread::spawn(move || {
        // Only the answers of a running server are compared, so the first poll after the launcher
        // starts announces no one. A failed poll keeps the last list: the network to the host
        // drops now and then, and whoever joined during the gap is announced on the next answer.
        let mut last: Option<Vec<String>> = None;
        loop {
            let status = tauri::async_runtime::block_on(crate::status_now());
            if status.online {
                if let Some(prev) = &last {
                    let (enabled, me) = prefs().lock().map(|p| (p.enabled, p.me.clone())).unwrap_or((true, String::new()));
                    let names = newcomers(prev, &status.sample, &me);
                    if enabled && !names.is_empty() {
                        notify(&app, Joins { names, players: status.players, max: status.max });
                    }
                }
                last = Some(status.sample);
            }
            thread::sleep(EVERY);
        }
    });
}

fn notify(app: &AppHandle, joins: Joins) {
    let in_front = app
        .get_webview_window("main")
        .map(|w| w.is_focused().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false);
    if !in_front {
        use tauri_plugin_notification::NotificationExt;
        let body = format!("Онлайн {} из {} — заходи!", joins.players, joins.max);
        let _ = app.notification().builder().title(title(&joins.names)).body(body).show();
    }
    let _ = app.emit("luma://joins", joins);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn only_new_names_and_never_me() {
        assert_eq!(newcomers(&v(&["Rimfyy"]), &v(&["Rimfyy", "Steve", "Me"]), "me"), v(&["Steve"]));
        assert!(newcomers(&v(&["A", "B"]), &v(&["B"]), "").is_empty());
        assert_eq!(newcomers(&[], &v(&["A"]), ""), v(&["A"]));
    }

    #[test]
    fn titles_read_naturally() {
        assert_eq!(title(&v(&["A"])), "A теперь на сервере");
        assert_eq!(title(&v(&["A", "B"])), "A и B теперь на сервере");
        assert_eq!(title(&v(&["A", "B", "C"])), "A, B и C теперь на сервере");
    }
}
