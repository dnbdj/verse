//! Update checking and self-install against the project's GitHub releases.
//!
//! Each launch compares the newest release tag with the running version, raises a
//! desktop notification and hands the release to the UI. The Download button then
//! fetches the attached `.exe` directly: a detached helper waits for Verse to exit,
//! replaces the running file with the download and starts the new build.

use std::fs::{self, File};
use std::io::{self, Read};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

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

/// The `.exe` attached to a release, preferring the build named for Windows.
fn windows_asset(release: &serde_json::Value) -> Option<String> {
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
        if name.contains("windows") {
            return Some(url.to_string());
        }
        if fallback.is_none() {
            fallback = Some(url.to_string());
        }
    }
    fallback
}

/// Downloads a release `.exe` into the temp folder, refusing anything suspicious.
#[cfg(windows)]
fn download_exe(url: &str) -> Result<std::path::PathBuf, String> {
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
    let written = io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
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
    Ok(target)
}

/// A PowerShell single-quoted literal for a Windows path.
#[cfg(windows)]
fn quote(path: &std::path::Path) -> String {
    format!("'{}'", path.display().to_string().replace('\'', "''"))
}

/// Starts a detached helper that waits for this process to exit, replaces the exe
/// with the download and launches it. A running file cannot overwrite itself.
#[cfg(windows)]
fn start_replacer(download: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let folder = std::env::temp_dir().join("verse-update");
    let script = folder.join("install-update.ps1");
    let pid = std::process::id();

    let body = format!(
        "Wait-Process -Id {pid} -ErrorAction SilentlyContinue\r\n\
         $new = {new}\r\n\
         $target = {target}\r\n\
         for ($attempt = 0; $attempt -lt 120; $attempt++) {{\r\n\
           try {{\r\n\
             Copy-Item -LiteralPath $new -Destination $target -Force -ErrorAction Stop\r\n\
             break\r\n\
           }} catch {{\r\n\
             Start-Sleep -Milliseconds 500\r\n\
           }}\r\n\
         }}\r\n\
         Start-Process -FilePath $target\r\n\
         Remove-Item -LiteralPath $new -Force -ErrorAction SilentlyContinue\r\n\
         Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue\r\n",
        new = quote(download),
        target = quote(&current),
    );
    fs::write(&script, body).map_err(|e| e.to_string())?;

    std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            &script.display().to_string(),
        ])
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| format!("could not start the updater: {e}"))?;
    Ok(())
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
    let url = windows_asset(&release).ok_or("the release has no Windows build attached")?;

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let download = download_exe(&url)?;
        start_replacer(&download)
    })
    .await
    .map_err(|e| e.to_string())??;

    // Let the helper attach, then close so the exe file unlocks for the swap.
    std::thread::sleep(Duration::from_millis(600));
    app.exit(0);
    Ok(())
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
