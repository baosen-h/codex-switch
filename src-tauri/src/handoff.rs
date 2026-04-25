use crate::models::{HandoffPreview, Provider, SessionMessage};
use crate::session_manager::{session_messages_for_path, session_record_for_path};
use reqwest::blocking::Client;
use reqwest::header::{HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

#[derive(Clone, Copy)]
enum HandoffMode {
    Fast,
    Slow,
}

struct HandoffBudget {
    recent_tail: usize,
    important_user_messages: usize,
    important_files: usize,
    include_detailed_feedback: bool,
}

struct ImportantFile {
    path: String,
    reason: String,
}

struct ErrorFix {
    issue: String,
    fix: String,
}

pub fn build_session_handoff(
    path: &Path,
    mode: &str,
    provider: Option<&Provider>,
) -> Result<HandoffPreview, String> {
    let session = session_record_for_path(path)?;
    let messages = session_messages_for_path(path)?;
    let handoff_mode = parse_mode(mode)?;
    let budget = budget_for(handoff_mode);

    let meaningful_messages = collect_meaningful_messages(&session.agent, &messages);
    let primary_request =
        first_user_request(&meaningful_messages).unwrap_or_else(|| session.title.clone());
    let recent_tail = collect_recent_tail(&meaningful_messages, budget.recent_tail);
    let important_feedback =
        collect_important_user_messages(&meaningful_messages, primary_request.as_str(), &budget);
    let important_files = collect_important_files(
        &meaningful_messages,
        &session.workspace_path,
        budget.important_files,
    );
    let errors_and_fixes = collect_errors_and_fixes(&meaningful_messages);
    let current_work = derive_current_work(&meaningful_messages, &primary_request);
    let pending_tasks = derive_pending_tasks(&meaningful_messages, &primary_request);
    let next_step = derive_next_step(&meaningful_messages, &pending_tasks, &primary_request);
    let key_decisions = derive_key_decisions(&meaningful_messages, &important_files);
    let model_summary = if matches!(handoff_mode, HandoffMode::Slow) {
        let provider = provider.ok_or_else(|| {
            "Slow handoff needs an active Codex-compatible provider, but none is configured."
                .to_string()
        })?;
        Some(generate_slow_summary(
            provider,
            &session.agent,
            &session.title,
            &session.workspace_path,
            &primary_request,
            &meaningful_messages,
            &recent_tail,
        )?)
    } else {
        None
    };
    let content = render_handoff(
        &session.agent,
        &session.session_id,
        &session.workspace_path,
        &session.resume_command,
        handoff_mode,
        &primary_request,
        session.summary.as_deref(),
        model_summary.as_deref(),
        &important_feedback,
        &current_work,
        &pending_tasks,
        &next_step,
        &key_decisions,
        &errors_and_fixes,
        &important_files,
        &recent_tail,
    );

    Ok(HandoffPreview {
        mode: mode_label(handoff_mode).to_string(),
        title: session.title,
        session_id: session.session_id,
        source_agent: session.agent,
        content,
    })
}

fn generate_slow_summary(
    provider: &Provider,
    source_agent: &str,
    title: &str,
    workspace_path: &str,
    primary_request: &str,
    messages: &[SessionMessage],
    recent_tail: &[SessionMessage],
) -> Result<String, String> {
    validate_provider(provider)?;
    let preserve_count = recent_tail.len();
    let summarize_count = messages.len().saturating_sub(preserve_count);
    let summarize_messages = if summarize_count == 0 {
        messages
    } else {
        &messages[..summarize_count]
    };

    let transcript = render_transcript(summarize_messages, 14000);
    let preserved_tail = render_transcript(recent_tail, 3500);
    let prompt = format!(
        "Create a detailed continuation summary for a coding session being transferred to another agent.\n\
This summary must let the next agent continue seamlessly without re-asking the user.\n\
Respond with plain text only. No follow-up questions, disclaimers, or meta-commentary.\n\n\
Before writing the summary, analyze the conversation chronologically in an <analysis> block, then write the summary in a <summary> block.\n\
In your analysis, ensure you capture:\n\
- The user's explicit requests and every change of direction\n\
- Technical decisions, constraints, and rationale\n\
- Exact file paths, commands, and error messages when present\n\
- What has been completed vs what remains\n\n\
Follow this numbered structure inside <summary>:\n\
1. Primary Request and Intent\n\
   The user's original and evolved requests in detail.\n\
2. Key Technical Concepts\n\
   Technologies, frameworks, patterns, and architecture discussed.\n\
3. Files and Code Sections\n\
   Specific files examined, modified, or created — with why each matters.\n\
4. Errors and Fixes\n\
   All errors encountered and how they were resolved (or not).\n\
5. Problem Solving Progress\n\
   What was attempted, what worked, what was abandoned.\n\
6. All User Feedback\n\
   Every user correction, constraint, preference, and change of direction.\n\
   This section is critical — the next agent must not repeat mistakes the user already corrected.\n\
7. Pending Tasks\n\
   Explicitly assigned or implied tasks that remain.\n\
8. Current Work\n\
   Precisely what was being worked on when the session ended, including file names.\n\
9. Next Step\n\
   The single most important action the next agent should take first.\n\n\
Requirements:\n\
- Be precise and concrete — vague summaries cause the next agent to re-ask the user.\n\
- Preserve exact file paths, variable names, and command text.\n\
- If something is uncertain, say so rather than guessing.\n\
- Keep the summary complementary to the preserved recent messages — don't repeat what they already contain.\n\n\
Session metadata:\n\
- Source agent: {source_agent}\n\
- Session title: {title}\n\
- Workspace: {workspace_path}\n\
- Primary request: {primary_request}\n\
- Preserved recent message count: {preserve_count}\n\n\
Earlier conversation to summarize:\n\
{transcript}\n\n\
Recent preserved messages (will appear verbatim after this summary):\n\
{preserved_tail}\n"
    );

    let raw = call_codex_stream_summary(provider, &prompt).map_err(|error| {
        format!(
            "Slow handoff Codex-compatible summary failed for provider '{}' (agent={}, model={}): {}",
            provider.name, provider.agent, provider.model, error
        )
    })?;

    Ok(format_compact_summary(&raw))
}

fn validate_provider(provider: &Provider) -> Result<(), String> {
    if provider.api_key.trim().is_empty() {
        return Err(format!(
            "Provider '{}' has no API key configured.",
            provider.name
        ));
    }
    if provider.model.trim().is_empty() {
        return Err(format!(
            "Provider '{}' has no model configured.",
            provider.name
        ));
    }
    Ok(())
}

fn call_codex_stream_summary(provider: &Provider, prompt: &str) -> Result<String, String> {
    let base = if provider.base_url.trim().is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        provider.base_url.trim().trim_end_matches('/').to_string()
    };
    let url = if base.ends_with("/chat/completions") {
        base
    } else {
        format!("{base}/chat/completions")
    };

    let body = serde_json::json!({
        "model": provider.model.trim(),
        "messages": [
            {
                "role": "system",
                "content": "You are a precise coding session summarizer."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "stream": true
    });

    let response = Client::new()
        .post(url)
        .header(CONTENT_TYPE, "application/json")
        .header(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", provider.api_key.trim()))
                .map_err(|e| e.to_string())?,
        )
        .json(&body)
        .send()
        .map_err(|e| format!("Codex-compatible summary request failed: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("Codex-compatible summary response decode failed: {e}"))?;
    if !status.is_success() {
        let value: Result<Value, _> = serde_json::from_str(&text);
        return Err(value
            .ok()
            .and_then(|json| extract_error_message(&json))
            .unwrap_or_else(|| {
                format!(
                    "Codex-compatible summary failed with {status}: {}",
                    summarize_multiline(&text, 300)
                )
            }));
    }

    parse_sse_text(&text)
        .ok_or_else(|| "Codex-compatible streamed summary response was empty".to_string())
}

fn render_transcript(messages: &[SessionMessage], max_chars: usize) -> String {
    let mut out = String::new();
    for message in messages {
        let role = message.role.to_ascii_uppercase();
        let line = format!("[{role}] {}\n", summarize_multiline(&message.content, 700));
        if out.len() + line.len() > max_chars {
            break;
        }
        out.push_str(&line);
    }
    out
}

fn parse_sse_text(text: &str) -> Option<String> {
    let mut parts = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with("data: ") {
            continue;
        }
        let payload = &line[6..];
        if payload == "[DONE]" {
            break;
        }
        let Ok(value) = serde_json::from_str::<Value>(payload) else {
            continue;
        };
        if let Some(choices) = value.get("choices").and_then(Value::as_array) {
            for choice in choices {
                if let Some(delta) = choice.get("delta") {
                    if let Some(content) = delta.get("content").and_then(Value::as_str) {
                        parts.push(content.to_string());
                    }
                }
            }
        }
    }

    let joined = parts.join("");
    if joined.trim().is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn extract_error_message(value: &Value) -> Option<String> {
    value
        .get("error")
        .and_then(|error| {
            error
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| error.as_str().map(str::to_string))
        })
        .or_else(|| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn format_compact_summary(summary: &str) -> String {
    let mut formatted = summary.to_string();
    if let Some(start) = formatted.find("<analysis>") {
        if let Some(end) = formatted.find("</analysis>") {
            formatted.replace_range(start..end + "</analysis>".len(), "");
        }
    }
    if let Some(start) = formatted.find("<summary>") {
        if let Some(end) = formatted.find("</summary>") {
            let content = formatted[start + "<summary>".len()..end].trim().to_string();
            formatted.replace_range(start..end + "</summary>".len(), &content);
        }
    }
    formatted.trim().to_string()
}

fn parse_mode(value: &str) -> Result<HandoffMode, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "fast" => Ok(HandoffMode::Fast),
        "slow" => Ok(HandoffMode::Slow),
        "medium" => Ok(HandoffMode::Fast),
        other => Err(format!("Unknown handoff mode: {other}")),
    }
}

fn budget_for(mode: HandoffMode) -> HandoffBudget {
    match mode {
        HandoffMode::Fast => HandoffBudget {
            recent_tail: 8,
            important_user_messages: 3,
            important_files: 3,
            include_detailed_feedback: false,
        },
        HandoffMode::Slow => HandoffBudget {
            recent_tail: 24,
            important_user_messages: 8,
            important_files: 8,
            include_detailed_feedback: true,
        },
    }
}

fn mode_label(mode: HandoffMode) -> &'static str {
    match mode {
        HandoffMode::Fast => "fast",
        HandoffMode::Slow => "slow",
    }
}

fn collect_meaningful_messages(agent: &str, messages: &[SessionMessage]) -> Vec<SessionMessage> {
    messages
        .iter()
        .filter_map(|message| {
            let content = sanitize_message_content(&message.content);
            if content.is_empty() || is_structural_message(agent, &message.role, &content) {
                return None;
            }
            Some(SessionMessage {
                role: message.role.clone(),
                content,
                timestamp: message.timestamp.clone(),
            })
        })
        .collect()
}

fn is_structural_message(agent: &str, role: &str, content: &str) -> bool {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return true;
    }

    if agent == "codex" && role == "user" && trimmed.starts_with("<environment_context>") {
        return true;
    }

    if agent == "claude" && role == "user" {
        if trimmed.starts_with("This session is being continued from a previous conversation")
            || trimmed.starts_with("Summary:\n1. Primary Request and Intent:")
        {
            return true;
        }
    }

    trimmed.starts_with("<permissions instructions>")
        || trimmed.starts_with("<collaboration_mode>")
        || trimmed.starts_with("<personality_spec>")
        || trimmed.starts_with("<skills_instructions>")
        || trimmed.starts_with("<system-reminder>")
        || trimmed.starts_with("<turn_aborted>")
}

fn sanitize_message_content(content: &str) -> String {
    let mut result = content.replace('\r', "");

    result = strip_xml_tags(
        &result,
        &[
            "image",
            "environment_context",
            "permissions instructions",
            "collaboration_mode",
            "personality_spec",
            "skills_instructions",
            "system-reminder",
            "turn_aborted",
            "cwd",
            "shell",
            "current_date",
            "timezone",
        ],
    );

    result = strip_ansi_codes(&result);
    result = strip_tool_output_prefix(&result);

    let lines = result
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty()
        })
        .collect::<Vec<_>>();

    summarize_multiline(&lines.join(" "), 2000)
}

fn strip_xml_tags(text: &str, tags: &[&str]) -> String {
    let mut result = text.to_string();
    for tag in tags {
        let open = format!("<{tag}");
        let close = format!("</{tag}>");
        loop {
            let Some(start) = result.find(&open) else {
                break;
            };
            if let Some(close_pos) = result[start..].find(&close) {
                result.replace_range(start..start + close_pos + close.len(), "");
            } else if let Some(end_bracket) = result[start..].find('>') {
                result.replace_range(start..start + end_bracket + 1, "");
            } else {
                break;
            }
        }
    }
    result
}

fn strip_ansi_codes(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
                continue;
            }
        }
        result.push(ch);
    }
    result
}

fn strip_tool_output_prefix(text: &str) -> String {
    let mut result = text.to_string();
    while let Some(start) = result.find("Exit code:") {
        if let Some(output_pos) = result[start..].find("Output:") {
            let end = start + output_pos + "Output:".len();
            let trimmed = if end < result.len() && result.as_bytes()[end] == b' ' {
                end + 1
            } else {
                end
            };
            result.replace_range(start..trimmed, "");
        } else {
            break;
        }
    }
    while let Some(start) = result.find("Wall time:") {
        let end = result[start..]
            .find(|ch: char| ch == '\n')
            .map(|pos| start + pos)
            .unwrap_or(result.len());
        if end > start && end - start < 80 {
            result.replace_range(start..end, "");
        } else {
            break;
        }
    }
    result
}

fn first_user_request(messages: &[SessionMessage]) -> Option<String> {
    messages
        .iter()
        .find(|message| message.role == "user")
        .map(|message| summarize_line(&message.content, 320))
}

fn collect_recent_tail(messages: &[SessionMessage], limit: usize) -> Vec<SessionMessage> {
    let mut tail = messages
        .iter()
        .rev()
        .filter(|message| matches!(message.role.as_str(), "user" | "assistant" | "tool"))
        .take(limit)
        .cloned()
        .collect::<Vec<_>>();
    tail.reverse();
    tail
}

fn collect_important_user_messages(
    messages: &[SessionMessage],
    primary_request: &str,
    budget: &HandoffBudget,
) -> Vec<String> {
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    let keywords = [
        "don't", "do not", "instead", "change", "delete", "remove", "keep", "must", "should",
        "need", "bug", "fix", "wrong", "still", "same",
    ];

    for message in messages
        .iter()
        .rev()
        .filter(|message| message.role == "user")
    {
        let text = summarize_line(&message.content, 260);
        let normalized = text.to_ascii_lowercase();
        let important = budget.include_detailed_feedback
            || keywords.iter().any(|keyword| normalized.contains(keyword));

        if !important || text == primary_request || !seen.insert(text.clone()) {
            continue;
        }

        items.push(text);
        if items.len() >= budget.important_user_messages {
            break;
        }
    }

    items.reverse();
    items
}

fn derive_current_work(messages: &[SessionMessage], primary_request: &str) -> String {
    if let Some(message) = messages
        .iter()
        .rev()
        .find(|message| matches!(message.role.as_str(), "assistant" | "user"))
    {
        let prefix = if message.role == "assistant" {
            "Latest assistant state"
        } else {
            "Latest user request"
        };
        return format!("{prefix}: {}", summarize_line(&message.content, 320));
    }

    format!("Continue the main task that started with: {primary_request}")
}

fn derive_pending_tasks(messages: &[SessionMessage], primary_request: &str) -> Vec<String> {
    let mut pending = Vec::new();
    let mut last_assistant_index = None;

    for (index, message) in messages.iter().enumerate().rev() {
        if message.role == "assistant" {
            last_assistant_index = Some(index);
            break;
        }
    }

    if let Some(index) = last_assistant_index {
        for message in messages
            .iter()
            .skip(index + 1)
            .filter(|message| message.role == "user")
        {
            let item = summarize_line(&message.content, 240);
            if !item.is_empty() {
                pending.push(item);
            }
        }
    }

    if pending.is_empty() {
        pending.push(primary_request.to_string());
    }

    pending.truncate(4);
    pending
}

fn derive_next_step(
    messages: &[SessionMessage],
    pending_tasks: &[String],
    primary_request: &str,
) -> String {
    if let Some(latest_user) = messages.iter().rev().find(|message| message.role == "user") {
        return format!(
            "Start from the latest unresolved user request: {}",
            summarize_line(&latest_user.content, 220)
        );
    }

    if let Some(first_pending) = pending_tasks.first() {
        return format!("Continue with the pending task: {first_pending}");
    }

    format!("Continue the main request: {primary_request}")
}

fn derive_key_decisions(
    messages: &[SessionMessage],
    important_files: &[ImportantFile],
) -> Vec<String> {
    let mut decisions = Vec::new();
    let mut seen = HashSet::new();

    let decision_patterns = [
        "i'll ",
        "i will ",
        "let's ",
        "decided to ",
        "choosing ",
        "switched to ",
        "instead of ",
        "approach:",
        "plan:",
        "we should ",
        "going with ",
        "opted for ",
    ];

    for message in messages
        .iter()
        .rev()
        .filter(|message| message.role == "assistant")
    {
        let normalized = message.content.to_ascii_lowercase();
        let is_decision = decision_patterns.iter().any(|pat| normalized.contains(pat));
        if !is_decision {
            continue;
        }

        let item = summarize_line(&message.content, 260);
        let signature = item
            .chars()
            .take(80)
            .collect::<String>()
            .to_ascii_lowercase();
        if seen.insert(signature) {
            decisions.push(item);
        }

        if decisions.len() >= 4 {
            break;
        }
    }

    for message in messages
        .iter()
        .rev()
        .filter(|message| message.role == "user")
    {
        if decisions.len() >= 4 {
            break;
        }
        let normalized = message.content.to_ascii_lowercase();
        let is_constraint = normalized.contains("don't ")
            || normalized.contains("do not ")
            || normalized.contains("must ")
            || normalized.contains("never ");
        if !is_constraint {
            continue;
        }
        let item = format!("User constraint: {}", summarize_line(&message.content, 240));
        let signature = item
            .chars()
            .take(80)
            .collect::<String>()
            .to_ascii_lowercase();
        if seen.insert(signature) {
            decisions.push(item);
        }
    }

    if decisions.is_empty() && !important_files.is_empty() {
        decisions.push(format!(
            "Key files: {}",
            important_files
                .iter()
                .take(3)
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }

    decisions.reverse();
    decisions
}

fn collect_errors_and_fixes(messages: &[SessionMessage]) -> Vec<ErrorFix> {
    let mut items = Vec::new();
    let mut seen = HashSet::new();

    for (index, message) in messages.iter().enumerate() {
        if !matches!(message.role.as_str(), "assistant" | "user") {
            continue;
        }

        let normalized = message.content.to_ascii_lowercase();
        let has_error_signal = (normalized.contains("error")
            && !normalized.contains("error handling"))
            || normalized.contains("failed to")
            || normalized.contains("bug")
            || (normalized.contains("invalid") && normalized.contains("fix"));

        if !has_error_signal {
            continue;
        }

        let issue = summarize_line(&message.content, 260);
        let signature = issue
            .chars()
            .take(80)
            .collect::<String>()
            .to_ascii_lowercase();
        if !seen.insert(signature) {
            continue;
        }

        let fix = messages
            .iter()
            .skip(index + 1)
            .take(6)
            .find(|next| {
                matches!(next.role.as_str(), "assistant" | "user") && {
                    let text = next.content.to_ascii_lowercase();
                    text.contains("fix")
                        || text.contains("resolved")
                        || text.contains("solved")
                        || text.contains("updated")
                        || text.contains("now pass")
                        || text.contains("succeeded")
                }
            })
            .map(|next| summarize_line(&next.content, 260))
            .unwrap_or_else(|| "Unresolved — check recent messages for context.".to_string());

        items.push(ErrorFix { issue, fix });

        if items.len() >= 4 {
            break;
        }
    }

    items
}

fn collect_important_files(
    messages: &[SessionMessage],
    workspace_path: &str,
    limit: usize,
) -> Vec<ImportantFile> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    let workspace = workspace_path.trim().replace('/', "\\");

    for message in messages.iter().rev() {
        let role = message.role.as_str();
        let action = match role {
            "assistant" => classify_file_action(&message.content),
            "user" => "referenced by user".to_string(),
            _ => "mentioned in output".to_string(),
        };

        for token in message.content.split_whitespace() {
            let cleaned = token
                .trim_matches(|ch: char| {
                    matches!(
                        ch,
                        '"' | '\''
                            | '`'
                            | ','
                            | ';'
                            | '('
                            | ')'
                            | '['
                            | ']'
                            | '{'
                            | '}'
                            | '<'
                            | '>'
                    )
                })
                .replace('/', "\\");

            if !looks_like_file_path(&cleaned)
                || !is_relevant_file_path(&cleaned, &workspace)
                || !seen.insert(cleaned.clone())
            {
                continue;
            }

            files.push(ImportantFile {
                path: cleaned,
                reason: action.clone(),
            });

            if files.len() >= limit {
                return files;
            }
        }
    }

    files.reverse();
    files
}

fn classify_file_action(content: &str) -> String {
    let lower = content.to_ascii_lowercase();
    if lower.contains("creat") || lower.contains("wrote") || lower.contains("added new") {
        "created".to_string()
    } else if lower.contains("modif")
        || lower.contains("edit")
        || lower.contains("updat")
        || lower.contains("chang")
        || lower.contains("refactor")
    {
        "modified".to_string()
    } else if lower.contains("read") || lower.contains("inspect") || lower.contains("review") {
        "inspected".to_string()
    } else if lower.contains("delet") || lower.contains("remov") {
        "deleted".to_string()
    } else {
        "referenced".to_string()
    }
}

fn is_relevant_file_path(path: &str, workspace: &str) -> bool {
    if path.ends_with("SKILL.md") || path.ends_with("plugin.json") {
        return false;
    }
    if workspace.is_empty() {
        return !path.contains("\\.codex\\skills\\") && !path.contains("\\.claude\\");
    }
    if path.starts_with(workspace) {
        return true;
    }
    !path.contains(":\\") && !path.starts_with("\\")
}

fn looks_like_file_path(value: &str) -> bool {
    if value.len() < 3 || !value.contains('.') {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    let known_suffixes = [
        ".rs", ".ts", ".tsx", ".js", ".jsx", ".json", ".toml", ".md", ".css", ".html", ".yml",
        ".yaml", ".py", ".mjs", ".cjs", ".sql", ".lock",
    ];
    let has_suffix = known_suffixes.iter().any(|suffix| lower.ends_with(suffix));
    has_suffix && (value.contains('\\') || value.contains('/') || !value.contains(' '))
}

fn render_handoff(
    source_agent: &str,
    session_id: &str,
    workspace_path: &str,
    resume_command: &str,
    mode: HandoffMode,
    primary_request: &str,
    record_summary: Option<&str>,
    model_summary: Option<&str>,
    important_feedback: &[String],
    current_work: &str,
    pending_tasks: &[String],
    next_step: &str,
    key_decisions: &[String],
    errors_and_fixes: &[ErrorFix],
    important_files: &[ImportantFile],
    recent_tail: &[SessionMessage],
) -> String {
    if matches!(mode, HandoffMode::Fast) {
        return render_fast_handoff(
            source_agent,
            session_id,
            workspace_path,
            resume_command,
            primary_request,
            record_summary,
            important_feedback,
            current_work,
            pending_tasks,
            next_step,
            key_decisions,
            recent_tail,
        );
    }

    let mut lines = Vec::new();
    lines.push(
        "Continue this task from the session handoff below. Do not restart from zero.".to_string(),
    );
    lines.push("When the summary and preserved recent messages differ, trust the preserved recent messages.".to_string());
    lines.push(String::new());
    lines.push(format!("Mode: {}", mode_label(mode)));
    lines.push(format!("Source agent: {source_agent}"));
    lines.push(format!("Session id: {session_id}"));
    if !workspace_path.trim().is_empty() {
        lines.push(format!("Workspace: {workspace_path}"));
    }
    if !resume_command.trim().is_empty() {
        lines.push(format!("Resume command: {resume_command}"));
    }
    lines.push(String::new());
    lines.push("1. Primary Request And Intent".to_string());
    lines.push(primary_request.to_string());

    if let Some(summary) = model_summary.filter(|summary| !summary.trim().is_empty()) {
        lines.push(String::new());
        lines.push("2. Claude-Like Model Summary".to_string());
        lines.push(summary.to_string());
    } else if let Some(summary) = record_summary.filter(|summary| !summary.trim().is_empty()) {
        lines.push(String::new());
        lines.push("2. Existing Session Summary".to_string());
        lines.push(summary.to_string());
    }

    lines.push(String::new());
    lines.push("3. Current Work".to_string());
    lines.push(current_work.to_string());

    lines.push(String::new());
    lines.push("4. Pending Tasks".to_string());
    for task in pending_tasks {
        lines.push(format!("- {task}"));
    }

    lines.push(String::new());
    lines.push("5. Key Decisions And Constraints".to_string());
    if key_decisions.is_empty() && important_feedback.is_empty() {
        lines.push("- Preserve the original task direction from the session history.".to_string());
    } else {
        for decision in key_decisions {
            lines.push(format!("- {decision}"));
        }
        for feedback in important_feedback {
            lines.push(format!("- User feedback: {feedback}"));
        }
    }

    lines.push(String::new());
    lines.push("6. Errors And Fixes".to_string());
    if errors_and_fixes.is_empty() {
        lines.push("- No explicit error/fix pair was extracted. Use the preserved recent messages if you need exact troubleshooting context.".to_string());
    } else {
        for item in errors_and_fixes {
            lines.push(format!("- Issue: {}", item.issue));
            lines.push(format!("  Fix or follow-up: {}", item.fix));
        }
    }

    lines.push(String::new());
    lines.push("7. Important Files".to_string());
    if important_files.is_empty() {
        lines.push("- No file paths were extracted reliably from this session.".to_string());
    } else {
        for file in important_files {
            lines.push(format!("- {} — {}", file.path, file.reason));
        }
    }

    lines.push(String::new());
    lines.push("8. Preserved Recent Messages".to_string());
    if recent_tail.is_empty() {
        lines.push("- No recent message tail was preserved.".to_string());
    } else {
        for message in recent_tail {
            let role = message.role.to_ascii_uppercase();
            let content = format_tail_message(&message.role, &message.content, 400);
            lines.push(format!("[{role}] {content}"));
        }
    }

    lines.push(String::new());
    lines.push("9. Next Step".to_string());
    lines.push(next_step.to_string());

    lines.join("\n")
}

fn render_fast_handoff(
    source_agent: &str,
    session_id: &str,
    workspace_path: &str,
    resume_command: &str,
    primary_request: &str,
    record_summary: Option<&str>,
    important_feedback: &[String],
    current_work: &str,
    pending_tasks: &[String],
    next_step: &str,
    key_decisions: &[String],
    recent_tail: &[SessionMessage],
) -> String {
    let mut lines = Vec::new();
    lines.push(
        "Continue this task from the session handoff below. Do not restart from zero.".to_string(),
    );
    lines.push(String::new());
    lines.push("Mode: fast".to_string());
    lines.push(format!("Source agent: {source_agent}"));
    lines.push(format!("Session id: {session_id}"));
    if !workspace_path.trim().is_empty() {
        lines.push(format!("Workspace: {workspace_path}"));
    }
    if !resume_command.trim().is_empty() {
        lines.push(format!("Resume command: {resume_command}"));
    }

    lines.push(String::new());
    lines.push("1. Goal".to_string());
    lines.push(summarize_multiline(primary_request, 700));
    if let Some(summary) = record_summary.filter(|summary| !summary.trim().is_empty()) {
        lines.push(format!(
            "- Existing summary: {}",
            summarize_multiline(summary, 500)
        ));
    }

    lines.push(String::new());
    lines.push("2. Current State".to_string());
    lines.push(summarize_multiline(current_work, 700));

    lines.push(String::new());
    lines.push("3. Next Actions".to_string());
    if pending_tasks.is_empty() {
        lines.push(format!("- {}", summarize_multiline(next_step, 500)));
    } else {
        for task in pending_tasks.iter().take(4) {
            lines.push(format!("- {}", summarize_multiline(task, 320)));
        }
        lines.push(format!("- Next: {}", summarize_multiline(next_step, 420)));
    }

    lines.push(String::new());
    lines.push("4. Critical Context".to_string());
    let mut context_count = 0;
    for decision in key_decisions.iter().take(4) {
        lines.push(format!("- {}", summarize_multiline(decision, 320)));
        context_count += 1;
    }
    for feedback in important_feedback.iter().take(3) {
        lines.push(format!(
            "- User feedback: {}",
            summarize_multiline(feedback, 320)
        ));
        context_count += 1;
    }
    if context_count == 0 {
        lines.push("- Use the preserved recent messages as the source of truth.".to_string());
    }

    lines.push(String::new());
    lines.push("5. Recent Messages".to_string());
    if recent_tail.is_empty() {
        lines.push("- No recent message tail was preserved.".to_string());
    } else {
        for message in recent_tail
            .iter()
            .rev()
            .take(6)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            let role = message.role.to_ascii_uppercase();
            lines.push(format!(
                "[{role}] {}",
                format_tail_message(&message.role, &message.content, 260)
            ));
        }
    }

    lines.join("\n")
}

fn format_tail_message(role: &str, content: &str, max_chars: usize) -> String {
    if role == "tool" {
        let cleaned = strip_ansi_codes(content);
        let cleaned = strip_tool_output_prefix(&cleaned);
        let cleaned = cleaned.trim();
        if cleaned.is_empty() {
            return "[Tool output]".to_string();
        }
        return summarize_multiline(cleaned, max_chars);
    }

    if role == "assistant" {
        let trimmed = content.trim();
        if trimmed.starts_with("[Tool:") {
            if let Some(end) = trimmed.find(']') {
                let tool_name = &trimmed[6..end].trim();
                return format!("[Tool: {tool_name}]");
            }
        }
    }

    summarize_multiline(content, max_chars)
}

fn summarize_line(value: &str, max_chars: usize) -> String {
    summarize_multiline(value, max_chars)
}

fn summarize_multiline(value: &str, max_chars: usize) -> String {
    let flattened = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if flattened.chars().count() <= max_chars {
        return flattened;
    }

    let mut result = flattened.chars().take(max_chars).collect::<String>();
    result.push_str("...");
    result
}
