# Data Model

## Providers

- `id`
- `name`
- `agent`
- `base_url`
- `api_key`
- `website_url`
- `model`
- `reasoning_effort`
- `extra_toml`
- `config_text`
- `is_current`
- `created_at`
- `updated_at`

## Sessions

- `id`
- `provider_id`
- `provider_name`
- `agent`
- `workspace_path`
- `title`
- `session_id`
- `summary`
- `source_path`
- `resume_command`
- `status`
- `notes`
- `message_count`
- `started_at`
- `last_active_at`

## Settings

- `codex_config_dir`
- `claude_config_dir`
- `gemini_config_dir`
- `default_workspace`
- `terminal_program`
- `auto_record_sessions`
- `language`
- `theme`
