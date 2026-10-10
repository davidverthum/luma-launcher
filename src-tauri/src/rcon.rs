//! Minimal Minecraft RCON client (the server's remote console) for the admin panel: log in with
//! the password, run one command, read the reply. A fresh connection per command — the panel
//! sends a handful, not a stream. The password lives in the OS credential store, never in
//! settings.json or the app itself.
use std::{
    io::{self, Read, Write},
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};

const LOGIN: i32 = 3;
const COMMAND: i32 = 2;
/// Vanilla drops longer commands.
const MAX_COMMAND: usize = 1446;
/// Vanilla splits long replies into pieces of this many bytes.
const CHUNK: usize = 4096;

fn write_packet(s: &mut impl Write, id: i32, kind: i32, body: &str) -> io::Result<()> {
    let mut buf = Vec::with_capacity(body.len() + 14);
    buf.extend_from_slice(&((body.len() + 10) as i32).to_le_bytes());
    buf.extend_from_slice(&id.to_le_bytes());
    buf.extend_from_slice(&kind.to_le_bytes());
    buf.extend_from_slice(body.as_bytes());
    buf.extend_from_slice(&[0, 0]);
    s.write_all(&buf)
}

/// (request id, payload bytes).
fn read_packet(s: &mut impl Read) -> io::Result<(i32, Vec<u8>)> {
    let mut len = [0u8; 4];
    s.read_exact(&mut len)?;
    let len = i32::from_le_bytes(len);
    if !(10..=1 << 16).contains(&len) {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "непонятный ответ RCON"));
    }
    let mut rest = vec![0u8; len as usize];
    s.read_exact(&mut rest)?;
    let id = i32::from_le_bytes([rest[0], rest[1], rest[2], rest[3]]);
    rest.truncate(rest.len() - 2);
    Ok((id, rest.split_off(8)))
}

/// Drops Minecraft's `§x` colour/format codes.
fn strip_formatting(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            out.push(c);
        }
    }
    out
}

fn io_err(e: io::Error) -> String {
    match e.kind() {
        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut => "сервер не ответил на команду".into(),
        _ => format!("связь с RCON оборвалась: {e}"),
    }
}

/// Runs `command` on the server at `address` (host:port) and returns its reply.
pub fn exec(address: &str, password: &str, command: &str) -> Result<String, String> {
    let command = command.trim().trim_start_matches('/');
    if command.is_empty() {
        return Err("пустая команда".into());
    }
    if command.len() > MAX_COMMAND {
        return Err("слишком длинная команда".into());
    }
    let addr = address
        .to_socket_addrs()
        .map_err(|e| format!("адрес RCON: {e}"))?
        .next()
        .ok_or("адрес RCON не найден")?;
    let mut s = TcpStream::connect_timeout(&addr, Duration::from_secs(5))
        .map_err(|_| "RCON не отвечает: сервер выключен или порт закрыт".to_string())?;
    s.set_read_timeout(Some(Duration::from_secs(10))).map_err(io_err)?;
    s.set_write_timeout(Some(Duration::from_secs(5))).map_err(io_err)?;

    write_packet(&mut s, 1, LOGIN, password).map_err(io_err)?;
    let (id, _) = read_packet(&mut s).map_err(io_err)?;
    if id == -1 {
        return Err("неверный пароль RCON".into());
    }

    write_packet(&mut s, 2, COMMAND, command).map_err(io_err)?;
    let (_, mut chunk) = read_packet(&mut s).map_err(io_err)?;
    let mut out = Vec::new();
    // A full chunk means the reply goes on; the next pieces follow right away.
    s.set_read_timeout(Some(Duration::from_millis(300))).map_err(io_err)?;
    loop {
        let full = chunk.len() >= CHUNK;
        out.append(&mut chunk);
        if !full {
            break;
        }
        match read_packet(&mut s) {
            Ok((_, next)) => chunk = next,
            Err(_) => break,
        }
    }
    Ok(strip_formatting(&String::from_utf8_lossy(&out)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    /// A one-connection fake server: checks the password, answers the command with `reply`
    /// split into vanilla-sized chunks.
    fn fake_server(password: &'static str, reply: String) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap().to_string();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let (id, body) = read_packet(&mut s).unwrap();
            let ok = body == password.as_bytes();
            write_packet(&mut s, if ok { id } else { -1 }, COMMAND, "").unwrap();
            if !ok {
                return;
            }
            let (id, _) = read_packet(&mut s).unwrap();
            for piece in reply.as_bytes().chunks(CHUNK) {
                write_packet(&mut s, id, 0, std::str::from_utf8(piece).unwrap()).unwrap();
            }
        });
        address
    }

    #[test]
    fn runs_a_command() {
        let address = fake_server("secret", "§6There are §c1§6 of a max of 10 players online: Rimfyy".into());
        assert_eq!(exec(&address, "secret", "/list").unwrap(), "There are 1 of a max of 10 players online: Rimfyy");
    }

    #[test]
    fn wrong_password() {
        let address = fake_server("secret", String::new());
        assert_eq!(exec(&address, "nope", "list").unwrap_err(), "неверный пароль RCON");
    }

    #[test]
    fn long_reply_is_reassembled() {
        let reply = "a".repeat(CHUNK * 2 + 17);
        let address = fake_server("secret", reply.clone());
        assert_eq!(exec(&address, "secret", "help").unwrap(), reply);
    }
}
