//! Desktop deep links.
//!
//! `verse://look#look=VRS1.…` arrives either as a process argument (a cold start) or
//! through the single-instance callback (the app is already running). This module only
//! finds the URL; the frontend parses and validates the code so web and desktop share
//! one error path.

pub const SCHEME: &str = "verse://";
pub const EVENT: &str = "verse:deep-link";

/// First argument that is a Verse link, if any. Arguments from file pickers and the
/// executable path itself are ignored.
pub fn from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    args.into_iter()
        .map(Into::into)
        .map(|arg| arg.trim().to_string())
        .find(|arg| arg.to_ascii_lowercase().starts_with(SCHEME))
        .filter(|arg| arg.len() > SCHEME.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_link_after_the_executable_path() {
        let args = vec![
            "C:\\Program Files\\Verse\\verse.exe".to_string(),
            "verse://look#look=VRS1.abc".to_string(),
        ];
        assert_eq!(
            from_args(args),
            Some("verse://look#look=VRS1.abc".to_string())
        );
    }

    #[test]
    fn matches_case_insensitively_and_trims() {
        assert_eq!(
            from_args(["  VERSE://look?code=VRS1.x  "]),
            Some("VERSE://look?code=VRS1.x".to_string())
        );
    }

    #[test]
    fn ignores_normal_launches_and_bare_schemes() {
        assert_eq!(from_args(["verse.exe"]), None);
        assert_eq!(from_args(["verse://"]), None);
        assert_eq!(from_args(Vec::<String>::new()), None);
        assert_eq!(
            from_args(["https://example.com/#look=VRS1.abc"]),
            None,
            "plain https links are not registered to the app"
        );
    }
}
