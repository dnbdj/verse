use crate::db::LyricsPayload;

const USER_AGENT: &str = "Verse/0.1 (local music player)";

pub struct Lookup {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: i64,
}

pub fn fetch(lookup: &Lookup) -> Result<LyricsPayload, String> {
    let duration = if lookup.duration_ms > 0 {
        (lookup.duration_ms / 1000).to_string()
    } else {
        String::new()
    };

    let mut url = format!(
        "https://lrclib.net/api/get?track_name={}&artist_name={}",
        enc(&lookup.title),
        enc(&lookup.artist)
    );
    if !lookup.album.is_empty() {
        url.push_str(&format!("&album_name={}", enc(&lookup.album)));
    }
    if !duration.is_empty() {
        url.push_str(&format!("&duration={duration}"));
    }

    match get_json(&url) {
        Ok(value) => parse_record(&value),
        Err(_) => search(lookup, duration.as_str()),
    }
}

fn search(lookup: &Lookup, duration: &str) -> Result<LyricsPayload, String> {
    let query = format!("{} {}", lookup.title, lookup.artist);
    let url = format!("https://lrclib.net/api/search?q={}", enc(query.trim()));
    let value = get_json(&url)?;
    let records = value.as_array().cloned().unwrap_or_default();

    let wanted: Option<f64> = duration.parse().ok();
    let mut best: Option<&serde_json::Value> = None;
    let mut best_delta = f64::MAX;

    for record in &records {
        let has_synced = record
            .get("syncedLyrics")
            .and_then(|v| v.as_str())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        if !has_synced {
            continue;
        }
        let delta = match (wanted, record.get("duration").and_then(|v| v.as_f64())) {
            (Some(a), Some(b)) => (a - b).abs(),
            _ => 0.0,
        };
        if delta < best_delta {
            best_delta = delta;
            best = Some(record);
        }
    }

    match best {
        Some(record) => parse_record(record),
        None => Ok(empty_payload()),
    }
}

fn parse_record(value: &serde_json::Value) -> Result<LyricsPayload, String> {
    let synced = value
        .get("syncedLyrics")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let plain = value
        .get("plainLyrics")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if synced.is_none() && plain.is_none() {
        return Ok(empty_payload());
    }

    Ok(LyricsPayload {
        synced,
        plain,
        source: "lrclib".to_string(),
        record_id: value.get("id").and_then(|v| v.as_i64()),
        instrumental: value
            .get("instrumental")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        duration_ms: value
            .get("duration")
            .and_then(|v| v.as_f64())
            .map(|d| (d * 1000.0) as i64)
            .unwrap_or(0),
    })
}

pub fn empty_payload() -> LyricsPayload {
    LyricsPayload {
        synced: None,
        plain: None,
        source: "none".to_string(),
        record_id: None,
        instrumental: false,
        duration_ms: 0,
    }
}

fn get_json(url: &str) -> Result<serde_json::Value, String> {
    let response = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Lrclib-Client", USER_AGENT)
        .timeout(std::time::Duration::from_secs(8))
        .call();

    match response {
        Ok(res) => res
            .into_json::<serde_json::Value>()
            .map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, _)) => Err(format!("lrclib {code}")),
        Err(error) => Err(error.to_string()),
    }
}

fn enc(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
