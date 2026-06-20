use crate::models::{SessionMessage, SessionRecord, SessionVisibilityRepairResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn collect_all_session_files(codex_config_dir: &Path) -> Vec<PathBuf> {
    let mut files = collect_codex_session_files(codex_config_dir);
    files.extend(collect_claude_files());
    files.extend(collect_gemini_files_from_default_root());
    files
}

pub fn collect_codex_session_files(codex_config_dir: &Path) -> Vec<PathBuf> {
    collect_files(&codex_config_dir.join("sessions"), "jsonl")
}

pub fn session_record_for_index(path: &Path) -> Option<SessionRecord> {
    session_record_for_path(path).ok()
}

pub fn repair_codex_session_visibility(
    codex_config_dir: &Path,
) -> Result<SessionVisibilityRepairResult, String> {
    let session_files = collect_codex_session_files(codex_config_dir);
    let sessions = session_files
        .iter()
        .filter_map(|path| {
            let record = parse_codex_session(path)?;
            Some(RepairableCodexSession::from_record(record, path))
        })
        .collect::<Vec<_>>();

    let mut result = SessionVisibilityRepairResult {
        scanned_sessions: sessions.len(),
        ..SessionVisibilityRepairResult::default()
    };

    if sessions.is_empty() {
        return Ok(result);
    }

    for db_path in codex_state_db_paths(codex_config_dir) {
        match repair_codex_state_database(&db_path, &sessions) {
            Ok((inserted, updated)) => {
                result.repaired_databases += 1;
                result.inserted_threads += inserted;
                result.updated_threads += updated;
            }
            Err(_) => {
                result.skipped_databases += 1;
            }
        }
    }

    match reconcile_codex_session_index(codex_config_dir, &sessions) {
        Ok((added, updated)) => {
            result.added_session_index_entries = added;
            result.updated_session_index_entries = updated;
        }
        Err(_) => {
            result.skipped_databases += 1;
        }
    }

    Ok(result)
}

pub fn load_codex_messages(path: &Path) -> Result<Vec<SessionMessage>, String> {
    let file = File::open(path).map_err(|error| format!("Failed to open session file: {error}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(value) => value,
            Err(_) => continue,
        };
        let value: Value = match serde_json::from_str(&line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        if value.get("type").and_then(Value::as_str) != Some("response_item") {
            continue;
        }

        let payload = match value.get("payload") {
            Some(payload) => payload,
            None => continue,
        };

        let payload_type = payload.get("type").and_then(Value::as_str).unwrap_or("");
        let timestamp = value
            .get("timestamp")
            .and_then(timestamp_to_string)
            .or_else(|| payload.get("timestamp").and_then(timestamp_to_string));

        let (role, content) = match payload_type {
            "message" => {
                let role = payload
                    .get("role")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string();
                let content = payload.get("content").map(extract_text).unwrap_or_default();
                (role, content)
            }
            "function_call" => {
                let name = payload
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                ("assistant".to_string(), format!("[Tool: {name}]"))
            }
            "function_call_output" => {
                let output = payload
                    .get("output")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                ("tool".to_string(), output)
            }
            _ => continue,
        };

        if content.trim().is_empty()
            || role == "developer"
            || role == "system"
            || is_codex_structural_prompt(&content)
        {
            continue;
        }

        messages.push(SessionMessage {
            role,
            content,
            timestamp,
        });
    }

    Ok(messages)
}

pub fn session_messages_for_path(path: &Path) -> Result<Vec<SessionMessage>, String> {
    match session_kind(path) {
        SessionKind::Gemini => load_gemini_messages(path),
        SessionKind::Claude => load_claude_messages(path),
        SessionKind::Codex => load_codex_messages(path),
    }
}

pub fn session_record_for_path(path: &Path) -> Result<SessionRecord, String> {
    match session_kind(path) {
        SessionKind::Gemini => {
            parse_gemini_session(path).ok_or_else(|| "Failed to parse Gemini session".to_string())
        }
        SessionKind::Claude => {
            parse_claude_session(path).ok_or_else(|| "Failed to parse Claude session".to_string())
        }
        SessionKind::Codex => {
            parse_codex_session(path).ok_or_else(|| "Failed to parse Codex session".to_string())
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionKind {
    Codex,
    Claude,
    Gemini,
}

fn session_kind(path: &Path) -> SessionKind {
    if ext_is(path, "json") {
        SessionKind::Gemini
    } else if path_has_component(path, ".claude") {
        SessionKind::Claude
    } else {
        SessionKind::Codex
    }
}

fn parse_codex_session(path: &Path) -> Option<SessionRecord> {
    let (head, tail) = read_head_tail_lines(path, 80, 30).ok()?;

    let mut session_id: Option<String> = None;
    let mut project_dir: Option<String> = None;
    let mut created_at: Option<String> = None;
    let mut first_user_text: Option<String> = None;
    let mut model_provider: Option<String> = None;
    let mut model: Option<String> = None;

    for line in &head {
        let value: Value = serde_json::from_str(line).ok()?;

        if created_at.is_none() {
            created_at = value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
        }

        if value.get("type").and_then(Value::as_str) == Some("session_meta") {
            if let Some(payload) = value.get("payload") {
                if session_id.is_none() {
                    session_id = payload
                        .get("id")
                        .and_then(Value::as_str)
                        .map(|value| value.to_string());
                }
                if project_dir.is_none() {
                    project_dir = payload
                        .get("cwd")
                        .and_then(Value::as_str)
                        .map(|value| value.to_string());
                }
                if let Some(timestamp) = payload.get("timestamp").and_then(Value::as_str) {
                    created_at.get_or_insert_with(|| timestamp.to_string());
                }
                if model_provider.is_none() {
                    model_provider = payload
                        .get("model_provider")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
            }
        }

        if value.get("type").and_then(Value::as_str) == Some("turn_context") {
            if let Some(payload) = value.get("payload") {
                if model.is_none() {
                    model = payload
                        .get("model")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
                if model_provider.is_none() {
                    model_provider = payload
                        .get("model_provider")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                }
            }
        }

        if first_user_text.is_none()
            && value.get("type").and_then(Value::as_str) == Some("response_item")
        {
            if let Some(payload) = value.get("payload") {
                if payload.get("type").and_then(Value::as_str) == Some("message")
                    && payload.get("role").and_then(Value::as_str) == Some("user")
                {
                    let text = payload.get("content").map(extract_text).unwrap_or_default();
                    if !text.trim().is_empty() && !is_codex_structural_prompt(&text) {
                        first_user_text = Some(text);
                    }
                }
            }
        }
    }

    let mut last_active_at: Option<String> = None;
    let mut summary: Option<String> = None;
    let mut last_assistant_text: Option<String> = None;

    for line in tail.iter().rev() {
        let value: Value = match serde_json::from_str(line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        last_active_at =
            last_active_at.or_else(|| value.get("timestamp").and_then(timestamp_to_string));

        if value.get("type").and_then(Value::as_str) == Some("response_item") {
            if let Some(payload) = value.get("payload") {
                if payload.get("type").and_then(Value::as_str) == Some("message") {
                    let role = payload.get("role").and_then(Value::as_str).unwrap_or("");
                    let text = payload.get("content").map(extract_text).unwrap_or_default();
                    if !text.trim().is_empty()
                        && role != "developer"
                        && role != "system"
                        && !is_codex_structural_prompt(&text)
                    {
                        if summary.is_none() {
                            summary = Some(truncate_summary(&text, 180));
                        }
                        if role == "assistant" && last_assistant_text.is_none() {
                            last_assistant_text = Some(text);
                        }
                    }
                }
            }
        }

        if summary.is_some() && last_active_at.is_some() && last_assistant_text.is_some() {
            break;
        }
    }

    let session_id = session_id.or_else(|| infer_session_id_from_filename(path))?;
    let workspace_path = project_dir.clone().unwrap_or_default();
    let title = first_user_text
        .as_deref()
        .map(|text| title_from_text(text, 60))
        .filter(|text| !text.is_empty())
        .or_else(|| {
            last_assistant_text
                .as_deref()
                .map(|text| title_from_text(text, 60))
                .filter(|text| !text.is_empty())
        })
        .or_else(|| project_dir.as_deref().and_then(path_basename))
        .unwrap_or_else(|| "Untitled".to_string());

    let started_at = created_at.unwrap_or_default();

    Some(SessionRecord {
        id: path.to_string_lossy().to_string(),
        provider_id: model_provider
            .clone()
            .unwrap_or_else(|| "codex".to_string()),
        provider_name: model_provider.unwrap_or_else(|| "Codex".to_string()),
        provider_model: model.unwrap_or_default(),
        agent: "codex".to_string(),
        session_id: session_id.clone(),
        workspace_path,
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("codex resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        message_count: indexed_message_count(path),
        started_at: started_at.clone(),
        last_active_at: last_active_at.unwrap_or(started_at),
    })
}

fn indexed_message_count(path: &Path) -> i64 {
    let file_size = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);
    if file_size > 1_048_576 {
        return 0;
    }
    count_lines(path)
}

fn count_lines(path: &Path) -> i64 {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return 0,
    };
    let mut buf = [0u8; 8192];
    let mut count: i64 = 0;
    loop {
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => count += buf[..n].iter().filter(|&&byte| byte == b'\n').count() as i64,
            Err(_) => break,
        }
    }
    count
}

#[derive(Debug, Clone)]
struct RepairableCodexSession {
    id: String,
    rollout_path: String,
    created_at: i64,
    updated_at: i64,
    created_at_ms: i64,
    updated_at_ms: i64,
    source: String,
    model_provider: String,
    cwd: String,
    title: String,
    first_user_message: String,
    preview: String,
    model: String,
}

impl RepairableCodexSession {
    fn from_record(record: SessionRecord, path: &Path) -> Self {
        let file_modified = path
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_seconds)
            .unwrap_or(0);
        let created_at = parse_timestamp_seconds(&record.started_at).unwrap_or(file_modified);
        let updated_at = parse_timestamp_seconds(&record.last_active_at).unwrap_or(created_at);
        let created_at_ms = parse_timestamp_millis(&record.started_at)
            .or_else(|| created_at.checked_mul(1000))
            .unwrap_or(0);
        let updated_at_ms = parse_timestamp_millis(&record.last_active_at)
            .or_else(|| updated_at.checked_mul(1000))
            .unwrap_or(created_at_ms);
        let title = if record.title.trim().is_empty() {
            "Untitled".to_string()
        } else {
            record.title
        };
        let first_user_message = title.clone();

        Self {
            id: record.session_id,
            rollout_path: normalize_windows_path(path),
            created_at,
            updated_at,
            created_at_ms,
            updated_at_ms,
            source: "cli".to_string(),
            model_provider: if record.provider_id.trim().is_empty() {
                "custom".to_string()
            } else {
                record.provider_id
            },
            cwd: normalize_codex_cwd(&record.workspace_path),
            preview: first_user_message.clone(),
            title,
            first_user_message,
            model: record.provider_model,
        }
    }
}

fn repair_codex_state_database(
    db_path: &Path,
    sessions: &[RepairableCodexSession],
) -> Result<(usize, usize), String> {
    if !db_path.exists() {
        return Ok((0, 0));
    }

    backup_codex_state_database(db_path)?;

    let mut conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    if !codex_threads_table_exists(&conn)? {
        return Err("Codex state database has no threads table".to_string());
    }
    let columns = read_codex_threads_columns(&conn)?;

    let tx = conn.transaction().map_err(|error| error.to_string())?;
    let mut inserted = 0;
    let mut updated = 0;

    for session in sessions {
        let exists = tx
            .query_row(
                "SELECT 1 FROM threads WHERE id = ?1 LIMIT 1",
                params![&session.id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();

        if exists {
            let changed = update_codex_thread_row(&tx, &columns, session)?;
            updated += changed;
        } else {
            insert_codex_thread_row(&tx, &columns, session)?;
            inserted += 1;
        }
    }

    tx.commit().map_err(|error| error.to_string())?;
    Ok((inserted, updated))
}

fn codex_threads_table_exists(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'threads' LIMIT 1",
        [],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(|error| error.to_string())
}

fn read_codex_threads_columns(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(threads)")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn column_exists(columns: &[String], name: &str) -> bool {
    columns.iter().any(|column| column == name)
}

fn update_codex_thread_row(
    tx: &rusqlite::Transaction<'_>,
    columns: &[String],
    session: &RepairableCodexSession,
) -> Result<usize, String> {
    let mut assignments = Vec::new();
    if column_exists(columns, "rollout_path") {
        assignments.push("rollout_path = ?2".to_string());
    }
    if column_exists(columns, "updated_at") {
        assignments.push("updated_at = MAX(updated_at, ?4)".to_string());
    }
    if column_exists(columns, "source") {
        assignments.push("source = CASE WHEN source = '' THEN ?5 ELSE source END".to_string());
    }
    if column_exists(columns, "model_provider") {
        assignments.push(
            "model_provider = CASE WHEN model_provider = '' THEN ?6 ELSE model_provider END"
                .to_string(),
        );
    }
    if column_exists(columns, "cwd") {
        assignments.push("cwd = CASE WHEN cwd = '' THEN ?7 ELSE cwd END".to_string());
    }
    if column_exists(columns, "title") {
        assignments.push(
            "title = CASE WHEN title IS NULL OR title = '' THEN ?8 ELSE title END".to_string(),
        );
    }
    if column_exists(columns, "archived") {
        assignments.push("archived = 0".to_string());
    }
    if column_exists(columns, "archived_at") {
        assignments.push("archived_at = NULL".to_string());
    }
    if column_exists(columns, "first_user_message") {
        assignments.push(
            "first_user_message = CASE WHEN first_user_message IS NULL OR first_user_message = '' THEN ?9 ELSE first_user_message END"
                .to_string(),
        );
    }
    if column_exists(columns, "preview") {
        assignments.push(
            "preview = CASE WHEN preview IS NULL OR preview = '' THEN ?10 ELSE preview END"
                .to_string(),
        );
    }
    if column_exists(columns, "model") {
        assignments.push(
            "model = CASE WHEN model IS NULL OR model = '' THEN ?11 ELSE model END".to_string(),
        );
    }
    if column_exists(columns, "thread_source") {
        assignments.push(
            "thread_source = CASE WHEN thread_source IS NULL OR thread_source = '' THEN 'user' ELSE thread_source END"
                .to_string(),
        );
    }
    if column_exists(columns, "has_user_event") {
        assignments.push("has_user_event = 1".to_string());
    }
    if column_exists(columns, "created_at_ms") {
        assignments.push(
            "created_at_ms = CASE WHEN created_at_ms IS NULL THEN ?12 ELSE created_at_ms END"
                .to_string(),
        );
    }
    if column_exists(columns, "updated_at_ms") {
        assignments.push("updated_at_ms = MAX(COALESCE(updated_at_ms, 0), ?13)".to_string());
    }
    if assignments.is_empty() {
        return Ok(0);
    }

    let sql = format!(
        "UPDATE threads SET {} WHERE id = ?1",
        assignments.join(", ")
    );
    tx.execute(
        &sql,
        params![
            &session.id,
            &session.rollout_path,
            session.created_at,
            session.updated_at,
            &session.source,
            &session.model_provider,
            &session.cwd,
            &session.title,
            &session.first_user_message,
            &session.preview,
            &session.model,
            session.created_at_ms,
            session.updated_at_ms,
        ],
    )
    .map_err(|error| error.to_string())
}

fn insert_codex_thread_row(
    tx: &rusqlite::Transaction<'_>,
    columns: &[String],
    session: &RepairableCodexSession,
) -> Result<(), String> {
    let mut names = vec!["id"];
    let mut placeholders = vec!["?1"];
    if column_exists(columns, "rollout_path") {
        names.push("rollout_path");
        placeholders.push("?2");
    }
    if column_exists(columns, "created_at") {
        names.push("created_at");
        placeholders.push("?3");
    }
    if column_exists(columns, "updated_at") {
        names.push("updated_at");
        placeholders.push("?4");
    }
    if column_exists(columns, "source") {
        names.push("source");
        placeholders.push("?5");
    }
    if column_exists(columns, "model_provider") {
        names.push("model_provider");
        placeholders.push("?6");
    }
    if column_exists(columns, "cwd") {
        names.push("cwd");
        placeholders.push("?7");
    }
    if column_exists(columns, "title") {
        names.push("title");
        placeholders.push("?8");
    }
    if column_exists(columns, "sandbox_policy") {
        names.push("sandbox_policy");
        placeholders.push("''");
    }
    if column_exists(columns, "approval_mode") {
        names.push("approval_mode");
        placeholders.push("''");
    }
    if column_exists(columns, "tokens_used") {
        names.push("tokens_used");
        placeholders.push("0");
    }
    if column_exists(columns, "has_user_event") {
        names.push("has_user_event");
        placeholders.push("1");
    }
    if column_exists(columns, "archived") {
        names.push("archived");
        placeholders.push("0");
    }
    if column_exists(columns, "first_user_message") {
        names.push("first_user_message");
        placeholders.push("?9");
    }
    if column_exists(columns, "model") {
        names.push("model");
        placeholders.push("?10");
    }
    if column_exists(columns, "thread_source") {
        names.push("thread_source");
        placeholders.push("'user'");
    }
    if column_exists(columns, "preview") {
        names.push("preview");
        placeholders.push("?11");
    }
    if column_exists(columns, "created_at_ms") {
        names.push("created_at_ms");
        placeholders.push("?12");
    }
    if column_exists(columns, "updated_at_ms") {
        names.push("updated_at_ms");
        placeholders.push("?13");
    }

    let sql = format!(
        "INSERT INTO threads ({}) VALUES ({})",
        names.join(", "),
        placeholders.join(", ")
    );
    tx.execute(
        &sql,
        params![
            &session.id,
            &session.rollout_path,
            session.created_at,
            session.updated_at,
            &session.source,
            &session.model_provider,
            &session.cwd,
            &session.title,
            &session.first_user_message,
            &session.model,
            &session.preview,
            session.created_at_ms,
            session.updated_at_ms,
        ],
    )
    .map(|_| ())
    .map_err(|error| error.to_string())
}

fn reconcile_codex_session_index(
    codex_config_dir: &Path,
    sessions: &[RepairableCodexSession],
) -> Result<(usize, usize), String> {
    let path = codex_config_dir.join("session_index.jsonl");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create Codex session index directory: {error}"))?;
    }

    let mut lines = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read Codex session index: {error}"))?
            .lines()
            .map(str::to_string)
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }

    let mut sessions_by_id = sessions
        .iter()
        .map(|session| (session.id.as_str(), session))
        .collect::<std::collections::HashMap<_, _>>();
    let updated = 0;

    for line in &mut lines {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(id) = value.get("id").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        let Some(session) = sessions_by_id.remove(id.as_str()) else {
            continue;
        };
        let _ = session;
    }

    let mut added = 0;
    let mut remaining = sessions_by_id.into_values().collect::<Vec<_>>();
    remaining.sort_by(|left, right| left.id.cmp(&right.id));
    for session in remaining {
        lines.push(
            serde_json::to_string(&session_index_entry(session)).map_err(|error| {
                format!("Failed to serialize Codex session index entry: {error}")
            })?,
        );
        added += 1;
    }

    if added > 0 || updated > 0 || !path.exists() {
        backup_codex_session_index(&path)?;
        let mut output = lines.join("\n");
        output.push('\n');
        fs::write(&path, output)
            .map_err(|error| format!("Failed to write Codex session index: {error}"))?;
    }

    Ok((added, updated))
}

fn session_index_entry(session: &RepairableCodexSession) -> Value {
    json!({
        "id": session.id,
        "thread_name": session.title,
        "updated_at": format_timestamp_millis_rfc3339(session.updated_at_ms),
    })
}

fn backup_codex_session_index(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let backup_path = path.with_extension(format!("jsonl.codex-switch-backup-{timestamp}"));
    fs::copy(path, backup_path)
        .map(|_| ())
        .map_err(|error| format!("Failed to back up Codex session index: {error}"))
}

fn backup_codex_state_database(db_path: &Path) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let backup_path = db_path.with_extension(format!("sqlite.codex-switch-backup-{timestamp}"));
    fs::copy(db_path, backup_path)
        .map(|_| ())
        .map_err(|error| format!("Failed to back up Codex state database: {error}"))
}

fn codex_state_db_paths(codex_config_dir: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for path in [
        codex_config_dir.join("state_5.sqlite"),
        codex_config_dir.join("sqlite").join("state_5.sqlite"),
    ] {
        if path.exists() && !paths.iter().any(|item| item == &path) {
            paths.push(path);
        }
    }
    paths
}

fn parse_timestamp_seconds(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(number) = trimmed.parse::<i64>() {
        return Some(if number > 10_000_000_000 {
            number / 1000
        } else {
            number
        });
    }
    chrono::DateTime::parse_from_rfc3339(trimmed)
        .ok()
        .map(|value| value.timestamp())
}

fn parse_timestamp_millis(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(number) = trimmed.parse::<i64>() {
        return Some(if number > 10_000_000_000 {
            number
        } else {
            number * 1000
        });
    }
    chrono::DateTime::parse_from_rfc3339(trimmed)
        .ok()
        .map(|value| value.timestamp_millis())
}

fn format_timestamp_millis_rfc3339(value: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(value)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339()
}

fn system_time_seconds(value: SystemTime) -> Option<i64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_secs() as i64)
}

fn normalize_windows_path(path: &Path) -> String {
    path.to_string_lossy()
        .trim_start_matches(r"\\?\")
        .to_string()
}

fn normalize_codex_cwd(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if cfg!(windows) && !trimmed.starts_with(r"\\?\") {
        format!(r"\\?\{trimmed}")
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
fn scan_files(
    root: &Path,
    ext: &str,
    keep: impl Fn(&Path) -> bool,
    parse: fn(&Path) -> Option<SessionRecord>,
) -> Vec<SessionRecord> {
    sessions_from(
        collect_files(root, ext)
            .into_iter()
            .filter(|path| keep(path))
            .collect(),
        parse,
    )
}

#[cfg(test)]
fn sessions_from(
    files: Vec<PathBuf>,
    parse: fn(&Path) -> Option<SessionRecord>,
) -> Vec<SessionRecord> {
    let mut sessions: Vec<SessionRecord> =
        files.into_iter().filter_map(|path| parse(&path)).collect();
    sessions.sort_by(|l, r| r.last_active_at.cmp(&l.last_active_at));
    sessions
}

fn collect_files(root: &Path, ext: &str) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_files_into(root, ext, &mut files);
    files
}

fn collect_files_into(root: &Path, ext: &str, files: &mut Vec<PathBuf>) {
    if !root.exists() {
        return;
    }

    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_files_into(&path, ext, files);
        } else if ext_is(&path, ext) {
            files.push(path);
        }
    }
}

fn ext_is(path: &Path, ext: &str) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case(ext))
}

fn path_has_component(path: &Path, needle: &str) -> bool {
    path.components()
        .any(|component| component.as_os_str().to_string_lossy() == needle)
}

fn read_head_tail_lines(
    path: &Path,
    head_n: usize,
    tail_n: usize,
) -> io::Result<(Vec<String>, Vec<String>)> {
    let file = File::open(path)?;
    let file_len = file.metadata()?.len();

    if file_len < 16_384 {
        let reader = BufReader::new(file);
        let all: Vec<String> = reader.lines().map_while(Result::ok).collect();
        let head = all.iter().take(head_n).cloned().collect();
        let skip = all.len().saturating_sub(tail_n);
        let tail = all.into_iter().skip(skip).collect();
        return Ok((head, tail));
    }

    let reader = BufReader::new(file);
    let head = reader.lines().take(head_n).map_while(Result::ok).collect();

    let seek_pos = file_len.saturating_sub(16_384);
    let mut file2 = File::open(path)?;
    file2.seek(SeekFrom::Start(seek_pos))?;
    let tail_reader = BufReader::new(file2);
    let all_tail: Vec<String> = tail_reader.lines().map_while(Result::ok).collect();
    let usable: Vec<String> = all_tail
        .into_iter()
        .skip(if seek_pos > 0 { 1 } else { 0 })
        .collect();
    let skip = usable.len().saturating_sub(tail_n);
    let tail = usable.into_iter().skip(skip).collect();

    Ok((head, tail))
}

fn extract_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.to_string(),
        Value::Array(items) => items
            .iter()
            .filter_map(extract_text_from_item)
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        _ => String::new(),
    }
}

fn extract_text_from_item(item: &Value) -> Option<String> {
    let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");

    if item_type == "tool_use" {
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        return Some(format!("[Tool: {name}]"));
    }

    if item_type == "tool_result" {
        if let Some(content) = item.get("content") {
            let text = extract_text(content);
            if !text.is_empty() {
                return Some(text);
            }
        }
        return None;
    }

    if let Some(text) = item.get("text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(text) = item.get("input_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(text) = item.get("output_text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    if let Some(content) = item.get("content") {
        let text = extract_text(content);
        if !text.is_empty() {
            return Some(text);
        }
    }

    None
}

fn title_from_text(text: &str, max_chars: usize) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max_chars {
        return flat;
    }
    let mut result: String = flat.chars().take(max_chars).collect();
    result.push_str("...");
    result
}

fn is_codex_structural_prompt(text: &str) -> bool {
    let trimmed = text.trim();
    trimmed.starts_with("<environment_context>")
        || trimmed.starts_with("<current_date>")
        || trimmed.starts_with("<timezone>")
        || trimmed.starts_with("<permissions instructions>")
        || trimmed.starts_with("<collaboration_mode>")
        || trimmed.starts_with("<skills_instructions>")
        || trimmed.starts_with("<turn_aborted>")
        || trimmed.starts_with("# Instructions")
        || trimmed.starts_with("<image")
}

fn truncate_summary(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let mut result = trimmed.chars().take(max_chars).collect::<String>();
    result.push_str("...");
    result
}

fn path_basename(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.trim_end_matches(['/', '\\']);
    let last = normalized
        .split(['/', '\\'])
        .next_back()
        .filter(|segment| !segment.is_empty())?;
    Some(last.to_string())
}

fn timestamp_to_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
        .or_else(|| value.as_f64().map(|number| number.to_string()))
}

fn infer_session_id_from_filename(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_string_lossy();
    file_name
        .as_bytes()
        .windows(36)
        .find(|candidate| is_uuid_like(candidate))
        .map(|candidate| String::from_utf8_lossy(candidate).to_string())
}

fn is_uuid_like(candidate: &[u8]) -> bool {
    if candidate.len() != 36 {
        return false;
    }

    for (index, byte) in candidate.iter().enumerate() {
        if matches!(index, 8 | 13 | 18 | 23) {
            if *byte != b'-' {
                return false;
            }
        } else if !byte.is_ascii_hexdigit() {
            return false;
        }
    }

    true
}

/* ── Claude Code sessions ──────────────────────────────────────── */

fn default_claude_projects_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude")
        .join("projects")
}

fn collect_claude_files() -> Vec<PathBuf> {
    collect_files(&default_claude_projects_root(), "jsonl")
        .into_iter()
        .filter(|path| not_agent_file(path))
        .collect()
}

fn gemini_chat_dirs(tmp: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(tmp)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path().join("chats"))
        .filter(|path| path.is_dir())
        .collect()
}

fn collect_gemini_files(tmp: &Path) -> Vec<PathBuf> {
    gemini_chat_dirs(tmp)
        .into_iter()
        .flat_map(|dir| collect_files(&dir, "json"))
        .collect()
}

fn not_agent_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| !s.starts_with("agent-"))
        .unwrap_or(true)
}

pub fn load_claude_messages(path: &Path) -> Result<Vec<SessionMessage>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open: {e}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(v) => v,
            Err(_) => continue,
        };
        let value: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if value
            .get("isMeta")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let message = match value.get("message") {
            Some(m) => m,
            None => continue,
        };
        let mut role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let null = Value::Null;
        let content_value = message.get("content").unwrap_or(&null);

        if role == "user" {
            if let Value::Array(items) = content_value {
                if !items.is_empty()
                    && items
                        .iter()
                        .all(|i| i.get("type").and_then(Value::as_str) == Some("tool_result"))
                {
                    role = "tool".to_string();
                }
            }
        }

        let content = extract_text(content_value);
        if content.trim().is_empty() {
            continue;
        }
        messages.push(SessionMessage {
            role,
            content,
            timestamp: value.get("timestamp").and_then(timestamp_to_string),
        });
    }
    Ok(messages)
}

fn parse_claude_session(path: &Path) -> Option<SessionRecord> {
    let (head, tail) = read_head_tail_lines(path, 80, 30).ok()?;

    let mut session_id: Option<String> = None;
    let mut project_dir: Option<String> = None;
    let mut created_at: Option<String> = None;
    let mut first_user_text: Option<String> = None;

    for line in &head {
        let value: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if session_id.is_none() {
            session_id = value
                .get("sessionId")
                .and_then(Value::as_str)
                .map(String::from);
        }
        if project_dir.is_none() {
            project_dir = value.get("cwd").and_then(Value::as_str).map(String::from);
        }
        if created_at.is_none() {
            created_at = value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(String::from);
        }
        if first_user_text.is_none() {
            let message = match value.get("message") {
                Some(message) => message,
                None => continue,
            };
            if message.get("role").and_then(Value::as_str) == Some("user") {
                let text = message.get("content").map(extract_text).unwrap_or_default();
                if !text.trim().is_empty() {
                    first_user_text = Some(text);
                }
            }
        }
        if session_id.is_some() && project_dir.is_some() && created_at.is_some() {
            if first_user_text.is_some() {
                break;
            }
        }
    }

    let mut last_active_at: Option<String> = None;
    let mut summary: Option<String> = None;
    let mut last_assistant_text: Option<String> = None;

    for line in tail.iter().rev() {
        let value: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if value
            .get("isMeta")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        last_active_at = last_active_at.or_else(|| {
            value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(String::from)
        });
        if let Some(message) = value.get("message") {
            let role = message.get("role").and_then(Value::as_str).unwrap_or("");
            if let Some(content) = message.get("content") {
                let text = extract_text(content);
                if !text.trim().is_empty() {
                    if summary.is_none() {
                        summary = Some(truncate_summary(&text, 180));
                    }
                    if role == "assistant" && last_assistant_text.is_none() {
                        last_assistant_text = Some(text);
                    }
                }
            }
        }
        if summary.is_some() && last_active_at.is_some() && last_assistant_text.is_some() {
            break;
        }
    }

    let session_id = session_id.or_else(|| infer_session_id_from_filename(path))?;
    let workspace_path = project_dir.clone().unwrap_or_default();
    let title = first_user_text
        .as_deref()
        .map(|text| title_from_text(text, 60))
        .filter(|text| !text.is_empty())
        .or_else(|| {
            last_assistant_text
                .as_deref()
                .map(|text| title_from_text(text, 60))
                .filter(|text| !text.is_empty())
        })
        .or_else(|| project_dir.as_deref().and_then(path_basename))
        .unwrap_or_else(|| "Claude chat".to_string());

    let started_at = created_at.unwrap_or_default();

    Some(SessionRecord {
        id: path.to_string_lossy().to_string(),
        provider_id: "claude".to_string(),
        provider_name: "Claude Code".to_string(),
        provider_model: String::new(),
        agent: "claude".to_string(),
        session_id: session_id.clone(),
        workspace_path,
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("claude --resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        message_count: indexed_message_count(path),
        started_at: started_at.clone(),
        last_active_at: last_active_at.unwrap_or(started_at),
    })
}

/* ── Gemini sessions ───────────────────────────────────────────── */

fn default_gemini_tmp_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".gemini")
        .join("tmp")
}

fn collect_gemini_files_from_default_root() -> Vec<PathBuf> {
    collect_gemini_files(&default_gemini_tmp_root())
}

pub fn load_gemini_messages(path: &Path) -> Result<Vec<SessionMessage>, String> {
    let contents = std::fs::read_to_string(path).map_err(|e| format!("Failed to open: {e}"))?;
    let value: Value = serde_json::from_str(&contents).map_err(|e| format!("Invalid JSON: {e}"))?;
    let messages = match value.get("messages").and_then(Value::as_array) {
        Some(a) => a,
        None => return Ok(Vec::new()),
    };

    let mut out = Vec::new();
    for msg in messages {
        let raw_type = msg.get("type").and_then(Value::as_str).unwrap_or("");
        let role = match raw_type {
            "user" => "user",
            "gemini" => "assistant",
            "info" | "error" => continue,
            other => other,
        };
        let mut content = msg.get("content").map(extract_text).unwrap_or_default();
        if let Some(tools) = msg.get("toolCalls").and_then(Value::as_array) {
            for t in tools {
                let name = t.get("name").and_then(Value::as_str).unwrap_or("unknown");
                content.push_str(&format!("\n[Tool: {name}]"));
            }
        }
        if content.trim().is_empty() {
            continue;
        }
        out.push(SessionMessage {
            role: role.to_string(),
            content,
            timestamp: msg
                .get("timestamp")
                .and_then(timestamp_to_string)
                .or_else(|| msg.get("createTime").and_then(timestamp_to_string))
                .or_else(|| msg.get("time").and_then(timestamp_to_string)),
        });
    }
    Ok(out)
}

fn parse_gemini_session(path: &Path) -> Option<SessionRecord> {
    let contents = std::fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&contents).ok()?;

    let session_id = value
        .get("sessionId")
        .and_then(Value::as_str)
        .map(String::from)
        .or_else(|| infer_session_id_from_filename(path))?;
    let started_at = value
        .get("startTime")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let last_active_at = value
        .get("lastUpdated")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let messages = value.get("messages").and_then(Value::as_array);
    let first_user_text = messages
        .and_then(|arr| {
            arr.iter()
                .find(|m| m.get("type").and_then(Value::as_str) == Some("user"))
        })
        .and_then(|m| m.get("content"))
        .map(extract_text)
        .unwrap_or_default();
    let title = if first_user_text.trim().is_empty() {
        "Gemini chat".to_string()
    } else {
        title_from_text(&first_user_text, 60)
    };
    let summary = if first_user_text.trim().is_empty() {
        None
    } else {
        Some(truncate_summary(&first_user_text, 180))
    };
    let count = messages.map(|a| a.len() as i64).unwrap_or(0);

    Some(SessionRecord {
        id: path.to_string_lossy().to_string(),
        provider_id: "gemini".to_string(),
        provider_name: "Gemini".to_string(),
        provider_model: String::new(),
        agent: "gemini".to_string(),
        session_id: session_id.clone(),
        workspace_path: String::new(),
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("gemini --resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        message_count: count,
        started_at: started_at.clone(),
        last_active_at: if last_active_at.is_empty() {
            started_at
        } else {
            last_active_at
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("codex-switch-{name}-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "{}\n").unwrap();
    }

    fn fake_session(path: &Path) -> Option<SessionRecord> {
        let ts = path.file_stem()?.to_string_lossy().to_string();
        Some(SessionRecord {
            id: path.to_string_lossy().to_string(),
            provider_id: "test".to_string(),
            provider_name: "Test".to_string(),
            provider_model: String::new(),
            agent: "test".to_string(),
            session_id: ts.clone(),
            workspace_path: String::new(),
            title: ts.clone(),
            summary: None,
            source_path: path.to_string_lossy().to_string(),
            resume_command: String::new(),
            status: "active".to_string(),
            notes: String::new(),
            message_count: 0,
            started_at: ts.clone(),
            last_active_at: ts,
        })
    }

    #[test]
    fn visibility_repair_preserves_existing_sidebar_text_while_unhiding() {
        let root = tmp_dir("codex-repair-existing");
        let db_path = root.join("state_5.sqlite");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE threads (
                id TEXT PRIMARY KEY,
                rollout_path TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                source TEXT,
                model_provider TEXT,
                cwd TEXT,
                title TEXT,
                sandbox_policy TEXT,
                approval_mode TEXT,
                tokens_used INTEGER,
                has_user_event INTEGER,
                archived INTEGER,
                archived_at INTEGER,
                first_user_message TEXT,
                model TEXT,
                thread_source TEXT,
                preview TEXT,
                created_at_ms INTEGER,
                updated_at_ms INTEGER
            );
            INSERT INTO threads (
                id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
                sandbox_policy, approval_mode, tokens_used, has_user_event, archived,
                archived_at, first_user_message, model, thread_source, preview
            ) VALUES (
                'session-title-test', '', 1, 1, '', '', '',
                'New chat', '', '', 0, 0, 1, 123,
                'Existing first message', '', '', 'Existing preview'
            );
            "#,
        )
        .unwrap();
        drop(conn);

        let sessions = vec![RepairableCodexSession {
            id: "session-title-test".to_string(),
            rollout_path: root.join("rollout.jsonl").to_string_lossy().to_string(),
            created_at: 10,
            updated_at: 20,
            created_at_ms: 10_123,
            updated_at_ms: 20_456,
            source: "cli".to_string(),
            model_provider: "codex".to_string(),
            cwd: normalize_codex_cwd(r"C:\workspace"),
            title: "Real user title appears after repair".to_string(),
            first_user_message: "Real user title appears after repair".to_string(),
            preview: "Real user title appears after repair".to_string(),
            model: "gpt-5".to_string(),
        }];

        let result = repair_codex_state_database(&db_path, &sessions).unwrap();
        assert_eq!(result, (0, 1));

        let conn = Connection::open(&db_path).unwrap();
        let row = conn
            .query_row(
                "SELECT title, first_user_message, preview, archived, archived_at, has_user_event, created_at_ms, updated_at_ms FROM threads WHERE id = 'session-title-test'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, i64>(7)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(row.0, "New chat");
        assert_eq!(row.1, "Existing first message");
        assert_eq!(row.2, "Existing preview");
        assert_eq!(row.3, 0);
        assert_eq!(row.4, None);
        assert_eq!(row.5, 1);
        assert_eq!(row.6, 10_123);
        assert_eq!(row.7, 20_456);
    }

    #[test]
    fn visibility_repair_reconciles_codex_session_index() {
        let root = tmp_dir("codex-session-index");
        fs::write(
            root.join("session_index.jsonl"),
            "{\"id\":\"session-title-test\",\"thread_name\":\"New chat\",\"updated_at\":\"2026-06-19T00:00:00Z\"}\n",
        )
        .unwrap();

        let sessions = vec![
            RepairableCodexSession {
                id: "session-title-test".to_string(),
                rollout_path: root.join("rollout-1.jsonl").to_string_lossy().to_string(),
                created_at: 10,
                updated_at: 20,
                created_at_ms: 10_000,
                updated_at_ms: 20_000,
                source: "cli".to_string(),
                model_provider: "codex".to_string(),
                cwd: String::new(),
                title: "Real user title appears after repair".to_string(),
                first_user_message: "Real user title appears after repair".to_string(),
                preview: "Real user title appears after repair".to_string(),
                model: "gpt-5".to_string(),
            },
            RepairableCodexSession {
                id: "missing-session".to_string(),
                rollout_path: root.join("rollout-2.jsonl").to_string_lossy().to_string(),
                created_at: 30,
                updated_at: 40,
                created_at_ms: 30_000,
                updated_at_ms: 40_000,
                source: "cli".to_string(),
                model_provider: "codex".to_string(),
                cwd: String::new(),
                title: "Missing session title".to_string(),
                first_user_message: "Missing session title".to_string(),
                preview: "Missing session title".to_string(),
                model: "gpt-5".to_string(),
            },
        ];

        let result = reconcile_codex_session_index(&root, &sessions).unwrap();
        assert_eq!(result, (1, 0));

        let lines = fs::read_to_string(root.join("session_index.jsonl")).unwrap();
        assert!(lines.contains("\"thread_name\":\"New chat\""));
        assert!(lines.contains("\"thread_name\":\"Missing session title\""));
        let backup_count = fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("session_index.jsonl.codex-switch-backup-")
            })
            .count();
        assert_eq!(backup_count, 1);
    }

    #[test]
    fn collect_files_recurses_and_filters_extension() {
        let root = tmp_dir("collect");
        touch(&root.join("a.jsonl"));
        touch(&root.join("nested").join("b.JSONL"));
        touch(&root.join("nested").join("c.json"));

        let mut names = collect_files(&root, "jsonl")
            .into_iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(names, vec!["a.jsonl", "b.JSONL"]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_files_applies_filter_and_sorts_newest_first() {
        let root = tmp_dir("scan");
        touch(&root.join("2024.jsonl"));
        touch(&root.join("2026.jsonl"));
        touch(&root.join("agent-2027.jsonl"));

        let sessions = scan_files(&root, "jsonl", not_agent_file, fake_session);
        let ids = sessions
            .iter()
            .map(|session| session.session_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["2026", "2024"]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn gemini_chat_files_only_come_from_project_chat_dirs() {
        let root = tmp_dir("gemini");
        touch(&root.join("project-a").join("chats").join("one.json"));
        touch(&root.join("project-a").join("chats").join("skip.txt"));
        touch(&root.join("project-b").join("other").join("two.json"));

        let files = collect_gemini_files(&root);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name().unwrap().to_string_lossy(), "one.json");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn session_kind_is_shared_by_record_and_message_routing() {
        assert_eq!(session_kind(Path::new("chat.JSON")), SessionKind::Gemini);
        assert_eq!(
            session_kind(&PathBuf::from("home").join(".claude").join("x.jsonl")),
            SessionKind::Claude
        );
        assert_eq!(session_kind(Path::new("x.jsonl")), SessionKind::Codex);
    }
}
