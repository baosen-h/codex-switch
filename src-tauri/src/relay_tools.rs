use std::collections::BTreeSet;

use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelayToolOwner {
    CodexNative,
    ProviderNative,
    ProxyHosted,
    ServerSideOnly,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
pub struct RelayToolContext<'a> {
    pub provider_native_web_search: bool,
    pub model: &'a str,
}

impl<'a> RelayToolContext<'a> {
    pub fn new(provider_native_web_search: bool, model: &'a str) -> Self {
        Self {
            provider_native_web_search,
            model,
        }
    }
}

pub fn transform_tools(tools: &mut Value, context: RelayToolContext<'_>) {
    let Some(arr) = tools.as_array_mut() else {
        return;
    };
    let mut transformed: Vec<Value> = Vec::with_capacity(arr.len());
    for tool in arr.drain(..) {
        transform_tool(tool, context, &mut transformed);
    }
    *arr = transformed;
}

pub fn normalize_deepseek_tool_choice_in_payload(obj: &mut Map<String, Value>) {
    let function_tool_names = chat_function_tool_names(obj);
    if let Some(tool_choice) = obj.remove("tool_choice") {
        obj.insert(
            "tool_choice".to_string(),
            normalize_deepseek_tool_choice(tool_choice, &function_tool_names),
        );
    }
}

pub fn response_shell_alias_enabled(request_metadata: &Value) -> bool {
    let Some(tools) = request_metadata.get("tools") else {
        return false;
    };
    tool_tree_has_type(tools, "local_shell") && !tool_tree_has_name(tools, "shell")
}

pub fn canonical_response_tool_name(request_metadata: &Value, name: &str) -> String {
    if name == "shell" && response_shell_alias_enabled(request_metadata) {
        "shell_command".to_string()
    } else {
        name.to_string()
    }
}

pub fn normalize_response_tool_arguments(name: &str, raw: &str) -> String {
    let safe = salvage_tool_call_arguments(raw);
    if name != "shell_command" {
        return safe;
    }
    let Ok(mut value) = serde_json::from_str::<Value>(&safe) else {
        return safe;
    };
    let Some(obj) = value.as_object_mut() else {
        return safe;
    };

    if !obj.contains_key("command") {
        for alias in ["cmd", "script"] {
            if let Some(command) = obj.get(alias).and_then(command_value_to_string) {
                obj.insert("command".to_string(), Value::String(command));
                break;
            }
        }
    }
    if let Some(command) = obj.get("command").and_then(command_value_to_string) {
        obj.insert("command".to_string(), Value::String(command));
    }
    if !obj.contains_key("workdir") {
        for alias in ["cwd", "working_directory"] {
            if let Some(workdir) = obj.get(alias).and_then(Value::as_str) {
                obj.insert("workdir".to_string(), Value::String(workdir.to_string()));
                break;
            }
        }
    }

    serde_json::to_string(&value).unwrap_or(safe)
}

fn transform_tool(tool: Value, context: RelayToolContext<'_>, out: &mut Vec<Value>) {
    match classify_tool(&tool, context) {
        RelayToolOwner::CodexNative => transform_codex_native_tool(tool, context, out),
        RelayToolOwner::ProviderNative => transform_provider_native_tool(tool, context, out),
        RelayToolOwner::ProxyHosted => {
            let ttype = tool_type(&tool);
            eprintln!(
                "[relay_tools] dropping proxy-hosted tool type={:?} before upstream forwarding",
                ttype
            );
        }
        RelayToolOwner::ServerSideOnly => {
            let ttype = tool_type(&tool);
            eprintln!(
                "[relay_tools] drop server-side-only tool type={:?} (no chat_completions equivalent)",
                ttype
            );
        }
        RelayToolOwner::Unknown => {
            let ttype = tool_type(&tool);
            eprintln!(
                "[relay_tools] drop unknown tool type={:?} name={:?}",
                ttype,
                tool.get("name").or_else(|| tool.pointer("/function/name")),
            );
        }
    }
}

fn classify_tool(tool: &Value, context: RelayToolContext<'_>) -> RelayToolOwner {
    match tool_type(tool).as_str() {
        "function" | "local_shell" | "custom" | "tool_search" | "namespace" => {
            RelayToolOwner::CodexNative
        }
        "web_search" | "web_search_preview" => {
            if context.provider_native_web_search {
                RelayToolOwner::ProviderNative
            } else {
                RelayToolOwner::ProxyHosted
            }
        }
        ttype if is_server_side_only_tool(ttype) => RelayToolOwner::ServerSideOnly,
        _ => RelayToolOwner::Unknown,
    }
}

fn transform_codex_native_tool(tool: Value, context: RelayToolContext<'_>, out: &mut Vec<Value>) {
    let ttype = tool_type(&tool);
    match ttype.as_str() {
        "function" => {
            if let Some(t) = function_tool_as_chat(tool) {
                out.push(t);
            } else {
                eprintln!("[relay_tools] drop function tool without name");
            }
        }
        "local_shell" => {
            out.push(local_shell_as_function());
        }
        "custom" => transform_custom_tool(tool, out),
        "tool_search" => transform_tool_search(tool, out),
        "namespace" => {
            let nested = tool.get("tools").and_then(Value::as_array).cloned();
            match nested {
                Some(arr) if !arr.is_empty() => {
                    for inner in arr {
                        transform_tool(inner, context, out);
                    }
                }
                _ => {
                    let nsname = tool
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("(unnamed)");
                    eprintln!("[relay_tools] drop empty namespace tool {:?}", nsname);
                }
            }
        }
        _ => {}
    }
}

fn transform_provider_native_tool(
    tool: Value,
    context: RelayToolContext<'_>,
    out: &mut Vec<Value>,
) {
    let ttype = tool_type(&tool);
    match ttype.as_str() {
        "web_search" | "web_search_preview" if context.provider_native_web_search => {
            out.push(json!({
                "type": "web_search",
                "web_search": {
                    "enable": true,
                    "search_engine": "search_pro_jina",
                }
            }));
        }
        _ => {
            eprintln!(
                "[relay_tools] drop provider-native tool type={:?} for model={}",
                ttype, context.model
            );
        }
    }
}

fn transform_custom_tool(tool: Value, out: &mut Vec<Value>) {
    let name = tool.get("name").and_then(Value::as_str).map(String::from);
    let Some(name) = name else {
        eprintln!("[relay_tools] drop custom tool without name");
        return;
    };
    let format_type = tool
        .pointer("/format/type")
        .and_then(Value::as_str)
        .map(String::from);
    let desc_base = tool
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("");
    let description = match format_type {
        Some(ft) => format!(
            "{}{}(originally a \"{}\"-format custom tool; output should follow that format).",
            desc_base,
            if desc_base.is_empty() { "" } else { " " },
            ft
        ),
        None => desc_base.to_string(),
    };
    out.push(json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": {
                    "input": {"type": "string", "description": "Input text for the tool."}
                },
                "additionalProperties": true,
            }
        }
    }));
}

fn transform_tool_search(tool: Value, out: &mut Vec<Value>) {
    let description = tool
        .get("description")
        .cloned()
        .filter(|value| !value.is_null());
    let parameters = tool
        .get("parameters")
        .cloned()
        .filter(|value| !value.is_null());
    let mut function = Map::new();
    function.insert("name".to_string(), Value::String("tool_search".to_string()));
    if let Some(description) = description {
        function.insert("description".to_string(), description);
    }
    if let Some(parameters) = parameters {
        function.insert("parameters".to_string(), parameters);
    }
    out.push(json!({
        "type": "function",
        "function": Value::Object(function),
    }));
}

fn local_shell_as_function() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "shell_command",
            "description": "Run a PowerShell command on the local machine. Returns stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "PowerShell command string to execute."
                    },
                    "workdir": {"type": "string", "description": "Working directory (optional)."},
                    "timeout_ms": {"type": "integer", "description": "Timeout in ms (optional, default 30000)."},
                    "justification": {"type": "string", "description": "Approval reason when elevated permissions are required."},
                    "sandbox_permissions": {
                        "type": "string",
                        "enum": ["use_default", "require_escalated"],
                        "description": "Optional sandbox permission override."
                    },
                    "prefix_rule": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional reusable approval prefix."
                    }
                },
                "required": ["command"]
            }
        }
    })
}

fn function_tool_as_chat(tool: Value) -> Option<Value> {
    let obj = tool.as_object()?;
    if let Some(function) = obj.get("function").and_then(Value::as_object) {
        let name = function
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| !name.trim().is_empty())?;
        let mut function = function.clone();
        function.insert("name".to_string(), Value::String(name.to_string()));
        match function.get("strict") {
            Some(Value::Bool(_)) => {}
            _ => {
                function.remove("strict");
            }
        }
        return Some(json!({
            "type": "function",
            "function": Value::Object(function),
        }));
    }

    let name = obj
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())?;
    let mut function = Map::new();
    function.insert("name".to_string(), Value::String(name.to_string()));
    if let Some(description) = obj
        .get("description")
        .cloned()
        .filter(|value| !value.is_null())
    {
        function.insert("description".to_string(), description);
    }
    if let Some(parameters) = obj
        .get("parameters")
        .cloned()
        .filter(|value| !value.is_null())
    {
        function.insert("parameters".to_string(), parameters);
    }
    if let Some(strict @ Value::Bool(_)) = obj.get("strict").cloned() {
        function.insert("strict".to_string(), strict);
    }
    Some(json!({
        "type": "function",
        "function": Value::Object(function),
    }))
}

fn chat_function_tool_names(obj: &Map<String, Value>) -> BTreeSet<String> {
    obj.get("tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .filter_map(|tool| {
                    if tool.get("type").and_then(Value::as_str) != Some("function") {
                        return None;
                    }
                    tool.pointer("/function/name")
                        .and_then(Value::as_str)
                        .filter(|name| !name.trim().is_empty())
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_deepseek_tool_choice(value: Value, function_tool_names: &BTreeSet<String>) -> Value {
    match value {
        Value::String(choice) if matches!(choice.as_str(), "auto" | "none" | "required") => {
            Value::String(choice)
        }
        Value::Object(mut object) => {
            let name = object
                .get("function")
                .and_then(Value::as_object)
                .and_then(|function| function.get("name"))
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .map(str::to_string)
                .or_else(|| {
                    object.remove("name").and_then(|value| match value {
                        Value::String(name) if !name.trim().is_empty() => Some(name),
                        _ => None,
                    })
                });
            let Some(mut name) = name else {
                return Value::String("auto".to_string());
            };
            if name == "shell" && function_tool_names.contains("shell_command") {
                name = "shell_command".to_string();
            }
            if function_tool_names.contains(&name) {
                json!({
                    "type": "function",
                    "function": {
                        "name": name
                    }
                })
            } else {
                Value::String("auto".to_string())
            }
        }
        _ => Value::String("auto".to_string()),
    }
}

fn is_server_side_only_tool(t: &str) -> bool {
    matches!(
        t,
        "code_interpreter"
            | "file_search"
            | "image_generation"
            | "computer_use_preview"
            | "computer_use"
    )
}

fn tool_type(tool: &Value) -> String {
    tool.get("type")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_default()
}

fn tool_tree_has_type(value: &Value, target: &str) -> bool {
    match value {
        Value::Array(items) => items.iter().any(|item| tool_tree_has_type(item, target)),
        Value::Object(obj) => {
            obj.get("type").and_then(Value::as_str) == Some(target)
                || obj
                    .get("tools")
                    .is_some_and(|tools| tool_tree_has_type(tools, target))
        }
        _ => false,
    }
}

fn tool_tree_has_name(value: &Value, target: &str) -> bool {
    match value {
        Value::Array(items) => items.iter().any(|item| tool_tree_has_name(item, target)),
        Value::Object(obj) => {
            obj.get("name").and_then(Value::as_str) == Some(target)
                || obj
                    .get("function")
                    .and_then(Value::as_object)
                    .and_then(|function| function.get("name"))
                    .and_then(Value::as_str)
                    == Some(target)
                || obj
                    .get("tools")
                    .is_some_and(|tools| tool_tree_has_name(tools, target))
        }
        _ => false,
    }
}

fn salvage_tool_call_arguments(raw: &str) -> String {
    if raw.is_empty() || serde_json::from_str::<Value>(raw).is_ok() {
        raw.to_string()
    } else {
        "{}".to_string()
    }
}

fn command_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(command) if !command.trim().is_empty() => Some(command.clone()),
        Value::Array(parts) => {
            let parts = parts
                .iter()
                .filter_map(Value::as_str)
                .map(quote_command_part)
                .collect::<Vec<_>>();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join(" "))
            }
        }
        _ => None,
    }
}

fn quote_command_part(part: &str) -> String {
    if part.is_empty() {
        return "\"\"".to_string();
    }
    if part.chars().any(char::is_whitespace) || part.contains('"') {
        format!("\"{}\"", part.replace('`', "``").replace('"', "`\""))
    } else {
        part.to_string()
    }
}
