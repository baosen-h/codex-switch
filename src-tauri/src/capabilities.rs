use crate::agent_writer::{
    resolve_claude_dir, resolve_codex_dir, resolve_gemini_dir, AGENT_CLAUDE, AGENT_CODEX,
    AGENT_GEMINI,
};
use crate::app_config::APP_HOME_DIR;
use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    CapabilitiesState, CapabilityCounts, CapabilitySyncResult, CapabilityTargets, ConfigValue,
    McpPreset, McpServer, McpTestResult, McpTool, Skill, SyncTargetResult,
};
use keyring::Entry;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use uuid::Uuid;

const CREDENTIAL_SERVICE: &str = "codex-switch-mcp";
const MCP_TIMEOUT: Duration = Duration::from_secs(10);

pub fn state(db: &Database) -> Result<CapabilitiesState, AppError> {
    discover_local_capabilities(db)?;
    remove_hidden_system_skills(db)?;
    remove_missing_external_skills(db)?;
    let servers = db.mcp_servers()?;
    let skills = db.skills()?;
    let available_targets = available_targets(db)?;
    Ok(CapabilitiesState {
        mcp_counts: counts_for_mcp(&servers, db)?,
        skill_counts: counts_for_skills(&skills, db)?,
        mcp_presets: db.mcp_presets()?,
        mcp_servers: redact_servers(servers),
        skills,
        available_targets,
    })
}

fn discover_local_capabilities(db: &Database) -> Result<(), AppError> {
    let settings = db.settings()?;
    let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
    let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
    let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
    let claude_config = if claude_dir.file_name().and_then(|name| name.to_str()) == Some(".claude") {
        claude_dir.parent().unwrap_or(&claude_dir).join(".claude.json")
    } else {
        claude_dir.join(".claude.json")
    };

    discover_mcp_file(db, &codex_dir.join("config.toml"), AGENT_CODEX)?;
    discover_mcp_file(db, &claude_config, AGENT_CLAUDE)?;
    discover_mcp_file(db, &gemini_dir.join("settings.json"), AGENT_GEMINI)?;
    discover_skill_root(db, &codex_dir.join("skills"), AGENT_CODEX)?;
    discover_skill_root(db, &claude_dir.join("skills"), AGENT_CLAUDE)?;
    discover_skill_root(db, &gemini_dir.join("skills"), AGENT_GEMINI)?;
    if let Some(home) = dirs::home_dir() {
        discover_skill_root(db, &home.join(".agents").join("skills"), "")?;
    }
    Ok(())
}

fn discover_mcp_file(db: &Database, path: &Path, agent: &str) -> Result<(), AppError> {
    let Some(servers) = (match read_mcp_map(path, agent) {
        Ok(servers) => servers,
        Err(_) => None,
    }) else {
        return Ok(());
    };
    let mut existing = db.mcp_servers()?;
    for (target_key, spec) in servers {
        let Some(mut discovered) = mcp_from_spec(&target_key, &spec, agent) else {
            continue;
        };
        if let Some(server) = existing.iter_mut().find(|item| {
            item.target_key.eq_ignore_ascii_case(&target_key)
                || item.name.eq_ignore_ascii_case(&discovered.name)
        }) {
            let changed = set_target(&mut server.targets, agent);
            if changed {
                *server = db.save_mcp_server(server.clone())?;
            }
        } else {
            discovered = db.save_mcp_server(discovered)?;
            existing.push(discovered);
        }
    }
    Ok(())
}

fn read_mcp_map(path: &Path, agent: &str) -> Result<Option<Map<String, Value>>, AppError> {
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(None);
    };
    if agent == AGENT_CODEX {
        let root: toml::Value = toml::from_str(&text)
            .map_err(|error| AppError::message(format!("Invalid Codex TOML: {error}")))?;
        let value = serde_json::to_value(root)?;
        Ok(value.get("mcp_servers").and_then(Value::as_object).cloned())
    } else {
        let root: Value = serde_json::from_str(&text)
            .map_err(|error| AppError::message(format!("Invalid agent MCP JSON: {error}")))?;
        Ok(root.get("mcpServers").and_then(Value::as_object).cloned())
    }
}

fn mcp_from_spec(target_key: &str, spec: &Value, agent: &str) -> Option<McpServer> {
    let object = spec.as_object()?;
    let command = object.get("command").and_then(Value::as_str).unwrap_or("").to_string();
    let url = object.get("httpUrl").or_else(|| object.get("url"))
        .and_then(Value::as_str).unwrap_or("").to_string();
    let transport = match object.get("type").and_then(Value::as_str) {
        Some("sse") => "sse",
        Some("http") | Some("streamable-http") => "http",
        _ if !command.is_empty() => "stdio",
        _ if !url.is_empty() => "http",
        _ => return None,
    }.to_string();
    let config_values = |value: Option<&Value>| {
        value.and_then(Value::as_object).map(|items| items.iter().filter_map(|(key, value)| {
            Some((key.clone(), ConfigValue {
                value: value.as_str()?.to_string(),
                secret: false,
                credential_id: String::new(),
            }))
        }).collect()).unwrap_or_default()
    };
    let mut targets = CapabilityTargets::default();
    set_target(&mut targets, agent);
    Some(McpServer {
        id: String::new(),
        target_key: target_key.to_string(),
        name: target_key.to_string(),
        description: "Imported from local agent configuration".to_string(),
        transport,
        command,
        args: object.get("args").and_then(Value::as_array).map(|items| {
            items.iter().filter_map(Value::as_str).map(str::to_string).collect()
        }).unwrap_or_default(),
        working_directory: object.get("cwd").and_then(Value::as_str).unwrap_or("").to_string(),
        url,
        env: config_values(object.get("env")),
        headers: config_values(object.get("http_headers").or_else(|| object.get("headers"))),
        targets,
        last_test_status: String::new(),
        last_test_error: String::new(),
        last_test_at: String::new(),
        cached_tools: Vec::new(),
        created_at: String::new(),
        updated_at: String::new(),
    })
}

fn discover_skill_root(db: &Database, root: &Path, agent: &str) -> Result<(), AppError> {
    if !root.is_dir() {
        return Ok(());
    }
    let mut existing = db.skills()?;
    let mut skill_dirs = Vec::new();
    collect_skill_dirs(root, &mut skill_dirs)?;
    for path in skill_dirs {
        let Ok((name, description, instructions)) = read_skill_md(&path) else {
            continue;
        };
        if let Some(skill) = existing.iter_mut().find(|item| item.name.eq_ignore_ascii_case(&name)) {
            let changed = !agent.is_empty() && set_target(&mut skill.targets, agent);
            if changed {
                *skill = db.save_skill(skill.clone())?;
            }
        } else {
            let mut targets = CapabilityTargets::default();
            if !agent.is_empty() {
                set_target(&mut targets, agent);
            }
            let saved = db.save_skill(Skill {
                id: String::new(),
                name,
                description,
                instructions,
                source_path: path.to_string_lossy().to_string(),
                source_kind: "external".to_string(),
                sync_mode: "reference".to_string(),
                targets,
                created_at: String::new(),
                updated_at: String::new(),
            })?;
            existing.push(saved);
        }
    }
    Ok(())
}

fn collect_skill_dirs(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), AppError> {
    if root.file_name().and_then(|name| name.to_str()) == Some(".system") {
        return Ok(());
    }
    if root.join("SKILL.md").is_file() {
        output.push(root.to_path_buf());
        return Ok(());
    }
    for entry in fs::read_dir(root)?.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            collect_skill_dirs(&path, output)?;
        }
    }
    Ok(())
}

fn set_target(targets: &mut CapabilityTargets, agent: &str) -> bool {
    let target = match agent {
        AGENT_CODEX => &mut targets.codex,
        AGENT_CLAUDE => &mut targets.claude,
        AGENT_GEMINI => &mut targets.gemini,
        _ => return false,
    };
    let changed = !*target;
    *target = true;
    changed
}

pub fn save_server(db: &Database, server: McpServer) -> Result<(McpServer, CapabilitySyncResult), AppError> {
    validate_server(db, &server)?;
    let existing = if server.id.trim().is_empty() {
        None
    } else {
        db.mcp_servers()?.into_iter().find(|item| item.id == server.id)
    };
    let mut secured = server;
    secure_config_values(&mut secured, existing.as_ref())?;
    let saved = db.save_mcp_server(secured)?;
    let sync = sync_mcp(db, None)?;
    Ok((redact_server(saved), sync))
}

pub fn save_preset(db: &Database, mut preset: McpPreset) -> Result<McpPreset, AppError> {
    preset.env.values_mut().for_each(clear_secret_value);
    preset.headers.values_mut().for_each(clear_secret_value);
    db.save_mcp_preset(preset)
}

pub fn delete_preset(db: &Database, id: &str) -> Result<(), AppError> {
    db.delete_mcp_preset(id)
}

pub fn delete_server(db: &Database, id: &str) -> Result<CapabilitySyncResult, AppError> {
    let Some(server) = db.delete_mcp_server_record(id)? else {
        return Ok(CapabilitySyncResult { results: Vec::new() });
    };
    let result = sync_mcp(db, None)?;
    // Credentials intentionally remain while the deletion backup exists.
    let _ = server;
    Ok(result)
}

pub fn test_server(db: &Database, mut server: McpServer) -> Result<McpTestResult, AppError> {
    validate_server(db, &server)?;
    resolve_config_secrets(&mut server)?;
    expand_server(db, &mut server)?;
    let tested_at = now_string();
    let result = match server.transport.as_str() {
        "stdio" => test_stdio(&server, &tested_at),
        "http" => test_http(&server, false, &tested_at),
        "sse" => test_http(&server, true, &tested_at),
        _ => Err(AppError::message("Unsupported MCP transport")),
    }?;
    if !server.id.trim().is_empty() {
        db.update_mcp_test(&server.id, &result.status, &result.error, &result.tools)?;
    }
    Ok(result)
}

pub fn preview_mcp(db: &Database, mut server: McpServer, agent: &str) -> Result<String, AppError> {
    validate_server(db, &server)?;
    expand_server(db, &mut server)?;
    let spec = server_spec(&server, agent, true)?;
    if agent == AGENT_CODEX {
        let mut table = toml_edit::Table::new();
        table[&server.target_key] = toml_edit::Item::Table(json_to_codex_table(&spec)?);
        let mut doc = toml_edit::DocumentMut::new();
        doc["mcp_servers"] = toml_edit::Item::Table(table);
        Ok(doc.to_string())
    } else {
        Ok(serde_json::to_string_pretty(&json!({
            "mcpServers": { server.target_key: spec }
        }))?)
    }
}

pub fn import_skill(db: &Database, source_path: &str) -> Result<(Skill, CapabilitySyncResult), AppError> {
    let path = PathBuf::from(source_path);
    let (name, description, instructions) = read_skill_md(&path)?;
    let skill = Skill {
        id: String::new(),
        name,
        description,
        instructions,
        source_path: path.to_string_lossy().to_string(),
        source_kind: "external".to_string(),
        sync_mode: "reference".to_string(),
        targets: CapabilityTargets::default(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    save_skill(db, skill)
}

pub fn save_skill(db: &Database, mut skill: Skill) -> Result<(Skill, CapabilitySyncResult), AppError> {
    validate_skill(db, &skill)?;
    if skill.id.trim().is_empty() {
        skill.id = Uuid::new_v4().to_string();
    }
    if skill.source_kind == "app" {
        let target = app_data_dir()?.join("skills").join(&skill.name);
        if skill.source_path.trim().is_empty() {
            skill.source_path = target.to_string_lossy().to_string();
        }
        write_skill_md(Path::new(&skill.source_path), &skill)?;
    } else {
        write_skill_md(Path::new(&skill.source_path), &skill)?;
    }
    let saved = db.save_skill(skill)?;
    let sync = sync_skills(db)?;
    Ok((saved, sync))
}

pub fn delete_skill(db: &Database, id: &str) -> Result<CapabilitySyncResult, AppError> {
    let skill = db.skills()?.into_iter().find(|item| item.id == id);
    let mut trash_path = String::new();
    if let Some(ref item) = skill {
        remove_skill_targets(db, item)?;
        if item.source_kind == "app" {
            let source = PathBuf::from(&item.source_path);
            if source.exists() {
                let trash = app_data_dir()?.join("trash").join("skills").join(format!(
                    "{}-{}",
                    sanitize_segment(&item.name),
                    item.id
                ));
                if let Some(parent) = trash.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::rename(&source, &trash)?;
                trash_path = trash.to_string_lossy().to_string();
            }
        }
    }
    db.delete_skill_record(id, &trash_path)?;
    sync_skills(db)
}

pub fn preview_skill(skill: &Skill) -> Result<String, AppError> {
    validate_skill_shape(skill)?;
    Ok(render_skill_md(skill))
}

pub fn sync_mcp(db: &Database, only_id: Option<&str>) -> Result<CapabilitySyncResult, AppError> {
    let servers = db.mcp_servers()?;
    let settings = db.settings()?;
    let mut results = Vec::new();
    for agent in [AGENT_CODEX, AGENT_CLAUDE, AGENT_GEMINI] {
        let result = sync_mcp_agent(&servers, &settings, agent, only_id);
        let (status, error) = match &result {
            Ok(hash) => {
                db.set_sync_state("mcp", agent, hash, "ok", "")?;
                ("ok".to_string(), String::new())
            }
            Err(error) => {
                db.set_sync_state("mcp", agent, "", "error", &error.to_string())?;
                ("error".to_string(), error.to_string())
            }
        };
        results.push(SyncTargetResult { agent: agent.to_string(), status, error });
    }
    Ok(CapabilitySyncResult { results })
}

pub fn sync_skills(db: &Database) -> Result<CapabilitySyncResult, AppError> {
    let skills = db.skills()?;
    let settings = db.settings()?;
    let mut results = Vec::new();
    for agent in [AGENT_CODEX, AGENT_CLAUDE, AGENT_GEMINI] {
        let result = sync_skill_agent(&skills, &settings, agent);
        let (status, error) = match &result {
            Ok(hash) => {
                db.set_sync_state("skill", agent, hash, "ok", "")?;
                ("ok".to_string(), String::new())
            }
            Err(error) => {
                db.set_sync_state("skill", agent, "", "error", &error.to_string())?;
                ("error".to_string(), error.to_string())
            }
        };
        results.push(SyncTargetResult { agent: agent.to_string(), status, error });
    }
    Ok(CapabilitySyncResult { results })
}

fn available_targets(db: &Database) -> Result<CapabilityTargets, AppError> {
    let settings = db.settings()?;
    Ok(CapabilityTargets {
        codex: resolve_codex_dir(&settings.codex_config_dir).exists(),
        claude: resolve_claude_dir(&settings.claude_config_dir).exists(),
        gemini: resolve_gemini_dir(&settings.gemini_config_dir).exists(),
    })
}

fn validate_server(db: &Database, server: &McpServer) -> Result<(), AppError> {
    let name = server.name.trim();
    if name.is_empty() {
        return Err(AppError::message("MCP server name is required"));
    }
    if db.mcp_servers()?.iter().any(|item| item.id != server.id && item.name.eq_ignore_ascii_case(name)) {
        return Err(AppError::message("An MCP server with this name already exists"));
    }
    match server.transport.as_str() {
        "stdio" if server.command.trim().is_empty() => Err(AppError::message("Command is required for stdio MCP servers")),
        "http" | "sse" if server.url.trim().is_empty() => Err(AppError::message("URL is required for remote MCP servers")),
        "stdio" | "http" | "sse" => Ok(()),
        _ => Err(AppError::message("Transport must be stdio, http, or sse")),
    }
}

fn validate_skill(db: &Database, skill: &Skill) -> Result<(), AppError> {
    validate_skill_shape(skill)?;
    if db.skills()?.iter().any(|item| item.id != skill.id && item.name.eq_ignore_ascii_case(skill.name.trim())) {
        return Err(AppError::message("A Skill with this name already exists"));
    }
    Ok(())
}

fn validate_skill_shape(skill: &Skill) -> Result<(), AppError> {
    let name = skill.name.trim();
    if name.is_empty() {
        return Err(AppError::message("Skill name is required"));
    }
    if skill.instructions.trim().is_empty() {
        return Err(AppError::message("Skill instructions are required"));
    }
    if !filesystem_safe_name(name) {
        return Err(AppError::message("Skill name is not safe for a folder name"));
    }
    Ok(())
}

fn filesystem_safe_name(name: &str) -> bool {
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "LPT1", "LPT2", "LPT3"];
    !name.is_empty()
        && name == name.trim()
        && !name.ends_with('.')
        && !name.chars().any(|ch| matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        && !reserved.iter().any(|item| item.eq_ignore_ascii_case(name))
}

fn secure_config_values(server: &mut McpServer, existing: Option<&McpServer>) -> Result<(), AppError> {
    for (scope, values) in [("env", &mut server.env), ("header", &mut server.headers)] {
        for (key, item) in values {
            if !item.secret {
                item.credential_id.clear();
                continue;
            }
            if item.credential_id.trim().is_empty() {
                item.credential_id = format!("mcp:{}:{}:{}", server.id, scope, key);
            }
            if item.value.is_empty() {
                if existing.and_then(|old| {
                    let map = if scope == "env" { &old.env } else { &old.headers };
                    map.get(key)
                }).is_none() {
                    return Err(AppError::message(format!("Secret value is required for {key}")));
                }
                continue;
            }
            credential_entry(&item.credential_id)?.set_password(&item.value)
                .map_err(|error| AppError::message(format!("Secure credential storage is unavailable: {error}")))?;
            item.value.clear();
        }
    }
    Ok(())
}

fn resolve_config_secrets(server: &mut McpServer) -> Result<(), AppError> {
    for values in [&mut server.env, &mut server.headers] {
        for (key, item) in values {
            if item.secret {
                if item.value.is_empty() {
                    item.value = credential_entry(&item.credential_id)?.get_password()
                        .map_err(|_| AppError::message(format!("Secret required: {key}")))?;
                }
            }
        }
    }
    Ok(())
}

fn credential_entry(id: &str) -> Result<Entry, AppError> {
    Entry::new(CREDENTIAL_SERVICE, id).map_err(|error| AppError::message(error.to_string()))
}

fn clear_secret_value(value: &mut ConfigValue) {
    if value.secret {
        value.value.clear();
        value.credential_id.clear();
    }
}

fn redact_servers(servers: Vec<McpServer>) -> Vec<McpServer> {
    servers.into_iter().map(redact_server).collect()
}

fn redact_server(mut server: McpServer) -> McpServer {
    for values in [&mut server.env, &mut server.headers] {
        for item in values.values_mut() {
            if item.secret {
                item.value.clear();
            }
        }
    }
    server
}

fn expand_server(db: &Database, server: &mut McpServer) -> Result<(), AppError> {
    let settings = db.settings()?;
    let home = dirs::home_dir().ok_or_else(|| AppError::message("Unable to determine home directory"))?;
    let app_data = app_data_dir()?;
    let expand = |value: &str| -> Result<String, AppError> {
        let mut output = value
            .replace("${HOME}", &home.to_string_lossy())
            .replace("${APP_DATA}", &app_data.to_string_lossy());
        if output.contains("${WORKSPACE}") {
            if settings.default_workspace.trim().is_empty() {
                return Err(AppError::message("${WORKSPACE} requires a default workspace in Settings"));
            }
            output = output.replace("${WORKSPACE}", &settings.default_workspace);
        }
        if output.contains("${") {
            return Err(AppError::message(format!("Unknown variable in '{value}'")));
        }
        Ok(output)
    };
    server.command = expand(&server.command)?;
    server.args = server.args.iter().map(|item| expand(item)).collect::<Result<_, _>>()?;
    server.working_directory = expand(&server.working_directory)?;
    server.url = expand(&server.url)?;
    for values in [&mut server.env, &mut server.headers] {
        for item in values.values_mut() {
            item.value = expand(&item.value)?;
        }
    }
    Ok(())
}

fn server_spec(server: &McpServer, agent: &str, redact: bool) -> Result<Value, AppError> {
    let values = |source: &BTreeMap<String, ConfigValue>| {
        source.iter().map(|(key, value)| {
            (key.clone(), Value::String(if value.secret && redact { "••••••••".to_string() } else { value.value.clone() }))
        }).collect::<Map<_, _>>()
    };
    let mut spec = Map::new();
    match server.transport.as_str() {
        "stdio" => {
            spec.insert("command".to_string(), json!(server.command));
            if !server.args.is_empty() { spec.insert("args".to_string(), json!(server.args)); }
            if !server.env.is_empty() { spec.insert("env".to_string(), Value::Object(values(&server.env))); }
            if !server.working_directory.trim().is_empty() {
                spec.insert(if agent == AGENT_GEMINI { "cwd" } else { "cwd" }.to_string(), json!(server.working_directory));
            }
            if agent == AGENT_CODEX { spec.insert("type".to_string(), json!("stdio")); }
        }
        "http" => {
            spec.insert(if agent == AGENT_GEMINI { "httpUrl" } else { "url" }.to_string(), json!(server.url));
            if agent == AGENT_CODEX { spec.insert("type".to_string(), json!("http")); }
            if !server.headers.is_empty() {
                spec.insert(if agent == AGENT_CODEX { "http_headers" } else { "headers" }.to_string(), Value::Object(values(&server.headers)));
            }
        }
        "sse" => {
            spec.insert("url".to_string(), json!(server.url));
            if agent == AGENT_CODEX { spec.insert("type".to_string(), json!("sse")); }
            if !server.headers.is_empty() {
                spec.insert(if agent == AGENT_CODEX { "http_headers" } else { "headers" }.to_string(), Value::Object(values(&server.headers)));
            }
        }
        _ => return Err(AppError::message("Unsupported MCP transport")),
    }
    Ok(Value::Object(spec))
}

fn sync_mcp_agent(
    servers: &[McpServer],
    settings: &crate::models::AppSettings,
    agent: &str,
    _only_id: Option<&str>,
) -> Result<String, AppError> {
    let dir = match agent {
        AGENT_CODEX => resolve_codex_dir(&settings.codex_config_dir),
        AGENT_CLAUDE => resolve_claude_dir(&settings.claude_config_dir),
        _ => resolve_gemini_dir(&settings.gemini_config_dir),
    };
    if !dir.exists() {
        return Err(AppError::message(format!("{agent} config directory is unavailable")));
    }
    let mut output = Map::new();
    for original in servers {
        let enabled = match agent {
            AGENT_CODEX => original.targets.codex,
            AGENT_CLAUDE => original.targets.claude,
            _ => original.targets.gemini,
        };
        if !enabled { continue; }
        let mut server = original.clone();
        resolve_config_secrets(&mut server)?;
        // Expansion does not need DB after settings are known.
        expand_server_with_settings(settings, &mut server)?;
        output.insert(server.target_key.clone(), server_spec(&server, agent, false)?);
    }
    if agent == AGENT_CODEX {
        sync_codex_mcp(&dir.join("config.toml"), &output)?;
    } else if agent == AGENT_CLAUDE {
        let path = if dir.file_name().and_then(|name| name.to_str()) == Some(".claude") {
            dir.parent().unwrap_or(&dir).join(".claude.json")
        } else {
            dir.join(".claude.json")
        };
        sync_json_mcp(&path, &output)?;
    } else {
        sync_json_mcp(&dir.join("settings.json"), &output)?;
    }
    Ok(hash_value(&Value::Object(output)))
}

fn expand_server_with_settings(settings: &crate::models::AppSettings, server: &mut McpServer) -> Result<(), AppError> {
    let home = dirs::home_dir().ok_or_else(|| AppError::message("Unable to determine home directory"))?;
    let app_data = app_data_dir()?;
    let expand = |value: &str| -> Result<String, AppError> {
        let mut output = value.replace("${HOME}", &home.to_string_lossy()).replace("${APP_DATA}", &app_data.to_string_lossy());
        if output.contains("${WORKSPACE}") {
            if settings.default_workspace.trim().is_empty() {
                return Err(AppError::message("${WORKSPACE} requires a default workspace in Settings"));
            }
            output = output.replace("${WORKSPACE}", &settings.default_workspace);
        }
        if output.contains("${") { return Err(AppError::message(format!("Unknown variable in '{value}'"))); }
        Ok(output)
    };
    server.command = expand(&server.command)?;
    server.args = server.args.iter().map(|item| expand(item)).collect::<Result<_, _>>()?;
    server.working_directory = expand(&server.working_directory)?;
    server.url = expand(&server.url)?;
    for values in [&mut server.env, &mut server.headers] {
        for item in values.values_mut() { item.value = expand(&item.value)?; }
    }
    Ok(())
}

fn sync_codex_mcp(path: &Path, servers: &Map<String, Value>) -> Result<(), AppError> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let mut doc = if text.trim().is_empty() {
        toml_edit::DocumentMut::new()
    } else {
        text.parse::<toml_edit::DocumentMut>().map_err(|error| AppError::message(format!("Invalid Codex TOML: {error}")))?
    };
    if servers.is_empty() {
        doc.as_table_mut().remove("mcp_servers");
    } else {
        let mut table = toml_edit::Table::new();
        for (key, spec) in servers {
            table[key] = toml_edit::Item::Table(json_to_codex_table(spec)?);
        }
        doc["mcp_servers"] = toml_edit::Item::Table(table);
    }
    atomic_write(path, doc.to_string().as_bytes())
}

fn json_to_codex_table(spec: &Value) -> Result<toml_edit::Table, AppError> {
    let object = spec.as_object().ok_or_else(|| AppError::message("MCP spec must be an object"))?;
    let mut table = toml_edit::Table::new();
    for (key, value) in object {
        match value {
            Value::String(text) => table[key] = toml_edit::value(text),
            Value::Array(items) => {
                let mut array = toml_edit::Array::new();
                for item in items.iter().filter_map(Value::as_str) { array.push(item); }
                table[key] = toml_edit::Item::Value(toml_edit::Value::Array(array));
            }
            Value::Object(items) => {
                let mut child = toml_edit::Table::new();
                for (child_key, child_value) in items {
                    if let Some(text) = child_value.as_str() { child[child_key] = toml_edit::value(text); }
                }
                table[key] = toml_edit::Item::Table(child);
            }
            _ => {}
        }
    }
    Ok(table)
}

fn sync_json_mcp(path: &Path, servers: &Map<String, Value>) -> Result<(), AppError> {
    let mut root = fs::read_to_string(path).ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or_else(|| json!({}));
    root.as_object_mut().ok_or_else(|| AppError::message("Agent settings root must be a JSON object"))?
        .insert("mcpServers".to_string(), Value::Object(servers.clone()));
    atomic_write(path, serde_json::to_string_pretty(&root)?.as_bytes())
}

fn sync_skill_agent(
    skills: &[Skill],
    settings: &crate::models::AppSettings,
    agent: &str,
) -> Result<String, AppError> {
    let base = match agent {
        AGENT_CODEX => resolve_codex_dir(&settings.codex_config_dir),
        AGENT_CLAUDE => resolve_claude_dir(&settings.claude_config_dir),
        _ => resolve_gemini_dir(&settings.gemini_config_dir),
    };
    if !base.exists() {
        return Err(AppError::message(format!("{agent} config directory is unavailable")));
    }
    let skill_root = base.join("skills");
    fs::create_dir_all(&skill_root)?;
    let managed_index_path = skill_root.join(".codex-switch-managed.json");
    let previous: Vec<String> = fs::read_to_string(&managed_index_path).ok()
        .and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default();
    let enabled = skills.iter().filter(|skill| match agent {
        AGENT_CODEX => skill.targets.codex,
        AGENT_CLAUDE => skill.targets.claude,
        _ => skill.targets.gemini,
    }).collect::<Vec<_>>();
    let desired = enabled.iter().map(|skill| skill.name.clone()).collect::<Vec<_>>();
    for old in previous {
        if !desired.iter().any(|name| name.eq_ignore_ascii_case(&old)) {
            let target = skill_root.join(old);
            if target.exists() { fs::remove_dir_all(target)?; }
        }
    }
    for skill in enabled {
        let source = PathBuf::from(&skill.source_path);
        if !source.join("SKILL.md").exists() {
            return Err(AppError::message(format!("Skill source is missing: {}", skill.name)));
        }
        let target = skill_root.join(&skill.name);
        if same_path(&source, &target) {
            continue;
        }
        if target.exists() { fs::remove_dir_all(&target)?; }
        copy_dir(&source, &target)?;
    }
    atomic_write(&managed_index_path, serde_json::to_string_pretty(&desired)?.as_bytes())?;
    Ok(hash_value(&json!(desired)))
}

fn remove_skill_targets(db: &Database, skill: &Skill) -> Result<(), AppError> {
    let settings = db.settings()?;
    for base in [
        resolve_codex_dir(&settings.codex_config_dir),
        resolve_claude_dir(&settings.claude_config_dir),
        resolve_gemini_dir(&settings.gemini_config_dir),
    ] {
        let target = base.join("skills").join(&skill.name);
        if target.exists() && !same_path(Path::new(&skill.source_path), &target) {
            fs::remove_dir_all(target)?;
        }
    }
    Ok(())
}

fn remove_missing_external_skills(db: &Database) -> Result<(), AppError> {
    let missing = db.skills()?.into_iter()
        .filter(|skill| skill.source_kind == "external" && !Path::new(&skill.source_path).exists())
        .collect::<Vec<_>>();
    for skill in missing {
        remove_skill_targets(db, &skill)?;
        db.delete_skill_record(&skill.id, "")?;
    }
    if !db.skills()?.is_empty() { let _ = sync_skills(db); }
    Ok(())
}

fn remove_hidden_system_skills(db: &Database) -> Result<(), AppError> {
    let hidden = db.skills()?.into_iter()
        .filter(|skill| is_hidden_system_skill_path(&skill.source_path))
        .collect::<Vec<_>>();
    for skill in hidden {
        remove_skill_targets(db, &skill)?;
        db.delete_skill_record(&skill.id, "")?;
    }
    Ok(())
}

fn is_hidden_system_skill_path(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_ascii_lowercase();
    normalized.contains("/skills/.system/")
        || normalized.ends_with("/skills/.system")
        || normalized.contains("/.codex-switcher/skills/.system/")
}

fn read_skill_md(dir: &Path) -> Result<(String, String, String), AppError> {
    let path = dir.join("SKILL.md");
    let text = fs::read_to_string(&path).map_err(|_| AppError::message("Selected folder does not contain a readable SKILL.md"))?;
    parse_skill_md(&text)
}

fn parse_skill_md(text: &str) -> Result<(String, String, String), AppError> {
    let normalized = text.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return Err(AppError::message("SKILL.md must start with YAML frontmatter"));
    }
    let remainder = &normalized[4..];
    let end = remainder.find("\n---\n").ok_or_else(|| AppError::message("SKILL.md frontmatter is not closed"))?;
    let frontmatter = &remainder[..end];
    let instructions = remainder[end + 5..].trim().to_string();
    let mut name = String::new();
    let mut description = String::new();
    for line in frontmatter.lines() {
        if let Some(value) = line.strip_prefix("name:") { name = unquote(value.trim()); }
        if let Some(value) = line.strip_prefix("description:") { description = unquote(value.trim()); }
    }
    let skill = Skill {
        id: String::new(), name: name.clone(), description: description.clone(),
        instructions: instructions.clone(), source_path: String::new(),
        source_kind: "external".to_string(), sync_mode: "reference".to_string(),
        targets: CapabilityTargets::default(), created_at: String::new(), updated_at: String::new(),
    };
    validate_skill_shape(&skill)?;
    Ok((name, description, instructions))
}

fn render_skill_md(skill: &Skill) -> String {
    let mut lines = vec!["---".to_string(), format!("name: {}", yaml_string(&skill.name))];
    if !skill.description.trim().is_empty() {
        lines.push(format!("description: {}", yaml_string(&skill.description)));
    }
    lines.push("---".to_string());
    lines.push(String::new());
    lines.push(skill.instructions.trim().to_string());
    lines.push(String::new());
    lines.join("\n")
}

fn write_skill_md(dir: &Path, skill: &Skill) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    atomic_write(&dir.join("SKILL.md"), render_skill_md(skill).as_bytes())
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn unquote(value: &str) -> String {
    serde_json::from_str::<String>(value).unwrap_or_else(|_| value.to_string())
}

fn test_stdio(server: &McpServer, tested_at: &str) -> Result<McpTestResult, AppError> {
    let mut command = Command::new(&server.command);
    command.args(&server.args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if !server.working_directory.trim().is_empty() { command.current_dir(&server.working_directory); }
    for (key, value) in &server.env { command.env(key, &value.value); }
    let mut child = command.spawn().map_err(|error| AppError::message(format!("Failed to start MCP server: {error}")))?;
    let mut stdin = child.stdin.take().ok_or_else(|| AppError::message("MCP stdin is unavailable"))?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::message("MCP stdout is unavailable"))?;
    writeln!(stdin, "{}", initialize_request())?;
    writeln!(stdin, "{}", json!({"jsonrpc":"2.0","method":"notifications/initialized"}))?;
    writeln!(stdin, "{}", tools_request())?;
    stdin.flush()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
                if value.get("id").and_then(Value::as_i64) == Some(2) {
                    let _ = tx.send(value);
                    return;
                }
            }
            line.clear();
        }
    });
    let response = rx.recv_timeout(MCP_TIMEOUT);
    let _ = child.kill();
    match response {
        Ok(value) => Ok(success_test(value, tested_at)),
        Err(_) => Ok(McpTestResult {
            status: "error".to_string(), error: "Timed out after 10 seconds".to_string(),
            output: String::new(), tools: Vec::new(), tested_at: tested_at.to_string(),
        }),
    }
}

fn test_http(server: &McpServer, sse: bool, tested_at: &str) -> Result<McpTestResult, AppError> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json, text/event-stream"));
    for (key, value) in &server.headers {
        headers.insert(
            HeaderName::from_bytes(key.as_bytes()).map_err(|error| AppError::message(error.to_string()))?,
            HeaderValue::from_str(&value.value).map_err(|error| AppError::message(error.to_string()))?,
        );
    }
    let client = Client::builder().timeout(MCP_TIMEOUT).build().map_err(|error| AppError::message(error.to_string()))?;
    let init = client.post(&server.url).headers(headers.clone()).json(&initialize_request()).send()
        .map_err(|error| AppError::message(format!("MCP initialize failed: {error}")))?;
    if !init.status().is_success() {
        return Ok(McpTestResult { status: "error".to_string(), error: format!("Initialize returned HTTP {}", init.status()), output: String::new(), tools: Vec::new(), tested_at: tested_at.to_string() });
    }
    let session_id = init.headers().get("mcp-session-id").and_then(|value| value.to_str().ok()).map(str::to_string);
    if let Some(session) = session_id {
        headers.insert("mcp-session-id", HeaderValue::from_str(&session).map_err(|error| AppError::message(error.to_string()))?);
    }
    let response = client.post(&server.url).headers(headers).json(&tools_request()).send()
        .map_err(|error| AppError::message(format!("MCP tools/list failed: {error}")))?;
    let body = response.text().map_err(|error| AppError::message(error.to_string()))?;
    let value = if sse || body.trim_start().starts_with("event:") || body.contains("\ndata:") {
        body.lines().find_map(|line| line.strip_prefix("data:").map(str::trim))
            .and_then(|line| serde_json::from_str::<Value>(line).ok())
            .ok_or_else(|| AppError::message("SSE response did not contain JSON data"))?
    } else {
        serde_json::from_str(&body)?
    };
    Ok(success_test(value, tested_at))
}

fn initialize_request() -> Value {
    json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"codex-switch","version":env!("CARGO_PKG_VERSION")}}})
}

fn tools_request() -> Value {
    json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
}

fn success_test(value: Value, tested_at: &str) -> McpTestResult {
    let tools: Vec<McpTool> = value.pointer("/result/tools").and_then(Value::as_array).map(|items| items.iter().filter_map(|tool| {
        Some(McpTool {
            name: tool.get("name")?.as_str()?.to_string(),
            description: tool.get("description").and_then(Value::as_str).unwrap_or("").to_string(),
            input_schema: tool.get("inputSchema").cloned().unwrap_or_else(|| json!({})),
        })
    }).collect()).unwrap_or_default();
    McpTestResult { status: "ok".to_string(), error: String::new(), output: format!("{} tools", tools.len()), tools, tested_at: tested_at.to_string() }
}

fn counts_for_mcp(items: &[McpServer], db: &Database) -> Result<CapabilityCounts, AppError> {
    counts(items.iter().map(|item| &item.targets), "mcp", db)
}

fn counts_for_skills(items: &[Skill], db: &Database) -> Result<CapabilityCounts, AppError> {
    counts(items.iter().map(|item| &item.targets), "skill", db)
}

fn counts<'a>(targets: impl Iterator<Item = &'a CapabilityTargets>, capability_type: &str, db: &Database) -> Result<CapabilityCounts, AppError> {
    let mut counts = CapabilityCounts { codex: 0, claude: 0, gemini: 0, status: "ok".to_string() };
    for target in targets {
        counts.codex += usize::from(target.codex);
        counts.claude += usize::from(target.claude);
        counts.gemini += usize::from(target.gemini);
    }
    for agent in [AGENT_CODEX, AGENT_CLAUDE, AGENT_GEMINI] {
        if let Some((_, status, _)) = db.sync_state(capability_type, agent)? {
            if status == "error" { counts.status = "error".to_string(); }
        }
    }
    Ok(counts)
}

fn hash_value(value: &Value) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(value).unwrap_or_default()))
}

fn app_data_dir() -> Result<PathBuf, AppError> {
    Ok(dirs::home_dir().ok_or_else(|| AppError::message("Unable to determine home directory"))?.join(APP_HOME_DIR))
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    let temp = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    fs::write(&temp, bytes)?;
    if path.exists() { fs::remove_file(path)?; }
    fs::rename(temp, path)?;
    Ok(())
}

fn copy_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() { copy_dir(&source_path, &target_path)?; }
        else { fs::copy(source_path, target_path)?; }
    }
    Ok(())
}

fn same_path(left: &Path, right: &Path) -> bool {
    let normalized = |path: &Path| {
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy().replace('\\', "/").trim_end_matches('/').to_ascii_lowercase()
    };
    normalized(left) == normalized(right)
}

fn sanitize_segment(value: &str) -> String {
    value.chars().map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') { ch } else { '-' }).collect()
}

fn now_string() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_renders_skill_markdown() {
        let (name, description, body) = parse_skill_md("---\nname: \"Code Review\"\ndescription: \"Find bugs\"\n---\nCheck behavior.\n").unwrap();
        assert_eq!(name, "Code Review");
        assert_eq!(description, "Find bugs");
        assert_eq!(body, "Check behavior.");
    }

    #[test]
    fn rejects_unsafe_skill_names() {
        assert!(!filesystem_safe_name("bad/name"));
        assert!(!filesystem_safe_name("NUL"));
        assert!(filesystem_safe_name("Code Review"));
    }

    #[test]
    fn parses_discovered_http_mcp_server() {
        let server = mcp_from_spec(
            "remote",
            &json!({"httpUrl":"https://example.test/mcp","headers":{"X-Test":"value"}}),
            AGENT_GEMINI,
        ).unwrap();
        assert_eq!(server.transport, "http");
        assert_eq!(server.url, "https://example.test/mcp");
        assert!(server.targets.gemini);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn stdio_test_starts_server_and_lists_tools() {
        let server = McpServer {
            id: String::new(),
            target_key: String::new(),
            name: "local-test".to_string(),
            description: String::new(),
            transport: "stdio".to_string(),
            command: "powershell.exe".to_string(),
            args: vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                r#"Write-Output '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"ping","description":"Ping tool","inputSchema":{}}]}}'"#.to_string(),
            ],
            working_directory: String::new(),
            url: String::new(),
            env: BTreeMap::new(),
            headers: BTreeMap::new(),
            targets: CapabilityTargets::default(),
            last_test_status: String::new(),
            last_test_error: String::new(),
            last_test_at: String::new(),
            cached_tools: Vec::new(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let result = test_stdio(&server, "now").unwrap();
        assert_eq!(result.status, "ok");
        assert_eq!(result.tools.len(), 1);
        assert_eq!(result.tools[0].name, "ping");
    }
}
