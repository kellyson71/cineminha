//! Interoperability with Trystero 0.26: encrypted Nostr signals and room/action frames.
use aes_gcm::{
    AesGcm,
    aead::{Aead, KeyInit, consts::U16},
    aes::Aes256,
};
use anyhow::{Result, anyhow, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

type Cipher = AesGcm<Aes256, U16>;

pub fn hash(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}
pub fn id() -> String {
    hex::encode(rand::random::<[u8; 10]>())
}
pub fn topic(s: &str) -> String {
    Sha1::digest(s.as_bytes())
        .iter()
        .map(|b| {
            const BASE: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
            if *b < 36 {
                (BASE[*b as usize] as char).to_string()
            } else {
                format!(
                    "{}{}",
                    BASE[*b as usize / 36] as char,
                    BASE[*b as usize % 36] as char
                )
            }
        })
        .collect()
}

#[derive(Clone)]
pub struct RoomKeys {
    pub root: String,
    pub own: String,
    pub namespace: String,
    pub plaintext: String,
    key: [u8; 32],
}
impl RoomKeys {
    pub fn new(app: &str, room: &str, password: &str, peer: &str) -> Self {
        let plaintext = format!("Trystero@{app}@{room}");
        Self {
            root: topic(&plaintext),
            own: topic(&format!("{plaintext}@{peer}")),
            namespace: hash(&format!("Trystero:{app}:{room}")),
            plaintext,
            key: Sha256::digest(format!("{password}:{app}:{room}")).into(),
        }
    }
    pub fn encrypt(&self, text: &str) -> Result<String> {
        let iv = rand::random::<[u8; 16]>();
        let data = Cipher::new_from_slice(&self.key)
            .unwrap()
            .encrypt((&iv).into(), text.as_bytes())
            .map_err(|_| anyhow!("Falha ao cifrar sinal"))?;
        Ok(format!(
            "{}${}",
            iv.iter().map(u8::to_string).collect::<Vec<_>>().join(","),
            STANDARD.encode(data)
        ))
    }
    pub fn decrypt(&self, text: &str) -> Result<String> {
        ensure!(text.len() < 100_000, "Sinal grande demais");
        let (iv, data) = text
            .split_once('$')
            .ok_or_else(|| anyhow!("Sinal inválido"))?;
        let iv = iv
            .split(',')
            .map(str::parse::<u8>)
            .collect::<std::result::Result<Vec<_>, _>>()?;
        ensure!(iv.len() == 16, "IV inválido");
        let plain = Cipher::new_from_slice(&self.key)
            .unwrap()
            .decrypt(iv.as_slice().into(), STANDARD.decode(data)?.as_ref())
            .map_err(|_| anyhow!("Senha da sala incorreta"))?;
        Ok(String::from_utf8(plain)?)
    }
}

pub fn presence(namespace: &str, online: bool) -> Vec<u8> {
    let mut b = vec![2, u8::from(online)];
    b.extend_from_slice(&(namespace.len() as u16).to_be_bytes());
    b.extend_from_slice(namespace.as_bytes());
    b
}
pub fn frame(namespace: &str, action: &str, value: &Value) -> Result<Vec<u8>> {
    ensure!(!action.is_empty() && action.len() <= 32, "Ação inválida");
    let (format, payload) = if let Some(s) = value.as_str() {
        (0, s.as_bytes().to_vec())
    } else {
        (1, serde_json::to_vec(value)?)
    };
    ensure!(payload.len() + 36 <= 16384, "Mensagem grande demais");
    let mut b = vec![1];
    b.extend_from_slice(&(namespace.len() as u16).to_be_bytes());
    b.extend_from_slice(namespace.as_bytes());
    let start = b.len();
    b.resize(start + 36, 0);
    b[start] = 2;
    b[start + 1] = format << 4;
    b[start + 2..start + 2 + action.len()].copy_from_slice(action.as_bytes());
    b.extend_from_slice(&payload);
    Ok(b)
}

struct Transfer {
    action: String,
    format: u8,
    size: usize,
    data: Vec<u8>,
    updated: std::time::Instant,
}
#[derive(Default)]
pub struct Decoder {
    transfers: HashMap<u32, Transfer>,
}
pub struct Decoded {
    pub action: Option<(String, Value)>,
    pub control: Option<Vec<u8>>,
}
impl Decoder {
    pub fn decode(&mut self, namespace: &str, bytes: &[u8]) -> Result<Decoded> {
        self.transfers
            .retain(|_, t| t.updated.elapsed().as_secs() < 30);
        let empty = || Decoded {
            action: None,
            control: None,
        };
        if bytes.first() == Some(&2) {
            return Ok(empty());
        }
        ensure!(bytes.len() >= 3 && bytes[0] == 1, "Envelope inválido");
        let n = u16::from_be_bytes([bytes[1], bytes[2]]) as usize;
        ensure!(
            n == namespace.len() && bytes.get(3..3 + n) == Some(namespace.as_bytes()),
            "Sala inválida"
        );
        let b = bytes
            .get(3 + n..)
            .ok_or_else(|| anyhow!("Envelope incompleto"))?;
        ensure!(
            b.len() >= 2 && b[0] == 2 && b.len() <= 16384,
            "Versão de ação inválida"
        );
        let kind = b[1] & 15;
        let format = b[1] >> 4;
        if kind == 2 {
            ensure!(b.len() >= 14, "Chunk incompleto");
            let id = u32::from_be_bytes(b[2..6].try_into()?);
            let offset = f64::from_be_bytes(b[6..14].try_into()?);
            let Some(t) = self.transfers.get_mut(&id) else {
                return Ok(empty());
            };
            ensure!(
                offset == t.data.len() as f64 && t.data.len() + b.len() - 14 <= t.size,
                "Chunk fora de ordem"
            );
            t.data.extend_from_slice(&b[14..]);
            t.updated = std::time::Instant::now();
            if t.data.len() == t.size {
                let t = self.transfers.remove(&id).unwrap();
                return Ok(Decoded {
                    action: Some((t.action, decode_value(t.format, &t.data)?)),
                    control: None,
                });
            }
            return Ok(empty());
        }
        if kind >= 3 {
            return Ok(empty());
        }
        let h = if kind == 0 { 36 } else { 48 };
        ensure!(b.len() >= h, "Cabeçalho incompleto");
        let action = String::from_utf8(b[2..34].iter().copied().take_while(|b| *b != 0).collect())?;
        let meta = u16::from_be_bytes(b[34..36].try_into()?) as usize;
        ensure!(h + meta <= b.len(), "Metadados inválidos");
        if kind == 0 {
            return Ok(Decoded {
                action: Some((action, decode_value(format, &b[h + meta..])?)),
                control: None,
            });
        }
        let id = u32::from_be_bytes(b[36..40].try_into()?);
        let size = f64::from_be_bytes(b[40..48].try_into()?);
        ensure!(
            self.transfers.len() < 8 && size > 0.0 && size <= 1_000_000.0 && size.fract() == 0.0,
            "Transferência excessiva"
        );
        self.transfers.insert(
            id,
            Transfer {
                action,
                format,
                size: size as usize,
                data: Vec::new(),
                updated: std::time::Instant::now(),
            },
        );
        let mut control = vec![1];
        control.extend_from_slice(&(namespace.len() as u16).to_be_bytes());
        control.extend_from_slice(namespace.as_bytes());
        control.extend_from_slice(&[2, 3]);
        control.extend_from_slice(&id.to_be_bytes());
        Ok(Decoded {
            action: None,
            control: Some(control),
        })
    }
}
fn decode_value(format: u8, b: &[u8]) -> Result<Value> {
    match format {
        0 => Ok(Value::String(String::from_utf8(b.to_vec())?)),
        1 => Ok(serde_json::from_slice(b)?),
        _ => Ok(Value::Null),
    }
}

pub fn nostr_event(topic: &str, content: &Value, keys: &secp256k1::Keypair) -> Result<Value> {
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let kind = 20_000 + topic.bytes().map(u32::from).sum::<u32>() % 10_000;
    let pubkey = keys.x_only_public_key().0.to_string();
    let tags = json!([["x", topic]]);
    let content = content.to_string();
    let digest = Sha256::digest(serde_json::to_vec(&json!([
        0, pubkey, time, kind, tags, content
    ]))?);
    let sig = secp256k1::SECP256K1.sign_schnorr_no_aux_rand(&digest, keys);
    Ok(
        json!(["EVENT",{"id":hex::encode(digest),"pubkey":pubkey,"created_at":time,"kind":kind,"tags":tags,"content":content,"sig":sig.to_string()}]),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crypto_and_wire() {
        let keys = RoomKeys::new("app", "room", "password", "peer");
        let data = keys.encrypt("sdp").unwrap();
        assert_eq!(keys.decrypt(&data).unwrap(), "sdp");
        assert!(
            RoomKeys::new("app", "room", "other", "peer")
                .decrypt(&data)
                .is_err()
        );
        let b = frame(&keys.namespace, "hello", &json!({"name":"Kellyson"})).unwrap();
        let d = Decoder::default().decode(&keys.namespace, &b).unwrap();
        assert_eq!(
            d.action.unwrap(),
            ("hello".into(), json!({"name":"Kellyson"}))
        );
    }
    #[test]
    fn refuses_wrong_room() {
        let b = frame("room-a", "chat", &json!("oi")).unwrap();
        assert!(Decoder::default().decode("room-b", &b).is_err());
    }
}
