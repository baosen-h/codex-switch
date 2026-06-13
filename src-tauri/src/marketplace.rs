use crate::app_config::{APP_HOME_DIR, USER_AGENT};
use crate::capabilities;
use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    CapabilitySyncResult, CapabilityTargets, ConfigValue, MarketplaceInstallRequest,
    MarketplaceInstallSpec, MarketplaceResult, MarketplaceSearchResponse, MarketplaceSource,
    MarketplaceSourceStatus, McpImportPreview, McpServer, RuntimeAvailability, Skill,
    SkillMarketPreview,
};
use keyring::Entry;
use reqwest::blocking::{Client, Response};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime};
use url::Url;
use uuid::Uuid;

const SOURCE_CREDENTIAL_SERVICE: &str = "codex-switch-marketplace";
const MAX_ARTIFACT_BYTES: usize = 25 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 1_000;
const MAX_HERMES_INDEX_BYTES: usize = 64 * 1024 * 1024;
const HERMES_INDEX_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
const HERMES_SEARCH_LIMIT: usize = 50;
const HERMES_OFFICIAL_REPO: &str = "NousResearch/hermes-agent";

static HERMES_INDEXES: OnceLock<Mutex<HashMap<String, Arc<Vec<HermesIndexEntry>>>>> =
    OnceLock::new();

#[derive(Debug, Deserialize)]
struct HermesIndex {
    skills: Vec<HermesIndexEntry>,
}

#[derive(Debug, Deserialize)]
struct HermesIndexEntry {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    source: String,
    #[serde(default)]
    identifier: String,
    #[serde(default)]
    repo: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    extra: Value,
    #[serde(default)]
    resolved_github_id: String,
}

pub fn list_sources(
    db: &Database,
    capability_type: &str,
) -> Result<Vec<MarketplaceSource>, AppError> {
    validate_capability_type(capability_type)?;
    db.marketplace_sources(capability_type)
}

pub fn save_source(
    db: &Database,
    mut source: MarketplaceSource,
    credential: &str,
) -> Result<MarketplaceSource, AppError> {
    validate_source(&source)?;
    if source.id.trim().is_empty() {
        source.id = Uuid::new_v4().to_string();
    }
    if !credential.trim().is_empty() {
        if source.credential_id.trim().is_empty() {
            source.credential_id = format!("source:{}", source.id);
        }
        source_credential(&source.credential_id)?
            .set_password(credential.trim())
            .map_err(|error| {
                AppError::message(format!("Unable to store marketplace credential: {error}"))
            })?;
        source.has_credential = true;
    }
    db.save_marketplace_source(source)
}

pub fn delete_source(db: &Database, id: &str) -> Result<(), AppError> {
    let source = ["skills", "mcp"].iter().find_map(|kind| {
        db.marketplace_sources(kind)
            .ok()?
            .into_iter()
            .find(|item| item.id == id)
    });
    db.delete_marketplace_source(id)?;
    if let Some(source) = source {
        if !source.credential_id.is_empty() {
            let _ = source_credential(&source.credential_id)?.delete_credential();
        }
    }
    Ok(())
}

pub fn test_source(source: &MarketplaceSource, credential: &str) -> Result<(), AppError> {
    validate_source(source)?;
    let client = http_client()?;
    match source.source_type.as_str() {
        "mcp_registry" => {
            request(
                &client,
                source,
                credential,
                &format!("{}/v0.1/servers?version=latest&limit=1", source.base_url),
            )?;
        }
        "skills_sh" => {
            request(
                &client,
                source,
                credential,
                &format!("{}/api/search?q=test", source.base_url),
            )?;
        }
        "claude_plugins" => {
            request(
                &client,
                source,
                credential,
                &format!("{}/api/skills?search=test", source.base_url),
            )?;
        }
        "clawhub" => {
            request(
                &client,
                source,
                credential,
                &format!("{}/api/v1/search?q=test", source.base_url),
            )?;
        }
        "hermes_index" => {
            request(&client, source, credential, &source.base_url)?;
        }
        "skill_feed" => {
            request(
                &client,
                source,
                credential,
                &format!("{}/v1/search?q=test", source.base_url),
            )?;
        }
        "github_repo" => {
            github_repo_parts(&source.base_url)?;
        }
        _ => return Err(AppError::message("Unsupported marketplace source type")),
    }
    Ok(())
}

pub fn search(
    db: &Database,
    capability_type: &str,
    query: &str,
) -> Result<MarketplaceSearchResponse, AppError> {
    validate_capability_type(capability_type)?;
    let sources = db
        .marketplace_sources(capability_type)?
        .into_iter()
        .filter(|source| source.enabled)
        .collect::<Vec<_>>();
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(MarketplaceSearchResponse {
            results: Vec::new(),
            sources: Vec::new(),
        });
    }

    let outcomes = thread::scope(|scope| {
        let handles = sources
            .iter()
            .cloned()
            .map(|source| {
                let query = query.clone();
                scope.spawn(move || {
                    let credential = load_source_credential(&source).unwrap_or_default();
                    let result = search_source(&source, &query, &credential);
                    (source, result)
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|handle| {
                handle.join().unwrap_or_else(|_| {
                    (
                        MarketplaceSource {
                            id: "unknown".to_string(),
                            capability_type: capability_type.to_string(),
                            name: "Unknown source".to_string(),
                            source_type: String::new(),
                            base_url: String::new(),
                            enabled: true,
                            sort_order: 0,
                            built_in: false,
                            credential_id: String::new(),
                            has_credential: false,
                        },
                        Err(AppError::message("Marketplace search worker failed")),
                    )
                })
            })
            .collect::<Vec<_>>()
    });

    let mut statuses = Vec::new();
    let mut all_results = Vec::new();
    for (source, outcome) in outcomes {
        match outcome {
            Ok(mut results) => {
                let count = results.len();
                mark_installed(db, &mut results)?;
                all_results.extend(results);
                statuses.push(MarketplaceSourceStatus {
                    source_id: source.id,
                    source_name: source.name,
                    status: "ok".to_string(),
                    error: String::new(),
                    result_count: count,
                });
            }
            Err(error) => statuses.push(MarketplaceSourceStatus {
                source_id: source.id,
                source_name: source.name,
                status: "error".to_string(),
                error: error.to_string(),
                result_count: 0,
            }),
        }
    }
    Ok(MarketplaceSearchResponse {
        results: deduplicate(all_results),
        sources: statuses,
    })
}

pub fn preview_skill(result: MarketplaceResult) -> Result<SkillMarketPreview, AppError> {
    if result.capability_type != "skills" {
        return Err(AppError::message("Expected a Skill marketplace result"));
    }
    let staging = stage_skill(&result)?;
    let skill_dir = locate_skill_dir(&staging, &result)?;
    let (name, _, instructions) = read_skill_md(&skill_dir)?;
    if !name.eq_ignore_ascii_case(&result.name) && !result.name.trim().is_empty() {
        // Registry display names are occasionally friendlier than the SKILL.md name.
    }
    let files = list_relative_files(&skill_dir)?;
    let content_hash = hash_directory(&skill_dir)?;
    let _ = fs::remove_dir_all(&staging);
    Ok(SkillMarketPreview {
        result,
        instructions,
        files,
        content_hash,
    })
}

pub fn install_skill(
    db: &Database,
    request: MarketplaceInstallRequest,
) -> Result<(Skill, CapabilitySyncResult), AppError> {
    if request.result.capability_type != "skills" {
        return Err(AppError::message("Expected a Skill marketplace result"));
    }
    let staging = stage_skill(&request.result)?;
    let skill_dir = locate_skill_dir(&staging, &request.result)?;
    let (name, description, instructions) = read_skill_md(&skill_dir)?;
    let target = app_data_dir()?.join("skills").join(&name);
    let backup = app_data_dir()?.join("backups").join("skills").join(format!(
        "{}-{}",
        sanitize(&name),
        timestamp()
    ));
    if target.exists() {
        if let Some(parent) = backup.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&target, &backup)?;
    }
    if let Err(error) = copy_dir(&skill_dir, &target) {
        if backup.exists() {
            let _ = fs::rename(&backup, &target);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    let installed_hash = hash_directory(&target)?;
    let skill = Skill {
        id: request.result.installed_id.clone(),
        name,
        description,
        instructions,
        source_path: target.to_string_lossy().to_string(),
        source_kind: "app".to_string(),
        sync_mode: "copy".to_string(),
        targets: request.targets,
        created_at: String::new(),
        updated_at: String::new(),
    };
    let (saved, sync) = capabilities::save_skill(db, skill)?;
    db.save_marketplace_install(
        "skills",
        &saved.id,
        &request.result.source_id,
        &request.result.canonical_id,
        &request.result.version,
        &request.result.source_url,
        &request.result.artifact_url,
        &request.result.artifact_sha256,
        &installed_hash,
    )?;
    let _ = fs::remove_dir_all(&staging);
    Ok((saved, sync))
}

pub fn install_mcp(
    db: &Database,
    request: MarketplaceInstallRequest,
) -> Result<(McpServer, CapabilitySyncResult), AppError> {
    if request.result.capability_type != "mcp" {
        return Err(AppError::message("Expected an MCP marketplace result"));
    }
    let spec = &request.result.install_spec;
    validate_runtime_for_spec(spec)?;
    let server = McpServer {
        id: request.result.installed_id.clone(),
        target_key: String::new(),
        name: request.result.name.clone(),
        description: request.result.description.clone(),
        transport: spec.transport.clone(),
        command: spec.command.clone(),
        args: spec.args.clone(),
        working_directory: String::new(),
        url: spec.url.clone(),
        env: request.env,
        headers: request.headers,
        targets: request.targets,
        last_test_status: String::new(),
        last_test_error: String::new(),
        last_test_at: String::new(),
        cached_tools: Vec::new(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    let (saved, sync) = capabilities::save_server(db, server)?;
    db.save_marketplace_install(
        "mcp",
        &saved.id,
        &request.result.source_id,
        &request.result.canonical_id,
        &request.result.version,
        &request.result.source_url,
        &request.result.artifact_url,
        &request.result.artifact_sha256,
        &hash_json(&serde_json::to_value(&saved)?),
    )?;
    Ok((saved, sync))
}

pub fn runtime_availability() -> RuntimeAvailability {
    RuntimeAvailability {
        node: command_available("node"),
        npx: command_available("npx"),
        uv: command_available("uv"),
        uvx: command_available("uvx"),
    }
}

pub fn preview_mcp_json(input: &str) -> Result<McpImportPreview, AppError> {
    let cleaned = strip_json_comments(input);
    let root: Value = serde_json::from_str(&cleaned)?;
    let map = root
        .get("mcpServers")
        .and_then(Value::as_object)
        .or_else(|| root.as_object())
        .ok_or_else(|| AppError::message("MCP JSON must be an object or contain mcpServers"))?;
    let mut servers = Vec::new();
    let mut errors = Vec::new();
    for (name, value) in map {
        match mcp_server_from_json(name, value) {
            Ok(server) => servers.push(server),
            Err(error) => errors.push(format!("{name}: {error}")),
        }
    }
    Ok(McpImportPreview { servers, errors })
}

fn search_source(
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let client = http_client()?;
    match source.source_type.as_str() {
        "skills_sh" => search_skills_sh(&client, source, query, credential),
        "claude_plugins" => search_claude_plugins(&client, source, query, credential),
        "clawhub" => search_clawhub(&client, source, query, credential),
        "hermes_index" => search_hermes_index(&client, source, query, credential),
        "skill_feed" => search_skill_feed(&client, source, query, credential),
        "github_repo" => search_github_repo(&client, source, query),
        "mcp_registry" => search_mcp_registry(&client, source, query, credential),
        _ => Err(AppError::message(format!(
            "Unsupported source type: {}",
            source.source_type
        ))),
    }
}

fn search_skills_sh(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let value = json_response(request(
        client,
        source,
        credential,
        &format!(
            "{}/api/search?q={}",
            source.base_url,
            urlencoding::encode(query)
        ),
    )?)?;
    Ok(parse_skills_sh_results(source, &value))
}

fn parse_skills_sh_results(source: &MarketplaceSource, value: &Value) -> Vec<MarketplaceResult> {
    value
        .get("skills")
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(|item| {
            let id = text(item, &["id", "skillId", "skill_id"])?;
            let repo = text(item, &["source", "repository"]).unwrap_or_default();
            if repo.is_empty() {
                return None;
            }
            let path = id.strip_prefix(&format!("{repo}/")).unwrap_or_else(|| {
                item.get("skillId")
                    .or_else(|| item.get("skill_id"))
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
            });
            let name = text(item, &["name"]).unwrap_or_else(|| id.clone());
            Some(skill_result(
                source,
                &format!("github:{repo}:{path}:main"),
                &format!("github:{repo}/{path}"),
                &name,
                text(item, &["description"]).unwrap_or_default(),
                text(item, &["version"]).unwrap_or_else(|| "latest".to_string()),
                format!("{}/{repo}/{path}", source.base_url),
                String::new(),
                item.get("installs").and_then(Value::as_u64).unwrap_or(0),
            ))
        })
        .collect()
}

fn search_claude_plugins(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let value = json_response(request(
        client,
        source,
        credential,
        &format!(
            "{}/api/skills?search={}",
            source.base_url,
            urlencoding::encode(query)
        ),
    )?)?;
    Ok(parse_claude_plugin_results(source, &value))
}

fn parse_claude_plugin_results(
    source: &MarketplaceSource,
    value: &Value,
) -> Vec<MarketplaceResult> {
    value
        .get("skills")
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(|item| {
            let name = text(item, &["name", "slug"])?;
            let repo = text(item, &["repository", "repo", "source"]).or_else(|| {
                let owner = pointer_text(item, "/metadata/repoOwner")?;
                let name = pointer_text(item, "/metadata/repoName")?;
                Some(format!("{owner}/{name}"))
            });
            let path = text(item, &["directoryPath", "directory_path", "path"])
                .or_else(|| pointer_text(item, "/metadata/directoryPath"))
                .unwrap_or_else(|| name.clone());
            let reference =
                if let Some(reference) = text(item, &["installSource", "install_source"]) {
                    reference
                } else {
                    format!("github:{}:{path}:main", repo.as_deref()?)
                };
            let canonical_id = repo
                .as_deref()
                .map(|repo| format!("github:{repo}/{path}"))
                .unwrap_or_else(|| reference.clone());
            Some(skill_result(
                source,
                &reference,
                &canonical_id,
                &name,
                text(item, &["description"]).unwrap_or_default(),
                text(item, &["version"]).unwrap_or_else(|| "latest".to_string()),
                text(item, &["url", "sourceUrl"])
                    .unwrap_or_else(|| format!("{}/skills/{name}", source.base_url)),
                text(item, &["downloadUrl", "artifactUrl"]).unwrap_or_default(),
                item.get("downloads")
                    .or_else(|| item.get("installs"))
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            ))
        })
        .collect()
}

fn search_clawhub(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let value = json_response(request(
        client,
        source,
        credential,
        &format!(
            "{}/api/v1/search?q={}",
            source.base_url,
            urlencoding::encode(query)
        ),
    )?)?;
    Ok(parse_clawhub_results(source, &value))
}

fn parse_clawhub_results(source: &MarketplaceSource, value: &Value) -> Vec<MarketplaceResult> {
    value
        .get("results")
        .or_else(|| value.get("skills"))
        .or_else(|| value.get("data"))
        .and_then(Value::as_array)
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(|item| {
            let slug = text(item, &["slug", "id"])?;
            let name = text(item, &["displayName", "name"]).unwrap_or_else(|| slug.clone());
            Some(skill_result(
                source,
                &format!("clawhub:{slug}"),
                &format!("clawhub:{slug}"),
                &name,
                text(item, &["summary", "description"]).unwrap_or_default(),
                text(item, &["version"]).unwrap_or_else(|| "latest".to_string()),
                format!("{}/skills/{slug}", source.base_url),
                clawhub_download_url(&source.base_url, &slug).ok()?,
                item.get("downloads")
                    .or_else(|| item.pointer("/stats/downloads"))
                    .and_then(Value::as_u64)
                    .unwrap_or(0),
            ))
        })
        .collect()
}

fn search_hermes_index(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let entries = load_hermes_index(client, source, credential)?;
    Ok(parse_hermes_index_results(
        source,
        &entries,
        query,
        HERMES_SEARCH_LIMIT,
    ))
}

fn parse_hermes_index_results(
    source: &MarketplaceSource,
    entries: &[HermesIndexEntry],
    query: &str,
    limit: usize,
) -> Vec<MarketplaceResult> {
    let query = query.trim().to_lowercase();
    entries
        .iter()
        .filter(|entry| {
            query.is_empty()
                || entry.name.to_lowercase().contains(&query)
                || entry.description.to_lowercase().contains(&query)
                || entry
                    .tags
                    .iter()
                    .any(|tag| tag.to_lowercase().contains(&query))
        })
        .filter_map(|entry| hermes_index_result(source, entry))
        .take(limit)
        .collect()
}

fn hermes_index_result(
    source: &MarketplaceSource,
    entry: &HermesIndexEntry,
) -> Option<MarketplaceResult> {
    if entry.name.trim().is_empty() || entry.identifier.trim().is_empty() {
        return None;
    }

    if entry.source == "clawhub" {
        let slug = entry
            .identifier
            .strip_prefix("clawhub/")
            .unwrap_or(&entry.identifier);
        return Some(skill_result(
            source,
            &format!("clawhub:{slug}"),
            &format!("clawhub:{slug}"),
            &entry.name,
            entry.description.clone(),
            "latest".to_string(),
            format!("https://clawhub.ai/skills/{slug}"),
            clawhub_download_url("https://clawhub.ai", slug).ok()?,
            hermes_entry_downloads(entry),
        ));
    }

    let (repo, path) = if entry.source == "official" {
        (
            HERMES_OFFICIAL_REPO.to_string(),
            format!("optional-skills/{}", entry.path.trim_start_matches('/')),
        )
    } else if !entry.resolved_github_id.is_empty() {
        github_identifier_parts(&entry.resolved_github_id)?
    } else if !entry.repo.is_empty() && !entry.path.is_empty() {
        (entry.repo.clone(), entry.path.clone())
    } else {
        return None;
    };
    if path.trim().is_empty() {
        return None;
    }

    Some(skill_result(
        source,
        &format!("github:{repo}:{path}:main"),
        &format!("github:{repo}/{path}"),
        &entry.name,
        entry.description.clone(),
        "latest".to_string(),
        hermes_entry_source_url(entry, &repo, &path),
        String::new(),
        hermes_entry_downloads(entry),
    ))
}

fn github_identifier_parts(identifier: &str) -> Option<(String, String)> {
    let mut parts = identifier.trim_matches('/').split('/');
    let owner = parts.next()?;
    let repo = parts.next()?;
    let path = parts.collect::<Vec<_>>().join("/");
    if owner.is_empty() || repo.is_empty() || path.is_empty() {
        return None;
    }
    Some((format!("{owner}/{repo}"), path))
}

fn hermes_entry_source_url(entry: &HermesIndexEntry, repo: &str, path: &str) -> String {
    pointer_text(&entry.extra, "/detail_url")
        .or_else(|| pointer_text(&entry.extra, "/source_url"))
        .unwrap_or_else(|| format!("https://github.com/{repo}/tree/main/{path}"))
}

fn hermes_entry_downloads(entry: &HermesIndexEntry) -> u64 {
    entry
        .extra
        .get("install_count")
        .or_else(|| entry.extra.get("weekly_installs"))
        .or_else(|| entry.extra.get("downloads"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

fn search_skill_feed(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let value = json_response(request(
        client,
        source,
        credential,
        &format!(
            "{}/v1/search?q={}",
            source.base_url,
            urlencoding::encode(query)
        ),
    )?)?;
    let items = value
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|item| {
            let canonical = text(item, &["canonicalId", "canonical_id", "id"])?;
            let name = text(item, &["name"])?;
            Some(
                skill_result(
                    source,
                    &text(item, &["installReference", "install_reference"])
                        .unwrap_or_else(|| format!("artifact:{canonical}")),
                    &canonical,
                    &name,
                    text(item, &["description"]).unwrap_or_default(),
                    text(item, &["version"])?,
                    text(item, &["sourceUrl", "source_url"]).unwrap_or_default(),
                    text(item, &["artifactUrl", "artifact_url"])?,
                    item.get("downloads").and_then(Value::as_u64).unwrap_or(0),
                )
                .with_sha(text(item, &["sha256", "artifactSha256"]).unwrap_or_default()),
            )
        })
        .collect())
}

fn search_github_repo(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let (owner, repo) = github_repo_parts(&source.base_url)?;
    let (bytes, branch) = download_github_archive(client, &owner, &repo, "main")
        .or_else(|_| download_github_archive(client, &owner, &repo, "master"))?;
    let staging = staging_dir("github-search")?;
    extract_zip(&bytes, &staging)?;
    let mut dirs = Vec::new();
    collect_skill_dirs(&staging, &mut dirs)?;
    let query = query.to_lowercase();
    let mut results = Vec::new();
    for dir in dirs {
        let (name, description, _) = read_skill_md(&dir)?;
        if !name.to_lowercase().contains(&query) && !description.to_lowercase().contains(&query) {
            continue;
        }
        let path = path_after_repo_root(&dir, &staging);
        results.push(skill_result(
            source,
            &format!("github:{owner}/{repo}:{path}:{branch}"),
            &format!("github:{owner}/{repo}/{path}"),
            &name,
            description,
            branch.clone(),
            format!("https://github.com/{owner}/{repo}/tree/{branch}/{path}"),
            format!("https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"),
            0,
        ));
    }
    let _ = fs::remove_dir_all(staging);
    Ok(results)
}

fn search_mcp_registry(
    client: &Client,
    source: &MarketplaceSource,
    query: &str,
    credential: &str,
) -> Result<Vec<MarketplaceResult>, AppError> {
    let value = json_response(request(
        client,
        source,
        credential,
        &format!(
            "{}/v0.1/servers?search={}&version=latest&limit=50",
            source.base_url,
            urlencoding::encode(query)
        ),
    )?)?;
    let items = value
        .get("servers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(items
        .iter()
        .filter_map(|wrapper| {
            let server = wrapper.get("server").unwrap_or(wrapper);
            let name = text(server, &["title", "name"])?;
            let canonical = text(server, &["name"])?;
            let version = text(server, &["version"]).unwrap_or_else(|| "latest".to_string());
            let description = text(server, &["description"]).unwrap_or_default();
            let repository = server
                .get("repository")
                .and_then(|value| text(value, &["url"]))
                .unwrap_or_default();
            let (install_spec, warnings) = mcp_install_spec(server);
            Some(MarketplaceResult {
                id: format!("{}:{canonical}:{version}", source.id),
                capability_type: "mcp".to_string(),
                canonical_id: canonical.clone(),
                name,
                description,
                author: text(server, &["author"]).unwrap_or_default(),
                version,
                source_id: source.id.clone(),
                source_name: source.name.clone(),
                source_ids: vec![source.id.clone()],
                source_url: repository,
                artifact_url: String::new(),
                artifact_sha256: String::new(),
                install_reference: canonical,
                downloads: 0,
                warnings,
                install_spec,
                installed_id: String::new(),
                update_available: false,
            })
        })
        .collect())
}

fn mcp_install_spec(server: &Value) -> (MarketplaceInstallSpec, Vec<String>) {
    let mut warnings = Vec::new();
    if let Some(remote) = server
        .get("remotes")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
    {
        let transport = text(remote, &["type"]).unwrap_or_else(|| "streamable-http".to_string());
        let mut spec = MarketplaceInstallSpec {
            transport: if transport.eq_ignore_ascii_case("sse") {
                "sse".to_string()
            } else {
                "http".to_string()
            },
            url: text(remote, &["url"]).unwrap_or_default(),
            ..Default::default()
        };
        collect_variables(remote, &mut spec.env_keys, &mut spec.header_keys);
        if let Some(headers) = remote.get("headers").and_then(Value::as_array) {
            for header in headers {
                if let (Some(name), Some(template)) =
                    (text(header, &["name"]), text(header, &["value"]))
                {
                    if header
                        .get("isRequired")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                        && !spec.required_header_keys.contains(&name)
                    {
                        spec.required_header_keys.push(name.clone());
                    }
                    if template.contains('{') {
                        warnings.push(format!("{}: {}", name, template));
                    }
                    spec.header_templates
                        .insert(name, normalize_config_template(&template));
                }
            }
        }
        if transport.eq_ignore_ascii_case("sse") {
            warnings.push("Legacy SSE transport".to_string());
        }
        if remote.to_string().to_lowercase().contains("oauth") {
            warnings.push("OAuth setup must be completed manually".to_string());
        }
        return (spec, warnings);
    }
    if let Some(package) = server
        .get("packages")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
    {
        let registry = text(
            package,
            &[
                "registryType",
                "registry_type",
                "registryName",
                "registry_name",
            ],
        )
        .unwrap_or_default();
        let identifier = text(package, &["identifier", "name"]).unwrap_or_default();
        let version = text(package, &["version"]).unwrap_or_else(|| "latest".to_string());
        let (command, args, package_type) = if registry.contains("npm") {
            (
                "npx".to_string(),
                vec!["-y".to_string(), format!("{identifier}@{version}")],
                "npm".to_string(),
            )
        } else if registry.contains("pypi") || registry.contains("python") {
            (
                "uvx".to_string(),
                vec![format!("{identifier}=={version}")],
                "pypi".to_string(),
            )
        } else {
            warnings.push(format!(
                "Package registry '{registry}' requires manual configuration"
            ));
            (String::new(), Vec::new(), registry)
        };
        let mut spec = MarketplaceInstallSpec {
            transport: "stdio".to_string(),
            command,
            args,
            package_type,
            package_name: identifier,
            ..Default::default()
        };
        collect_variables(package, &mut spec.env_keys, &mut spec.header_keys);
        return (spec, warnings);
    }
    warnings.push("No directly installable package or remote endpoint".to_string());
    (MarketplaceInstallSpec::default(), warnings)
}

fn normalize_config_template(template: &str) -> String {
    let Some(start) = template.find('{') else {
        return template.to_string();
    };
    let Some(relative_end) = template[start..].find('}') else {
        return template.to_string();
    };
    let end = start + relative_end;
    format!("{}{{value}}{}", &template[..start], &template[end + 1..])
}

fn collect_variables(value: &Value, env_keys: &mut Vec<String>, header_keys: &mut Vec<String>) {
    let text = value.to_string();
    for key in ["environmentVariables", "env"] {
        if let Some(items) = value.get(key).and_then(Value::as_array) {
            for item in items {
                if let Some(name) = crate::marketplace::text(item, &["name", "key"]) {
                    if !env_keys.contains(&name) {
                        env_keys.push(name);
                    }
                }
            }
        }
    }
    if let Some(items) = value.get("headers").and_then(Value::as_array) {
        for item in items {
            if let Some(name) = crate::marketplace::text(item, &["name", "key"]) {
                if !header_keys.contains(&name) {
                    header_keys.push(name);
                }
            }
        }
    }
    if let Some(items) = value.get("variables").and_then(Value::as_array) {
        for item in items {
            let Some(name) = crate::marketplace::text(item, &["name", "key"]) else {
                continue;
            };
            let item_text = item.to_string().to_lowercase();
            let target = if item_text.contains("\"header\"") {
                &mut *header_keys
            } else {
                &mut *env_keys
            };
            if !target.contains(&name) {
                target.push(name);
            }
        }
    }
    if text.to_lowercase().contains("authorization")
        && !header_keys.iter().any(|item| item == "Authorization")
    {
        header_keys.push("Authorization".to_string());
    }
}

fn skill_result(
    source: &MarketplaceSource,
    install_reference: &str,
    canonical_id: &str,
    name: &str,
    description: String,
    version: String,
    source_url: String,
    artifact_url: String,
    downloads: u64,
) -> MarketplaceResult {
    MarketplaceResult {
        id: format!("{}:{canonical_id}:{version}", source.id),
        capability_type: "skills".to_string(),
        canonical_id: canonical_id.to_string(),
        name: name.to_string(),
        description,
        author: String::new(),
        version,
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        source_ids: vec![source.id.clone()],
        source_url,
        artifact_url,
        artifact_sha256: String::new(),
        install_reference: install_reference.to_string(),
        downloads,
        warnings: Vec::new(),
        install_spec: MarketplaceInstallSpec::default(),
        installed_id: String::new(),
        update_available: false,
    }
}

trait MarketplaceResultExt {
    fn with_sha(self, sha: String) -> Self;
}

impl MarketplaceResultExt for MarketplaceResult {
    fn with_sha(mut self, sha: String) -> Self {
        self.artifact_sha256 = sha;
        self
    }
}

fn mark_installed(db: &Database, results: &mut [MarketplaceResult]) -> Result<(), AppError> {
    for result in results {
        if let Some((id, version)) =
            db.installed_marketplace_item(&result.capability_type, &result.canonical_id)?
        {
            result.installed_id = id;
            result.update_available = !result.version.is_empty()
                && result.version != "latest"
                && version != result.version;
        }
    }
    Ok(())
}

fn deduplicate(results: Vec<MarketplaceResult>) -> Vec<MarketplaceResult> {
    let mut merged: HashMap<(String, String), MarketplaceResult> = HashMap::new();
    for result in results {
        let key = (
            result.capability_type.clone(),
            result.canonical_id.to_lowercase(),
        );
        if let Some(existing) = merged.get_mut(&key) {
            if !existing.source_ids.contains(&result.source_id) {
                existing.source_ids.push(result.source_id.clone());
            }
            existing.downloads = existing.downloads.max(result.downloads);
            existing.update_available |= result.update_available;
            if existing.artifact_url.is_empty() {
                existing.artifact_url = result.artifact_url;
            }
        } else {
            merged.insert(key, result);
        }
    }
    let mut output = merged.into_values().collect::<Vec<_>>();
    output.sort_by(|left, right| {
        right
            .downloads
            .cmp(&left.downloads)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    output
}

fn stage_skill(result: &MarketplaceResult) -> Result<PathBuf, AppError> {
    let client = http_client()?;
    let staging = staging_dir("skill-preview")?;
    let mut artifact_error = None;
    if !result.artifact_url.is_empty() {
        match download_bytes(&client, &result.artifact_url, "") {
            Ok(bytes) => {
                verify_skill_artifact(result, &bytes)?;
                extract_zip(&bytes, &staging)?;
                return Ok(staging);
            }
            Err(error) => artifact_error = Some(error),
        }
    }

    let bytes = if result.install_reference.starts_with("github:") {
        let (repo, path, branch) = parse_github_reference(&result.install_reference)?;
        let branches = github_branch_candidates(&branch);
        let paths = github_skill_path_candidates(&path);
        for candidate in &branches {
            for candidate_path in &paths {
                if stage_github_skill(&staging, &repo, candidate_path, candidate).is_ok() {
                    return Ok(staging);
                }
            }
        }
        let (owner, name) = repo
            .split_once('/')
            .ok_or_else(|| AppError::message("Invalid GitHub install reference"))?;
        let mut last_error = None;
        let mut archive = None;
        for candidate in &branches {
            match download_github_archive(&client, owner, name, candidate) {
                Ok((bytes, _)) => {
                    archive = Some(bytes);
                    break;
                }
                Err(error) => last_error = Some(error),
            }
        }
        archive.ok_or_else(|| {
            last_error.unwrap_or_else(|| AppError::message("GitHub artifact download failed"))
        })?
    } else if let Some(slug) = result.install_reference.strip_prefix("clawhub:") {
        let base_url = result
            .source_url
            .strip_suffix(&format!("/skills/{slug}"))
            .unwrap_or("https://clawhub.ai");
        download_bytes(&client, &clawhub_download_url(base_url, slug)?, "")?
    } else {
        return Err(artifact_error.unwrap_or_else(|| AppError::message(
            "This Skill result does not provide an installable artifact",
        )));
    };
    verify_skill_artifact(result, &bytes)?;
    extract_zip(&bytes, &staging)?;
    Ok(staging)
}

fn verify_skill_artifact(result: &MarketplaceResult, bytes: &[u8]) -> Result<(), AppError> {
    if !result.artifact_sha256.is_empty() {
        let actual = hex_hash(bytes);
        if !actual.eq_ignore_ascii_case(&result.artifact_sha256) {
            return Err(AppError::message(
                "Skill artifact checksum did not match the registry",
            ));
        }
    }
    Ok(())
}

fn locate_skill_dir(root: &Path, result: &MarketplaceResult) -> Result<PathBuf, AppError> {
    let mut dirs = Vec::new();
    collect_skill_dirs(root, &mut dirs)?;
    if dirs.is_empty() {
        return Err(AppError::message(
            "The downloaded artifact contains no SKILL.md",
        ));
    }
    if result.install_reference.starts_with("github:") {
        let (_, wanted, _) = parse_github_reference(&result.install_reference)?;
        let wanted = wanted.replace('\\', "/");
        if let Some(found) = dirs
            .iter()
            .find(|path| path.to_string_lossy().replace('\\', "/").ends_with(&wanted))
        {
            return Ok(found.clone());
        }
    }
    if let Some(found) = dirs.iter().find(|path| {
        read_skill_md(path)
            .map(|(name, _, _)| name.eq_ignore_ascii_case(&result.name))
            .unwrap_or(false)
    }) {
        return Ok(found.clone());
    }
    Ok(dirs.remove(0))
}

fn parse_github_reference(value: &str) -> Result<(String, String, String), AppError> {
    let body = value
        .strip_prefix("github:")
        .ok_or_else(|| AppError::message("Invalid GitHub install reference"))?;
    let (repo_and_path, branch) = body.rsplit_once(':').unwrap_or((body, "main"));
    let (repo, path) = if let Some((repo, path)) = repo_and_path.split_once(':') {
        (repo.to_string(), path.to_string())
    } else {
        let slash = repo_and_path
            .match_indices('/')
            .nth(1)
            .map(|(index, _)| index)
            .ok_or_else(|| {
                AppError::message("GitHub install reference requires owner/repository/path")
            })?;
        (
            repo_and_path[..slash].to_string(),
            repo_and_path[slash + 1..].to_string(),
        )
    };
    if repo.split_once('/').is_none() || path.trim().is_empty() {
        return Err(AppError::message(
            "GitHub install reference requires owner/repository/path",
        ));
    }
    Ok((repo, path, branch.to_string()))
}

fn github_branch_candidates(branch: &str) -> Vec<String> {
    let mut branches = vec![branch.trim().to_string()];
    for fallback in ["main", "master"] {
        if !branches.iter().any(|item| item == fallback) {
            branches.push(fallback.to_string());
        }
    }
    branches.retain(|item| !item.is_empty());
    branches
}

fn github_skill_path_candidates(path: &str) -> Vec<String> {
    let path = path.trim().trim_matches('/').replace('\\', "/");
    let mut paths = vec![path.clone()];
    if !path.contains('/') {
        for prefix in ["skills", ".claude/skills"] {
            paths.push(format!("{prefix}/{path}"));
        }
    }
    paths.retain(|item| !item.is_empty());
    paths.dedup();
    paths
}

fn stage_github_skill(
    staging: &Path,
    repo: &str,
    path: &str,
    branch: &str,
) -> Result<(), AppError> {
    if !command_available("git") {
        return Err(AppError::message("Git is not available"));
    }
    let mut last_error = None;
    for attempt in 0..2 {
        match stage_github_skill_once(staging, repo, path, branch, attempt) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.unwrap_or_else(|| AppError::message("GitHub sparse checkout failed")))
}

fn stage_github_skill_once(
    staging: &Path,
    repo: &str,
    path: &str,
    branch: &str,
    attempt: usize,
) -> Result<(), AppError> {
    let checkout = staging.join(format!("github-{attempt}"));
    if checkout.exists() {
        fs::remove_dir_all(&checkout)?;
    }
    let repository_url = format!("https://github.com/{repo}.git");
    let clone = hidden_command("git")
        .args([
            "clone",
            "--depth",
            "1",
            "--filter=blob:none",
            "--sparse",
            "--single-branch",
            "--branch",
            branch,
            "--no-tags",
        ])
        .arg(&repository_url)
        .arg(&checkout)
        .output()
        .map_err(|error| AppError::message(format!("GitHub sparse clone failed: {error}")))?;
    if !clone.status.success() {
        return Err(AppError::message(format!(
            "GitHub sparse clone failed: {}",
            String::from_utf8_lossy(&clone.stderr).trim()
        )));
    }
    let sparse = hidden_command("git")
        .arg("-C")
        .arg(&checkout)
        .args(["sparse-checkout", "set", "--"])
        .arg(path)
        .output()
        .map_err(|error| AppError::message(format!("GitHub sparse checkout failed: {error}")))?;
    if !sparse.status.success() {
        return Err(AppError::message(format!(
            "GitHub sparse checkout failed: {}",
            String::from_utf8_lossy(&sparse.stderr).trim()
        )));
    }
    if !checkout.join(path).join("SKILL.md").is_file() {
        return Err(AppError::message(
            "GitHub skill directory contains no SKILL.md",
        ));
    }
    Ok(())
}

fn mcp_server_from_json(name: &str, value: &Value) -> Result<McpServer, AppError> {
    let object = value
        .as_object()
        .ok_or_else(|| AppError::message("Server definition must be an object"))?;
    let command = object
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let url = object
        .get("httpUrl")
        .or_else(|| object.get("url"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let transport = match object.get("type").and_then(Value::as_str) {
        Some("sse") => "sse",
        Some("http") | Some("streamable-http") | Some("streamableHttp") => "http",
        _ if !command.is_empty() => "stdio",
        _ if !url.is_empty() => "http",
        _ => return Err(AppError::message("Server requires command or URL")),
    };
    let config = |value: Option<&Value>| -> BTreeMap<String, ConfigValue> {
        value
            .and_then(Value::as_object)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|(key, value)| {
                        value.as_str().map(|text| {
                            (
                                key.clone(),
                                ConfigValue {
                                    value: text.to_string(),
                                    secret: looks_secret(key),
                                    credential_id: String::new(),
                                    template: String::new(),
                                },
                            )
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    Ok(McpServer {
        id: String::new(),
        target_key: String::new(),
        name: name.to_string(),
        description: "Imported from MCP JSON".to_string(),
        transport: transport.to_string(),
        command,
        args: object
            .get("args")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        working_directory: object
            .get("cwd")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        url,
        env: config(object.get("env")),
        headers: config(object.get("http_headers").or_else(|| object.get("headers"))),
        targets: CapabilityTargets::default(),
        last_test_status: String::new(),
        last_test_error: String::new(),
        last_test_at: String::new(),
        cached_tools: Vec::new(),
        created_at: String::new(),
        updated_at: String::new(),
    })
}

fn validate_source(source: &MarketplaceSource) -> Result<(), AppError> {
    validate_capability_type(&source.capability_type)?;
    if source.name.trim().is_empty() {
        return Err(AppError::message("Marketplace source name is required"));
    }
    let allowed = if source.capability_type == "skills" {
        [
            "skills_sh",
            "claude_plugins",
            "clawhub",
            "hermes_index",
            "skill_feed",
            "github_repo",
        ]
        .as_slice()
    } else {
        ["mcp_registry"].as_slice()
    };
    if !allowed.contains(&source.source_type.as_str()) {
        return Err(AppError::message(
            "Source type is not valid for this capability",
        ));
    }
    if source.base_url.trim().is_empty() {
        return Err(AppError::message("Marketplace source URL is required"));
    }
    let url = Url::parse(&source.base_url)
        .map_err(|_| AppError::message("Marketplace source URL is invalid"))?;
    if !matches!(url.scheme(), "https" | "http") {
        return Err(AppError::message(
            "Marketplace source URL must use HTTP or HTTPS",
        ));
    }
    Ok(())
}

fn validate_capability_type(value: &str) -> Result<(), AppError> {
    if matches!(value, "skills" | "mcp") {
        Ok(())
    } else {
        Err(AppError::message("Capability type must be skills or mcp"))
    }
}

fn validate_runtime_for_spec(spec: &MarketplaceInstallSpec) -> Result<(), AppError> {
    if spec.transport != "stdio" {
        return Ok(());
    }
    if spec.command.is_empty() {
        return Err(AppError::message(
            "This MCP package requires manual configuration",
        ));
    }
    if !command_available(&spec.command) {
        return Err(AppError::message(format!(
            "{} is required but was not found on PATH",
            spec.command
        )));
    }
    Ok(())
}

fn command_available(command: &str) -> bool {
    hidden_command(command)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn request(
    client: &Client,
    source: &MarketplaceSource,
    credential: &str,
    url: &str,
) -> Result<Response, AppError> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if !credential.trim().is_empty() {
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", credential.trim())).map_err(|_| {
                AppError::message("Marketplace credential contains invalid characters")
            })?,
        );
    }
    let response = client
        .get(url)
        .headers(headers)
        .send()
        .map_err(|error| AppError::message(format!("Marketplace request failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::message(format!(
            "Marketplace returned HTTP {}",
            response.status()
        )));
    }
    let _ = source;
    Ok(response)
}

fn json_response(response: Response) -> Result<Value, AppError> {
    response
        .json()
        .map_err(|error| AppError::message(format!("Invalid marketplace response: {error}")))
}

fn http_client() -> Result<Client, AppError> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| AppError::message(error.to_string()))
}

fn download_bytes(client: &Client, url: &str, credential: &str) -> Result<Vec<u8>, AppError> {
    let mut request = client.get(url);
    if !credential.trim().is_empty() {
        request = request.bearer_auth(credential.trim());
    }
    let response = request
        .send()
        .map_err(|error| AppError::message(format!("Artifact download failed: {error}")))?;
    if !response.status().is_success() {
        return Err(AppError::message(format!(
            "Artifact download returned HTTP {}",
            response.status()
        )));
    }
    let bytes = response
        .bytes()
        .map_err(|error| AppError::message(error.to_string()))?;
    if bytes.len() > MAX_ARTIFACT_BYTES {
        return Err(AppError::message(
            "Marketplace artifact exceeds the 25 MB limit",
        ));
    }
    Ok(bytes.to_vec())
}

fn load_hermes_index(
    client: &Client,
    source: &MarketplaceSource,
    credential: &str,
) -> Result<Arc<Vec<HermesIndexEntry>>, AppError> {
    let indexes = HERMES_INDEXES.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(entries) = indexes
        .lock()
        .map_err(|_| AppError::message("Hermes index cache lock failed"))?
        .get(&source.base_url)
        .cloned()
    {
        return Ok(entries);
    }

    let cache_path = hermes_index_cache_path(&source.base_url)?;
    let fresh_cache = fs::metadata(&cache_path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < HERMES_INDEX_CACHE_TTL);
    let bytes = if fresh_cache {
        fs::read(&cache_path)?
    } else {
        match download_hermes_index(client, &source.base_url, credential) {
            Ok(bytes) => {
                if let Some(parent) = cache_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&cache_path, &bytes)?;
                bytes
            }
            Err(error) if cache_path.exists() => fs::read(&cache_path).map_err(|_| error)?,
            Err(error) => return Err(error),
        }
    };
    let index: HermesIndex = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::message(format!("Invalid Hermes Skills Index: {error}")))?;
    let entries = Arc::new(index.skills);
    indexes
        .lock()
        .map_err(|_| AppError::message("Hermes index cache lock failed"))?
        .insert(source.base_url.clone(), entries.clone());
    Ok(entries)
}

fn hermes_index_cache_path(base_url: &str) -> Result<PathBuf, AppError> {
    let hash = hex_hash(base_url.as_bytes());
    Ok(app_data_dir()?
        .join("cache")
        .join(format!("hermes-skills-index-{}.json", &hash[..16])))
}

fn download_hermes_index(
    client: &Client,
    url: &str,
    credential: &str,
) -> Result<Vec<u8>, AppError> {
    let mut request = client.get(url);
    if !credential.trim().is_empty() {
        request = request.bearer_auth(credential.trim());
    }
    let response = request.send().map_err(|error| {
        AppError::message(format!("Hermes Skills Index download failed: {error}"))
    })?;
    if !response.status().is_success() {
        return Err(AppError::message(format!(
            "Hermes Skills Index returned HTTP {}",
            response.status()
        )));
    }
    let bytes = response
        .bytes()
        .map_err(|error| AppError::message(error.to_string()))?;
    if bytes.len() > MAX_HERMES_INDEX_BYTES {
        return Err(AppError::message(
            "Hermes Skills Index exceeds the 64 MB limit",
        ));
    }
    Ok(bytes.to_vec())
}

fn download_github_archive(
    client: &Client,
    owner: &str,
    repo: &str,
    branch: &str,
) -> Result<(Vec<u8>, String), AppError> {
    let url = format!("https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip");
    Ok((download_bytes(client, &url, "")?, branch.to_string()))
}

fn clawhub_download_url(base_url: &str, slug: &str) -> Result<String, AppError> {
    let mut url = Url::parse(&format!(
        "{}/api/v1/download",
        base_url.trim_end_matches('/')
    ))
    .map_err(|_| AppError::message("Invalid ClawHub marketplace URL"))?;
    url.query_pairs_mut().append_pair("slug", slug);
    Ok(url.to_string())
}

fn extract_zip(bytes: &[u8], target: &Path) -> Result<(), AppError> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AppError::message(format!("Invalid ZIP artifact: {error}")))?;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(AppError::message(
            "Marketplace artifact contains too many files",
        ));
    }
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::message(format!("Unable to read ZIP entry: {error}")))?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| AppError::message("Marketplace artifact contains an unsafe path"))?
            .to_path_buf();
        let destination = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = fs::File::create(destination)?;
        std::io::copy(&mut entry, &mut output)?;
    }
    Ok(())
}

fn collect_skill_dirs(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), AppError> {
    if root.join("SKILL.md").is_file() {
        output.push(root.to_path_buf());
        return Ok(());
    }
    for entry in fs::read_dir(root)?.filter_map(Result::ok) {
        if entry.path().is_dir()
            && entry.file_name() != ".git"
            && entry.file_name() != "node_modules"
        {
            collect_skill_dirs(&entry.path(), output)?;
        }
    }
    Ok(())
}

fn read_skill_md(path: &Path) -> Result<(String, String, String), AppError> {
    let instructions = fs::read_to_string(path.join("SKILL.md"))?;
    let mut name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill")
        .to_string();
    let mut description = String::new();
    let mut frontmatter = false;
    for line in instructions.lines() {
        if line.trim() == "---" {
            if frontmatter {
                break;
            }
            frontmatter = true;
            continue;
        }
        if frontmatter {
            if let Some(value) = line.strip_prefix("name:") {
                name = value.trim().trim_matches('"').to_string();
            }
            if let Some(value) = line.strip_prefix("description:") {
                description = value.trim().trim_matches('"').to_string();
            }
        }
    }
    if name.trim().is_empty() {
        return Err(AppError::message("SKILL.md is missing a valid name"));
    }
    Ok((name, description, instructions))
}

fn list_relative_files(root: &Path) -> Result<Vec<String>, AppError> {
    fn walk(root: &Path, path: &Path, output: &mut Vec<String>) -> Result<(), AppError> {
        for entry in fs::read_dir(path)?.filter_map(Result::ok) {
            let child = entry.path();
            if child.is_dir() {
                walk(root, &child, output)?;
            } else if child.is_file() {
                output.push(
                    child
                        .strip_prefix(root)
                        .unwrap_or(&child)
                        .to_string_lossy()
                        .replace('\\', "/"),
                );
            }
        }
        Ok(())
    }
    let mut output = Vec::new();
    walk(root, root, &mut output)?;
    output.sort();
    Ok(output)
}

fn hash_directory(root: &Path) -> Result<String, AppError> {
    let files = list_relative_files(root)?;
    let mut hasher = Sha256::new();
    for relative in files {
        hasher.update(relative.as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(root.join(&relative))?);
        hasher.update([0]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn copy_dir(source: &Path, target: &Path) -> Result<(), AppError> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)?.filter_map(Result::ok) {
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir(&source_path, &target_path)?;
        } else if source_path.is_file() {
            fs::copy(source_path, target_path)?;
        }
    }
    Ok(())
}

fn source_credential(id: &str) -> Result<Entry, AppError> {
    Entry::new(SOURCE_CREDENTIAL_SERVICE, id).map_err(|error| AppError::message(error.to_string()))
}

fn load_source_credential(source: &MarketplaceSource) -> Result<String, AppError> {
    if source.credential_id.is_empty() {
        return Ok(String::new());
    }
    source_credential(&source.credential_id)?
        .get_password()
        .map_err(|_| AppError::message(format!("Credential required for {}", source.name)))
}

fn staging_dir(prefix: &str) -> Result<PathBuf, AppError> {
    let path = std::env::temp_dir().join(format!("codex-switch-{prefix}-{}", Uuid::new_v4()));
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn app_data_dir() -> Result<PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::message("Unable to determine home directory"))?;
    let path = home.join(APP_HOME_DIR);
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn github_repo_parts(value: &str) -> Result<(String, String), AppError> {
    let url = Url::parse(value).map_err(|_| AppError::message("Invalid GitHub repository URL"))?;
    if url.host_str() != Some("github.com") {
        return Err(AppError::message(
            "GitHub repository source must use github.com",
        ));
    }
    let parts = url
        .path_segments()
        .map(|items| items.filter(|item| !item.is_empty()).collect::<Vec<_>>())
        .unwrap_or_default();
    if parts.len() < 2 {
        return Err(AppError::message(
            "GitHub repository URL must include owner and repository",
        ));
    }
    Ok((
        parts[0].to_string(),
        parts[1].trim_end_matches(".git").to_string(),
    ))
}

fn path_after_repo_root(path: &Path, root: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    relative
        .components()
        .skip(1)
        .collect::<PathBuf>()
        .to_string_lossy()
        .replace('\\', "/")
}

fn text(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).map(str::to_string))
}

fn pointer_text(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn hex_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn hash_json(value: &Value) -> String {
    hex_hash(serde_json::to_string(value).unwrap_or_default().as_bytes())
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn timestamp() -> String {
    chrono::Utc::now().format("%Y%m%d%H%M%S").to_string()
}

fn looks_secret(key: &str) -> bool {
    let key = key.to_lowercase();
    ["key", "token", "secret", "password", "authorization"]
        .iter()
        .any(|needle| key.contains(needle))
}

fn strip_json_comments(input: &str) -> String {
    input
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") {
                None
            } else {
                Some(line)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill_source(id: &str, name: &str, source_type: &str, base_url: &str) -> MarketplaceSource {
        MarketplaceSource {
            id: id.into(),
            capability_type: "skills".into(),
            name: name.into(),
            source_type: source_type.into(),
            base_url: base_url.into(),
            enabled: true,
            sort_order: 0,
            built_in: true,
            credential_id: String::new(),
            has_credential: false,
        }
    }

    #[test]
    fn builds_current_clawhub_download_url() {
        assert_eq!(
            clawhub_download_url("https://clawhub.ai/", "git tools").unwrap(),
            "https://clawhub.ai/api/v1/download?slug=git+tools"
        );
    }

    #[test]
    fn parses_current_clawhub_search_shape() {
        let source = skill_source(
            "skill-clawhub",
            "clawhub.ai",
            "clawhub",
            "https://clawhub.ai",
        );
        let value = serde_json::json!({
            "results": [{
                "slug": "git",
                "displayName": "Git",
                "summary": "Safe day-to-day version control.",
                "version": null
            }]
        });
        let results = parse_clawhub_results(&source, &value);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Git");
        assert_eq!(results[0].description, "Safe day-to-day version control.");
        assert_eq!(results[0].version, "latest");
        assert_eq!(
            results[0].artifact_url,
            "https://clawhub.ai/api/v1/download?slug=git"
        );
    }

    #[test]
    fn parses_current_claude_plugins_metadata() {
        let source = skill_source(
            "skill-claude-plugins",
            "claude-plugins.dev",
            "claude_plugins",
            "https://claude-plugins.dev",
        );
        let value = serde_json::json!({
            "skills": [{
                "name": "frontend-design",
                "sourceUrl": "https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design/skills/frontend-design",
                "description": "Build polished interfaces.",
                "version": null,
                "installs": 21736,
                "metadata": {
                    "repoOwner": "anthropics",
                    "repoName": "claude-code",
                    "directoryPath": "plugins/frontend-design/skills/frontend-design"
                }
            }]
        });
        let results = parse_claude_plugin_results(&source, &value);
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].install_reference,
            "github:anthropics/claude-code:plugins/frontend-design/skills/frontend-design:main"
        );
        assert_eq!(
            results[0].canonical_id,
            "github:anthropics/claude-code/plugins/frontend-design/skills/frontend-design"
        );
        assert_eq!(results[0].downloads, 21736);
    }

    #[test]
    fn normalizes_skills_sh_repository_prefix() {
        let source = skill_source(
            "skill-skills-sh",
            "skills.sh",
            "skills_sh",
            "https://skills.sh",
        );
        let value = serde_json::json!({
            "skills": [{
                "id": "github/awesome-copilot/git-commit",
                "skillId": "git-commit",
                "name": "git-commit",
                "source": "github/awesome-copilot",
                "installs": 35189
            }]
        });
        let results = parse_skills_sh_results(&source, &value);
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].install_reference,
            "github:github/awesome-copilot:git-commit:main"
        );
        assert_eq!(
            results[0].canonical_id,
            "github:github/awesome-copilot/git-commit"
        );
    }

    #[test]
    fn parses_installable_hermes_index_entries() {
        let source = skill_source(
            "skill-hermes-index",
            "Hermes Skills Hub",
            "hermes_index",
            "https://hermes-agent.nousresearch.com/docs/api/skills-index.json",
        );
        let index: HermesIndex = serde_json::from_value(serde_json::json!({
            "skills": [
                {
                    "name": "1password",
                    "description": "Use the 1Password CLI.",
                    "source": "official",
                    "identifier": "official/security/1password",
                    "path": "security/1password",
                    "tags": ["security"],
                    "extra": {}
                },
                {
                    "name": "git-commit",
                    "description": "Create Git commits.",
                    "source": "skills.sh",
                    "identifier": "skills-sh/github/awesome-copilot/git-commit",
                    "repo": "github/awesome-copilot",
                    "path": "git-commit",
                    "resolved_github_id": "github/awesome-copilot/skills/git-commit",
                    "tags": ["git"],
                    "extra": {
                        "detail_url": "https://skills.sh/github/awesome-copilot/git-commit"
                    }
                },
                {
                    "name": "Git",
                    "description": "Version control workflows.",
                    "source": "clawhub",
                    "identifier": "git",
                    "tags": ["git"],
                    "extra": {}
                },
                {
                    "name": "not-installable",
                    "description": "No downloadable bundle.",
                    "source": "lobehub",
                    "identifier": "lobehub/not-installable",
                    "tags": [],
                    "extra": {}
                }
            ]
        }))
        .unwrap();

        let results = parse_hermes_index_results(&source, &index.skills, "", 50);
        assert_eq!(results.len(), 3);
        assert_eq!(
            results[0].install_reference,
            "github:NousResearch/hermes-agent:optional-skills/security/1password:main"
        );
        assert_eq!(
            results[1].install_reference,
            "github:github/awesome-copilot:skills/git-commit:main"
        );
        assert_eq!(results[2].install_reference, "clawhub:git");
        assert_eq!(
            results[2].artifact_url,
            "https://clawhub.ai/api/v1/download?slug=git"
        );
    }

    #[test]
    fn searches_hermes_index_tags_case_insensitively() {
        let source = skill_source(
            "skill-hermes-index",
            "Hermes Skills Hub",
            "hermes_index",
            "https://hermes-agent.nousresearch.com/docs/api/skills-index.json",
        );
        let index: HermesIndex = serde_json::from_value(serde_json::json!({
            "skills": [{
                "name": "deploy-runbook",
                "description": "Production workflow.",
                "source": "github",
                "identifier": "my-org/hermes-skills/skills/deploy-runbook",
                "repo": "my-org/hermes-skills",
                "path": "skills/deploy-runbook",
                "tags": ["Kubernetes"],
                "extra": {}
            }]
        }))
        .unwrap();

        let results = parse_hermes_index_results(&source, &index.skills, "kubernetes", 50);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "deploy-runbook");
    }

    #[test]
    fn parses_colon_github_install_reference() {
        let (repo, path, branch) =
            parse_github_reference("github:xixu-me/skills:readme-i18n:main").unwrap();
        assert_eq!(repo, "xixu-me/skills");
        assert_eq!(path, "readme-i18n");
        assert_eq!(branch, "main");
    }

    #[test]
    fn parses_slash_github_install_reference() {
        let (repo, path, branch) =
            parse_github_reference("github:anthropics/skills/skills/pdf:main").unwrap();
        assert_eq!(repo, "anthropics/skills");
        assert_eq!(path, "skills/pdf");
        assert_eq!(branch, "main");
    }

    #[test]
    fn github_branch_candidates_include_common_defaults() {
        assert_eq!(github_branch_candidates("trunk"), vec!["trunk", "main", "master"]);
        assert_eq!(github_branch_candidates("main"), vec!["main", "master"]);
        assert_eq!(github_branch_candidates("master"), vec!["master", "main"]);
    }

    #[test]
    fn github_skill_path_candidates_cover_common_layouts() {
        assert_eq!(
            github_skill_path_candidates("readme-i18n"),
            vec!["readme-i18n", "skills/readme-i18n", ".claude/skills/readme-i18n"]
        );
        assert_eq!(
            github_skill_path_candidates("skills/pdf"),
            vec!["skills/pdf"]
        );
    }

    #[test]
    fn deduplicates_results_and_keeps_sources() {
        let mut source = skill_source("one", "One", "skill_feed", "https://example.com");
        source.built_in = false;
        let mut second = source.clone();
        second.id = "two".into();
        second.name = "Two".into();
        let results = deduplicate(vec![
            skill_result(
                &source,
                "artifact:a",
                "same",
                "Same",
                String::new(),
                "1".into(),
                String::new(),
                "a".into(),
                1,
            ),
            skill_result(
                &second,
                "artifact:b",
                "same",
                "Same",
                String::new(),
                "1".into(),
                String::new(),
                "b".into(),
                5,
            ),
        ]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].source_ids.len(), 2);
        assert_eq!(results[0].downloads, 5);
    }

    #[test]
    fn parses_multi_server_json() {
        let preview = preview_mcp_json(r#"{"mcpServers":{"one":{"command":"npx","args":["-y","one"]},"two":{"type":"http","url":"https://example.com/mcp"}}}"#).unwrap();
        assert_eq!(preview.servers.len(), 2);
        assert!(preview.errors.is_empty());
    }

    #[test]
    fn registry_remote_headers_stay_headers() {
        let server = serde_json::json!({
            "remotes": [{
                "type": "streamable-http",
                "url": "https://server.smithery.ai/example/mcp",
                "headers": [{
                    "name": "Authorization",
                    "value": "Bearer {smithery_api_key}",
                    "isRequired": true,
                    "isSecret": true
                }]
            }]
        });
        let (spec, warnings) = mcp_install_spec(&server);
        assert_eq!(spec.header_keys, vec!["Authorization"]);
        assert_eq!(
            spec.header_templates
                .get("Authorization")
                .map(String::as_str),
            Some("Bearer {value}")
        );
        assert_eq!(spec.required_header_keys, vec!["Authorization"]);
        assert!(spec.env_keys.is_empty());
        assert!(warnings.iter().any(|warning| warning.contains("Bearer")));
    }
}
