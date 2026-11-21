use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API: &str = "https://api.spotify.com/v1";
const SERVICE: &str = "com.verse.player";
const SCOPES: &str = "user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read playlist-read-private";

static TOKEN_CACHE: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();

fn cache() -> &'static Mutex<Option<(String, Instant)>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

fn store(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|e| format!("keychain: {e}"))
}

fn load(key: &str) -> Option<String> {
    entry(key).ok()?.get_password().ok()
}

fn forget(key: &str) {
    if let Ok(entry) = entry(key) {
        let _ = entry.delete_credential();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyStatus {
    pub configured: bool,
    pub connected: bool,
    pub name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpTrack {
    pub id: String,
    pub name: String,
    pub artists: String,
    pub art: Option<String>,
    pub duration_ms: i64,
    pub uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpPlaylist {
    pub id: String,
    pub name: String,
    pub art: Option<String>,
    pub track_count: i64,
    pub uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpLibrary {
    pub liked: Vec<SpTrack>,
    pub playlists: Vec<SpPlaylist>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpPlayback {
    pub playing: bool,
    pub name: String,
    pub artists: String,
    pub art: Option<String>,
    pub progress_ms: i64,
    pub duration_ms: i64,
    pub device: Option<String>,
}

#[tauri::command]
pub fn spotify_configure(client_id: String) -> Result<(), String> {
    let trimmed = client_id.trim();
    if trimmed.is_empty() {
        return Err("Paste a Client ID first".into());
    }
    *cache().lock().map_err(|e| e.to_string())? = None;
    store("client_id", trimmed)
}

#[tauri::command]
pub async fn spotify_status() -> Result<SpotifyStatus, String> {
    tauri::async_runtime::spawn_blocking(status_blocking)
        .await
        .map_err(|e| e.to_string())?
}

fn status_blocking() -> Result<SpotifyStatus, String> {
    let configured = load("client_id").is_some();
    let connected = load("refresh_token").is_some();
    if !connected {
        return Ok(SpotifyStatus {
            configured,
            connected: false,
            name: None,
        });
    }
    match api_json("GET", "/me", None) {
        Ok(value) => Ok(SpotifyStatus {
            configured,
            connected: true,
            name: value
                .get("display_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        }),
        Err(_) => Ok(SpotifyStatus {
            configured,
            connected: false,
            name: None,
        }),
    }
}

#[tauri::command]
pub async fn spotify_login(app: tauri::AppHandle) -> Result<SpotifyStatus, String> {
    let client_id = load("client_id").ok_or("Save your Client ID first")?;
    let verifier: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(96)
        .map(char::from)
        .collect();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let redirect = format!("http://127.0.0.1:{port}/callback");

    let url = format!(
        "{AUTH_URL}?client_id={}&response_type=code&redirect_uri={}&scope={}&code_challenge_method=S256&code_challenge={}",
        enc(&client_id),
        enc(&redirect),
        enc(SCOPES),
        challenge
    );

    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())?;
    let _ = app;

    let outer = client_id.clone();
    let callback = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        wait_for_code(listener)
    })
    .await
    .map_err(|e| e.to_string())??;

    let token = post_form(
        TOKEN_URL,
        &[
            ("grant_type", "authorization_code".to_string()),
            ("code", callback),
            ("redirect_uri", redirect),
            ("client_id", outer),
            ("code_verifier", verifier),
        ],
    )?;

    let refresh = token
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or("Spotify did not return a refresh token")?;
    store("refresh_token", refresh)?;
    *cache().lock().map_err(|e| e.to_string())? = token
        .get("access_token")
        .and_then(|v| v.as_str())
        .map(|value| (value.to_string(), Instant::now()));

    status_blocking()
}

#[tauri::command]
pub fn spotify_disconnect() -> Result<(), String> {
    forget("refresh_token");
    *cache().lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn spotify_library() -> Result<SpLibrary, String> {
    let liked_json = api_json("GET", "/me/tracks?limit=50", None)?;
    let liked = liked_json
        .get("items")
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(track_from_saved).collect())
        .unwrap_or_default();

    let lists_json = api_json("GET", "/me/playlists?limit=50", None)?;
    let playlists = lists_json
        .get("items")
        .and_then(|v| v.as_array())
        .map(|items| items.iter().filter_map(playlist_from).collect())
        .unwrap_or_default();

    Ok(SpLibrary { liked, playlists })
}

#[tauri::command]
pub fn spotify_playback() -> Result<Option<SpPlayback>, String> {
    let value = api_json("GET", "/me/player", None)?;
    if value.is_null() {
        return Ok(None);
    }
    let item = value.get("item");
    let Some(item) = item.filter(|v| !v.is_null()) else {
        return Ok(None);
    };
    Ok(Some(SpPlayback {
        playing: value
            .get("is_playing")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        name: item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        artists: artists_of(item),
        art: art_of(item),
        progress_ms: value
            .get("progress_ms")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        duration_ms: item
            .get("duration_ms")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        device: value
            .get("device")
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    }))
}

#[tauri::command]
pub fn spotify_control(action: String) -> Result<(), String> {
    match action.as_str() {
        "play" => api_json("PUT", "/me/player/play", None).map(|_| ()),
        "pause" => api_json("PUT", "/me/player/pause", None).map(|_| ()),
        "next" => api_json("POST", "/me/player/next", None).map(|_| ()),
        "previous" => api_json("POST", "/me/player/previous", None).map(|_| ()),
        other => Err(format!("unknown action {other}")),
    }
}

#[tauri::command]
pub fn spotify_play(uri: String) -> Result<(), String> {
    let body = if uri.contains(":track:") {
        serde_json::json!({ "uris": [uri] })
    } else {
        serde_json::json!({ "context_uri": uri })
    };
    api_json("PUT", "/me/player/play", Some(body)).map(|_| ())
}

fn wait_for_code(listener: TcpListener) -> Result<String, String> {
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(180);

    for stream in listener.incoming() {
        if Instant::now() > deadline {
            return Err("Timed out waiting for Spotify".into());
        }
        let mut stream = stream.map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
        let mut request_line = String::new();
        reader
            .read_line(&mut request_line)
            .map_err(|e| e.to_string())?;

        let code = request_line
            .split_whitespace()
            .nth(1)
            .and_then(|path| path.split_once("code="))
            .map(|(_, rest)| rest.split('&').next().unwrap_or("").to_string());

        let body = "<html><body style=\"font-family:sans-serif;background:#0b0b0d;color:#f3f0ea;display:grid;place-items:center;height:100vh\"><div>Connected to Spotify — you can close this tab.</div></body></html>";
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.flush();

        if let Some(code) = code {
            if !code.is_empty() {
                return Ok(code);
            }
        }
        if request_line.contains("error=") {
            return Err("Spotify authorisation was declined".into());
        }
    }
    Err("No response from Spotify".into())
}

fn access_token() -> Result<String, String> {
    if let Some((token, issued)) = cache().lock().map_err(|e| e.to_string())?.as_ref() {
        if issued.elapsed() < Duration::from_secs(3000) {
            return Ok(token.clone());
        }
    }

    let client_id = load("client_id").ok_or("Save your Client ID first")?;
    let refresh = load("refresh_token").ok_or("Connect Spotify first")?;
    let token = post_form(
        TOKEN_URL,
        &[
            ("grant_type", "refresh_token".to_string()),
            ("refresh_token", refresh),
            ("client_id", client_id),
        ],
    )?;
    let access = token
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Spotify refresh failed")?
        .to_string();
    *cache().lock().map_err(|e| e.to_string())? = Some((access.clone(), Instant::now()));
    Ok(access)
}

fn api_json(
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let token = access_token()?;
    let url = format!("{API}{path}");
    let request = match method {
        "GET" => ureq::get(&url),
        "POST" => ureq::post(&url),
        "PUT" => ureq::put(&url),
        other => return Err(format!("bad method {other}")),
    }
    .set("Authorization", &format!("Bearer {token}"))
    .timeout(Duration::from_secs(15));

    let response = match body {
        Some(value) => request
            .set("Content-Type", "application/json")
            .send_string(&value.to_string()),
        None => request.call(),
    };

    match response {
        Ok(res) => {
            if res.status() == 204 {
                return Ok(serde_json::Value::Null);
            }
            let text = res.into_string().unwrap_or_default();
            if text.is_empty() {
                Ok(serde_json::Value::Null)
            } else {
                serde_json::from_str(&text).map_err(|e| e.to_string())
            }
        }
        Err(ureq::Error::Status(401, _)) => {
            *cache().lock().map_err(|e| e.to_string())? = None;
            Err("Spotify session expired — reconnect in Settings".into())
        }
        Err(ureq::Error::Status(code, response)) => {
            let text = response.into_string().unwrap_or_default();
            let reason = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or(text);
            Err(format!("Spotify {code}: {reason}"))
        }
        Err(error) => Err(error.to_string()),
    }
}

fn post_form(url: &str, form: &[(&str, String)]) -> Result<serde_json::Value, String> {
    let body = form
        .iter()
        .map(|(key, value)| format!("{key}={}", enc(value)))
        .collect::<Vec<_>>()
        .join("&");

    let response = ureq::post(url)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(Duration::from_secs(20))
        .send_string(&body);

    match response {
        Ok(res) => res.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, response)) => {
            let text = response.into_string().unwrap_or_default();
            Err(format!("Spotify token {code}: {text}"))
        }
        Err(error) => Err(error.to_string()),
    }
}

fn track_from_saved(item: &serde_json::Value) -> Option<SpTrack> {
    let track = item.get("track")?;
    Some(SpTrack {
        id: track.get("id").and_then(|v| v.as_str())?.to_string(),
        name: track
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string(),
        artists: artists_of(track),
        art: art_of(track),
        duration_ms: track
            .get("duration_ms")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        uri: track.get("uri").and_then(|v| v.as_str())?.to_string(),
    })
}

fn playlist_from(item: &serde_json::Value) -> Option<SpPlaylist> {
    Some(SpPlaylist {
        id: item.get("id").and_then(|v| v.as_str())?.to_string(),
        name: item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Playlist")
            .to_string(),
        art: item
            .get("images")
            .and_then(|v| v.as_array())
            .and_then(|images| images.first())
            .and_then(|image| image.get("url"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        track_count: item
            .get("tracks")
            .and_then(|v| v.get("total"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        uri: item
            .get("uri")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

fn artists_of(track: &serde_json::Value) -> String {
    track
        .get("artists")
        .and_then(|v| v.as_array())
        .map(|artists| {
            artists
                .iter()
                .filter_map(|artist| artist.get("name").and_then(|v| v.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default()
}

fn art_of(track: &serde_json::Value) -> Option<String> {
    track
        .get("album")
        .and_then(|album| album.get("images"))
        .and_then(|v| v.as_array())
        .and_then(|images| images.first())
        .and_then(|image| image.get("url"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
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
