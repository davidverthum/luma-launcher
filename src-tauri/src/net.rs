//! Finding the server's address when the system DNS can't. VPN clients in TUN mode (Happ and
//! the like) sometimes break plain DNS while HTTPS through their proxy still works — then the
//! launcher would call a running server "offline". On a system lookup failure this asks
//! DNS-over-HTTPS (Cloudflare, then Google) through the same HTTP client as everything else.
use crate::game;
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr, ToSocketAddrs},
    sync::Mutex,
    time::{Duration, Instant},
};

const DOH: [&str; 2] = ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"];
/// DoH answers are kept this long, so the 30-second status poll doesn't ask every time.
const CACHE_FOR: Duration = Duration::from_secs(10 * 60);

fn cache() -> &'static Mutex<HashMap<String, (IpAddr, Instant)>> {
    static CACHE: std::sync::OnceLock<Mutex<HashMap<String, (IpAddr, Instant)>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// First A record from a DoH JSON answer (`{"Answer":[{"type":1,"data":"1.2.3.4"}]}`).
fn first_a(json: &serde_json::Value) -> Option<IpAddr> {
    json["Answer"].as_array()?.iter().filter(|a| a["type"].as_u64() == Some(1)).find_map(|a| a["data"].as_str()?.parse().ok())
}

async fn doh(host: &str) -> Result<IpAddr, String> {
    if let Some((ip, at)) = cache().lock().ok().and_then(|c| c.get(host).copied()) {
        if at.elapsed() < CACHE_FOR {
            return Ok(ip);
        }
    }
    let client = game::http()?;
    let mut last = String::from("нет ответа");
    for base in DOH {
        let url = tauri::Url::parse_with_params(base, &[("name", host), ("type", "A")]).map_err(|e| e.to_string())?;
        let resp = client
            .get(url)
            .header("Accept", "application/dns-json")
            .timeout(Duration::from_secs(6))
            .send()
            .await;
        match resp {
            Ok(r) => match r.json::<serde_json::Value>().await {
                Ok(json) => {
                    if let Some(ip) = first_a(&json) {
                        if let Ok(mut c) = cache().lock() {
                            c.insert(host.to_string(), (ip, Instant::now()));
                        }
                        return Ok(ip);
                    }
                    last = "в ответе нет адреса".into();
                }
                Err(e) => last = e.to_string(),
            },
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!("DNS: адрес {host} не найден ({last})"))
}

/// `host:port` → a socket address: an IP as is, then the system resolver, then DoH.
pub async fn resolve(address: &str) -> Result<SocketAddr, String> {
    let (host, port) = crate::slp::split_address(address);
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(SocketAddr::new(ip, port));
    }
    let lookup = (host.clone(), port);
    let system = tauri::async_runtime::spawn_blocking(move || lookup.to_socket_addrs().ok().and_then(|mut a| a.next()))
        .await
        .ok()
        .flatten();
    match system {
        Some(addr) => Ok(addr),
        None => Ok(SocketAddr::new(doh(&host).await?, port)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_record_past_cname() {
        let json = serde_json::json!({ "Answer": [
            { "name": "x1.example.", "type": 5, "data": "edge.example." },
            { "name": "edge.example.", "type": 1, "data": "188.127.241.232" }
        ] });
        assert_eq!(first_a(&json), Some("188.127.241.232".parse().unwrap()));
        assert_eq!(first_a(&serde_json::json!({ "Status": 3 })), None);
    }
}
