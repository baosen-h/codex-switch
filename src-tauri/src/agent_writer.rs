use crate::compatibility_proxy::proxy_base_url;
use crate::error::AppError;
use crate::models::{ApiProvider, Provider, RemoteModel};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

pub const AGENT_CODEX: &str = "codex";
pub const AGENT_CLAUDE: &str = "claude";
pub const AGENT_GEMINI: &str = "gemini";
const DEEPSEEK_CONTEXT_WINDOW: u64 = 1_000_000;
const DEEPSEEK_DEFAULT_CONTEXT_WINDOW: u64 = 128_000;
const DEEPSEEK_AUTO_COMPACT_LIMIT: u64 = 950_000;
const ONE_MILLION_CONTEXT_ON_MARKER: &str = "codex-switch: one-million-context=true";
const ONE_MILLION_CONTEXT_OFF_MARKER: &str = "codex-switch: one-million-context=false";
const DEEPSEEK_ONE_MILLION_ON_MARKER: &str = "codex-switch: deepseek-1m-context=true";
const DEEPSEEK_ONE_MILLION_OFF_MARKER: &str = "codex-switch: deepseek-1m-context=false";
const CODEX_WEB_SEARCH_MARKER: &str = "codex-switch: codex-web-search-tool=true";
const LEGACY_DEEPSEEK_V4_ONE_MILLION_MARKER: &str = "codex-switch: deepseek-v4-1m-context=true";

pub fn default_codex_config_dir() -> PathBuf {
    home_join(".codex")
}

pub fn default_claude_config_dir() -> PathBuf {
    home_join(".claude")
}

pub fn default_gemini_config_dir() -> PathBuf {
    home_join(".gemini")
}

fn home_join(segment: &str) -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(segment)
}

pub fn render_codex(provider: &Provider) -> String {
    let toml = build_codex_toml(provider);
    let auth = serde_json::to_string_pretty(&serde_json::json!({
        "OPENAI_API_KEY": provider.api_key,
    }))
    .unwrap_or_else(|_| "{}".to_string());
    format!("# ── ~/.codex/config.toml ──\n{toml}\n\n# ── ~/.codex/auth.json ──\n{auth}\n")
}

pub fn render_codex_oauth(model: &str, auth_json: &str) -> String {
    let selected_model = if model.trim().is_empty() {
        "gpt-5.4"
    } else {
        model.trim()
    };
    format!(
        "# ── ~/.codex/config.toml ──\nmodel = {:?}\ndisable_response_storage = true\n\n# ── ~/.codex/auth.json ──\n{}\n",
        selected_model,
        auth_json.trim()
    )
}

pub fn render_claude(provider: &Provider) -> String {
    let base_url = provider.base_url.trim();
    let model = claude_model_with_context(provider);
    let json = serde_json::to_string_pretty(&serde_json::json!({
        "env": {
            "ANTHROPIC_AUTH_TOKEN": provider.api_key,
            "ANTHROPIC_BASE_URL": base_url,
            "ANTHROPIC_MODEL": model,
            "ANTHROPIC_DEFAULT_HAIKU_MODEL": model,
            "ANTHROPIC_DEFAULT_SONNET_MODEL": model,
            "ANTHROPIC_DEFAULT_OPUS_MODEL": model,
            "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "950000",
        }
    }))
    .unwrap_or_else(|_| "{}".to_string());
    format!("// ── ~/.claude/settings.json ──\n{json}\n")
}

pub fn render_gemini(provider: &Provider) -> String {
    let model = provider.model.trim();
    let selected_model = if model.is_empty() {
        "gemini-2.5-pro"
    } else {
        model
    };
    let settings = serde_json::to_string_pretty(&serde_json::json!({
        "security": {
            "auth": {
                "selectedType": "gemini-api-key"
            }
        },
        "model": {
            "name": selected_model
        }
    }))
    .unwrap_or_else(|_| "{}".to_string());

    let base = provider.base_url.trim();
    let mut env_lines = vec![format!("GEMINI_API_KEY={}", provider.api_key)];
    if !base.is_empty() {
        env_lines.push(format!(
            "GOOGLE_GEMINI_BASE_URL={}",
            gemini_cli_base_url(base)
        ));
        env_lines.push("GEMINI_API_KEY_AUTH_MECHANISM=bearer".to_string());
        env_lines.push("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI".to_string());
    }
    let env = env_lines.join("\n");

    format!("// ── ~/.gemini/settings.json ──\n{settings}\n\n# ── ~/.gemini/.env ──\n{env}\n")
}

fn uses_native_cli_model(provider: &Provider) -> bool {
    let model = provider.model.trim().to_ascii_lowercase();
    if model.is_empty() {
        return false;
    }

    match provider.agent.as_str() {
        AGENT_CLAUDE => model.contains("claude"),
        AGENT_GEMINI => model.contains("gemini"),
        _ => model.contains("gpt") || model.contains("codex"),
    }
}

fn should_proxy_gemini(provider: &Provider, use_gateway: bool) -> bool {
    let base_url = provider.base_url.trim();
    let custom_endpoint = !base_url.is_empty() && !is_official_gemini_base_url(base_url);
    custom_endpoint || (use_gateway && !uses_native_cli_model(provider))
}

fn is_official_gemini_base_url(base_url: &str) -> bool {
    url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| host == "generativelanguage.googleapis.com")
}

fn build_codex_toml(provider: &Provider) -> String {
    let upstream_base_url = provider.base_url.trim();
    let base_url = if uses_codex_proxy(provider) {
        proxy_base_url()
    } else {
        upstream_base_url.to_string()
    };
    let has_custom = !upstream_base_url.is_empty();
    let mut lines: Vec<String> = Vec::new();

    if has_custom {
        lines.push("model_provider = \"custom\"".to_string());
    }
    lines.push(format!("model = \"{}\"", provider.model.trim()));
    lines.push("disable_response_storage = true".to_string());
    let uses_deepseek_context = uses_deepseek_one_million_context(provider);
    let uses_codex_web_search = uses_codex_web_search_tool(provider);
    if uses_deepseek_context {
        lines.push(format!("model_context_window = {DEEPSEEK_CONTEXT_WINDOW}"));
        lines.push(format!(
            "model_auto_compact_token_limit = {DEEPSEEK_AUTO_COMPACT_LIMIT}"
        ));
    }
    if uses_deepseek_context || uses_codex_web_search {
        lines.push("model_catalog_json = \"model-catalog.json\"".to_string());
    }

    if has_custom {
        lines.push("[model_providers]".to_string());
        lines.push("[model_providers.custom]".to_string());
        let name = provider.name.trim();
        let name = if name.is_empty() { "custom" } else { name };
        lines.push(format!("name = {:?}", name));
        lines.push("wire_api = \"responses\"".to_string());
        lines.push("requires_openai_auth = true".to_string());
        lines.push(format!("base_url = {:?}", base_url));
    }

    lines.push(String::new());
    lines.push("[features]".to_string());
    lines.push("responses_websockets = false".to_string());
    lines.push("responses_websockets_v2 = false".to_string());

    if !provider.extra_toml.trim().is_empty() {
        lines.push(String::new());
        lines.push(provider.extra_toml.trim().to_string());
    }

    lines.join("\n")
}

pub struct AgentDirs<'a> {
    pub codex: &'a Path,
    pub claude: &'a Path,
    pub gemini: &'a Path,
    pub api_providers: &'a [ApiProvider],
    pub vision_codex: bool,
    pub vision_claude: bool,
    pub vision_gemini: bool,
}

/// Write the provider to disk, using the agent-specific layout.
/// If `provider.config_text` is non-empty we use it verbatim (user edited the
/// preview); otherwise we regenerate from fields.
pub fn write_provider(provider: &Provider, dirs: &AgentDirs) -> Result<(), AppError> {
    match provider.agent.as_str() {
        AGENT_CLAUDE => write_claude_with_gateway(provider, dirs.claude, dirs.vision_claude),
        AGENT_GEMINI => write_gemini_with_gateway(provider, dirs.gemini, dirs.vision_gemini),
        _ => write_codex_with_gateway(provider, dirs.codex, dirs.vision_codex, dirs.api_providers),
    }
}

pub fn resolve_codex_dir(settings_value: &str) -> PathBuf {
    if settings_value.trim().is_empty() {
        default_codex_config_dir()
    } else {
        PathBuf::from(settings_value)
    }
}

pub fn resolve_claude_dir(settings_value: &str) -> PathBuf {
    if settings_value.trim().is_empty() {
        default_claude_config_dir()
    } else {
        PathBuf::from(settings_value)
    }
}

pub fn resolve_gemini_dir(settings_value: &str) -> PathBuf {
    if settings_value.trim().is_empty() {
        default_gemini_config_dir()
    } else {
        PathBuf::from(settings_value)
    }
}

fn ensure_dir(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path)?;
    Ok(())
}

fn effective_text(provider: &Provider, fallback: impl Fn() -> String) -> String {
    let raw = provider.config_text.trim();
    if raw.is_empty() {
        fallback()
    } else {
        provider.config_text.clone()
    }
}

fn split_sections(text: &str) -> Vec<(String, String)> {
    // Sections delimited by "── <path> ──" marker lines (preceded by any comment char).
    let mut out: Vec<(String, String)> = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_body: Vec<&str> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim_start_matches(['#', '/', ' ', '\t']).trim();
        if let Some(rest) = trimmed.strip_prefix("── ") {
            if let Some(name) = rest.strip_suffix(" ──") {
                if let Some(prev) = current_name.take() {
                    out.push((prev, current_body.join("\n").trim().to_string()));
                    current_body.clear();
                }
                current_name = Some(name.trim().to_string());
                continue;
            }
        }
        current_body.push(line);
    }
    if let Some(prev) = current_name.take() {
        out.push((prev, current_body.join("\n").trim().to_string()));
    }
    out
}

#[allow(dead_code)]
pub fn write_codex(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    write_codex_with_gateway(provider, config_dir, false, &[])
}

fn write_codex_with_gateway(
    provider: &Provider,
    config_dir: &Path,
    use_gateway: bool,
    api_providers: &[ApiProvider],
) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let auth_path = config_dir.join("auth.json");
    let config_path = config_dir.join("config.toml");

    let mut effective_provider = provider.clone();
    let uses_oauth = saved_codex_text_uses_oauth(&effective_provider.config_text);
    if use_gateway && !uses_oauth && !uses_native_cli_model(&effective_provider) {
        effective_provider.wire_api = "chat".to_string();
    }
    let text = if uses_oauth {
        effective_text(&effective_provider, || render_codex(&effective_provider))
    } else if uses_codex_proxy(&effective_provider)
        || saved_codex_text_uses_proxy(&effective_provider.config_text)
    {
        render_codex(&effective_provider)
    } else {
        effective_text(&effective_provider, || render_codex(&effective_provider))
    };
    let sections = split_sections(&text);

    let mut auth: Option<String> = None;
    let mut toml: Option<String> = None;
    for (name, body) in sections {
        if name.contains("auth.json") {
            auth = Some(body);
        } else if name.contains("config.toml") {
            toml = Some(body);
        }
    }

    let advertise_vision_images = use_gateway && uses_codex_proxy(&effective_provider);
    let toml_body = toml.unwrap_or_else(|| build_codex_toml(provider));
    let toml_body = augment_codex_toml_for_model_catalog(
        &toml_body,
        provider,
        config_dir,
        advertise_vision_images,
    );
    let auth_body = auth.unwrap_or_else(|| {
        serde_json::to_string_pretty(&serde_json::json!({"OPENAI_API_KEY": provider.api_key}))
            .unwrap_or_else(|_| "{}".to_string())
    });

    maybe_write_codex_model_catalog(provider, config_dir, advertise_vision_images, api_providers)?;
    fs::write(auth_path, auth_body)?;
    fs::write(config_path, toml_body)?;
    Ok(())
}

fn is_deepseek_model(model: &str) -> bool {
    model.trim().to_ascii_lowercase().starts_with("deepseek-")
}

fn is_official_deepseek_base_url(base_url: &str) -> bool {
    let normalized = base_url.trim().trim_end_matches('/').to_ascii_lowercase();
    normalized == "https://api.deepseek.com"
        || normalized == "https://api.deepseek.com/v1"
        || normalized == "https://api.deepseek.com/anthropic"
}

fn provider_contains_marker(provider: &Provider, marker: &str) -> bool {
    provider.extra_toml.contains(marker) || provider.config_text.contains(marker)
}

fn uses_deepseek_one_million_context(provider: &Provider) -> bool {
    if provider.model.trim().is_empty() {
        return false;
    }
    if provider_contains_marker(provider, ONE_MILLION_CONTEXT_OFF_MARKER)
        || provider_contains_marker(provider, DEEPSEEK_ONE_MILLION_OFF_MARKER)
    {
        return false;
    }
    if provider_contains_marker(provider, ONE_MILLION_CONTEXT_ON_MARKER)
        || provider_contains_marker(provider, DEEPSEEK_ONE_MILLION_ON_MARKER)
        || provider_contains_marker(provider, LEGACY_DEEPSEEK_V4_ONE_MILLION_MARKER)
    {
        return true;
    }
    is_deepseek_model(provider.model.trim()) && is_official_deepseek_base_url(&provider.base_url)
}

fn strip_one_million_suffix(model: &str) -> String {
    let model = model.trim();
    if model.to_ascii_lowercase().ends_with("[1m]") {
        model[..model.len().saturating_sub(4)]
            .trim_end()
            .to_string()
    } else {
        model.to_string()
    }
}

fn add_one_million_suffix(model: &str) -> String {
    let model = strip_one_million_suffix(model);
    if model.is_empty() {
        model
    } else {
        format!("{model}[1M]")
    }
}

fn claude_model_with_context(provider: &Provider) -> String {
    let model = if provider.model.trim().is_empty() {
        "claude-opus-4-5"
    } else {
        provider.model.trim()
    };
    if uses_deepseek_one_million_context(provider) {
        add_one_million_suffix(model)
    } else {
        strip_one_million_suffix(model)
    }
}

fn uses_codex_web_search_tool(provider: &Provider) -> bool {
    !provider.model.trim().is_empty() && provider_contains_marker(provider, CODEX_WEB_SEARCH_MARKER)
}

fn maybe_write_codex_model_catalog(
    provider: &Provider,
    config_dir: &Path,
    advertise_vision_images: bool,
    api_providers: &[ApiProvider],
) -> Result<(), AppError> {
    let uses_context = uses_deepseek_one_million_context(provider);
    let uses_web_search = uses_codex_web_search_tool(provider);
    if !uses_context && !uses_web_search && !advertise_vision_images {
        return Ok(());
    }

    let model = provider.model.trim();
    let metadata = provider_model_metadata(provider, api_providers);
    let catalog = json!({
        "models": [
            codex_catalog_model(model, uses_context, uses_web_search, advertise_vision_images, metadata)
        ]
    });
    let catalog_path = config_dir.join("model-catalog.json");
    fs::write(
        catalog_path,
        serde_json::to_string_pretty(&catalog)
            .map_err(|error| AppError::message(error.to_string()))?
            + "\n",
    )?;
    Ok(())
}

fn codex_catalog_model(
    slug: &str,
    uses_context: bool,
    uses_web_search: bool,
    advertise_vision_images: bool,
    metadata: Option<&RemoteModel>,
) -> serde_json::Value {
    let context_window = if uses_context {
        DEEPSEEK_CONTEXT_WINDOW
    } else {
        DEEPSEEK_DEFAULT_CONTEXT_WINDOW
    };
    let input_modalities = catalog_input_modalities(metadata, advertise_vision_images);
    let display_name = metadata
        .and_then(|model| model.name.as_deref())
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| catalog_display_name(slug));
    let description = metadata
        .and_then(|model| model.description.as_deref())
        .filter(|description| !description.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{slug} through the configured Codex Switch provider."));
    let mut model = json!({
        "slug": slug,
        "display_name": display_name,
        "description": description,
        "base_instructions": "",
        "default_reasoning_level": "high",
        "supported_reasoning_levels": [
            {
                "effort": "low",
                "description": "Fast responses with lighter reasoning"
            },
            {
                "effort": "medium",
                "description": "Balances speed and reasoning depth for everyday tasks"
            },
            {
                "effort": "high",
                "description": "Greater reasoning depth for complex problems"
            },
            {
                "effort": "xhigh",
                "description": "Extra high reasoning depth for complex problems"
            }
        ],
        "shell_type": "shell_command",
        "visibility": "list",
        "supported_in_api": true,
        "priority": 0,
        "context_window": context_window,
        "max_context_window": context_window,
        "effective_context_window_percent": 95,
        "apply_patch_tool_type": "freeform",
        "truncation_policy": {
            "mode": "tokens",
            "limit": 10000
        },
        "supports_reasoning_summaries": true,
        "default_reasoning_summary": "none",
        "support_verbosity": true,
        "default_verbosity": "low",
        "supports_parallel_tool_calls": true,
        "experimental_supported_tools": [],
        "supports_image_detail_original": true,
        "input_modalities": input_modalities,
        "service_tiers": []
    });
    if uses_web_search {
        if let Some(object) = model.as_object_mut() {
            object.insert(
                "web_search_tool_type".to_string(),
                serde_json::Value::String("text_and_image".to_string()),
            );
            object.insert(
                "supports_search_tool".to_string(),
                serde_json::Value::Bool(true),
            );
        }
    }
    model
}

fn provider_model_metadata<'a>(
    provider: &Provider,
    api_providers: &'a [ApiProvider],
) -> Option<&'a RemoteModel> {
    let api_provider = api_providers
        .iter()
        .find(|api| api.id == provider.api_provider_id)?;
    find_remote_model(&api_provider.models, provider.model.trim())
}

fn find_remote_model<'a>(models: &'a [RemoteModel], model: &str) -> Option<&'a RemoteModel> {
    let model = model.trim();
    if model.is_empty() {
        return None;
    }
    let lower = model.to_ascii_lowercase();
    let compact = catalog_model_match_key(&lower);
    models.iter().find(|item| {
        let id = item.id.trim().to_ascii_lowercase();
        let id_compact = catalog_model_match_key(&id);
        id == lower
            || id_compact == compact
            || id.rsplit_once('/').is_some_and(|(_, suffix)| {
                let suffix = suffix.to_ascii_lowercase();
                suffix == lower || catalog_model_match_key(&suffix) == compact
            })
    })
}

fn catalog_model_match_key(model_id: &str) -> String {
    model_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn catalog_input_modalities(
    metadata: Option<&RemoteModel>,
    advertise_vision_images: bool,
) -> Value {
    let mut modalities = metadata
        .map(|model| model.input_modalities.clone())
        .filter(|modalities| !modalities.is_empty())
        .unwrap_or_else(|| vec!["text".to_string()]);
    if !modalities
        .iter()
        .any(|item| item.eq_ignore_ascii_case("text"))
    {
        modalities.insert(0, "text".to_string());
    }
    if advertise_vision_images
        && !modalities
            .iter()
            .any(|item| item.eq_ignore_ascii_case("image"))
    {
        modalities.push("image".to_string());
    }
    json!(modalities)
}

fn catalog_display_name(slug: &str) -> String {
    match slug.trim().to_ascii_lowercase().as_str() {
        "deepseek-v4-flash" => "DeepSeek V4 Flash".to_string(),
        "deepseek-v4-pro" => "DeepSeek V4 Pro".to_string(),
        "deepseek-chat" => "DeepSeek Chat".to_string(),
        "deepseek-reasoner" => "DeepSeek Reasoner".to_string(),
        other => {
            let suffix = other
                .strip_prefix("deepseek-")
                .or_else(|| other.strip_prefix("claude-"))
                .or_else(|| other.strip_prefix("gemini-"))
                .or_else(|| other.strip_prefix("gpt-"))
                .unwrap_or(other);
            let suffix = suffix
                .split(['-', '_'])
                .filter(|part| !part.is_empty())
                .map(|part| {
                    let mut chars = part.chars();
                    match chars.next() {
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            let prefix = if other.starts_with("deepseek-") {
                "DeepSeek"
            } else if other.starts_with("claude-") {
                "Claude"
            } else if other.starts_with("gemini-") {
                "Gemini"
            } else if other.starts_with("gpt-") {
                "GPT"
            } else {
                ""
            };
            if suffix.is_empty() || prefix.is_empty() {
                slug.trim().to_string()
            } else {
                format!("{prefix} {suffix}")
            }
        }
    }
}

fn augment_codex_toml_for_model_catalog(
    toml_body: &str,
    provider: &Provider,
    config_dir: &Path,
    advertise_vision_images: bool,
) -> String {
    let uses_context = uses_deepseek_one_million_context(provider);
    let uses_web_search = uses_codex_web_search_tool(provider);
    if !uses_context && !uses_web_search && !advertise_vision_images {
        if provider_contains_marker(provider, ONE_MILLION_CONTEXT_OFF_MARKER)
            || provider_contains_marker(provider, DEEPSEEK_ONE_MILLION_OFF_MARKER)
        {
            let mut next = remove_top_level_toml_line(toml_body, "model_context_window");
            next = remove_top_level_toml_line(&next, "model_auto_compact_token_limit");
            return remove_top_level_toml_line(&next, "model_catalog_json");
        }
        return toml_body.to_string();
    }

    let catalog_path = config_dir.join("model-catalog.json");
    let catalog_path = catalog_path.to_string_lossy().replace('\\', "\\\\");
    let mut next = toml_body.to_string();
    if uses_context {
        next = set_top_level_toml_line(
            &next,
            "model_context_window",
            &DEEPSEEK_CONTEXT_WINDOW.to_string(),
        );
        next = set_top_level_toml_line(
            &next,
            "model_auto_compact_token_limit",
            &DEEPSEEK_AUTO_COMPACT_LIMIT.to_string(),
        );
    } else {
        next = remove_top_level_toml_line(&next, "model_context_window");
        next = remove_top_level_toml_line(&next, "model_auto_compact_token_limit");
    }
    set_top_level_toml_line(&next, "model_catalog_json", &format!("\"{catalog_path}\""))
}

fn remove_top_level_toml_line(toml_body: &str, key: &str) -> String {
    let prefix = format!("{key} ");
    let compact_prefix = format!("{key}=");
    let mut in_top_level = true;
    let mut lines = Vec::new();

    for line in toml_body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('[') {
            in_top_level = false;
        }
        if in_top_level && (trimmed.starts_with(&prefix) || trimmed.starts_with(&compact_prefix)) {
            continue;
        }
        lines.push(line.to_string());
    }

    lines.join("\n")
}

fn set_top_level_toml_line(toml_body: &str, key: &str, value: &str) -> String {
    let mut lines = Vec::new();
    let mut found_key = false;
    let mut inserted = false;
    let prefix = format!("{key} ");
    let compact_prefix = format!("{key}=");

    for line in toml_body.lines() {
        let trimmed = line.trim_start();
        if !found_key && !inserted && trimmed.starts_with('[') {
            lines.push(format!("{key} = {value}"));
            inserted = true;
        }
        if trimmed.starts_with(&prefix) || trimmed.starts_with(&compact_prefix) {
            if !found_key {
                lines.push(format!("{key} = {value}"));
                found_key = true;
            }
        } else {
            lines.push(line.to_string());
        }
    }

    if !found_key && !inserted {
        lines.push(format!("{key} = {value}"));
    }
    lines.join("\n")
}

fn uses_codex_proxy(provider: &Provider) -> bool {
    provider.wire_api.trim() == "chat" && !uses_native_cli_model(provider)
}

fn saved_codex_text_uses_proxy(text: &str) -> bool {
    text.contains(&proxy_base_url()) || text.contains("http://127.0.0.1:47632")
}

fn saved_codex_text_uses_oauth(text: &str) -> bool {
    split_sections(text).into_iter().any(|(name, body)| {
        name.contains("auth.json")
            && serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|value| value.get("tokens").cloned())
                .is_some_and(|tokens| tokens.is_object())
    })
}

#[allow(dead_code)]
pub fn write_claude(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    write_claude_with_gateway(provider, config_dir, false)
}

fn write_claude_with_gateway(
    provider: &Provider,
    config_dir: &Path,
    use_gateway: bool,
) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let path = config_dir.join("settings.json");
    let mut effective_provider = provider.clone();
    if use_gateway && !uses_native_cli_model(&effective_provider) {
        effective_provider.base_url = format!(
            "http://{}:{}/anthropic",
            crate::compatibility_proxy::PROXY_HOST,
            crate::compatibility_proxy::PROXY_PORT
        );
        effective_provider.api_key = "codex-switch-local".to_string();
        effective_provider.config_text.clear();
    }
    let text = effective_text(&effective_provider, || render_claude(&effective_provider));
    let sections = split_sections(&text);
    let body = sections
        .into_iter()
        .find(|(name, _)| name.contains("settings.json"))
        .map(|(_, body)| body)
        .unwrap_or(text);
    fs::write(path, body)?;
    Ok(())
}

#[allow(dead_code)]
pub fn write_gemini(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    write_gemini_with_gateway(provider, config_dir, false)
}

fn write_gemini_with_gateway(
    provider: &Provider,
    config_dir: &Path,
    use_gateway: bool,
) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let settings_path = config_dir.join("settings.json");
    let env_path = config_dir.join(".env");

    let mut effective_provider = provider.clone();
    if should_proxy_gemini(&effective_provider, use_gateway) {
        effective_provider.base_url = format!(
            "http://{}:{}/gemini",
            crate::compatibility_proxy::PROXY_HOST,
            crate::compatibility_proxy::PROXY_PORT
        );
        effective_provider.api_key = "codex-switch-local".to_string();
        effective_provider.config_text.clear();
    }
    let text = effective_text(&effective_provider, || render_gemini(&effective_provider));
    let sections = split_sections(&text);

    let mut settings: Option<String> = None;
    let mut env: Option<String> = None;
    for (name, body) in sections {
        if name.contains("settings.json") || name.contains("config.json") {
            settings = Some(body);
        } else if name.contains(".env") {
            env = Some(body);
        }
    }

    let settings_body = settings.unwrap_or_else(|| {
        serde_json::to_string_pretty(&serde_json::json!({
            "security": {
                "auth": {
                    "selectedType": "gemini-api-key"
                }
            },
            "model": {
                "name": if provider.model.trim().is_empty() { "gemini-2.5-pro" } else { provider.model.trim() }
            },
        }))
        .unwrap_or_else(|_| "{}".to_string())
    });
    let env_body = env.unwrap_or_else(|| {
        let mut lines = vec![format!("GEMINI_API_KEY={}", provider.api_key)];
        if !provider.base_url.trim().is_empty() {
            lines.push(format!(
                "GOOGLE_GEMINI_BASE_URL={}",
                gemini_cli_base_url(provider.base_url.trim())
            ));
            lines.push("GEMINI_API_KEY_AUTH_MECHANISM=bearer".to_string());
            lines.push("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI".to_string());
        }
        lines.join("\n")
    });

    let generated_settings = serde_json::from_str::<serde_json::Value>(&settings_body)
        .map_err(|error| AppError::message(format!("Invalid Gemini settings JSON: {error}")))?;
    let generated_settings = normalize_gemini_settings(generated_settings, &effective_provider);
    let mut merged_settings = fs::read_to_string(&settings_path)
        .ok()
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    merge_json(&mut merged_settings, generated_settings);

    let existing_env = fs::read_to_string(&env_path).unwrap_or_default();
    let env_body = normalize_gemini_env(&env_body, &effective_provider);
    let merged_env = merge_gemini_env(&existing_env, &env_body);

    fs::write(
        settings_path,
        serde_json::to_string_pretty(&merged_settings)
            .map_err(|error| AppError::message(error.to_string()))?,
    )?;
    fs::write(env_path, merged_env)?;
    Ok(())
}

fn normalize_gemini_settings(
    mut settings: serde_json::Value,
    provider: &Provider,
) -> serde_json::Value {
    let legacy_model = settings
        .get("model")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);
    if let Some(object) = settings.as_object_mut() {
        object.remove("selectedAuthType");
        if legacy_model.is_some() {
            object.remove("model");
        }
    }

    let selected_model = legacy_model.unwrap_or_else(|| {
        if provider.model.trim().is_empty() {
            "gemini-2.5-pro".to_string()
        } else {
            provider.model.trim().to_string()
        }
    });
    merge_json(
        &mut settings,
        serde_json::json!({
            "security": {
                "auth": {
                    "selectedType": "gemini-api-key"
                }
            },
            "model": {
                "name": selected_model
            }
        }),
    );
    settings
}

fn normalize_gemini_env(env: &str, provider: &Provider) -> String {
    let api_key = env_value(env, "GEMINI_API_KEY").unwrap_or_else(|| provider.api_key.clone());
    let base_url = env_value(env, "GOOGLE_GEMINI_BASE_URL")
        .unwrap_or_else(|| provider.base_url.trim().to_string());
    let mut lines = vec![format!("GEMINI_API_KEY={api_key}")];
    if !base_url.trim().is_empty() {
        lines.push(format!(
            "GOOGLE_GEMINI_BASE_URL={}",
            gemini_cli_base_url(base_url.trim())
        ));
        lines.push("GEMINI_API_KEY_AUTH_MECHANISM=bearer".to_string());
        lines.push("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI".to_string());
    }
    lines.join("\n")
}

fn gemini_cli_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    for suffix in ["/v1beta", "/v1"] {
        if let Some(root) = trimmed.strip_suffix(suffix) {
            return root.to_string();
        }
    }
    trimmed.to_string()
}

fn env_value(env: &str, key: &str) -> Option<String> {
    env.lines().find_map(|line| {
        let (line_key, value) = line.split_once('=')?;
        (line_key.trim() == key).then(|| value.trim().to_string())
    })
}

fn merge_json(target: &mut serde_json::Value, source: serde_json::Value) {
    match (target, source) {
        (serde_json::Value::Object(target), serde_json::Value::Object(source)) => {
            for (key, value) in source {
                merge_json(target.entry(key).or_insert(serde_json::Value::Null), value);
            }
        }
        (target, source) => *target = source,
    }
}

fn merge_gemini_env(existing: &str, generated: &str) -> String {
    const MANAGED_KEYS: [&str; 4] = [
        "GEMINI_API_KEY",
        "GOOGLE_GEMINI_BASE_URL",
        "GEMINI_API_KEY_AUTH_MECHANISM",
        "GEMINI_CLI_CUSTOM_HEADERS",
    ];

    let mut lines = existing
        .lines()
        .filter(|line| {
            let key = line.split_once('=').map(|(key, _)| key.trim());
            !key.is_some_and(|key| MANAGED_KEYS.contains(&key))
        })
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.extend(
        generated
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(str::to_string),
    );
    format!("{}\n", lines.join("\n").trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn codex_provider(wire_api: &str, config_text: &str) -> Provider {
        Provider {
            id: "provider-test".to_string(),
            name: "PackyCode".to_string(),
            agent: AGENT_CODEX.to_string(),
            api_provider_id: String::new(),
            base_url: "https://www.packyapi.com/v1".to_string(),
            api_key: "sk-test".to_string(),
            website_url: String::new(),
            model: "gpt-5.5".to_string(),
            wire_api: wire_api.to_string(),
            reasoning_effort: String::new(),
            extra_toml: String::new(),
            config_text: config_text.to_string(),
            is_current: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn api_provider_with_models(id: &str, models: Vec<RemoteModel>) -> ApiProvider {
        ApiProvider {
            id: id.to_string(),
            name: id.to_string(),
            provider_type: "openai_compatible".to_string(),
            wire_api: "chat".to_string(),
            base_url: "https://example.com/v1".to_string(),
            api_key: "sk-test".to_string(),
            website_url: String::new(),
            open_ai_auth_json: None,
            models,
            enabled: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn remote_model(id: &str, input_modalities: &[&str]) -> RemoteModel {
        RemoteModel {
            id: id.to_string(),
            name: None,
            owned_by: None,
            description: None,
            capabilities: Vec::new(),
            input_modalities: input_modalities
                .iter()
                .map(|item| item.to_string())
                .collect(),
            output_modalities: Vec::new(),
            metadata_source: None,
        }
    }

    fn claude_provider(name: &str, base_url: &str, model: &str) -> Provider {
        Provider {
            id: format!("provider-{name}"),
            name: name.to_string(),
            agent: AGENT_CLAUDE.to_string(),
            api_provider_id: String::new(),
            base_url: base_url.to_string(),
            api_key: "sk-test".to_string(),
            website_url: String::new(),
            model: model.to_string(),
            wire_api: "messages".to_string(),
            reasoning_effort: String::new(),
            extra_toml: String::new(),
            config_text: String::new(),
            is_current: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn gemini_provider(base_url: &str, model: &str) -> Provider {
        Provider {
            id: "provider-gemini".to_string(),
            name: "GemAI".to_string(),
            agent: AGENT_GEMINI.to_string(),
            api_provider_id: String::new(),
            base_url: base_url.to_string(),
            api_key: "sk-test".to_string(),
            website_url: String::new(),
            model: model.to_string(),
            wire_api: "responses".to_string(),
            reasoning_effort: String::new(),
            extra_toml: String::new(),
            config_text: String::new(),
            is_current: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn rendered_claude_env(provider: &Provider) -> serde_json::Value {
        let text = render_claude(provider);
        let body = split_sections(&text)
            .into_iter()
            .find(|(name, _)| name.contains("settings.json"))
            .map(|(_, body)| body)
            .expect("settings.json section");
        serde_json::from_str::<serde_json::Value>(&body).expect("valid claude settings json")["env"]
            .clone()
    }

    #[test]
    fn render_codex_uses_proxy_only_for_chat_wire_api_on_non_native_models() {
        let mut chat = codex_provider("chat", "");
        chat.model = "deepseek-chat".to_string();
        let responses = codex_provider("responses", "");

        assert!(render_codex(&chat).contains("http://127.0.0.1:47632/v1"));
        assert!(render_codex(&responses).contains("https://www.packyapi.com/v1"));
    }

    #[test]
    fn render_codex_keeps_gpt_models_direct_even_for_chat_wire_api() {
        let chat = codex_provider("chat", "");

        assert!(render_codex(&chat).contains("https://www.packyapi.com/v1"));
        assert!(!render_codex(&chat).contains("http://127.0.0.1:47632/v1"));
    }

    #[test]
    fn render_codex_advertises_official_deepseek_context_and_catalog() {
        let mut provider = codex_provider("chat", "");
        provider.base_url = "https://api.deepseek.com/v1".to_string();
        provider.model = "deepseek-chat".to_string();

        let text = render_codex(&provider);

        assert!(text.contains("model_context_window = 1000000"));
        assert!(text.contains("model_auto_compact_token_limit = 950000"));
        assert!(text.contains("model_catalog_json = \"model-catalog.json\""));
        assert!(text.contains("http://127.0.0.1:47632/v1"));
    }

    #[test]
    fn write_codex_writes_selected_deepseek_model_catalog() {
        let mut provider = codex_provider("chat", "");
        provider.model = "deepseek-v4-flash".to_string();
        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_ON_MARKER}");
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-deepseek-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, false, &[]).expect("write Codex config");

        let config = std::fs::read_to_string(dir.join("config.toml")).expect("read config.toml");
        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(config.contains("model_context_window = 1000000"));
        assert!(config.contains("model_auto_compact_token_limit = 950000"));
        assert!(config.contains("model_catalog_json = "));
        assert!(catalog.contains("\"slug\": \"deepseek-v4-flash\""));
        assert!(!catalog.contains("\"slug\": \"deepseek-v4-pro\""));
        assert!(catalog.contains("\"base_instructions\": \"\""));
        assert!(catalog.contains("\"truncation_policy\""));
        assert!(catalog.contains("\"supported_reasoning_levels\""));
        assert!(catalog.contains("\"input_modalities\": [\n        \"text\"\n      ]"));
        assert!(!catalog.contains("\"web_search_tool_type\""));
        assert!(!catalog.contains("\"supports_search_tool\""));
        assert!(catalog.contains("\"apply_patch_tool_type\": \"freeform\""));

        std::fs::remove_dir_all(&dir).expect("remove catalog test dir");
    }

    #[test]
    fn codex_vision_fallback_catalog_advertises_image_input_for_proxy_models() {
        let mut provider = codex_provider("chat", "");
        provider.model = "deepseek-v4-flash".to_string();
        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_ON_MARKER}");
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-vision-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale vision catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, true, &[]).expect("write Codex config");

        let config = std::fs::read_to_string(dir.join("config.toml")).expect("read config.toml");
        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(config.contains("model_catalog_json = "));
        assert!(catalog
            .contains("\"input_modalities\": [\n        \"text\",\n        \"image\"\n      ]"));

        std::fs::remove_dir_all(&dir).expect("remove vision catalog test dir");
    }

    #[test]
    fn codex_catalog_uses_upstream_model_input_modalities() {
        let mut provider = codex_provider("chat", "");
        provider.api_provider_id = "api-openrouter".to_string();
        provider.model = "qwen/qwen-vl-max".to_string();
        provider.extra_toml = format!("# {ONE_MILLION_CONTEXT_ON_MARKER}");
        let api_providers = vec![api_provider_with_models(
            "api-openrouter",
            vec![remote_model("qwen/qwen-vl-max", &["text", "image"])],
        )];
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-upstream-modalities-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir)
                .expect("clean stale upstream modalities catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, false, &api_providers)
            .expect("write Codex config");

        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(catalog
            .contains("\"input_modalities\": [\n        \"text\",\n        \"image\"\n      ]"));

        std::fs::remove_dir_all(&dir).expect("remove upstream modalities catalog test dir");
    }

    #[test]
    fn codex_vision_fallback_adds_image_to_text_only_upstream_metadata() {
        let mut provider = codex_provider("chat", "");
        provider.api_provider_id = "api-deepseek".to_string();
        provider.model = "deepseek-v4-flash".to_string();
        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_ON_MARKER}");
        let api_providers = vec![api_provider_with_models(
            "api-deepseek",
            vec![remote_model("deepseek-v4-flash", &["text"])],
        )];
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-fallback-modalities-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir)
                .expect("clean stale fallback modalities catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, true, &api_providers)
            .expect("write Codex config");

        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(catalog
            .contains("\"input_modalities\": [\n        \"text\",\n        \"image\"\n      ]"));

        std::fs::remove_dir_all(&dir).expect("remove fallback modalities catalog test dir");
    }

    #[test]
    fn write_codex_can_advertise_one_million_context_for_non_deepseek_model() {
        let mut provider = codex_provider("responses", "");
        provider.model = "qwen-max".to_string();
        provider.extra_toml = format!("# {ONE_MILLION_CONTEXT_ON_MARKER}");
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-generic-1m-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale generic 1m catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, false, &[]).expect("write Codex config");

        let config = std::fs::read_to_string(dir.join("config.toml")).expect("read config.toml");
        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(config.contains("model_context_window = 1000000"));
        assert!(config.contains("model_auto_compact_token_limit = 950000"));
        assert!(config.contains("model_catalog_json = "));
        assert!(catalog.contains("\"slug\": \"qwen-max\""));
        assert!(catalog.contains("\"display_name\": \"qwen-max\""));
        assert!(catalog.contains("\"base_instructions\": \"\""));
        assert!(catalog.contains("\"truncation_policy\""));
        assert!(catalog.contains("\"context_window\": 1000000"));
        assert!(!catalog.contains("\"web_search_tool_type\""));

        std::fs::remove_dir_all(&dir).expect("remove generic 1m catalog test dir");
    }

    #[test]
    fn write_codex_can_advertise_web_search_without_one_million_context() {
        let mut provider = codex_provider("chat", "");
        provider.model = "gpt-5.4".to_string();
        provider.extra_toml = format!("# {CODEX_WEB_SEARCH_MARKER}");
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-deepseek-web-search-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale web search catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, false, &[]).expect("write Codex config");

        let config = std::fs::read_to_string(dir.join("config.toml")).expect("read config.toml");
        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(!config.contains("model_context_window = 1000000"));
        assert!(!config.contains("model_auto_compact_token_limit = 950000"));
        assert!(config.contains("model_catalog_json = "));
        assert!(catalog.contains("\"slug\": \"gpt-5.4\""));
        assert!(catalog.contains("\"base_instructions\": \"\""));
        assert!(catalog.contains("\"truncation_policy\""));
        assert!(catalog.contains("\"context_window\": 128000"));
        assert!(catalog.contains("\"supported_reasoning_levels\""));
        assert!(catalog.contains("\"web_search_tool_type\": \"text_and_image\""));
        assert!(catalog.contains("\"supports_search_tool\": true"));

        std::fs::remove_dir_all(&dir).expect("remove web search catalog test dir");
    }

    #[test]
    fn official_deepseek_can_disable_one_million_context_but_keep_web_search_catalog() {
        let mut provider = codex_provider("chat", "");
        provider.base_url = "https://api.deepseek.com".to_string();
        provider.model = "deepseek-v4-pro".to_string();
        provider.extra_toml =
            format!("# {DEEPSEEK_ONE_MILLION_OFF_MARKER}\n# {CODEX_WEB_SEARCH_MARKER}");
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-deepseek-web-search-off-catalog-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale web search off catalog test dir");
        }

        write_codex_with_gateway(&provider, &dir, false, &[]).expect("write Codex config");

        let config = std::fs::read_to_string(dir.join("config.toml")).expect("read config.toml");
        let catalog =
            std::fs::read_to_string(dir.join("model-catalog.json")).expect("read catalog");
        assert!(!config.contains("model_context_window = 1000000"));
        assert!(!config.contains("model_auto_compact_token_limit = 950000"));
        assert!(config.contains("model_catalog_json = "));
        assert!(catalog.contains("\"web_search_tool_type\": \"text_and_image\""));
        assert!(catalog.contains("\"supports_search_tool\": true"));

        std::fs::remove_dir_all(&dir).expect("remove web search off catalog test dir");
    }

    #[test]
    fn custom_deepseek_catalog_is_opt_in() {
        let mut provider = codex_provider("chat", "");
        provider.model = "deepseek-v4-pro".to_string();

        let text = render_codex(&provider);

        assert!(!text.contains("model_context_window = 1000000"));
        assert!(!text.contains("model_catalog_json"));
    }

    #[test]
    fn official_deepseek_catalog_can_be_disabled() {
        let mut provider = codex_provider("chat", "");
        provider.base_url = "https://api.deepseek.com".to_string();
        provider.model = "deepseek-v4-pro".to_string();
        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_OFF_MARKER}");

        let text = render_codex(&provider);

        assert!(!text.contains("model_context_window = 1000000"));
        assert!(!text.contains("model_catalog_json"));
    }

    #[test]
    fn stale_proxy_preview_is_detected() {
        let text = r#"# -- ~/.codex/config.toml --
base_url = "http://127.0.0.1:47632/v1"
"#;

        assert!(saved_codex_text_uses_proxy(text));
    }

    #[test]
    fn vision_gateway_preserves_codex_oauth_auth() {
        let auth_json = r#"{
  "tokens": {
    "access_token": "oauth-access",
    "refresh_token": "oauth-refresh"
  }
}"#;
        let mut provider = codex_provider("responses", "");
        provider.base_url.clear();
        provider.api_key.clear();
        provider.config_text = render_codex_oauth(&provider.model, auth_json);
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-oauth-gateway-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale OAuth test dir");
        }

        write_codex_with_gateway(&provider, &dir, true, &[]).expect("write OAuth config");

        let auth = std::fs::read_to_string(dir.join("auth.json")).expect("read auth.json");
        assert!(auth.contains("\"tokens\""));
        assert!(auth.contains("\"access_token\": \"oauth-access\""));
        assert!(!auth.contains("OPENAI_API_KEY"));

        std::fs::remove_dir_all(&dir).expect("remove OAuth test dir");
    }

    #[test]
    fn claude_code_settings_support_deepseek_anthropic_endpoint() {
        let provider = claude_provider(
            "DeepSeek",
            "https://api.deepseek.com/anthropic",
            "deepseek-chat",
        );
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], "sk-test");
        assert_eq!(
            env["ANTHROPIC_BASE_URL"],
            "https://api.deepseek.com/anthropic"
        );
        assert_eq!(env["ANTHROPIC_MODEL"], "deepseek-chat[1M]");
        assert_eq!(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], "deepseek-chat[1M]");
        assert_eq!(env["ANTHROPIC_DEFAULT_OPUS_MODEL"], "deepseek-chat[1M]");
        assert_eq!(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"], "deepseek-chat[1M]");
        assert_eq!(env["CLAUDE_CODE_AUTO_COMPACT_WINDOW"], "950000");
    }

    #[test]
    fn claude_code_deepseek_one_million_context_can_be_disabled() {
        let mut provider = claude_provider(
            "DeepSeek",
            "https://api.deepseek.com/anthropic",
            "deepseek-chat",
        );
        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_OFF_MARKER}");
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_MODEL"], "deepseek-chat");
    }

    #[test]
    fn claude_code_custom_deepseek_one_million_context_is_opt_in() {
        let mut provider = claude_provider(
            "DeepSeek Custom",
            "https://gateway.example.com/anthropic",
            "deepseek-chat",
        );
        let env = rendered_claude_env(&provider);
        assert_eq!(env["ANTHROPIC_MODEL"], "deepseek-chat");

        provider.extra_toml = format!("# {DEEPSEEK_ONE_MILLION_ON_MARKER}");
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_MODEL"], "deepseek-chat[1M]");
        assert_eq!(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], "deepseek-chat[1M]");
    }

    #[test]
    fn claude_code_non_deepseek_one_million_context_is_opt_in() {
        let mut provider =
            claude_provider("Qwen", "https://gateway.example.com/anthropic", "qwen-max");
        let env = rendered_claude_env(&provider);
        assert_eq!(env["ANTHROPIC_MODEL"], "qwen-max");

        provider.extra_toml = format!("# {ONE_MILLION_CONTEXT_ON_MARKER}");
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_MODEL"], "qwen-max[1M]");
        assert_eq!(env["ANTHROPIC_DEFAULT_SONNET_MODEL"], "qwen-max[1M]");
    }

    #[test]
    fn claude_code_settings_support_mimo_anthropic_endpoint() {
        let provider = claude_provider("MiMo", "https://api.xiaomimimo.com/anthropic", "mimo-v2.5");
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], "sk-test");
        assert_eq!(
            env["ANTHROPIC_BASE_URL"],
            "https://api.xiaomimimo.com/anthropic"
        );
        assert_eq!(env["ANTHROPIC_MODEL"], "mimo-v2.5");
    }

    #[test]
    fn claude_code_settings_support_zhipu_glm_anthropic_endpoint() {
        let provider = claude_provider(
            "Zhipu GLM",
            "https://open.bigmodel.cn/api/anthropic",
            "glm-5.1",
        );
        let env = rendered_claude_env(&provider);

        assert_eq!(env["ANTHROPIC_AUTH_TOKEN"], "sk-test");
        assert_eq!(
            env["ANTHROPIC_BASE_URL"],
            "https://open.bigmodel.cn/api/anthropic"
        );
        assert_eq!(env["ANTHROPIC_MODEL"], "glm-5.1");
    }

    #[test]
    fn write_claude_writes_settings_json_body() {
        let provider = claude_provider(
            "DeepSeek",
            "https://api.deepseek.com/anthropic",
            "deepseek-chat",
        );
        let dir =
            std::env::temp_dir().join(format!("codex-switch-claude-test-{}", std::process::id()));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale temp claude test dir");
        }

        write_claude(&provider, &dir).expect("write claude settings");
        let settings_path = dir.join("settings.json");
        let text = std::fs::read_to_string(&settings_path).expect("read settings.json");
        let value = serde_json::from_str::<serde_json::Value>(&text).expect("valid settings json");

        assert_eq!(value["env"]["ANTHROPIC_AUTH_TOKEN"], "sk-test");
        assert_eq!(
            value["env"]["ANTHROPIC_BASE_URL"],
            "https://api.deepseek.com/anthropic"
        );
        assert_eq!(value["env"]["ANTHROPIC_MODEL"], "deepseek-chat[1M]");
        assert_eq!(
            value["env"]["ANTHROPIC_DEFAULT_SONNET_MODEL"],
            "deepseek-chat[1M]"
        );
        assert_eq!(
            value["env"]["ANTHROPIC_DEFAULT_OPUS_MODEL"],
            "deepseek-chat[1M]"
        );
        assert_eq!(
            value["env"]["ANTHROPIC_DEFAULT_HAIKU_MODEL"],
            "deepseek-chat[1M]"
        );
        assert_eq!(value["env"]["CLAUDE_CODE_AUTO_COMPACT_WINDOW"], "950000");

        std::fs::remove_dir_all(&dir).expect("remove temp claude test dir");
    }

    #[test]
    fn render_gemini_uses_current_cli_settings_and_bearer_auth() {
        let provider = gemini_provider(
            "https://api.gemai.cc",
            "[福利]gemini-3.1-flash-lite-preview",
        );
        let text = render_gemini(&provider);

        assert!(text.contains("~/.gemini/settings.json"));
        assert!(text.contains(r#""selectedType": "gemini-api-key""#));
        assert!(text.contains(r#""name": "[福利]gemini-3.1-flash-lite-preview""#));
        assert!(text.contains("GOOGLE_GEMINI_BASE_URL=https://api.gemai.cc"));
        assert!(text.contains("GEMINI_API_KEY_AUTH_MECHANISM=bearer"));
        assert!(text.contains("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI"));
    }

    #[test]
    fn write_gemini_preserves_unmanaged_settings_and_env() {
        let provider = gemini_provider("https://api.gemai.cc", "gemini-2.0-flash");
        let dir =
            std::env::temp_dir().join(format!("codex-switch-gemini-test-{}", std::process::id()));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale temp gemini test dir");
        }
        std::fs::create_dir_all(&dir).expect("create temp gemini test dir");
        std::fs::write(
            dir.join("settings.json"),
            r#"{"general":{"previewFeatures":true},"mcpServers":{"demo":{"command":"demo"}}}"#,
        )
        .expect("seed settings");
        std::fs::write(
            dir.join(".env"),
            "KEEP_ME=yes\nGEMINI_API_KEY=old\nGOOGLE_GEMINI_BASE_URL=https://old.example\n",
        )
        .expect("seed env");

        write_gemini(&provider, &dir).expect("write gemini settings");

        let settings: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("settings.json")).expect("read settings"),
        )
        .expect("valid settings json");
        assert_eq!(settings["general"]["previewFeatures"], true);
        assert_eq!(settings["mcpServers"]["demo"]["command"], "demo");
        assert_eq!(
            settings["security"]["auth"]["selectedType"],
            "gemini-api-key"
        );
        assert_eq!(settings["model"]["name"], "gemini-2.0-flash");

        let env = std::fs::read_to_string(dir.join(".env")).expect("read env");
        assert!(env.contains("KEEP_ME=yes"));
        assert!(env.contains("GEMINI_API_KEY=codex-switch-local"));
        assert!(env.contains("GOOGLE_GEMINI_BASE_URL=http://127.0.0.1:47632/gemini"));
        assert!(env.contains("GEMINI_API_KEY_AUTH_MECHANISM=bearer"));
        assert!(env.contains("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI"));
        assert!(!env.contains("GEMINI_API_KEY=old"));

        std::fs::remove_dir_all(&dir).expect("remove temp gemini test dir");
    }

    #[test]
    fn write_gemini_migrates_legacy_saved_preview() {
        let mut provider = gemini_provider(
            "https://api.gemai.cc",
            "[福利]gemini-3.1-flash-lite-preview",
        );
        provider.config_text = r#"// ── ~/.gemini/config.json ──
{
  "selectedAuthType": "gemini-api-key",
  "model": "[福利]gemini-3.1-flash-lite-preview"
}

# ── ~/.gemini/.env ──
GEMINI_API_KEY=sk-test
GOOGLE_GEMINI_BASE_URL=https://api.gemai.cc
"#
        .to_string();
        let dir = std::env::temp_dir().join(format!(
            "codex-switch-gemini-legacy-test-{}",
            std::process::id()
        ));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).expect("clean stale temp gemini legacy test dir");
        }

        write_gemini(&provider, &dir).expect("write migrated gemini settings");

        let settings: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("settings.json")).expect("read settings"),
        )
        .expect("valid settings json");
        assert!(settings.get("selectedAuthType").is_none());
        assert_eq!(
            settings["model"]["name"],
            "[福利]gemini-3.1-flash-lite-preview"
        );
        assert_eq!(
            settings["security"]["auth"]["selectedType"],
            "gemini-api-key"
        );
        let env = std::fs::read_to_string(dir.join(".env")).expect("read env");
        assert!(env.contains("GEMINI_API_KEY_AUTH_MECHANISM=bearer"));
        assert!(env.contains("GEMINI_CLI_CUSTOM_HEADERS=User-Agent:CodexSwitch-GeminiCLI"));

        std::fs::remove_dir_all(&dir).expect("remove temp gemini legacy test dir");
    }

    #[test]
    fn gemini_cli_base_url_removes_openai_or_api_version_suffix() {
        assert_eq!(
            gemini_cli_base_url("https://api.gemai.cc/v1"),
            "https://api.gemai.cc"
        );
        assert_eq!(
            gemini_cli_base_url("https://generativelanguage.googleapis.com/v1beta/"),
            "https://generativelanguage.googleapis.com"
        );
        assert_eq!(
            gemini_cli_base_url("https://gateway.example.com"),
            "https://gateway.example.com"
        );
    }

    #[test]
    fn custom_gemini_endpoints_use_the_local_proxy() {
        let provider = gemini_provider("https://api.gemai.cc", "gemini-3.5-flash");

        assert!(should_proxy_gemini(&provider, false));
    }

    #[test]
    fn official_gemini_endpoint_stays_direct() {
        let provider = gemini_provider(
            "https://generativelanguage.googleapis.com/v1beta",
            "gemini-2.5-pro",
        );

        assert!(!should_proxy_gemini(&provider, false));
    }
}
