use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::collections::HashMap;

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
    pub enabled: bool,
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
            enabled: false,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_source: Option<String>,
}

pub fn enrich_remote_models_from_catalog(models: &mut [RemoteModel], catalog: Vec<RemoteModel>) {
    let mut by_id = HashMap::new();
    let mut by_suffix = HashMap::new();
    for model in catalog {
        let normalized_id = model.id.to_ascii_lowercase();
        if !model.input_modalities.is_empty() || !model.output_modalities.is_empty() {
            if let Some((_, suffix)) = normalized_id.rsplit_once('/') {
                by_suffix
                    .entry(suffix.to_string())
                    .or_insert_with(|| model.clone());
                by_suffix
                    .entry(model_match_key(suffix))
                    .or_insert_with(|| model.clone());
            }
            by_id
                .entry(model_match_key(&normalized_id))
                .or_insert_with(|| model.clone());
            by_id.entry(normalized_id).or_insert(model);
        }
    }

    for model in models {
        if !model.input_modalities.is_empty() || !model.output_modalities.is_empty() {
            continue;
        }

        let key = model.id.to_ascii_lowercase();
        let compact_key = model_match_key(&key);
        let source = by_id
            .get(&key)
            .or_else(|| by_suffix.get(&key))
            .or_else(|| by_id.get(&compact_key))
            .or_else(|| by_suffix.get(&compact_key));
        if let Some(source) = source {
            if model.name.is_none() {
                model.name = source.name.clone();
            }
            if model.owned_by.is_none() {
                model.owned_by = source.owned_by.clone();
            }
            if model.description.is_none() {
                model.description = source.description.clone();
            }
            model.input_modalities = source.input_modalities.clone();
            model.output_modalities = source.output_modalities.clone();
            model.metadata_source = source.metadata_source.clone();
        }
    }
}

pub fn model_match_key(model_id: &str) -> String {
    model_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionVisibilityRepairResult {
    pub scanned_sessions: usize,
    pub repaired_databases: usize,
    pub inserted_threads: usize,
    pub updated_threads: usize,
    pub skipped_databases: usize,
    pub added_session_index_entries: usize,
    pub updated_session_index_entries: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityTargets {
    pub codex: bool,
    pub claude: bool,
    pub gemini: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigValue {
    pub value: String,
    #[serde(default)]
    pub secret: bool,
    #[serde(default)]
    pub credential_id: String,
    #[serde(default)]
    pub template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    pub id: String,
    pub target_key: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub working_directory: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub env: BTreeMap<String, ConfigValue>,
    #[serde(default)]
    pub headers: BTreeMap<String, ConfigValue>,
    #[serde(default)]
    pub targets: CapabilityTargets,
    #[serde(default)]
    pub last_test_status: String,
    #[serde(default)]
    pub last_test_error: String,
    #[serde(default)]
    pub last_test_at: String,
    #[serde(default)]
    pub cached_tools: Vec<McpTool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTestResult {
    pub status: String,
    #[serde(default)]
    pub error: String,
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub tools: Vec<McpTool>,
    pub tested_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub built_in: bool,
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub working_directory: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub env: BTreeMap<String, ConfigValue>,
    #[serde(default)]
    pub headers: BTreeMap<String, ConfigValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub instructions: String,
    pub source_path: String,
    pub source_kind: String,
    pub sync_mode: String,
    #[serde(default)]
    pub targets: CapabilityTargets,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketResult {
    pub id: String,
    pub skill_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub source: String,
    #[serde(default)]
    pub installs: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSource {
    pub id: String,
    pub capability_type: String,
    pub name: String,
    pub source_type: String,
    pub base_url: String,
    pub enabled: bool,
    pub sort_order: i64,
    pub built_in: bool,
    #[serde(default)]
    pub credential_id: String,
    #[serde(default)]
    pub has_credential: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallSpec {
    #[serde(default)]
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub package_type: String,
    #[serde(default)]
    pub package_name: String,
    #[serde(default)]
    pub env_keys: Vec<String>,
    #[serde(default)]
    pub header_keys: Vec<String>,
    #[serde(default)]
    pub header_templates: BTreeMap<String, String>,
    #[serde(default)]
    pub required_header_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceResult {
    pub id: String,
    pub capability_type: String,
    pub canonical_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub version: String,
    pub source_id: String,
    pub source_name: String,
    #[serde(default)]
    pub source_ids: Vec<String>,
    #[serde(default)]
    pub source_url: String,
    #[serde(default)]
    pub artifact_url: String,
    #[serde(default)]
    pub artifact_sha256: String,
    #[serde(default)]
    pub install_reference: String,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub install_spec: MarketplaceInstallSpec,
    #[serde(default)]
    pub installed_id: String,
    #[serde(default)]
    pub update_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSourceStatus {
    pub source_id: String,
    pub source_name: String,
    pub status: String,
    #[serde(default)]
    pub error: String,
    #[serde(default)]
    pub result_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSearchResponse {
    pub results: Vec<MarketplaceResult>,
    pub sources: Vec<MarketplaceSourceStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketPreview {
    pub result: MarketplaceResult,
    pub instructions: String,
    pub files: Vec<String>,
    #[serde(default)]
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallRequest {
    pub result: MarketplaceResult,
    #[serde(default)]
    pub targets: CapabilityTargets,
    #[serde(default)]
    pub env: BTreeMap<String, ConfigValue>,
    #[serde(default)]
    pub headers: BTreeMap<String, ConfigValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAvailability {
    pub node: bool,
    pub npx: bool,
    pub uv: bool,
    pub uvx: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpImportPreview {
    pub servers: Vec<McpServer>,
    #[serde(default)]
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTargetResult {
    pub agent: String,
    pub status: String,
    #[serde(default)]
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitySyncResult {
    pub results: Vec<SyncTargetResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityCounts {
    pub codex: usize,
    pub claude: usize,
    pub gemini: usize,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesState {
    pub mcp_servers: Vec<McpServer>,
    pub mcp_presets: Vec<McpPreset>,
    pub skills: Vec<Skill>,
    pub mcp_counts: CapabilityCounts,
    pub skill_counts: CapabilityCounts,
    pub available_targets: CapabilityTargets,
}

#[cfg(test)]
mod tests {
    use super::WebSearchSettings;

    #[test]
    fn web_search_settings_normalize_values() {
        let settings = WebSearchSettings {
            enabled: true,
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
        assert!(settings.enabled);
        assert_eq!(settings.search_api_url, "https://api.tavily.com");
        assert_eq!(settings.search_api_keys, vec!["key-1"]);
        assert_eq!(settings.fetch_provider_id, "direct");
        assert_eq!(settings.max_results, 1);
        assert_eq!(settings.exclude_domains, vec!["example.com"]);
        assert_eq!(settings.cutoff_tokens, 256);
    }
}
