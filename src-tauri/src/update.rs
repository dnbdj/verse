//! Update checking and self-install against the project's GitHub releases.
//!
//! Each launch compares the newest release tag with the running version, raises a
//! desktop notification and hands the release to the UI. The Download button then
//! fetches the attached `.exe` directly: a detached copy of Verse stages it beside
//! the app, swaps it in once the old process has closed, and reopens the previous
//! build if anything about the swap fails.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// The public repository whose Releases carry Verse builds.
const REPO: &str = "dnbdj/verse";
const USER_AGENT: &str = "Verse-Update-Check";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The version this build runs, e.g. 0.1.0.
    pub current: String,
    /// The newest published version, without its leading v.
    pub latest: String,
    /// The release page, kept as a fallback for manual downloads.
    pub url: String,
    /// Release notes, already trimmed to a readable length.
    pub notes: String,
}

/// Bytes downloaded so far, streamed to the banner while an update fetches.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    received: u64,
    total: u64,
}

/// Numeric parts of a tag like `v1.2.3`, ignoring any suffix after the numbers.
fn parse_version(raw: &str) -> Vec<u64> {
    raw.trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

/// True only when `latest` is strictly newer than `current`.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let next = parse_version(latest);
    let running = parse_version(current);
    let length = next.len().max(running.len());
    for index in 0..length {
        let a = next.get(index).copied().unwrap_or(0);
        let b = running.get(index).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

/// Windows files every toast under an AppUserModelID, and an unpackaged exe that
/// never registered one has its notification dropped without an error. Verse uses
/// its bundle identifier, registered per user so a portable copy works anywhere.
#[cfg(windows)]
fn claim_windows_identity() {
    use std::os::windows::process::CommandExt;

    /// The bundle identifier from tauri.conf.json.
    const AUMID: &str = "com.verse.player";
    /// Stops the helper console window from flashing on screen.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let key = format!("HKCU\\Software\\Classes\\AppUserModelId\\{AUMID}");
    let mut values = vec![("DisplayName", "Verse".to_string())];
    if let Ok(exe) = std::env::current_exe() {
        values.push(("IconUri", exe.display().to_string()));
    }
    for (name, value) in values {
        let _ = std::process::Command::new("reg")
            .args(["add", &key, "/v", name, "/t", "REG_SZ", "/d", &value, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }

    #[link(name = "shell32")]
    extern "system" {
        fn SetCurrentProcessExplicitAppUserModelID(app_id: *const u16) -> i32;
    }
    let wide: Vec<u16> = AUMID.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

/// Says it once per launch, so a re-render never repeats the toast.
fn announce(app: &AppHandle, info: &UpdateInfo) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static ANNOUNCED: AtomicBool = AtomicBool::new(false);
    if ANNOUNCED.swap(true, Ordering::SeqCst) {
        return;
    }

    #[cfg(windows)]
    claim_windows_identity();

    #[cfg(desktop)]
    {
        use tauri_plugin_notification::NotificationExt;
        if let Err(error) = app
            .notification()
            .builder()
            .title(format!("Verse {} is ready", info.latest))
            .body("A newer version is on GitHub. Open Verse to download it.")
            .show()
        {
            // Toasts can be unavailable (unpackaged exe, notifications off); the
            // in-app banner is the reliable channel.
            eprintln!("[verse] update notification failed: {error}");
        }
    }

    #[cfg(not(desktop))]
    let _ = (app, info);
}

/// The newest published release, or None when the repository has no releases.
fn newest_release() -> Result<Option<serde_json::Value>, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let response = ureq::get(&url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(8))
        .call();

    match response {
        Ok(response) => response
            .into_json::<serde_json::Value>()
            .map(Some)
            .map_err(|e| e.to_string()),
        // No releases yet is a normal state, not a failure worth showing.
        Err(ureq::Error::Status(404, _)) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Reads the newest published release and returns it only when it is newer.
#[tauri::command]
pub fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.to_string();
    let Some(body) = newest_release()? else {
        return Ok(None);
    };

    let tag = body
        .get("tag_name")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if tag.is_empty() || !is_newer(tag, &current) {
        return Ok(None);
    }

    let info = UpdateInfo {
        current: current.clone(),
        latest: tag.trim_start_matches(['v', 'V']).to_string(),
        url: body
            .get("html_url")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        notes: body
            .get("body")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .chars()
            .take(600)
            .collect(),
    };

    announce(&app, &info);
    Ok(Some(info))
}

/// The `.exe` attached to a release and its size, preferring the Windows build.
fn windows_asset(release: &serde_json::Value) -> Option<(String, u64)> {
    let assets = release.get("assets")?.as_array()?;
    let mut fallback = None;
    for asset in assets {
        let Some(name) = asset.get("name").and_then(|value| value.as_str()) else {
            continue;
        };
        let Some(url) = asset
            .get("browser_download_url")
            .and_then(|value| value.as_str())
        else {
            continue;
        };
        let name = name.to_ascii_lowercase();
        if !name.ends_with(".exe") {
            continue;
        }
        let entry = (
            url.to_string(),
            asset
                .get("size")
                .and_then(|value| value.as_u64())
                .unwrap_or(0),
        );
        if name.contains("windows") {
            return Some(entry);
        }
        if fallback.is_none() {
            fallback = Some(entry);
        }
    }
    fallback
}

/// Downloads a release `.exe` into the temp folder, refusing anything suspicious.
#[cfg(windows)]
fn download_exe(url: &str, app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let folder = std::env::temp_dir().join("verse-update");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let target = folder.join("Verse-new.exe");

    let response = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .timeout(Duration::from_secs(300))
        .call()
        .map_err(|e| format!("download failed: {e}"))?;
    let expected = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);

    let mut reader = response.into_reader();
    let mut file = File::create(&target).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 64 * 1024];
    let mut written = 0u64;
    let mut announced = 0u64;
    let progress = |received: u64| {
        let _ = app.emit(
            "update-download",
            DownloadProgress {
                received,
                total: expected.max(received),
            },
        );
    };
    progress(0);
    loop {
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        written += read as u64;
        if written - announced >= 131_072 {
            announced = written;
            progress(written);
        }
    }
    drop(file);

    // A truncated download or an HTML error page must never replace the app.
    if written < 1_000_000 {
        return Err(format!("the download was only {written} bytes"));
    }
    if expected > 0 && written != expected {
        return Err("the download was incomplete".to_string());
    }
    let mut signature = [0u8; 2];
    File::open(&target)
        .and_then(|mut file| file.read_exact(&mut signature))
        .map_err(|e| e.to_string())?;
    if &signature != b"MZ" {
        return Err("the download was not a Windows program".to_string());
    }
    progress(written);
    Ok(target)
}

/// How the updater copy is told to swap a downloaded exe into place.
const REPLACE_FLAG: &str = "--apply-update";

/// Written by the updater once the replacement is staged. The running app waits for
/// it before closing, so an updater that never starts leaves Verse open.
const READY_FILE: &str = "updater-ready";

fn ready_path() -> std::path::PathBuf {
    std::env::temp_dir().join("verse-update").join(READY_FILE)
}

/// Appends a line to the updater log, so a swap that fails stays diagnosable.
fn note_update(message: &str) {
    use std::io::Write as _;
    let folder = std::env::temp_dir().join("verse-update");
    let _ = fs::create_dir_all(&folder);
    if let Ok(mut log) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(folder.join("update.log"))
    {
        let _ = writeln!(log, "{message}");
    }
}

/// The arguments the updater copy starts with, when this process is that copy.
pub fn replacer_request() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let mut args = std::env::args_os().skip(1);
    if args.next()?.to_str()? != REPLACE_FLAG {
        return None;
    }
    Some((
        std::path::PathBuf::from(args.next()?),
        std::path::PathBuf::from(args.next()?),
    ))
}

/// Removes the updater copy and its readiness marker, then exits.
fn finish(code: i32) -> ! {
    let _ = fs::remove_file(ready_path());
    if let Ok(me) = std::env::current_exe() {
        let _ = fs::remove_file(me);
    }
    std::process::exit(code);
}

/// Opens the build that was running before the swap. A failed update must never
/// leave Verse closed, so every failure path ends here.
fn reopen_old(target: &std::path::Path, backup: &std::path::Path) -> ! {
    // The target is intact unless the rollback itself failed; in that case the
    // renamed backup still runs the old build.
    let old = if target.is_file() {
        target
    } else if backup.is_file() {
        backup
    } else {
        target
    };
    if let Err(error) = Command::new(old).spawn() {
        note_update(&format!("could not reopen the previous Verse: {error}"));
    }
    finish(1)
}

/// Waits for the old Verse to close, swaps the downloaded exe in and opens it.
/// Runs in a copy of Verse, before any window, plugin or database exists. The swap
/// is staged next to the app and the old build is kept aside until the new one has
/// started, so a failure at any step restores and reopens the previous build.
pub fn run_replacer(download: std::path::PathBuf, target: std::path::PathBuf) -> ! {
    note_update("updater started");
    // The old build still owns its exe for a moment after it closes.
    std::thread::sleep(Duration::from_millis(300));

    let staged = target.with_extension("update.exe");
    let backup = target.with_extension("previous.exe");
    let _ = fs::remove_file(&staged);
    let _ = fs::remove_file(&backup);

    // Stage the replacement on the same volume as the app, so putting it in place
    // is a rename instead of an in-place copy that could leave a half-written exe.
    if let Err(error) = fs::copy(&download, &staged) {
        note_update(&format!("could not stage the download: {error}"));
        let _ = fs::remove_file(&staged);
        reopen_old(&target, &backup);
    }
    let _ = fs::write(ready_path(), b"staged");

    // The old build keeps its exe open until Windows has released it; opening it
    // for writing only succeeds once that has happened.
    let mut unlocked = false;
    for _ in 0..240 {
        if fs::OpenOptions::new().write(true).open(&target).is_ok() {
            unlocked = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    if !unlocked {
        note_update("gave up waiting for the old build to close");
        let _ = fs::remove_file(&staged);
        reopen_old(&target, &backup);
    }

    if let Err(error) = fs::rename(&target, &backup) {
        note_update(&format!("could not move the old build aside: {error}"));
        let _ = fs::remove_file(&staged);
        reopen_old(&target, &backup);
    }

    if let Err(error) = fs::rename(&staged, &target) {
        note_update(&format!("could not put the new build in place: {error}"));
        let _ = fs::remove_file(&target);
        let _ = fs::rename(&backup, &target);
        reopen_old(&target, &backup);
    }
    note_update("new build copied");

    match Command::new(&target).spawn() {
        Ok(_) => {
            note_update("new build started");
            let _ = fs::remove_file(&backup);
            let _ = fs::remove_file(&download);
            finish(0)
        }
        Err(error) => {
            // The new build cannot run: put the old one back and reopen it.
            note_update(&format!("the new build would not start: {error}"));
            let _ = fs::remove_file(&target);
            if let Err(restore) = fs::rename(&backup, &target) {
                note_update(&format!("could not restore the old build: {restore}"));
            }
            reopen_old(&target, &backup)
        }
    }
}

/// Copies Verse beside the download, then starts that copy as the replacer. Using
/// Verse itself instead of a script host means no execution policy, antivirus
/// script scanning or console handles can stop the swap.
#[cfg(windows)]
fn start_replacer(download: &std::path::Path) -> Result<std::process::Child, String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let folder = std::env::temp_dir().join("verse-update");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let updater = folder.join("Verse-updater.exe");
    // A copy left by an earlier attempt may still be running.
    let _ = fs::remove_file(&updater);
    let _ = fs::remove_file(ready_path());
    fs::copy(&current, &updater).map_err(|e| format!("could not prepare the updater: {e}"))?;

    let child = Command::new(&updater)
        .args([
            REPLACE_FLAG,
            &download.display().to_string(),
            &current.display().to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| format!("could not start the updater: {e}"))?;
    note_update("updater copy started");
    Ok(child)
}

#[cfg(windows)]
async fn install_windows(app: AppHandle) -> Result<(), String> {
    let current = app.package_info().version.to_string();
    let release = newest_release()?.ok_or("there is no published release yet")?;
    let tag = release
        .get("tag_name")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if !is_newer(tag, &current) {
        return Err("this build is already the newest version".to_string());
    }
    let (url, _size) =
        windows_asset(&release).ok_or("the release has no Windows build attached")?;

    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let download = download_exe(&url, &handle)?;
        let mut child = start_replacer(&download)?;

        // Do not close Verse until the updater confirms the replacement is staged.
        // If it exits first, the old build stays open and the banner shows the error.
        for _ in 0..80 {
            if ready_path().is_file() {
                std::thread::sleep(Duration::from_millis(300));
                return Ok(());
            }
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!(
                    "the updater stopped before the swap began ({status})"
                ));
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        let _ = child.kill();
        Err("the updater did not start, so Verse is still open".to_string())
    })
    .await
    .map_err(|e| e.to_string())??;

    // The updater is staged and waiting; closing unlocks the exe for the swap.
    app.exit(0);
    Ok(())
}

/// One published release, as the changelog in Settings shows it.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub name: String,
    pub notes: String,
    pub url: String,
    pub published_at: String,
    pub download_url: Option<String>,
    pub download_size: u64,
}

/// Every published release, newest first.
#[tauri::command]
pub fn list_releases() -> Result<Vec<ReleaseInfo>, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=20");
    let response = ureq::get(&url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(8))
        .call()
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = response.into_json().map_err(|e| e.to_string())?;
    let releases = body
        .as_array()
        .ok_or("GitHub returned an unexpected release list")?;

    Ok(releases
        .iter()
        .filter(|release| release.get("draft").and_then(|value| value.as_bool()) != Some(true))
        .map(|release| {
            let asset = windows_asset(release);
            let tag = release
                .get("tag_name")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            ReleaseInfo {
                version: tag.trim_start_matches(['v', 'V']).to_string(),
                name: release
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
                notes: release
                    .get("body")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .chars()
                    .take(4000)
                    .collect(),
                url: release
                    .get("html_url")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
                published_at: release
                    .get("published_at")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
                download_url: asset.as_ref().map(|(url, _)| url.clone()),
                download_size: asset.map(|(_, size)| size).unwrap_or(0),
            }
        })
        .collect())
}

/// Downloads the newest release, swaps it in and reopens Verse on the new build.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        install_windows(app).await
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("Automatic updates are only available on the Windows build".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn compares_numeric_versions() {
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("0.1.10", "0.1.9"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(!is_newer("", "0.1.0"));
    }
}
