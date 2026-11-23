//! Startup update check against the project's GitHub releases.
//!
//! The check is informational only: Verse compares the newest release tag with the
//! running version, raises a desktop notification and hands the release page to the
//! UI. Nothing is downloaded or installed behind the user's back.

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
    /// The release page the Download button opens.
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

/// Reads the newest published release and returns it only when it is newer.
#[tauri::command]
pub fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current = app.package_info().version.to_string();
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");

    let response = ureq::get(&url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(8))
        .call();

    let body = match response {
        Ok(response) => response
            .into_json::<serde_json::Value>()
            .map_err(|e| e.to_string())?,
        // No releases yet is a normal state, not a failure worth showing.
        Err(ureq::Error::Status(404, _)) => return Ok(None),
        Err(error) => return Err(error.to_string()),
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
