use crate::compatibility_proxy::proxy_base_url;
use crate::error::AppError;
use crate::models::Provider;
use std::fs;
use std::path::{Path, PathBuf};

pub const AGENT_CODEX: &str = "codex";
pub const AGENT_CLAUDE: &str = "claude";
pub const AGENT_GEMINI: &str = "gemini";

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

pub fn render_claude(provider: &Provider) -> String {
    let base_url = provider.base_url.trim();
    let model = provider.model.trim();
    let json = serde_json::to_string_pretty(&serde_json::json!({
        "env": {
            "ANTHROPIC_AUTH_TOKEN": provider.api_key,
            "ANTHROPIC_BASE_URL": base_url,
            "ANTHROPIC_MODEL": model,
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
    let config = serde_json::to_string_pretty(&serde_json::json!({
        "selectedAuthType": "gemini-api-key",
        "model": selected_model,
    }))
    .unwrap_or_else(|_| "{}".to_string());

    let base = provider.base_url.trim();
    let mut env_lines = vec![format!("GEMINI_API_KEY={}", provider.api_key)];
    if !base.is_empty() {
        env_lines.push(format!("GOOGLE_GEMINI_BASE_URL={}", base));
    }
    let env = env_lines.join("\n");

    format!("// ── ~/.gemini/config.json ──\n{config}\n\n# ── ~/.gemini/.env ──\n{env}\n")
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
}

/// Write the provider to disk, using the agent-specific layout.
/// If `provider.config_text` is non-empty we use it verbatim (user edited the
/// preview); otherwise we regenerate from fields.
pub fn write_provider(provider: &Provider, dirs: &AgentDirs) -> Result<(), AppError> {
    match provider.agent.as_str() {
        AGENT_CLAUDE => write_claude(provider, dirs.claude),
        AGENT_GEMINI => write_gemini(provider, dirs.gemini),
        _ => write_codex(provider, dirs.codex),
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

pub fn write_codex(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let auth_path = config_dir.join("auth.json");
    let config_path = config_dir.join("config.toml");

    let text = if uses_codex_proxy(provider) || saved_codex_text_uses_proxy(&provider.config_text) {
        render_codex(provider)
    } else {
        effective_text(provider, || render_codex(provider))
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

    let toml_body = toml.unwrap_or_else(|| build_codex_toml(provider));
    let auth_body = auth.unwrap_or_else(|| {
        serde_json::to_string_pretty(&serde_json::json!({"OPENAI_API_KEY": provider.api_key}))
            .unwrap_or_else(|_| "{}".to_string())
    });

    fs::write(auth_path, auth_body)?;
    fs::write(config_path, toml_body)?;
    Ok(())
}

fn uses_codex_proxy(provider: &Provider) -> bool {
    provider.wire_api.trim() == "chat"
}

fn saved_codex_text_uses_proxy(text: &str) -> bool {
    text.contains(&proxy_base_url()) || text.contains("http://127.0.0.1:47632")
}

pub fn write_claude(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let path = config_dir.join("settings.json");
    let text = effective_text(provider, || render_claude(provider));
    let sections = split_sections(&text);
    let body = sections
        .into_iter()
        .find(|(name, _)| name.contains("settings.json"))
        .map(|(_, body)| body)
        .unwrap_or(text);
    fs::write(path, body)?;
    Ok(())
}

pub fn write_gemini(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    ensure_dir(config_dir)?;
    let config_path = config_dir.join("config.json");
    let env_path = config_dir.join(".env");

    let text = effective_text(provider, || render_gemini(provider));
    let sections = split_sections(&text);

    let mut config: Option<String> = None;
    let mut env: Option<String> = None;
    for (name, body) in sections {
        if name.contains("config.json") {
            config = Some(body);
        } else if name.contains(".env") {
            env = Some(body);
        }
    }

    let config_body = config.unwrap_or_else(|| {
        serde_json::to_string_pretty(&serde_json::json!({
            "selectedAuthType": "gemini-api-key",
            "model": if provider.model.trim().is_empty() { "gemini-2.5-pro" } else { provider.model.trim() },
        }))
        .unwrap_or_else(|_| "{}".to_string())
    });
    let env_body = env.unwrap_or_else(|| format!("GEMINI_API_KEY={}", provider.api_key));

    fs::write(config_path, config_body)?;
    fs::write(env_path, env_body)?;
    Ok(())
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

    #[test]
    fn render_codex_uses_proxy_only_for_chat_wire_api() {
        let chat = codex_provider("chat", "");
        let responses = codex_provider("responses", "");

        assert!(render_codex(&chat).contains("http://127.0.0.1:47632/v1"));
        assert!(render_codex(&responses).contains("https://www.packyapi.com/v1"));
    }

    #[test]
    fn stale_proxy_preview_is_detected() {
        let text = r#"# -- ~/.codex/config.toml --
base_url = "http://127.0.0.1:47632/v1"
"#;

        assert!(saved_codex_text_uses_proxy(text));
    }
}
