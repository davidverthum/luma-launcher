//! Admin panel backend: RCON to the Luma server. The password is checked against the server
//! before it is kept, and it is kept only in the OS credential store (Windows Credential
//! Manager, macOS Keychain, the Linux kernel keyring). The server's address goes through
//! net::resolve, so a broken system DNS doesn't lock the admin out.
use crate::{game, net, rcon};

const SERVICE: &str = "gg.luma.launcher";

/// host:port of the server's RCON, from modpack.json.
fn address() -> Result<String, String> {
    let server = &game::modpack().server;
    let port = server.rcon.ok_or("RCON ещё не настроен: впиши его порт в modpack.json → server.rcon")?;
    let host = server.address.rsplit_once(':').map_or(server.address.as_str(), |(h, _)| h);
    Ok(format!("{host}:{port}"))
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, &format!("rcon:{}", address()?)).map_err(|e| e.to_string())
}

pub fn configured() -> bool {
    game::modpack().server.rcon.is_some()
}

pub fn has_password() -> bool {
    entry().is_ok_and(|e| e.get_password().is_ok())
}

/// Resolves the RCON address, then runs `command` with `password` off the async runtime.
async fn run(password: String, command: String) -> Result<String, String> {
    let addr = net::resolve(&address()?).await?;
    tauri::async_runtime::spawn_blocking(move || rcon::exec_at(addr, &password, &command))
        .await
        .map_err(|e| e.to_string())?
}

/// Logs in with `password` (runs `list`) and only then saves it; returns the reply.
pub async fn login(password: String) -> Result<String, String> {
    let reply = run(password.clone(), "list".into()).await?;
    entry()?.set_password(&password).map_err(|e| format!("не удалось сохранить пароль: {e}"))?;
    Ok(reply)
}

pub async fn exec(command: String) -> Result<String, String> {
    let password = entry()?.get_password().map_err(|_| "сначала введи пароль RCON".to_string())?;
    run(password, command).await
}

/// Forgets the password on this computer.
pub fn logout() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
