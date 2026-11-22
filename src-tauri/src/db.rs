use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub struct Db {
    pub conn: Mutex<Connection>,
    pub covers: PathBuf,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub duration_ms: i64,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub cover_path: Option<String>,
    pub size: i64,
    pub added_at: i64,
    pub last_played_at: Option<i64>,
    pub play_count: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<String>,
    pub remote_tracks: Vec<RemoteTrack>,
}

/// A song saved from a streaming service. It lives in the playlist row as JSON so
/// the local track table stays a pure index of files on disk.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTrack {
    pub id: String,
    pub service: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub art: Option<String>,
    pub duration_ms: i64,
    pub url: String,
    pub preview_url: Option<String>,
    pub uri: Option<String>,
    pub added_at: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub path: String,
    pub track_count: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPayload {
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub source: String,
    pub record_id: Option<i64>,
    pub instrumental: bool,
    pub duration_ms: i64,
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  path TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  album_artist TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  track_no INTEGER,
  disc_no INTEGER,
  year INTEGER,
  genre TEXT,
  cover_path TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  last_played_at INTEGER,
  play_count INTEGER NOT NULL DEFAULT 0,
  lyrics_text TEXT,
  lyrics_source TEXT
);

CREATE INDEX IF NOT EXISTS tracks_album ON tracks(album);
CREATE INDEX IF NOT EXISTS tracks_artist ON tracks(artist);

CREATE TABLE IF NOT EXISTS lyrics_cache (
  track_id TEXT PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  synced TEXT,
  plain TEXT,
  record_id INTEGER,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  remote_tracks TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);
"#;

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn remote_tracks(raw: &str) -> Vec<RemoteTrack> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn write_remote_tracks(
    conn: &Connection,
    playlist_id: &str,
    tracks: &[RemoteTrack],
) -> Result<(), String> {
    let raw = serde_json::to_string(tracks).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE playlists SET remote_tracks = ?2 WHERE id = ?1",
        params![playlist_id, raw],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Adds a remote song, replacing the row's metadata if it is already saved.
pub fn add_remote_track(
    conn: &Connection,
    playlist_id: &str,
    track: &RemoteTrack,
) -> Result<(), String> {
    let raw: String = conn
        .query_row(
            "SELECT remote_tracks FROM playlists WHERE id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut tracks = remote_tracks(&raw);
    if let Some(existing) = tracks.iter_mut().find(|entry| entry.id == track.id) {
        *existing = track.clone();
    } else {
        tracks.push(track.clone());
    }
    write_remote_tracks(conn, playlist_id, &tracks)
}

pub fn remove_remote_track(
    conn: &Connection,
    playlist_id: &str,
    track_id: &str,
) -> Result<(), String> {
    let raw: String = conn
        .query_row(
            "SELECT remote_tracks FROM playlists WHERE id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let tracks: Vec<RemoteTrack> = remote_tracks(&raw)
        .into_iter()
        .filter(|entry| entry.id != track_id)
        .collect();
    write_remote_tracks(conn, playlist_id, &tracks)
}

/// Renames a playlist. A blank name is ignored rather than stored.
pub fn rename_playlist(conn: &Connection, playlist_id: &str, name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    conn.execute(
        "UPDATE playlists SET name = ?2 WHERE id = ?1",
        params![playlist_id, trimmed],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Rewrites a playlist's positions in one transaction.
///
/// The list only has to name the tracks being moved: ids that are not in the playlist
/// are ignored, and tracks the caller left out keep their relative order at the end.
/// That keeps a partial UI list (say, a filtered view) from dropping tracks.
pub fn reorder_playlist(
    conn: &mut Connection,
    playlist_id: &str,
    track_ids: &[String],
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut current: Vec<String> = tx
        .prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
        )
        .map_err(|e| e.to_string())?
        .query_map(params![playlist_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut ordered: Vec<String> = Vec::with_capacity(current.len());
    for id in track_ids {
        if current.contains(id) && !ordered.contains(id) {
            ordered.push(id.clone());
        }
    }
    for id in current.drain(..) {
        if !ordered.contains(&id) {
            ordered.push(id);
        }
    }

    {
        let mut statement = tx
            .prepare(
                "UPDATE playlist_tracks SET position = ?3 WHERE playlist_id = ?1 AND track_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        for (index, track_id) in ordered.iter().enumerate() {
            statement
                .execute(params![playlist_id, track_id, index as i64])
                .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn init(app: &AppHandle) -> Result<Db, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let covers = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("no cache dir: {e}"))?
        .join("covers");
    std::fs::create_dir_all(&covers).map_err(|e| e.to_string())?;

    let conn = Connection::open(data_dir.join("verse.db")).map_err(|e| e.to_string())?;
    conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;

    // Databases created before remote playlist saves existed need the new column.
    let mut has_remote = false;
    {
        let mut columns = conn
            .prepare("PRAGMA table_info(playlists)")
            .map_err(|e| e.to_string())?;
        let names = columns
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?;
        for name in names {
            if name.map_err(|e| e.to_string())? == "remote_tracks" {
                has_remote = true;
            }
        }
    }
    if !has_remote {
        conn.execute(
            "ALTER TABLE playlists ADD COLUMN remote_tracks TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(Db {
        conn: Mutex::new(conn),
        covers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.execute_batch(SCHEMA).expect("schema");
        conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES ('p1', 'Warm up', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES ('p2', 'Night drive', 2)",
            [],
        )
        .unwrap();
        for (index, id) in ["t1", "t2", "t3", "t4"].iter().enumerate() {
            conn.execute(
                "INSERT INTO tracks (id, path, title, added_at) VALUES (?1, ?2, ?3, 1)",
                params![id, format!("/music/{id}.mp3"), id],
            )
            .unwrap();
            if index < 3 {
                conn.execute(
                    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('p1', ?1, ?2)",
                    params![id, index as i64],
                )
                .unwrap();
            }
        }
        conn
    }

    fn order(conn: &Connection, playlist: &str) -> Vec<String> {
        conn.prepare(
            "SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position ASC",
        )
        .unwrap()
        .query_map(params![playlist], |row| row.get::<_, String>(0))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap()
    }

    fn name(conn: &Connection, id: &str) -> String {
        conn.query_row(
            "SELECT name FROM playlists WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap()
    }

    fn remote(id: &str, title: &str) -> RemoteTrack {
        RemoteTrack {
            id: id.into(),
            service: "deezer".into(),
            title: title.into(),
            artist: "Artist".into(),
            album: "Album".into(),
            art: None,
            duration_ms: 180_000,
            url: format!("https://www.deezer.com/track/{id}"),
            preview_url: None,
            uri: None,
            added_at: 1,
        }
    }

    #[test]
    fn remote_tracks_round_trip_in_saved_order() {
        let conn = seeded();
        add_remote_track(&conn, "p1", &remote("deezer:track:1", "First")).unwrap();
        add_remote_track(&conn, "p1", &remote("spotify:track:2", "Second")).unwrap();
        add_remote_track(&conn, "p1", &remote("deezer:track:1", "First again")).unwrap();

        let raw: String = conn
            .query_row(
                "SELECT remote_tracks FROM playlists WHERE id = 'p1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let tracks = remote_tracks(&raw);
        assert_eq!(
            tracks.len(),
            2,
            "saving the same service song updates one row"
        );
        assert_eq!(tracks[0].title, "First again");
        assert_eq!(tracks[1].title, "Second");

        remove_remote_track(&conn, "p1", "deezer:track:1").unwrap();
        let raw: String = conn
            .query_row(
                "SELECT remote_tracks FROM playlists WHERE id = 'p1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remote_tracks(&raw).len(), 1);
        assert_eq!(remote_tracks(&raw)[0].title, "Second");
    }

    #[test]
    fn rename_playlist_round_trips_through_sqlite() {
        let conn = seeded();
        rename_playlist(&conn, "p1", "  Late ferry  ").unwrap();
        assert_eq!(name(&conn, "p1"), "Late ferry");
        assert_eq!(name(&conn, "p2"), "Night drive");

        rename_playlist(&conn, "p1", "   ").unwrap();
        assert_eq!(name(&conn, "p1"), "Late ferry", "blank names are ignored");
    }

    #[test]
    fn reorder_playlist_persists_the_requested_order() {
        let mut conn = seeded();
        reorder_playlist(&mut conn, "p1", &["t3".into(), "t1".into(), "t2".into()]).unwrap();
        assert_eq!(order(&conn, "p1"), vec!["t3", "t1", "t2"]);
    }

    #[test]
    fn reorder_keeps_omitted_tracks_and_ignores_foreign_ids() {
        let mut conn = seeded();
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('p1','t4',9)",
            [],
        )
        .unwrap();
        reorder_playlist(&mut conn, "p1", &["t2".into(), "nope".into()]).unwrap();
        assert_eq!(order(&conn, "p1"), vec!["t2", "t1", "t3", "t4"]);
        assert_eq!(order(&conn, "p2"), Vec::<String>::new());
    }

    #[test]
    fn reorder_survives_reopening_the_database_file() {
        // Proves the transaction commits to disk, not only to this connection's view.
        let dir = std::env::temp_dir().join(format!("verse-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("verse.db");
        {
            let mut conn = Connection::open(&path).unwrap();
            conn.execute_batch(SCHEMA).unwrap();
            conn.execute(
                "INSERT INTO playlists (id, name, created_at) VALUES ('p1','Mix',1)",
                [],
            )
            .unwrap();
            for (index, id) in ["a", "b", "c"].iter().enumerate() {
                conn.execute(
                    "INSERT INTO tracks (id, path, title, added_at) VALUES (?1, ?2, ?3, 1)",
                    params![id, format!("/m/{id}.mp3"), id],
                )
                .unwrap();
                conn.execute(
                    "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ('p1', ?1, ?2)",
                    params![id, index as i64],
                )
                .unwrap();
            }
            reorder_playlist(&mut conn, "p1", &["c".into(), "a".into(), "b".into()]).unwrap();
        }
        {
            let conn = Connection::open(&path).unwrap();
            assert_eq!(order(&conn, "p1"), vec!["c", "a", "b"]);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
