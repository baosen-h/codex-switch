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
    let settings_path = config_dir.join("settings.json");
    let env_path = config_dir.join(".env");

    let text = effective_text(provider, || render_gemini(provider));
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
    let generated_settings = normalize_gemini_settings(generated_settings, provider);
    let mut merged_settings = fs::read_to_string(&settings_path)
        .ok()
        .and_then(|body| serde_json::from_str::<serde_json::Value>(&body).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    merge_json(&mut merged_settings, generated_settings);

    let existing_env = fs::read_to_string(&env_path).unwrap_or_default();
    let env_body = normalize_gemini_env(&env_body, provider);
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
        assert_eq!(env["ANTHROPIC_MODEL"], "deepseek-chat");
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
        assert_eq!(value["env"]["ANTHROPIC_MODEL"], "deepseek-chat");

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
        assert!(env.contains("GEMINI_API_KEY=sk-test"));
        assert!(env.contains("GOOGLE_GEMINI_BASE_URL=https://api.gemai.cc"));
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
}
