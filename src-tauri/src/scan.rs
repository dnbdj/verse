use lofty::prelude::*;
use lofty::tag::ItemKey;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use walkdir::WalkDir;

use crate::db::now_ms;

pub struct Summary {
    pub added: i64,
    pub updated: i64,
    pub skipped: i64,
}

const EXTENSIONS: [&str; 8] = ["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus", "wma"];

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn scan_folder(root: &Path, conn: &Connection, covers: &Path) -> Result<Summary, String> {
    let now = now_ms();
    let mut summary = Summary {
        added: 0,
        updated: 0,
        skipped: 0,
    };

    for entry in WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !is_audio(path) {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();

        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM tracks WHERE path = ?1",
                params![path_str],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let id = existing_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let mut title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
        let mut artist = String::new();
        let mut album = String::new();
        let mut album_artist = String::new();
        let mut genre: Option<String> = None;
        let mut track_no: Option<i64> = None;
        let mut disc_no: Option<i64> = None;
        let mut year: Option<i64> = None;
        let mut duration_ms = 0i64;
        let mut cover_path: Option<String> = None;
        let mut lyrics_text: Option<String> = None;
        let mut lyrics_source: Option<String> = None;

        if let Ok(tagged) = lofty::read_from_path(path) {
            duration_ms = tagged.properties().duration().as_millis() as i64;
            if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
                if let Some(value) = tag.title() {
                    title = value.to_string();
                }
                if let Some(value) = tag.artist() {
                    artist = value.to_string();
                }
                if let Some(value) = tag.album() {
                    album = value.to_string();
                }
                if let Some(value) = tag.get_string(&ItemKey::AlbumArtist) {
                    album_artist = value.to_string();
                }
                if let Some(value) = tag.genre() {
                    genre = Some(value.to_string());
                }
                track_no = tag.track().map(|v| v as i64);
                disc_no = tag.disk().map(|v| v as i64);
                year = tag.year().map(|v| v as i64);

                if let Some(text) = tag.get_string(&ItemKey::Lyrics) {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() {
                        lyrics_text = Some(trimmed.to_string());
                        lyrics_source = Some("embedded".to_string());
                    }
                }

                if let Some(picture) = tag.pictures().first() {
                    let bytes = picture.data();
                    if !bytes.is_empty() {
                        let ext = sniff_image_ext(bytes);
                        let file_name = format!("{id}.{ext}");
                        let target = covers.join(&file_name);
                        if std::fs::write(&target, bytes).is_ok() {
                            cover_path = Some(target.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        if lyrics_text.is_none() {
            let sidecar = path.with_extension("lrc");
            if sidecar.is_file() {
                if let Ok(text) = std::fs::read_to_string(&sidecar) {
                    if !text.trim().is_empty() {
                        lyrics_text = Some(text);
                        lyrics_source = Some("sidecar".to_string());
                    }
                }
            }
        }

        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);

        if existing_id.is_some() {
            conn.execute(
                "UPDATE tracks SET title=?1, artist=?2, album=?3, album_artist=?4, duration_ms=?5,
                                   track_no=?6, disc_no=?7, year=?8, genre=?9, cover_path=?10,
                                   size=?11, lyrics_text=?12, lyrics_source=?13
                 WHERE id=?14",
                params![
                    title,
                    artist,
                    album,
                    album_artist,
                    duration_ms,
                    track_no,
                    disc_no,
                    year,
                    genre,
                    cover_path,
                    size,
                    lyrics_text,
                    lyrics_source,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            summary.updated += 1;
        } else {
            conn.execute(
                "INSERT INTO tracks (id, path, title, artist, album, album_artist, duration_ms,
                                     track_no, disc_no, year, genre, cover_path, size, added_at,
                                     lyrics_text, lyrics_source)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    id,
                    path_str,
                    title,
                    artist,
                    album,
                    album_artist,
                    duration_ms,
                    track_no,
                    disc_no,
                    year,
                    genre,
                    cover_path,
                    size,
                    now,
                    lyrics_text,
                    lyrics_source
                ],
            )
            .map_err(|e| e.to_string())?;
            summary.added += 1;
        }
    }

    Ok(summary)
}

fn sniff_image_ext(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xFF, 0xD8]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        "bin"
    }
}
