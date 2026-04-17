# Data Model

## Providers

- `id`
- `name`
- `base_url`
- `api_key`
- `model`
- `reasoning_effort`
- `extra_toml`
- `is_current`
- `created_at`
- `updated_at`

## Sessions

- `id`
- `provider_id`
- `provider_name`
- `workspace_path`
- `title`
- `session_ref`
- `status`
- `notes`
- `started_at`
- `last_active_at`

## Settings

- `codex_config_dir`
- `default_workspace`
- `terminal_program`
- `auto_record_sessions`
