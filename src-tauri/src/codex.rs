use crate::error::AppError;
use crate::models::Provider;
use std::fs;
use std::path::{Path, PathBuf};

pub fn default_codex_config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

pub fn ensure_codex_config_dir(config_dir: &Path) -> Result<(), AppError> {
    fs::create_dir_all(config_dir)?;
    Ok(())
}

pub fn write_provider_config(provider: &Provider, config_dir: &Path) -> Result<(), AppError> {
    ensure_codex_config_dir(config_dir)?;

    let auth_path = config_dir.join("auth.json");
    let config_path = config_dir.join("config.toml");

    let auth_value = serde_json::json!({
        "OPENAI_API_KEY": provider.api_key
    });

    fs::write(auth_path, serde_json::to_vec_pretty(&auth_value)?)?;
    fs::write(config_path, build_config_toml(provider))?;

    Ok(())
}

fn build_config_toml(provider: &Provider) -> String {
    let mut lines = vec![
        format!("model = \"{}\"", provider.model.trim()),
        format!(
            "model_reasoning_effort = \"{}\"",
            provider.reasoning_effort.trim()
        ),
        "disable_response_storage = true".to_string(),
    ];

    if !provider.base_url.trim().is_empty() {
        lines.push(String::new());
        lines.push("model_provider = \"custom\"".to_string());
        lines.push(String::new());
        lines.push("[model_providers.custom]".to_string());
        lines.push(format!("name = {:?}", provider.name.trim()));
        lines.push(format!("base_url = {:?}", provider.base_url.trim()));
        lines.push("wire_api = \"responses\"".to_string());
        lines.push("requires_openai_auth = true".to_string());
    }

    if !provider.extra_toml.trim().is_empty() {
        lines.push(String::new());
        lines.push(provider.extra_toml.trim().to_string());
    }

    lines.join("\n")
}
