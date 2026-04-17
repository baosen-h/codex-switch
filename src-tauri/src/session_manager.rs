use crate::models::{SessionMessage, SessionRecord};
use chrono::{DateTime, FixedOffset};
use regex::Regex;
use serde_json::Value;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

static UUID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
        .expect("valid UUID regex")
});

pub fn scan_codex_sessions(config_dir: &Path) -> Vec<SessionRecord> {
    let root = config_dir.join("sessions");
    let mut files = Vec::new();
    collect_jsonl_files(&root, &mut files);

    let mut sessions = files
        .into_iter()
        .filter_map(|path| parse_session(&path))
        .collect::<Vec<_>>();

    sessions.sort_by(|left, right| right.last_active_at.cmp(&left.last_active_at));
    sessions
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

        if content.trim().is_empty() {
            continue;
        }

        messages.push(SessionMessage {
            role,
            content,
            ts: value.get("timestamp").and_then(parse_timestamp_to_ms),
        });
    }

    Ok(messages)
}

fn parse_session(path: &Path) -> Option<SessionRecord> {
    let (head, tail) = read_head_tail_lines(path, 10, 30).ok()?;

    let mut session_id: Option<String> = None;
    let mut project_dir: Option<String> = None;
    let mut created_at: Option<String> = None;
    let mut created_at_ms: Option<i64> = None;

    for line in &head {
        let value: Value = serde_json::from_str(line).ok()?;

        if created_at.is_none() {
            created_at = value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
            created_at_ms = value.get("timestamp").and_then(parse_timestamp_to_ms);
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
                if let Some(timestamp_ms) = payload.get("timestamp").and_then(parse_timestamp_to_ms)
                {
                    created_at_ms.get_or_insert(timestamp_ms);
                }
            }
        }
    }

    let mut last_active_at = created_at.clone();
    let mut last_active_at_ms = created_at_ms;
    let mut summary: Option<String> = None;

    for line in tail.iter().rev() {
        let value: Value = match serde_json::from_str(line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        if last_active_at.is_none() {
            last_active_at = value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(|value| value.to_string());
        }
        if last_active_at_ms.is_none() {
            last_active_at_ms = value.get("timestamp").and_then(parse_timestamp_to_ms);
        }

        if summary.is_none() && value.get("type").and_then(Value::as_str) == Some("response_item") {
            if let Some(payload) = value.get("payload") {
                if payload.get("type").and_then(Value::as_str) == Some("message") {
                    let text = payload.get("content").map(extract_text).unwrap_or_default();
                    if !text.trim().is_empty() {
                        summary = Some(truncate_summary(&text, 180));
                    }
                }
            }
        }

        if summary.is_some() && last_active_at.is_some() && last_active_at_ms.is_some() {
            break;
        }
    }

    let session_id = session_id.or_else(|| infer_session_id_from_filename(path))?;
    let workspace_path = project_dir.clone().unwrap_or_default();
    let title = project_dir
        .as_deref()
        .and_then(path_basename)
        .unwrap_or_else(|| "Untitled".to_string());

    Some(SessionRecord {
        id: path.to_string_lossy().to_string(),
        provider_id: "codex".to_string(),
        provider_name: "Codex".to_string(),
        session_id: session_id.clone(),
        workspace_path,
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("codex resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        started_at: created_at.unwrap_or_default(),
        started_at_ms: created_at_ms.unwrap_or_default(),
        last_active_at: last_active_at.unwrap_or_default(),
        last_active_at_ms: last_active_at_ms.unwrap_or_default(),
    })
}

fn collect_jsonl_files(root: &Path, files: &mut Vec<PathBuf>) {
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
            collect_jsonl_files(&path, files);
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }
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

fn parse_timestamp_to_ms(value: &Value) -> Option<i64> {
    if let Some(number) = value.as_i64() {
        return Some(if number > 1_000_000_000_000 {
            number
        } else {
            number * 1000
        });
    }
    if let Some(number) = value.as_f64() {
        let number = number as i64;
        return Some(if number > 1_000_000_000_000 {
            number
        } else {
            number * 1000
        });
    }

    let raw = value.as_str()?;
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|timestamp: DateTime<FixedOffset>| timestamp.timestamp_millis())
}

fn infer_session_id_from_filename(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_string_lossy();
    UUID_RE.find(&file_name).map(|matched| matched.as_str().to_string())
}
