pub const APP_NAME: &str = "Codex Switch";
pub const APP_ID: &str = "codex-switch";
pub const APP_HOME_DIR: &str = ".codex-switch";
pub const LEGACY_APP_HOME_DIR: &str = ".codex-switch-mini";
pub const DB_FILE: &str = "codex-switch.db";
pub const LEGACY_DB_FILE: &str = "codex-switch-mini.db";
pub const USER_AGENT: &str = concat!(env!("CARGO_PKG_NAME"), "/", env!("CARGO_PKG_VERSION"));
pub const PROXY_USER_AGENT: &str =
    concat!(env!("CARGO_PKG_NAME"), "-proxy/", env!("CARGO_PKG_VERSION"));

pub const RELEASES_URL: &str = "https://github.com/baosen-h/codex-switch/releases";
pub const LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/baosen-h/codex-switch/releases/latest";
pub const RELEASE_DOWNLOAD_PREFIX: &str =
    "https://github.com/baosen-h/codex-switch/releases/download/";

pub const WINDOWS_EXE_NAME: &str = "Codex Switch.exe";
