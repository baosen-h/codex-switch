use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WebSearchCapability {
    SearchKeywords,
    FetchUrls,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub source_input: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResponse {
    pub provider_id: String,
    pub capability: WebSearchCapability,
    pub inputs: Vec<String>,
    pub results: Vec<WebSearchResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct WebSearchSettings {
    pub search_provider_id: String,
    pub search_api_url: String,
    pub search_api_keys: Vec<String>,
    pub fetch_provider_id: String,
    pub fetch_api_url: String,
    pub fetch_api_keys: Vec<String>,
    pub max_results: u32,
    pub exclude_domains: Vec<String>,
    pub cutoff_tokens: u32,
}

impl Default for WebSearchSettings {
    fn default() -> Self {
        Self {
            search_provider_id: String::new(),
            search_api_url: String::new(),
            search_api_keys: Vec::new(),
            fetch_provider_id: "direct".to_string(),
            fetch_api_url: String::new(),
            fetch_api_keys: Vec::new(),
            max_results: 5,
            exclude_domains: Vec::new(),
            cutoff_tokens: 4_000,
        }
    }
}

impl WebSearchSettings {
    pub fn normalized(mut self) -> Self {
        self.search_provider_id = self.search_provider_id.trim().to_ascii_lowercase();
        self.search_api_url = self.search_api_url.trim().to_string();
        self.search_api_keys = normalize_string_list(self.search_api_keys);
        self.fetch_provider_id = self.fetch_provider_id.trim().to_ascii_lowercase();
        if self.fetch_provider_id.is_empty() {
            self.fetch_provider_id = "direct".to_string();
        }
        self.fetch_api_url = self.fetch_api_url.trim().to_string();
        self.fetch_api_keys = normalize_string_list(self.fetch_api_keys);
        self.max_results = self.max_results.clamp(1, 20);
        self.exclude_domains = normalize_string_list(
            self.exclude_domains
                .into_iter()
                .map(|domain| domain.to_ascii_lowercase())
                .collect(),
        );
        self.cutoff_tokens = self.cutoff_tokens.clamp(256, 32_000);
        self
    }
}

fn normalize_string_list(values: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values {
        let value = value.trim();
        if !value.is_empty() && !normalized.iter().any(|existing| existing == value) {
            normalized.push(value.to_string());
        }
    }
    normalized
}

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
pub struct AppUpdateInfo {
    pub latest_version: String,
    pub release_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installer_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installer_digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDownloadProgress {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub provider_id: String,
    pub provider_name: String,
    #[serde(default)]
    pub provider_model: String,
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
    pub vision_fallback_enabled: bool,
    pub vision_api_provider_id: String,
    pub vision_model: String,
    pub vision_chat_enabled: bool,
    pub vision_codex_enabled: bool,
    pub vision_claude_enabled: bool,
    pub vision_gemini_enabled: bool,
    #[serde(default)]
    pub web_search: WebSearchSettings,
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

#[cfg(test)]
mod tests {
    use super::WebSearchSettings;

    #[test]
    fn web_search_settings_normalize_values() {
        let settings = WebSearchSettings {
            search_provider_id: " Tavily ".to_string(),
            search_api_url: " https://api.tavily.com ".to_string(),
            search_api_keys: vec![" key-1 ".to_string(), "key-1".to_string(), String::new()],
            fetch_provider_id: String::new(),
            fetch_api_url: String::new(),
            fetch_api_keys: Vec::new(),
            max_results: 0,
            exclude_domains: vec![" Example.COM ".to_string(), "example.com".to_string()],
            cutoff_tokens: 100,
        }
        .normalized();

        assert_eq!(settings.search_provider_id, "tavily");
        assert_eq!(settings.search_api_url, "https://api.tavily.com");
        assert_eq!(settings.search_api_keys, vec!["key-1"]);
        assert_eq!(settings.fetch_provider_id, "direct");
        assert_eq!(settings.max_results, 1);
        assert_eq!(settings.exclude_domains, vec!["example.com"]);
        assert_eq!(settings.cutoff_tokens, 256);
    }
}
