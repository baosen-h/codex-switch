use crate::models::{SessionMessage, SessionRecord};
use serde_json::Value;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

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

        messages.push(SessionMessage { role, content });
    }

    Ok(messages)
}

fn parse_session(path: &Path) -> Option<SessionRecord> {
    let (head, tail) = read_head_tail_lines(path, 80, 30).ok()?;

    let mut session_id: Option<String> = None;
    let mut project_dir: Option<String> = None;
    let mut created_at: Option<String> = None;
    let mut first_user_text: Option<String> = None;

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
        provider_id: "codex".to_string(),
        provider_name: "Codex".to_string(),
        agent: "codex".to_string(),
        session_id: session_id.clone(),
        workspace_path,
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("codex resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        message_count: count_lines(path),
        started_at: started_at.clone(),
        last_active_at: last_active_at.unwrap_or(started_at),
    })
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
    trimmed.starts_with("<environment_context>") || trimmed.starts_with("<image")
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

pub fn scan_claude_sessions() -> Vec<SessionRecord> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };
    let root = home.join(".claude").join("projects");
    let mut files = Vec::new();
    collect_jsonl_files(&root, &mut files);
    files.retain(|p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|s| !s.starts_with("agent-"))
            .unwrap_or(true)
    });

    let mut sessions: Vec<SessionRecord> = files
        .into_iter()
        .filter_map(|path| parse_claude_session(&path))
        .collect();
    sessions.sort_by(|l, r| r.last_active_at.cmp(&l.last_active_at));
    sessions
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
        messages.push(SessionMessage { role, content });
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
        agent: "claude".to_string(),
        session_id: session_id.clone(),
        workspace_path,
        title,
        summary,
        source_path: path.to_string_lossy().to_string(),
        resume_command: format!("claude --resume {session_id}"),
        status: "active".to_string(),
        notes: String::new(),
        message_count: count_lines(path),
        started_at: started_at.clone(),
        last_active_at: last_active_at.unwrap_or(started_at),
    })
}

/* ── Gemini sessions ───────────────────────────────────────────── */

pub fn scan_gemini_sessions() -> Vec<SessionRecord> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };
    let tmp = home.join(".gemini").join("tmp");
    if !tmp.exists() {
        return Vec::new();
    }

    let mut files = Vec::new();
    if let Ok(project_dirs) = std::fs::read_dir(&tmp) {
        for entry in project_dirs.flatten() {
            let chats = entry.path().join("chats");
            if let Ok(chat_files) = std::fs::read_dir(&chats) {
                for f in chat_files.flatten() {
                    let p = f.path();
                    if p.extension().and_then(|e| e.to_str()) == Some("json") {
                        files.push(p);
                    }
                }
            }
        }
    }

    let mut sessions: Vec<SessionRecord> = files
        .into_iter()
        .filter_map(|path| parse_gemini_session(&path))
        .collect();
    sessions.sort_by(|l, r| r.last_active_at.cmp(&l.last_active_at));
    sessions
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
