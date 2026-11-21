mod db;
mod lyrics;
mod scan;
mod spotify;

use db::{now_ms, Db, Folder, LyricsPayload, Playlist, Track};
use rusqlite::{params, OptionalExtension};
use tauri::{AppHandle, Manager, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanSummary {
    added: i64,
    updated: i64,
    skipped: i64,
}

fn map_track(row: &rusqlite::Row<'_>) -> rusqlite::Result<Track> {
    Ok(Track {
        id: row.get("id")?,
        path: row.get("path")?,
        title: row.get("title")?,
        artist: row.get("artist")?,
        album: row.get("album")?,
        album_artist: row.get("album_artist")?,
        duration_ms: row.get("duration_ms")?,
        track_no: row.get("track_no")?,
        disc_no: row.get("disc_no")?,
        year: row.get("year")?,
        genre: row.get("genre")?,
        cover_path: row.get("cover_path")?,
        size: row.get("size")?,
        added_at: row.get("added_at")?,
        last_played_at: row.get("last_played_at")?,
        play_count: row.get("play_count")?,
    })
}

#[tauri::command]
fn list_tracks(db: State<'_, Db>) -> Result<Vec<Track>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT * FROM tracks ORDER BY added_at DESC")
        .map_err(|e| e.to_string())?;
    let tracks = stmt
        .query_map([], |row| map_track(row))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(tracks)
}

#[tauri::command]
fn list_folders(db: State<'_, Db>) -> Result<Vec<Folder>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT f.path AS path,
                    (SELECT COUNT(*) FROM tracks t WHERE t.path LIKE f.path || '%') AS track_count
             FROM folders f ORDER BY f.added_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let folders = stmt
        .query_map([], |row| {
            Ok(Folder {
                path: row.get("path")?,
                track_count: row.get("track_count")?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
async fn add_folder(app: AppHandle, path: String) -> Result<ScanSummary, String> {
    let summary = tauri::async_runtime::spawn_blocking(move || -> Result<ScanSummary, String> {
        let state = app.state::<Db>();
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO folders (path, added_at) VALUES (?1, ?2)",
            params![path, now_ms()],
        )
        .map_err(|e| e.to_string())?;
        let result = scan::scan_folder(std::path::Path::new(&path), &conn, &state.covers)?;
        Ok(ScanSummary {
            added: result.added,
            updated: result.updated,
            skipped: result.skipped,
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(summary)
}

/// Android's folder picker hands back `content://` SAF URIs, which the scanner cannot walk.
/// Instead we scan the shared music locations directly, which needs READ_MEDIA_AUDIO.
#[tauri::command]
async fn scan_device_music(app: AppHandle) -> Result<ScanSummary, String> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Scanning device music is only available on Android".to_string())
    }

    #[cfg(target_os = "android")]
    {
        let summary = tauri::async_runtime::spawn_blocking(move || -> Result<ScanSummary, String> {
            let state = app.state::<Db>();
            let conn = state.conn.lock().map_err(|e| e.to_string())?;
            let roots = [
                "/storage/emulated/0/Music",
                "/sdcard/Music",
                "/storage/emulated/0/Download",
                "/storage/emulated/0/Podcasts",
            ];
            let mut total = ScanSummary {
                added: 0,
                updated: 0,
                skipped: 0,
            };
            let mut scanned_any = false;
            for root in roots {
                let path = std::path::Path::new(root);
                if !path.is_dir() || root == "/sdcard/Music" && scanned_any {
                    continue;
                }
                scanned_any = true;
                conn.execute(
                    "INSERT OR IGNORE INTO folders (path, added_at) VALUES (?1, ?2)",
                    params![root, now_ms()],
                )
                .map_err(|e| e.to_string())?;
                let result = scan::scan_folder(path, &conn, &state.covers)?;
                total.added += result.added;
                total.updated += result.updated;
                total.skipped += result.skipped;
            }
            if !scanned_any {
                return Err(
                    "No music folder found on this device — copy songs into Music and try again"
                        .to_string(),
                );
            }
            Ok(total)
        })
        .await
        .map_err(|e| e.to_string())??;

        Ok(summary)
    }
}

#[tauri::command]
fn remove_folder(db: State<'_, Db>, path: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM tracks WHERE path LIKE ?1 || '%'",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn mark_played(db: State<'_, Db>, track_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET last_played_at = ?1, play_count = play_count + 1 WHERE id = ?2",
        params![now_ms(), track_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_playlists(db: State<'_, Db>) -> Result<Vec<Playlist>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM playlists ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut playlists = Vec::with_capacity(rows.len());
    for (id, name) in rows {
        let mut track_stmt = conn
            .prepare(
                "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
            )
            .map_err(|e| e.to_string())?;
        let track_ids = track_stmt
            .query_map(params![id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        playlists.push(Playlist {
            id,
            name,
            track_ids,
        });
    }
    Ok(playlists)
}

#[tauri::command]
fn create_playlist(db: State<'_, Db>, name: String) -> Result<Playlist, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, name, now_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(Playlist {
        id,
        name,
        track_ids: Vec::new(),
    })
}

#[tauri::command]
fn delete_playlist(db: State<'_, Db>, playlist_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn add_to_playlist(db: State<'_, Db>, playlist_id: String, track_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
        params![playlist_id, track_id, next],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn remove_from_playlist(
    db: State<'_, Db>,
    playlist_id: String,
    track_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
        params![playlist_id, track_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn lyrics_for(app: AppHandle, track_id: String) -> Result<LyricsPayload, String> {
    enum Next {
        Ready(LyricsPayload),
        Fetch(lyrics::Lookup),
        Nothing,
    }

    let next = {
        let state = app.state::<Db>();
        let conn = state.conn.lock().map_err(|e| e.to_string())?;

        let track = conn
            .query_row(
                "SELECT title, artist, album, duration_ms, lyrics_text, lyrics_source
                 FROM tracks WHERE id = ?1",
                params![track_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((title, artist, album, duration_ms, text, text_source)) = track else {
            return Ok(lyrics::empty_payload());
        };

        let cached = conn
            .query_row(
                "SELECT source, synced, plain, record_id FROM lyrics_cache WHERE track_id = ?1",
                params![track_id],
                |row| {
                    Ok(LyricsPayload {
                        source: row.get(0)?,
                        synced: row.get(1)?,
                        plain: row.get(2)?,
                        record_id: row.get(3)?,
                        instrumental: false,
                        duration_ms,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if let Some(payload) = cached {
            if payload.synced.is_some() || payload.plain.is_some() {
                Next::Ready(payload)
            } else {
                Next::Nothing
            }
        } else if let Some(text) = text.filter(|t| !t.trim().is_empty()) {
            Next::Ready(LyricsPayload {
                synced: Some(text),
                plain: None,
                source: text_source.unwrap_or_else(|| "manual".to_string()),
                record_id: None,
                instrumental: false,
                duration_ms,
            })
        } else {
            Next::Fetch(lyrics::Lookup {
                title,
                artist,
                album,
                duration_ms,
            })
        }
    };

    match next {
        Next::Ready(payload) => Ok(payload),
        Next::Nothing => Ok(lyrics::empty_payload()),
        Next::Fetch(lookup) => {
            let fetched = tauri::async_runtime::spawn_blocking(move || lyrics::fetch(&lookup))
                .await
                .map_err(|e| e.to_string())??;

            if fetched.source == "lrclib" {
                let state = app.state::<Db>();
                let conn = state.conn.lock().map_err(|e| e.to_string())?;
                conn.execute(
                    "INSERT INTO lyrics_cache (track_id, source, synced, plain, record_id, fetched_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT(track_id) DO UPDATE SET
                       source=excluded.source, synced=excluded.synced, plain=excluded.plain,
                       record_id=excluded.record_id, fetched_at=excluded.fetched_at",
                    params![
                        track_id,
                        fetched.source,
                        fetched.synced,
                        fetched.plain,
                        fetched.record_id,
                        now_ms()
                    ],
                )
                .map_err(|e| e.to_string())?;
            }

            Ok(fetched)
        }
    }
}

#[tauri::command]
fn save_lyrics(db: State<'_, Db>, track_id: String, text: String) -> Result<LyricsPayload, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET lyrics_text = ?1, lyrics_source = 'manual' WHERE id = ?2",
        params![text, track_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM lyrics_cache WHERE track_id = ?1",
        params![track_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(LyricsPayload {
        synced: Some(text),
        plain: None,
        source: "manual".to_string(),
        record_id: None,
        instrumental: false,
        duration_ms: 0,
    })
}

#[tauri::command]
fn forget_lyrics(db: State<'_, Db>, track_id: String) -> Result<LyricsPayload, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM lyrics_cache WHERE track_id = ?1",
        params![track_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET lyrics_text = NULL, lyrics_source = NULL
         WHERE id = ?1 AND lyrics_source = 'manual'",
        params![track_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(lyrics::empty_payload())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database = db::init(app.handle()).map_err(|e| -> Box<dyn std::error::Error> {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
            })?;
            app.manage(database);

            // No OS keychain on mobile: point Spotify's secret store at the app data dir.
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                if let Ok(dir) = app.path().app_data_dir() {
                    spotify::set_secret_dir(dir);
                }
            }

            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    // Acrylic: the desktop behind the window is blurred through the glass layers.
                    match window_vibrancy::apply_acrylic(&window, Some((10, 10, 14, 70))) {
                        Ok(()) => eprintln!("[verse] acrylic applied"),
                        Err(error) => eprintln!("[verse] acrylic failed: {error}"),
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_tracks,
            list_folders,
            add_folder,
            scan_device_music,
            remove_folder,
            mark_played,
            list_playlists,
            create_playlist,
            delete_playlist,
            add_to_playlist,
            remove_from_playlist,
            lyrics_for,
            save_lyrics,
            forget_lyrics,
            spotify::spotify_configure,
            spotify::spotify_status,
            spotify::spotify_login,
            spotify::spotify_disconnect,
            spotify::spotify_library,
            spotify::spotify_playback,
            spotify::spotify_control,
            spotify::spotify_play
        ])
        .run(tauri::generate_context!())
        .expect("error while running Verse");
}
