//! Minecraft Server List Ping: the same request the game's multiplayer screen sends.

use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Serialize, Clone, Debug, Default)]
pub struct Status {
    pub online: bool,
    pub players: i64,
    pub max: i64,
    pub version: String,
    pub motd: String,
    pub latency_ms: u64,
    pub sample: Vec<String>,
    pub error: Option<String>,
}

fn put_varint(out: &mut Vec<u8>, mut v: i32) {
    loop {
        let mut b = (v & 0x7f) as u8;
        v = ((v as u32) >> 7) as i32;
        if v != 0 {
            b |= 0x80;
        }
        out.push(b);
        if v == 0 {
            break;
        }
    }
}

fn get_varint(next: &mut impl FnMut() -> std::io::Result<u8>) -> std::io::Result<i32> {
    let mut v: i32 = 0;
    for i in 0..5 {
        let b = next()?;
        v |= ((b & 0x7f) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(v);
        }
    }
    Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "varint too long"))
}

fn packet(id: i32, body: &[u8]) -> Vec<u8> {
    let mut inner = Vec::new();
    put_varint(&mut inner, id);
    inner.extend_from_slice(body);
    let mut out = Vec::new();
    put_varint(&mut out, inner.len() as i32);
    out.extend_from_slice(&inner);
    out
}

fn read_packet(stream: &mut TcpStream) -> std::io::Result<(i32, Vec<u8>)> {
    let one = |s: &mut TcpStream| -> std::io::Result<u8> {
        let mut b = [0u8; 1];
        s.read_exact(&mut b)?;
        Ok(b[0])
    };
    let len = get_varint(&mut || one(stream))?;
    if !(1..=1 << 21).contains(&len) {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad packet length"));
    }
    let mut buf = vec![0u8; len as usize];
    stream.read_exact(&mut buf)?;
    let mut pos = 0;
    let id = get_varint(&mut || {
        let b = *buf.get(pos).ok_or(std::io::ErrorKind::UnexpectedEof)?;
        pos += 1;
        Ok(b)
    })?;
    Ok((id, buf[pos..].to_vec()))
}

/// Flattens a chat component (string or {text, extra}) to plain text without § codes.
pub fn plain_text(v: &serde_json::Value) -> String {
    fn walk(v: &serde_json::Value, out: &mut String) {
        match v {
            serde_json::Value::String(s) => out.push_str(s),
            serde_json::Value::Array(items) => items.iter().for_each(|i| walk(i, out)),
            serde_json::Value::Object(o) => {
                if let Some(t) = o.get("text") {
                    walk(t, out);
                }
                if let Some(e) = o.get("extra") {
                    walk(e, out);
                }
            }
            _ => {}
        }
    }
    let mut raw = String::new();
    walk(v, &mut raw);
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            out.push(c);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn parse_status(json: &str, latency_ms: u64) -> Result<Status, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let players = &v["players"];
    Ok(Status {
        online: true,
        players: players["online"].as_i64().unwrap_or(0),
        max: players["max"].as_i64().unwrap_or(0),
        version: v["version"]["name"].as_str().unwrap_or("").to_string(),
        motd: plain_text(&v["description"]),
        latency_ms,
        sample: players["sample"]
            .as_array()
            .map(|a| a.iter().filter_map(|p| p["name"].as_str().map(str::to_string)).collect())
            .unwrap_or_default(),
        error: None,
    })
}

fn split_address(address: &str) -> (String, u16) {
    match address.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() => (h.to_string(), p.parse().unwrap_or(25565)),
        _ => (address.to_string(), 25565),
    }
}

pub fn query(address: &str, timeout: Duration) -> Result<Status, String> {
    let (host, port) = split_address(address);
    let addr = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|e| format!("DNS: {e}"))?
        .next()
        .ok_or("DNS: адрес не найден")?;
    let started = Instant::now();
    let mut stream = TcpStream::connect_timeout(&addr, timeout).map_err(|e| e.to_string())?;
    let connect_ms = started.elapsed().as_millis() as u64;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();
    stream.set_nodelay(true).ok();

    let mut hs = Vec::new();
    put_varint(&mut hs, 767); // 1.21 / 1.21.1; servers answer any version with their own
    put_varint(&mut hs, host.len() as i32);
    hs.extend_from_slice(host.as_bytes());
    hs.extend_from_slice(&port.to_be_bytes());
    put_varint(&mut hs, 1);
    stream.write_all(&packet(0x00, &hs)).map_err(|e| e.to_string())?;
    stream.write_all(&packet(0x00, &[])).map_err(|e| e.to_string())?;

    let (id, body) = read_packet(&mut stream).map_err(|e| e.to_string())?;
    if id != 0 {
        return Err(format!("неожиданный пакет {id}"));
    }
    let mut pos = 0;
    let n = get_varint(&mut || {
        let b = *body.get(pos).ok_or(std::io::ErrorKind::UnexpectedEof)?;
        pos += 1;
        Ok(b)
    })
    .map_err(|e| e.to_string())? as usize;
    let json = String::from_utf8_lossy(body.get(pos..pos + n).ok_or("обрезанный ответ")?).into_owned();

    // Ping round trip; some servers close right after status, then the connect time stands in.
    let sent = Instant::now();
    let latency = match stream
        .write_all(&packet(0x01, &42i64.to_be_bytes()))
        .and_then(|_| read_packet(&mut stream))
    {
        Ok((1, _)) => sent.elapsed().as_millis() as u64,
        _ => connect_ms,
    };
    parse_status(&json, latency.max(1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn varint_round_trip() {
        for v in [0, 1, 127, 128, 255, 25565, 767, 2_097_151, i32::MAX, -1] {
            let mut b = Vec::new();
            put_varint(&mut b, v);
            let mut it = b.into_iter();
            assert_eq!(get_varint(&mut || Ok(it.next().unwrap())).unwrap(), v);
        }
    }

    #[test]
    fn motd_is_flattened() {
        let v: serde_json::Value = serde_json::from_str(r#"{"text":"","extra":[{"text":"§a§lLuma"},{"text":" §7· §fкошкодевочки ждут"}]}"#).unwrap();
        assert_eq!(plain_text(&v), "Luma · кошкодевочки ждут");
        assert_eq!(plain_text(&serde_json::json!("§aHi  there")), "Hi there");
    }

    /// A tiny fake server that answers like vanilla does.
    #[test]
    fn talks_to_a_server() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let _hs = read_packet(&mut s).unwrap();
            let (req, _) = read_packet(&mut s).unwrap();
            assert_eq!(req, 0);
            let json = r#"{"version":{"name":"1.21.1","protocol":767},"players":{"max":10,"online":2,"sample":[{"name":"Steve","id":"x"},{"name":"Alex","id":"y"}]},"description":"§aLuma"}"#;
            let mut body = Vec::new();
            put_varint(&mut body, json.len() as i32);
            body.extend_from_slice(json.as_bytes());
            s.write_all(&packet(0, &body)).unwrap();
            let (ping, payload) = read_packet(&mut s).unwrap();
            assert_eq!(ping, 1);
            s.write_all(&packet(1, &payload)).unwrap();
        });
        let st = query(&format!("127.0.0.1:{port}"), Duration::from_secs(3)).unwrap();
        assert!(st.online);
        assert_eq!((st.players, st.max), (2, 10));
        assert_eq!(st.version, "1.21.1");
        assert_eq!(st.motd, "Luma");
        assert_eq!(st.sample, vec!["Steve", "Alex"]);
    }
}
