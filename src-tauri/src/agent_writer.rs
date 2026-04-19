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
    format!(
        "# ── ~/.codex/config.toml ──\n{toml}\n\n# ── ~/.codex/auth.json ──\n{auth}\n"
    )
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
    let selected_model = if model.is_empty() { "gemini-2.5-pro" } else { model };
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
    let base_url = provider.base_url.trim();
    let has_custom = !base_url.is_empty();
    let mut lines: Vec<String> = Vec::new();

    if has_custom {
        lines.push("model_provider = \"custom\"".to_string());
    }
    lines.push(format!("model = \"{}\"", provider.model.trim()));
    lines.push(format!(
        "model_reasoning_effort = \"{}\"",
        provider.reasoning_effort.trim()
    ));
    lines.push("disable_response_storage = true".to_string());

    if has_custom {
        lines.push("model_context_window = 1000000".to_string());
        lines.push("model_auto_compact_token_limit = 900000".to_string());
        lines.push("[model_providers]".to_string());
        lines.push("[model_providers.custom]".to_string());
        let name = provider.name.trim();
        let name = if name.is_empty() { "custom" } else { name };
        lines.push(format!("name = {:?}", name));
        lines.push("wire_api = \"responses\"".to_string());
        lines.push("requires_openai_auth = true".to_string());
        lines.push(format!("base_url = {:?}", base_url));
    }

    if !provider.extra_toml.trim().is_empty() {
        lines.push(String::new());
        lines.push(provider.extra_toml.trim().to_string());
    }

    lines.join("\n")
}

/// Write the provider to disk, using the agent-specific layout.
/// If `provider.config_text` is non-empty we use it verbatim (user edited the
/// preview); otherwise we regenerate from fields.
pub fn write_provider(provider: &Provider, codex_dir: &Path) -> Result<(), AppError> {
    match provider.agent.as_str() {
        AGENT_CLAUDE => write_claude(provider, &default_claude_config_dir()),
        AGENT_GEMINI => write_gemini(provider, &default_gemini_config_dir()),
        _ => write_codex(provider, codex_dir),
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

    let text = effective_text(provider, || render_codex(provider));
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
