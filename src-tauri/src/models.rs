use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub agent: String,
    pub base_url: String,
    pub api_key: String,
    pub website_url: String,
    pub model: String,
    pub reasoning_effort: String,
    pub extra_toml: String,
    pub config_text: String,
    pub is_current: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub provider_id: String,
    pub provider_name: String,
    pub agent: String,
    pub session_id: String,
    pub workspace_path: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub source_path: String,
    pub resume_command: String,
    pub status: String,
    pub notes: String,
    pub message_count: i64,
    pub started_at: String,
    pub last_active_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffPreview {
    pub mode: String,
    pub title: String,
    pub session_id: String,
    pub source_agent: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub codex_config_dir: String,
    pub claude_config_dir: String,
    pub gemini_config_dir: String,
    pub default_workspace: String,
    pub terminal_program: String,
    pub auto_record_sessions: bool,
    pub language: String,
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    pub providers: Vec<Provider>,
    pub sessions: Vec<SessionRecord>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub workspace_path: String,
}
