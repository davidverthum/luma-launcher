//! Minimal Java-edition NBT (big-endian, uncompressed) — enough to read and write `servers.dat`.

#[derive(Clone, Debug, PartialEq)]
pub enum Tag {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<i8>),
    String(String),
    /// Element type id + elements (all of that type).
    List(u8, Vec<Tag>),
    /// Ordered, so a round trip keeps the file as the game wrote it.
    Compound(Vec<(String, Tag)>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

impl Tag {
    pub fn id(&self) -> u8 {
        match self {
            Tag::Byte(_) => 1,
            Tag::Short(_) => 2,
            Tag::Int(_) => 3,
            Tag::Long(_) => 4,
            Tag::Float(_) => 5,
            Tag::Double(_) => 6,
            Tag::ByteArray(_) => 7,
            Tag::String(_) => 8,
            Tag::List(..) => 9,
            Tag::Compound(_) => 10,
            Tag::IntArray(_) => 11,
            Tag::LongArray(_) => 12,
        }
    }

    pub fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(items) => items.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Tag::String(s) => Some(s),
            _ => None,
        }
    }
}

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.pos + n > self.buf.len() {
            return Err("unexpected end of NBT".into());
        }
        let s = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }
    fn i16(&mut self) -> Result<i16, String> {
        Ok(i16::from_be_bytes(self.take(2)?.try_into().unwrap()))
    }
    fn i32(&mut self) -> Result<i32, String> {
        Ok(i32::from_be_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn i64(&mut self) -> Result<i64, String> {
        Ok(i64::from_be_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn len(&mut self) -> Result<usize, String> {
        let n = self.i32()?;
        if n < 0 || n as usize > self.buf.len() {
            return Err("bad NBT length".into());
        }
        Ok(n as usize)
    }
    fn string(&mut self) -> Result<String, String> {
        let n = u16::from_be_bytes(self.take(2)?.try_into().unwrap()) as usize;
        Ok(String::from_utf8_lossy(self.take(n)?).into_owned())
    }
    fn payload(&mut self, id: u8, depth: u32) -> Result<Tag, String> {
        if depth > 64 {
            return Err("NBT too deep".into());
        }
        Ok(match id {
            1 => Tag::Byte(self.u8()? as i8),
            2 => Tag::Short(self.i16()?),
            3 => Tag::Int(self.i32()?),
            4 => Tag::Long(self.i64()?),
            5 => Tag::Float(f32::from_bits(self.i32()? as u32)),
            6 => Tag::Double(f64::from_bits(self.i64()? as u64)),
            7 => {
                let n = self.len()?;
                Tag::ByteArray(self.take(n)?.iter().map(|b| *b as i8).collect())
            }
            8 => Tag::String(self.string()?),
            9 => {
                let elem = self.u8()?;
                let n = self.len()?;
                let mut items = Vec::with_capacity(n.min(4096));
                for _ in 0..n {
                    items.push(self.payload(elem, depth + 1)?);
                }
                Tag::List(elem, items)
            }
            10 => {
                let mut items = Vec::new();
                loop {
                    let t = self.u8()?;
                    if t == 0 {
                        break;
                    }
                    let name = self.string()?;
                    items.push((name, self.payload(t, depth + 1)?));
                }
                Tag::Compound(items)
            }
            11 => {
                let n = self.len()?;
                let mut v = Vec::with_capacity(n.min(4096));
                for _ in 0..n {
                    v.push(self.i32()?);
                }
                Tag::IntArray(v)
            }
            12 => {
                let n = self.len()?;
                let mut v = Vec::with_capacity(n.min(4096));
                for _ in 0..n {
                    v.push(self.i64()?);
                }
                Tag::LongArray(v)
            }
            other => return Err(format!("unknown NBT tag {other}")),
        })
    }
}

/// Reads a root tag (always a named compound in `servers.dat`).
pub fn read(buf: &[u8]) -> Result<(String, Tag), String> {
    let mut r = Reader { buf, pos: 0 };
    let id = r.u8()?;
    if id != 10 {
        return Err("NBT root is not a compound".into());
    }
    let name = r.string()?;
    let tag = r.payload(10, 0)?;
    Ok((name, tag))
}

fn put_string(out: &mut Vec<u8>, s: &str) {
    let b = s.as_bytes();
    let n = b.len().min(u16::MAX as usize);
    out.extend_from_slice(&(n as u16).to_be_bytes());
    out.extend_from_slice(&b[..n]);
}

fn put_payload(out: &mut Vec<u8>, tag: &Tag) {
    match tag {
        Tag::Byte(v) => out.push(*v as u8),
        Tag::Short(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Int(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Long(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Float(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        Tag::Double(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        Tag::ByteArray(v) => {
            out.extend_from_slice(&(v.len() as i32).to_be_bytes());
            out.extend(v.iter().map(|b| *b as u8));
        }
        Tag::String(s) => put_string(out, s),
        Tag::List(elem, items) => {
            // An empty list is written with element type End, as the game does.
            out.push(if items.is_empty() { 0 } else { *elem });
            out.extend_from_slice(&(items.len() as i32).to_be_bytes());
            for t in items {
                put_payload(out, t);
            }
        }
        Tag::Compound(items) => {
            for (k, v) in items {
                out.push(v.id());
                put_string(out, k);
                put_payload(out, v);
            }
            out.push(0);
        }
        Tag::IntArray(v) => {
            out.extend_from_slice(&(v.len() as i32).to_be_bytes());
            for x in v {
                out.extend_from_slice(&x.to_be_bytes());
            }
        }
        Tag::LongArray(v) => {
            out.extend_from_slice(&(v.len() as i32).to_be_bytes());
            for x in v {
                out.extend_from_slice(&x.to_be_bytes());
            }
        }
    }
}

pub fn write(name: &str, root: &Tag) -> Vec<u8> {
    let mut out = Vec::new();
    out.push(root.id());
    put_string(&mut out, name);
    put_payload(&mut out, root);
    out
}

/// Puts `name` / `address` at the top of the multiplayer list, keeping the player's own servers.
pub fn upsert_server(existing: Option<&[u8]>, name: &str, address: &str) -> Vec<u8> {
    let mut servers: Vec<Tag> = existing
        .and_then(|b| read(b).ok())
        .and_then(|(_, root)| match root.get("servers") {
            Some(Tag::List(_, items)) => Some(items.clone()),
            _ => None,
        })
        .unwrap_or_default();
    servers.retain(|s| {
        s.get("ip")
            .and_then(Tag::as_str)
            .map(|ip| !ip.eq_ignore_ascii_case(address))
            .unwrap_or(true)
    });
    servers.insert(
        0,
        Tag::Compound(vec![
            ("name".into(), Tag::String(name.into())),
            ("ip".into(), Tag::String(address.into())),
        ]),
    );
    write("", &Tag::Compound(vec![("servers".into(), Tag::List(10, servers))]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_upsert() {
        let other = Tag::Compound(vec![
            ("name".into(), Tag::String("Hypixel".into())),
            ("ip".into(), Tag::String("mc.hypixel.net".into())),
            ("acceptTextures".into(), Tag::Byte(1)),
            ("icon".into(), Tag::String("iVBOR".into())),
        ]);
        let old_luma = Tag::Compound(vec![
            ("name".into(), Tag::String("old".into())),
            ("ip".into(), Tag::String("X1.QWERTYX.HOST:28828".into())),
        ]);
        let file = write("", &Tag::Compound(vec![("servers".into(), Tag::List(10, vec![other.clone(), old_luma]))]));
        let (_, root) = read(&file).unwrap();
        assert!(matches!(root.get("servers"), Some(Tag::List(10, v)) if v.len() == 2));

        let out = upsert_server(Some(&file), "Luma", "x1.qwertyx.host:28828");
        let (name, root) = read(&out).unwrap();
        assert_eq!(name, "");
        let Some(Tag::List(10, v)) = root.get("servers") else { panic!("no list") };
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].get("name").and_then(Tag::as_str), Some("Luma"));
        assert_eq!(v[1], other);

        let fresh = upsert_server(None, "Luma", "x1.qwertyx.host:28828");
        let (_, root) = read(&fresh).unwrap();
        assert!(matches!(root.get("servers"), Some(Tag::List(10, v)) if v.len() == 1));
        // Garbage input falls back to a fresh list instead of failing.
        let fixed = upsert_server(Some(b"not nbt"), "Luma", "x1.qwertyx.host:28828");
        assert_eq!(fixed, fresh);
    }
}
