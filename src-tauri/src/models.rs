use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub agent: String,
    pub api_provider_id: String,
    pub base_url: String,
    pub api_key: String,
    pub website_url: String,
    pub model: String,
    pub wire_api: String,
    pub reasoning_effort: String,
    pub extra_toml: String,
    pub config_text: String,
    pub is_current: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiProvider {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub wire_api: String,
    pub base_url: String,
    pub api_key: String,
    pub website_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_ai_auth_json: Option<String>,
    pub models: Vec<RemoteModel>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListRequest {
    #[serde(default)]
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModel {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub input_modalities: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub output_modalities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<ChatAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: i64,
    pub kind: String,
    #[serde(default)]
    pub data_url: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub provider: ApiProvider,
    pub model: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationRequest {
    pub provider: ApiProvider,
    pub model: String,
    pub prompt: String,
    pub size: String,
    pub count: i64,
    #[serde(default)]
    pub quality: String,
    #[serde(default)]
    pub background: String,
    #[serde(default)]
    pub input_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationResponse {
    pub images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderBalance {
    pub strategy: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<f64>,
    pub unit: String,
    pub is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_reset_at: Option<i64>,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour_left: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour_reset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour_reset_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly_left: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly_reset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly_reset_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits_balance: Option<f64>,
    #[serde(default)]
    pub has_credits: bool,
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
    pub background_color: String,
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    pub api_providers: Vec<ApiProvider>,
    pub providers: Vec<Provider>,
    pub sessions: Vec<SessionRecord>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub workspace_path: String,
}
