use crate::agent_writer::{
    default_claude_config_dir, default_codex_config_dir, default_gemini_config_dir,
    render_codex_oauth,
};
use crate::app_config::{APP_HOME_DIR, DB_FILE, LEGACY_APP_HOME_DIR, LEGACY_DB_FILE};
use crate::error::AppError;
use crate::models::{
    ApiProvider, AppSettings, DashboardState, MarketplaceSource, McpPreset, McpServer, McpTool,
    Provider, RemoteModel, SessionRecord, Skill, WebSearchSettings,
};
use crate::session_manager;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn new() -> Result<Self, AppError> {
        let app_dir = Self::app_data_dir()?;
        fs::create_dir_all(&app_dir)?;
        Self::migrate_legacy_database_files(&app_dir)?;
        let connection = Connection::open(app_dir.join(DB_FILE))?;

        let database = Self { connection };
        database.initialize()?;
        Ok(database)
    }

    pub fn dashboard(&self) -> Result<DashboardState, AppError> {
        let settings = self.settings()?;
        let api_providers = self.api_providers()?;
        let providers = self.providers()?;

        Ok(DashboardState {
            api_providers,
            sessions: self.live_sessions(&settings.codex_config_dir),
            providers,
            settings,
        })
    }

    pub fn providers(&self) -> Result<Vec<Provider>, AppError> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT id, name, agent, api_provider_id, base_url, api_key, website_url, model, wire_api, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
            FROM providers
            ORDER BY is_current DESC, updated_at DESC
            "#,
        )?;

        let rows = statement.query_map([], map_provider)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn provider_by_id(&self, id: &str) -> Result<Provider, AppError> {
        self.connection
            .query_row(
                r#"
                SELECT id, name, agent, api_provider_id, base_url, api_key, website_url, model, wire_api, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
                FROM providers
                WHERE id = ?1
                "#,
                params![id],
                map_provider,
            )
            .map_err(AppError::from)
    }

    pub fn save_provider(&self, provider: Provider) -> Result<Provider, AppError> {
        let now = current_time_string();
        let provider = self.with_linked_api_provider(provider)?;
        let provider_id = if provider.id.trim().is_empty() {
            format!("provider-{}", Uuid::new_v4())
        } else {
            provider.id.clone()
        };

        let created_at = self
            .connection
            .query_row(
                "SELECT created_at FROM providers WHERE id = ?1",
                params![provider_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| now.clone());

        let agent = if provider.agent.trim().is_empty() {
            "codex".to_string()
        } else {
            provider.agent.trim().to_string()
        };

        self.connection.execute(
            r#"
            INSERT INTO providers (
              id, name, agent, api_provider_id, base_url, api_key, website_url, model, wire_api, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, COALESCE((SELECT is_current FROM providers WHERE id = ?1), 0), ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              agent = excluded.agent,
              api_provider_id = excluded.api_provider_id,
              base_url = excluded.base_url,
              api_key = excluded.api_key,
              website_url = excluded.website_url,
              model = excluded.model,
              wire_api = excluded.wire_api,
              reasoning_effort = excluded.reasoning_effort,
              extra_toml = excluded.extra_toml,
              config_text = excluded.config_text,
              updated_at = excluded.updated_at
            "#,
            params![
                provider_id,
                provider.name.trim(),
                agent,
                provider.api_provider_id.trim(),
                provider.base_url.trim(),
                provider.api_key.trim(),
                provider.website_url.trim(),
                provider.model.trim(),
                normalized_wire_api(&provider.wire_api),
                provider.reasoning_effort.trim(),
                provider.extra_toml.trim(),
                provider.config_text,
                created_at,
                now
            ],
        )?;

        self.provider_by_id(&provider_id)
    }

    pub fn api_providers(&self) -> Result<Vec<ApiProvider>, AppError> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT id, name, provider_type, wire_api, base_url, api_key, website_url, open_ai_auth_json, models_json, enabled, created_at, updated_at
            FROM api_providers
            ORDER BY enabled DESC, updated_at DESC, name ASC
            "#,
        )?;

        let rows = statement.query_map([], map_api_provider)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn api_provider_by_id(&self, id: &str) -> Result<ApiProvider, AppError> {
        self.connection
            .query_row(
                r#"
                SELECT id, name, provider_type, wire_api, base_url, api_key, website_url, open_ai_auth_json, models_json, enabled, created_at, updated_at
                FROM api_providers
                WHERE id = ?1
                "#,
                params![id],
                map_api_provider,
            )
            .map_err(AppError::from)
    }

    pub fn save_api_provider(&self, provider: ApiProvider) -> Result<ApiProvider, AppError> {
        let now = current_time_string();
        let provider_id = if provider.id.trim().is_empty() {
            format!("api-provider-{}", Uuid::new_v4())
        } else {
            provider.id.clone()
        };
        let has_openai_oauth = provider
            .open_ai_auth_json
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());
        let provider_type = normalized_api_provider_type(&provider.provider_type, has_openai_oauth);
        if provider_type == "openai_oauth" && !has_openai_oauth {
            return Err(AppError::message(
                "OpenAI OAuth provider is not authorized yet. Complete login before saving.",
            ));
        }

        let created_at = self
            .connection
            .query_row(
                "SELECT created_at FROM api_providers WHERE id = ?1",
                params![provider_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| now.clone());
        let models_json =
            serde_json::to_string(&provider.models).unwrap_or_else(|_| "[]".to_string());

        self.connection.execute(
            r#"
            INSERT INTO api_providers (
              id, name, provider_type, wire_api, base_url, api_key, website_url, open_ai_auth_json, models_json, enabled, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              provider_type = excluded.provider_type,
              wire_api = excluded.wire_api,
              base_url = excluded.base_url,
              api_key = excluded.api_key,
              website_url = excluded.website_url,
              open_ai_auth_json = excluded.open_ai_auth_json,
              models_json = excluded.models_json,
              enabled = excluded.enabled,
              updated_at = excluded.updated_at
            "#,
            params![
                provider_id,
                provider.name.trim(),
                provider_type,
                normalized_wire_api(&provider.wire_api),
                provider.base_url.trim(),
                provider.api_key.trim(),
                provider.website_url.trim(),
                provider.open_ai_auth_json.as_deref().unwrap_or("").trim(),
                models_json,
                if provider.enabled { 1 } else { 0 },
                created_at,
                now,
            ],
        )?;

        let saved = self.api_provider_by_id(&provider_id)?;
        self.sync_linked_providers_from_api_provider(&saved, &now)?;
        Ok(saved)
    }

    pub fn delete_api_provider(&self, id: &str) -> Result<bool, AppError> {
        self.connection
            .execute("DELETE FROM api_providers WHERE id = ?1", params![id])?;
        self.connection.execute(
            "INSERT OR IGNORE INTO deleted_api_provider_seeds (id, deleted_at) VALUES (?1, ?2)",
            params![id, current_time_string()],
        )?;
        self.connection.execute(
            "UPDATE providers SET api_provider_id = '' WHERE api_provider_id = ?1",
            params![id],
        )?;
        Ok(true)
    }

    pub fn delete_provider(&self, id: &str) -> Result<bool, AppError> {
        self.connection
            .execute("DELETE FROM providers WHERE id = ?1", params![id])?;
        Ok(true)
    }

    pub fn activate_provider(&self, id: &str) -> Result<Provider, AppError> {
        // Clear is_current only among providers of the same agent (so each agent
        // tracks its own active provider).
        let agent: String = self.connection.query_row(
            "SELECT agent FROM providers WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )?;

        self.connection.execute(
            "UPDATE providers SET is_current = 0 WHERE agent = ?1",
            params![agent],
        )?;
        self.connection.execute(
            "UPDATE providers SET is_current = 1, updated_at = ?2 WHERE id = ?1",
            params![id, current_time_string()],
        )?;

        let provider = self.provider_by_id(id)?;
        let provider = self.with_linked_api_provider(provider)?;
        self.save_provider(provider)
    }

    pub fn current_provider_for_agent(&self, agent: &str) -> Result<Provider, AppError> {
        let id = self
            .connection
            .query_row(
                "SELECT id FROM providers WHERE is_current = 1 AND agent = ?1 LIMIT 1",
                params![agent],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| AppError::message("No active provider configured for this agent"))?;

        self.provider_by_id(&id)
    }

    fn with_linked_api_provider(&self, mut provider: Provider) -> Result<Provider, AppError> {
        let api_provider_id = provider.api_provider_id.trim();
        if api_provider_id.is_empty() {
            return Ok(provider);
        }
        let Ok(api_provider) = self.api_provider_by_id(api_provider_id) else {
            return Ok(provider);
        };

        let next_base_url = api_provider.base_url.trim().to_string();
        let next_api_key = api_provider.api_key.trim().to_string();
        let next_website_url = api_provider.website_url.trim().to_string();
        let next_wire_api = normalized_wire_api(&api_provider.wire_api);
        if api_provider.provider_type == "openai_oauth" && provider.agent == "codex" {
            let auth_json = api_provider
                .open_ai_auth_json
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    AppError::message(
                        "OpenAI OAuth provider is missing auth data. Complete login again.",
                    )
                })?;

            provider.base_url = String::new();
            provider.api_key = String::new();
            provider.website_url = next_website_url;
            provider.wire_api = "responses".to_string();
            provider.config_text = render_codex_oauth(&provider.model, auth_json);
            return Ok(provider);
        }

        let changed = provider.base_url != next_base_url
            || provider.api_key != next_api_key
            || provider.website_url != next_website_url
            || normalized_wire_api(&provider.wire_api) != next_wire_api;

        provider.base_url = next_base_url;
        provider.api_key = next_api_key;
        provider.website_url = next_website_url;
        provider.wire_api = next_wire_api;
        if changed && provider.agent == "codex" {
            provider.config_text.clear();
        }
        Ok(provider)
    }

    fn sync_linked_providers_from_api_provider(
        &self,
        api_provider: &ApiProvider,
        now: &str,
    ) -> Result<(), AppError> {
        let base_url = api_provider.base_url.trim();
        let api_key = api_provider.api_key.trim();
        let website_url = api_provider.website_url.trim();
        let wire_api = normalized_wire_api(&api_provider.wire_api);

        self.connection.execute(
            r#"
            UPDATE providers
            SET
              config_text = CASE
                WHEN agent = 'codex'
                  AND (
                    base_url <> ?1
                    OR api_key <> ?2
                    OR website_url <> ?3
                    OR wire_api <> ?4
                  )
                THEN ''
                ELSE config_text
              END,
              base_url = ?1,
              api_key = ?2,
              website_url = ?3,
              wire_api = ?4,
              updated_at = CASE
                WHEN base_url <> ?1
                  OR api_key <> ?2
                  OR website_url <> ?3
                  OR wire_api <> ?4
                THEN ?5
                ELSE updated_at
              END
            WHERE api_provider_id = ?6
            "#,
            params![
                base_url,
                api_key,
                website_url,
                wire_api,
                now,
                api_provider.id
            ],
        )?;
        Ok(())
    }

    pub fn settings(&self) -> Result<AppSettings, AppError> {
        Ok(AppSettings {
            codex_config_dir: self.setting("codex_config_dir")?,
            claude_config_dir: self.setting("claude_config_dir")?,
            gemini_config_dir: self.setting("gemini_config_dir")?,
            default_workspace: self.setting("default_workspace")?,
            terminal_program: self.setting("terminal_program")?,
            auto_record_sessions: self.setting("auto_record_sessions")? == "true",
            language: self.setting("language")?,
            background_color: self.setting("background_color")?,
            theme: self.setting("theme")?,
            vision_fallback_enabled: self.setting("vision_fallback_enabled")? == "true",
            vision_api_provider_id: self.setting("vision_api_provider_id")?,
            vision_model: self.setting("vision_model")?,
            vision_chat_enabled: self.setting("vision_chat_enabled")? == "true",
            vision_codex_enabled: self.setting("vision_codex_enabled")? == "true",
            vision_claude_enabled: self.setting("vision_claude_enabled")? == "true",
            vision_gemini_enabled: self.setting("vision_gemini_enabled")? == "true",
            web_search: serde_json::from_str(&self.setting("web_search")?).unwrap_or_default(),
        })
    }

    pub fn save_settings(&self, settings: AppSettings) -> Result<AppSettings, AppError> {
        let web_search = settings.web_search.normalized();
        self.set_setting("codex_config_dir", settings.codex_config_dir.clone())?;
        self.set_setting("claude_config_dir", settings.claude_config_dir.clone())?;
        self.set_setting("gemini_config_dir", settings.gemini_config_dir.clone())?;
        self.set_setting("default_workspace", settings.default_workspace.clone())?;
        self.set_setting("terminal_program", settings.terminal_program.clone())?;
        self.set_setting(
            "auto_record_sessions",
            if settings.auto_record_sessions {
                "true".to_string()
            } else {
                "false".to_string()
            },
        )?;
        self.set_setting("language", settings.language.clone())?;
        self.set_setting("background_color", settings.background_color.clone())?;
        self.set_setting("theme", settings.theme.clone())?;
        self.set_setting(
            "vision_fallback_enabled",
            settings.vision_fallback_enabled.to_string(),
        )?;
        self.set_setting(
            "vision_api_provider_id",
            settings.vision_api_provider_id.clone(),
        )?;
        self.set_setting("vision_model", settings.vision_model.clone())?;
        self.set_setting(
            "vision_chat_enabled",
            settings.vision_chat_enabled.to_string(),
        )?;
        self.set_setting(
            "vision_codex_enabled",
            settings.vision_codex_enabled.to_string(),
        )?;
        self.set_setting(
            "vision_claude_enabled",
            settings.vision_claude_enabled.to_string(),
        )?;
        self.set_setting(
            "vision_gemini_enabled",
            settings.vision_gemini_enabled.to_string(),
        )?;
        self.set_setting(
            "web_search",
            serde_json::to_string(&web_search).map_err(AppError::from)?,
        )?;
        self.settings()
    }

    fn app_data_dir() -> Result<PathBuf, AppError> {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::message("Unable to determine home directory"))?;
        Ok(home.join(APP_HOME_DIR))
    }

    fn migrate_legacy_database_files(app_dir: &PathBuf) -> Result<(), AppError> {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::message("Unable to determine home directory"))?;
        let legacy_dir = home.join(LEGACY_APP_HOME_DIR);
        let target_db = app_dir.join(DB_FILE);
        let target_wal = app_dir.join(format!("{DB_FILE}-wal"));
        let target_shm = app_dir.join(format!("{DB_FILE}-shm"));

        if !target_db.exists() {
            let legacy_db = legacy_dir.join(LEGACY_DB_FILE);
            if legacy_db.exists() {
                fs::create_dir_all(app_dir)?;
                fs::copy(&legacy_db, &target_db)?;
            }
        }
        if !target_wal.exists() {
            let legacy_wal = legacy_dir.join(format!("{LEGACY_DB_FILE}-wal"));
            if legacy_wal.exists() {
                fs::copy(&legacy_wal, &target_wal)?;
            }
        }
        if !target_shm.exists() {
            let legacy_shm = legacy_dir.join(format!("{LEGACY_DB_FILE}-shm"));
            if legacy_shm.exists() {
                fs::copy(&legacy_shm, &target_shm)?;
            }
        }
        Ok(())
    }

    fn initialize(&self) -> Result<(), AppError> {
        self.connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS providers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              agent TEXT NOT NULL DEFAULT 'codex',
              api_provider_id TEXT NOT NULL DEFAULT '',
              base_url TEXT NOT NULL DEFAULT '',
              api_key TEXT NOT NULL DEFAULT '',
              website_url TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL,
              wire_api TEXT NOT NULL DEFAULT 'responses',
              reasoning_effort TEXT NOT NULL DEFAULT 'high',
              extra_toml TEXT NOT NULL DEFAULT '',
              config_text TEXT NOT NULL DEFAULT '',
              is_current INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS api_providers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
              wire_api TEXT NOT NULL DEFAULT 'responses',
              base_url TEXT NOT NULL DEFAULT '',
              api_key TEXT NOT NULL DEFAULT '',
              website_url TEXT NOT NULL DEFAULT '',
              open_ai_auth_json TEXT NOT NULL DEFAULT '',
              models_json TEXT NOT NULL DEFAULT '[]',
              enabled INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS deleted_api_provider_seeds (
              id TEXT PRIMARY KEY,
              deleted_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mcp_servers (
              id TEXT PRIMARY KEY,
              target_key TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL COLLATE NOCASE UNIQUE,
              description TEXT NOT NULL DEFAULT '',
              transport TEXT NOT NULL DEFAULT 'stdio',
              command TEXT NOT NULL DEFAULT '',
              args_json TEXT NOT NULL DEFAULT '[]',
              working_directory TEXT NOT NULL DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              env_json TEXT NOT NULL DEFAULT '{}',
              headers_json TEXT NOT NULL DEFAULT '{}',
              targets_json TEXT NOT NULL DEFAULT '{}',
              last_test_status TEXT NOT NULL DEFAULT '',
              last_test_error TEXT NOT NULL DEFAULT '',
              last_test_at TEXT NOT NULL DEFAULT '',
              cached_tools_json TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mcp_presets (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL COLLATE NOCASE UNIQUE,
              description TEXT NOT NULL DEFAULT '',
              transport TEXT NOT NULL DEFAULT 'stdio',
              command TEXT NOT NULL DEFAULT '',
              args_json TEXT NOT NULL DEFAULT '[]',
              working_directory TEXT NOT NULL DEFAULT '',
              url TEXT NOT NULL DEFAULT '',
              env_json TEXT NOT NULL DEFAULT '{}',
              headers_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS skills (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL COLLATE NOCASE UNIQUE,
              description TEXT NOT NULL DEFAULT '',
              instructions TEXT NOT NULL,
              source_path TEXT NOT NULL,
              source_kind TEXT NOT NULL DEFAULT 'external',
              sync_mode TEXT NOT NULL DEFAULT 'reference',
              targets_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS capability_sync_state (
              capability_type TEXT NOT NULL,
              target_agent TEXT NOT NULL,
              last_synced_hash TEXT NOT NULL DEFAULT '',
              last_synced_at TEXT NOT NULL DEFAULT '',
              last_status TEXT NOT NULL DEFAULT '',
              last_error TEXT NOT NULL DEFAULT '',
              PRIMARY KEY(capability_type, target_agent)
            );

            CREATE TABLE IF NOT EXISTS capability_delete_backups (
              id TEXT PRIMARY KEY,
              capability_type TEXT NOT NULL,
              capability_id TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              trash_path TEXT NOT NULL DEFAULT '',
              deleted_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS marketplace_sources (
              id TEXT PRIMARY KEY,
              capability_type TEXT NOT NULL,
              name TEXT NOT NULL,
              source_type TEXT NOT NULL,
              base_url TEXT NOT NULL DEFAULT '',
              enabled INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0,
              built_in INTEGER NOT NULL DEFAULT 0,
              credential_id TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS marketplace_installs (
              capability_type TEXT NOT NULL,
              capability_id TEXT NOT NULL,
              source_id TEXT NOT NULL DEFAULT '',
              canonical_id TEXT NOT NULL DEFAULT '',
              source_version TEXT NOT NULL DEFAULT '',
              source_url TEXT NOT NULL DEFAULT '',
              artifact_url TEXT NOT NULL DEFAULT '',
              artifact_sha256 TEXT NOT NULL DEFAULT '',
              installed_hash TEXT NOT NULL DEFAULT '',
              update_version TEXT NOT NULL DEFAULT '',
              checked_at TEXT NOT NULL DEFAULT '',
              PRIMARY KEY(capability_type, capability_id)
            );
            "#,
        )?;

        ensure_column(
            &self.connection,
            "mcp_servers",
            "source_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "mcp_servers",
            "canonical_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "mcp_servers",
            "source_version",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "mcp_servers",
            "source_url",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "mcp_servers",
            "installed_hash",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "mcp_servers",
            "update_version",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "source_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "canonical_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "source_version",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "source_url",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "installed_hash",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "skills",
            "update_version",
            "TEXT NOT NULL DEFAULT ''",
        )?;

        self.connection.execute_batch(
            r#"
            INSERT OR IGNORE INTO marketplace_sources
              (id, capability_type, name, source_type, base_url, enabled, sort_order, built_in)
            VALUES
              ('skill-skills-sh', 'skills', 'skills.sh', 'skills_sh', 'https://skills.sh', 1, 10, 1),
              ('skill-claude-plugins', 'skills', 'claude-plugins.dev', 'claude_plugins', 'https://claude-plugins.dev', 1, 20, 1),
              ('skill-clawhub', 'skills', 'clawhub.ai', 'clawhub', 'https://clawhub.ai', 1, 30, 1),
              ('skill-hermes-index', 'skills', 'Hermes Skills Hub', 'hermes_index', 'https://hermes-agent.nousresearch.com/docs/api/skills-index.json', 1, 40, 1),
              ('mcp-official', 'mcp', 'Official MCP Registry', 'mcp_registry', 'https://registry.modelcontextprotocol.io', 1, 10, 1);
            "#,
        )?;

        // Forward-migrations for DBs created before agent/config_text existed.
        ensure_column(
            &self.connection,
            "providers",
            "agent",
            "TEXT NOT NULL DEFAULT 'codex'",
        )?;
        ensure_column(
            &self.connection,
            "providers",
            "api_provider_id",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "providers",
            "config_text",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "providers",
            "wire_api",
            "TEXT NOT NULL DEFAULT 'responses'",
        )?;
        ensure_column(
            &self.connection,
            "api_providers",
            "wire_api",
            "TEXT NOT NULL DEFAULT 'responses'",
        )?;
        ensure_column(
            &self.connection,
            "api_providers",
            "open_ai_auth_json",
            "TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &self.connection,
            "providers",
            "website_url",
            "TEXT NOT NULL DEFAULT ''",
        )?;

        self.connection.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_providers_agent_current
            ON providers(agent, is_current);

            CREATE INDEX IF NOT EXISTS idx_providers_updated_at
            ON providers(updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_api_providers_updated_at
            ON api_providers(updated_at DESC);

            UPDATE api_providers
            SET provider_type = CASE
              WHEN trim(open_ai_auth_json) <> '' THEN 'openai_oauth'
              ELSE 'openai_apikey'
            END
            WHERE provider_type = 'openai';
            "#,
        )?;

        self.seed_api_providers_from_agent_configs()?;

        self.ensure_setting(
            "codex_config_dir",
            default_codex_config_dir().to_string_lossy().to_string(),
        )?;
        self.ensure_setting(
            "claude_config_dir",
            default_claude_config_dir().to_string_lossy().to_string(),
        )?;
        self.ensure_setting(
            "gemini_config_dir",
            default_gemini_config_dir().to_string_lossy().to_string(),
        )?;
        self.ensure_setting("default_workspace", String::new())?;
        self.ensure_setting("terminal_program", "pwsh".to_string())?;
        self.ensure_setting("auto_record_sessions", "true".to_string())?;
        self.ensure_setting("language", "en".to_string())?;
        self.ensure_setting("background_color", "system".to_string())?;
        self.ensure_setting("theme", "professional".to_string())?;
        self.ensure_setting("vision_fallback_enabled", "false".to_string())?;
        self.ensure_setting("vision_api_provider_id", String::new())?;
        self.ensure_setting("vision_model", String::new())?;
        self.ensure_setting("vision_chat_enabled", "true".to_string())?;
        self.ensure_setting("vision_codex_enabled", "true".to_string())?;
        self.ensure_setting("vision_claude_enabled", "true".to_string())?;
        self.ensure_setting("vision_gemini_enabled", "true".to_string())?;
        self.ensure_setting(
            "web_search",
            serde_json::to_string(&WebSearchSettings::default()).map_err(AppError::from)?,
        )?;

        let theme = self.setting("theme")?;
        if matches!(theme.as_str(), "system" | "dark" | "light") {
            self.set_setting("background_color", theme.clone())?;
            self.set_setting("theme", "professional".to_string())?;
        }
        if theme == "anime" {
            self.set_setting("theme", "professional".to_string())?;
        }
        self.connection
            .execute("DELETE FROM settings WHERE key = 'background_scene'", [])?;

        Ok(())
    }

    pub fn mcp_servers(&self) -> Result<Vec<McpServer>, AppError> {
        let mut statement = self.connection.prepare(
            r#"SELECT id, target_key, name, description, transport, command, args_json,
            working_directory, url, env_json, headers_json, targets_json, last_test_status,
            last_test_error, last_test_at, cached_tools_json, created_at, updated_at
            FROM mcp_servers ORDER BY name COLLATE NOCASE"#,
        )?;
        let rows = statement.query_map([], |row| {
            Ok(McpServer {
                id: row.get(0)?,
                target_key: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                transport: row.get(4)?,
                command: row.get(5)?,
                args: json_column(row.get(6)?),
                working_directory: row.get(7)?,
                url: row.get(8)?,
                env: json_column(row.get(9)?),
                headers: json_column(row.get(10)?),
                targets: json_column(row.get(11)?),
                last_test_status: row.get(12)?,
                last_test_error: row.get(13)?,
                last_test_at: row.get(14)?,
                cached_tools: json_column(row.get(15)?),
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn save_mcp_server(&self, mut server: McpServer) -> Result<McpServer, AppError> {
        let now = current_time_string();
        if server.id.trim().is_empty() {
            server.id = Uuid::new_v4().to_string();
        }
        if server.target_key.trim().is_empty() {
            server.target_key = capability_target_key(&server.name, &server.id);
        }
        let created_at = self
            .connection
            .query_row(
                "SELECT created_at FROM mcp_servers WHERE id = ?1",
                params![server.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| now.clone());
        self.connection.execute(
            r#"INSERT INTO mcp_servers (
              id, target_key, name, description, transport, command, args_json,
              working_directory, url, env_json, headers_json, targets_json,
              last_test_status, last_test_error, last_test_at, cached_tools_json,
              created_at, updated_at
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, description=excluded.description, transport=excluded.transport,
              command=excluded.command, args_json=excluded.args_json,
              working_directory=excluded.working_directory, url=excluded.url,
              env_json=excluded.env_json, headers_json=excluded.headers_json,
              targets_json=excluded.targets_json, updated_at=excluded.updated_at"#,
            params![
                server.id,
                server.target_key,
                server.name.trim(),
                server.description.trim(),
                server.transport,
                server.command.trim(),
                serde_json::to_string(&server.args)?,
                server.working_directory.trim(),
                server.url.trim(),
                serde_json::to_string(&server.env)?,
                serde_json::to_string(&server.headers)?,
                serde_json::to_string(&server.targets)?,
                server.last_test_status,
                server.last_test_error,
                server.last_test_at,
                serde_json::to_string(&server.cached_tools)?,
                created_at,
                now,
            ],
        )?;
        self.mcp_servers()?
            .into_iter()
            .find(|item| item.id == server.id)
            .ok_or_else(|| AppError::message("Saved MCP server was not found"))
    }

    pub fn update_mcp_test(
        &self,
        id: &str,
        status: &str,
        error: &str,
        tools: &[McpTool],
    ) -> Result<(), AppError> {
        self.connection.execute(
            "UPDATE mcp_servers SET last_test_status=?2,last_test_error=?3,last_test_at=?4,cached_tools_json=?5 WHERE id=?1",
            params![id, status, error, current_time_string(), serde_json::to_string(tools)?],
        )?;
        Ok(())
    }

    pub fn delete_mcp_server_record(&self, id: &str) -> Result<Option<McpServer>, AppError> {
        let server = self.mcp_servers()?.into_iter().find(|item| item.id == id);
        if let Some(ref item) = server {
            self.save_capability_backup("mcp", id, &serde_json::to_string(item)?, "")?;
            self.connection
                .execute("DELETE FROM mcp_servers WHERE id=?1", params![id])?;
        }
        Ok(server)
    }

    pub fn mcp_presets(&self) -> Result<Vec<McpPreset>, AppError> {
        let mut presets = builtin_mcp_presets();
        let mut statement = self.connection.prepare(
            r#"SELECT id,name,description,transport,command,args_json,working_directory,url,
            env_json,headers_json FROM mcp_presets ORDER BY name COLLATE NOCASE"#,
        )?;
        let rows = statement.query_map([], |row| {
            Ok(McpPreset {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                built_in: false,
                transport: row.get(3)?,
                command: row.get(4)?,
                args: json_column(row.get(5)?),
                working_directory: row.get(6)?,
                url: row.get(7)?,
                env: json_column(row.get(8)?),
                headers: json_column(row.get(9)?),
            })
        })?;
        presets.extend(rows.filter_map(Result::ok));
        Ok(presets)
    }

    pub fn save_mcp_preset(&self, mut preset: McpPreset) -> Result<McpPreset, AppError> {
        if preset.built_in {
            return Err(AppError::message("Built-in presets are read-only"));
        }
        if preset.id.trim().is_empty() {
            preset.id = Uuid::new_v4().to_string();
        }
        let now = current_time_string();
        self.connection.execute(
            r#"INSERT INTO mcp_presets (id,name,description,transport,command,args_json,
            working_directory,url,env_json,headers_json,created_at,updated_at)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
            transport=excluded.transport,command=excluded.command,args_json=excluded.args_json,
            working_directory=excluded.working_directory,url=excluded.url,env_json=excluded.env_json,
            headers_json=excluded.headers_json,updated_at=excluded.updated_at"#,
            params![preset.id,preset.name.trim(),preset.description.trim(),preset.transport,
                preset.command.trim(),serde_json::to_string(&preset.args)?,preset.working_directory.trim(),
                preset.url.trim(),serde_json::to_string(&preset.env)?,serde_json::to_string(&preset.headers)?,now],
        )?;
        preset.built_in = false;
        Ok(preset)
    }

    pub fn delete_mcp_preset(&self, id: &str) -> Result<(), AppError> {
        self.connection
            .execute("DELETE FROM mcp_presets WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn skills(&self) -> Result<Vec<Skill>, AppError> {
        let mut statement = self.connection.prepare(
            r#"SELECT id,name,description,instructions,source_path,source_kind,sync_mode,
            targets_json,created_at,updated_at FROM skills ORDER BY name COLLATE NOCASE"#,
        )?;
        let rows = statement.query_map([], |row| {
            Ok(Skill {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                instructions: row.get(3)?,
                source_path: row.get(4)?,
                source_kind: row.get(5)?,
                sync_mode: row.get(6)?,
                targets: json_column(row.get(7)?),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn save_skill(&self, mut skill: Skill) -> Result<Skill, AppError> {
        let now = current_time_string();
        if skill.id.trim().is_empty() {
            skill.id = Uuid::new_v4().to_string();
        }
        let created_at = self
            .connection
            .query_row(
                "SELECT created_at FROM skills WHERE id=?1",
                params![skill.id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| now.clone());
        self.connection.execute(
            r#"INSERT INTO skills (id,name,description,instructions,source_path,source_kind,
            sync_mode,targets_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
            instructions=excluded.instructions,source_path=excluded.source_path,
            source_kind=excluded.source_kind,sync_mode=excluded.sync_mode,
            targets_json=excluded.targets_json,updated_at=excluded.updated_at"#,
            params![
                skill.id,
                skill.name.trim(),
                skill.description.trim(),
                skill.instructions,
                skill.source_path,
                skill.source_kind,
                skill.sync_mode,
                serde_json::to_string(&skill.targets)?,
                created_at,
                now
            ],
        )?;
        self.skills()?
            .into_iter()
            .find(|item| item.id == skill.id)
            .ok_or_else(|| AppError::message("Saved skill was not found"))
    }

    pub fn delete_skill_record(
        &self,
        id: &str,
        trash_path: &str,
    ) -> Result<Option<Skill>, AppError> {
        let skill = self.skills()?.into_iter().find(|item| item.id == id);
        if let Some(ref item) = skill {
            self.save_capability_backup("skill", id, &serde_json::to_string(item)?, trash_path)?;
            self.connection
                .execute("DELETE FROM skills WHERE id=?1", params![id])?;
        }
        Ok(skill)
    }

    pub fn set_sync_state(
        &self,
        capability_type: &str,
        agent: &str,
        hash: &str,
        status: &str,
        error: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            r#"INSERT INTO capability_sync_state (capability_type,target_agent,last_synced_hash,last_synced_at,last_status,last_error)
            VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(capability_type,target_agent) DO UPDATE SET
            last_synced_hash=excluded.last_synced_hash,last_synced_at=excluded.last_synced_at,
            last_status=excluded.last_status,last_error=excluded.last_error"#,
            params![capability_type,agent,hash,current_time_string(),status,error],
        )?;
        Ok(())
    }

    pub fn sync_state(
        &self,
        capability_type: &str,
        agent: &str,
    ) -> Result<Option<(String, String, String)>, AppError> {
        Ok(self.connection.query_row(
            "SELECT last_synced_hash,last_status,last_error FROM capability_sync_state WHERE capability_type=?1 AND target_agent=?2",
            params![capability_type,agent],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
        ).optional()?)
    }

    pub fn marketplace_sources(
        &self,
        capability_type: &str,
    ) -> Result<Vec<MarketplaceSource>, AppError> {
        let mut statement = self.connection.prepare(
            r#"SELECT id,capability_type,name,source_type,base_url,enabled,sort_order,built_in,credential_id
               FROM marketplace_sources WHERE capability_type=?1 ORDER BY sort_order,name COLLATE NOCASE"#,
        )?;
        let rows = statement.query_map(params![capability_type], |row| {
            let credential_id: String = row.get(8)?;
            Ok(MarketplaceSource {
                id: row.get(0)?,
                capability_type: row.get(1)?,
                name: row.get(2)?,
                source_type: row.get(3)?,
                base_url: row.get(4)?,
                enabled: row.get::<_, i64>(5)? != 0,
                sort_order: row.get(6)?,
                built_in: row.get::<_, i64>(7)? != 0,
                has_credential: !credential_id.is_empty(),
                credential_id,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn save_marketplace_source(
        &self,
        mut source: MarketplaceSource,
    ) -> Result<MarketplaceSource, AppError> {
        if source.id.trim().is_empty() {
            source.id = Uuid::new_v4().to_string();
        }
        self.connection.execute(
            r#"INSERT INTO marketplace_sources
               (id,capability_type,name,source_type,base_url,enabled,sort_order,built_in,credential_id)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
               ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_type=excluded.source_type,
               base_url=excluded.base_url,enabled=excluded.enabled,sort_order=excluded.sort_order,
               credential_id=excluded.credential_id"#,
            params![
                source.id,
                source.capability_type,
                source.name.trim(),
                source.source_type,
                source.base_url.trim().trim_end_matches('/'),
                source.enabled as i64,
                source.sort_order,
                source.built_in as i64,
                source.credential_id,
            ],
        )?;
        self.marketplace_sources(&source.capability_type)?
            .into_iter()
            .find(|item| item.id == source.id)
            .ok_or_else(|| AppError::message("Saved marketplace source was not found"))
    }

    pub fn delete_marketplace_source(&self, id: &str) -> Result<(), AppError> {
        let built_in = self
            .connection
            .query_row(
                "SELECT built_in FROM marketplace_sources WHERE id=?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        if built_in == Some(1) {
            return Err(AppError::message(
                "Built-in marketplace sources cannot be removed",
            ));
        }
        self.connection
            .execute("DELETE FROM marketplace_sources WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn save_marketplace_install(
        &self,
        capability_type: &str,
        capability_id: &str,
        source_id: &str,
        canonical_id: &str,
        source_version: &str,
        source_url: &str,
        artifact_url: &str,
        artifact_sha256: &str,
        installed_hash: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            r#"INSERT INTO marketplace_installs
               (capability_type,capability_id,source_id,canonical_id,source_version,source_url,
                artifact_url,artifact_sha256,installed_hash,checked_at)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
               ON CONFLICT(capability_type,capability_id) DO UPDATE SET
               source_id=excluded.source_id,canonical_id=excluded.canonical_id,
               source_version=excluded.source_version,source_url=excluded.source_url,
               artifact_url=excluded.artifact_url,artifact_sha256=excluded.artifact_sha256,
               installed_hash=excluded.installed_hash,update_version='',checked_at=excluded.checked_at"#,
            params![
                capability_type,
                capability_id,
                source_id,
                canonical_id,
                source_version,
                source_url,
                artifact_url,
                artifact_sha256,
                installed_hash,
                current_time_string(),
            ],
        )?;
        Ok(())
    }

    pub fn installed_marketplace_item(
        &self,
        capability_type: &str,
        canonical_id: &str,
    ) -> Result<Option<(String, String)>, AppError> {
        Ok(self.connection.query_row(
            "SELECT capability_id,source_version FROM marketplace_installs WHERE capability_type=?1 AND canonical_id=?2",
            params![capability_type, canonical_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional()?)
    }

    fn save_capability_backup(
        &self,
        capability_type: &str,
        capability_id: &str,
        payload: &str,
        trash_path: &str,
    ) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT INTO capability_delete_backups (id,capability_type,capability_id,payload_json,trash_path,deleted_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![Uuid::new_v4().to_string(), capability_type, capability_id, payload, trash_path, current_time_string()],
        )?;
        Ok(())
    }

    fn seed_api_providers_from_agent_configs(&self) -> Result<(), AppError> {
        self.connection.execute_batch(
            r#"
            INSERT OR IGNORE INTO api_providers (
              id, name, provider_type, wire_api, base_url, api_key, website_url, open_ai_auth_json, models_json, enabled, created_at, updated_at
            )
            SELECT
              'api-from-' || id,
              name,
              'openai-compatible',
              wire_api,
              base_url,
              api_key,
              website_url,
              '',
              '[]',
              1,
              created_at,
              updated_at
            FROM providers
            WHERE (trim(base_url) <> '' OR trim(api_key) <> '' OR trim(website_url) <> '')
              AND NOT EXISTS (
                SELECT 1 FROM deleted_api_provider_seeds deleted
                WHERE deleted.id = 'api-from-' || providers.id
              );

            UPDATE providers
            SET api_provider_id = 'api-from-' || id
            WHERE trim(api_provider_id) = ''
              AND (trim(base_url) <> '' OR trim(api_key) <> '' OR trim(website_url) <> '')
              AND NOT EXISTS (
                SELECT 1 FROM deleted_api_provider_seeds deleted
                WHERE deleted.id = 'api-from-' || providers.id
              );
            "#,
        )?;
        Ok(())
    }

    fn ensure_setting(&self, key: &str, value: String) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    fn setting(&self, key: &str) -> Result<String, AppError> {
        self.connection
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .map_err(AppError::from)
    }

    fn set_setting(&self, key: &str, value: String) -> Result<(), AppError> {
        self.connection.execute(
            r#"
            INSERT INTO settings (key, value) VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            "#,
            params![key, value],
        )?;
        Ok(())
    }

    fn live_sessions(&self, codex_config_dir: &str) -> Vec<SessionRecord> {
        let mut all = session_manager::scan_codex_sessions(&PathBuf::from(codex_config_dir));
        all.extend(session_manager::scan_claude_sessions());
        all.extend(session_manager::scan_gemini_sessions());
        all.sort_by(|l, r| r.last_active_at.cmp(&l.last_active_at));
        all
    }
}

fn ensure_column(conn: &Connection, table: &str, column: &str, decl: &str) -> Result<(), AppError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let existing: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .collect();
    if !existing.iter().any(|name| name == column) {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
            [],
        )?;
    }
    Ok(())
}

fn current_time_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn json_column<T: serde::de::DeserializeOwned + Default>(value: String) -> T {
    serde_json::from_str(&value).unwrap_or_default()
}

fn capability_target_key(name: &str, id: &str) -> String {
    let slug = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let slug = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let prefix = if slug.is_empty() {
        "mcp"
    } else {
        slug.as_str()
    };
    format!(
        "{}-{}",
        prefix,
        id.chars()
            .filter(|ch| ch.is_ascii_hexdigit())
            .take(6)
            .collect::<String>()
    )
}

fn builtin_mcp_presets() -> Vec<McpPreset> {
    use std::collections::BTreeMap;
    let preset =
        |id: &str, name: &str, description: &str, command: &str, args: Vec<&str>| McpPreset {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            built_in: true,
            transport: "stdio".to_string(),
            command: command.to_string(),
            args: args.into_iter().map(str::to_string).collect(),
            working_directory: String::new(),
            url: String::new(),
            env: BTreeMap::new(),
            headers: BTreeMap::new(),
        };
    vec![
        preset(
            "builtin-filesystem",
            "Filesystem",
            "Read and manage selected local files.",
            "npx",
            vec![
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "${WORKSPACE}",
            ],
        ),
        preset(
            "builtin-git",
            "Git",
            "Inspect and operate on a Git repository.",
            "uvx",
            vec!["mcp-server-git", "--repository", "${WORKSPACE}"],
        ),
        preset(
            "builtin-memory",
            "Memory",
            "Local knowledge graph memory server.",
            "npx",
            vec!["-y", "@modelcontextprotocol/server-memory"],
        ),
        preset(
            "builtin-fetch",
            "Fetch",
            "Retrieve and transform web content.",
            "uvx",
            vec!["mcp-server-fetch"],
        ),
    ]
}

fn map_provider(row: &rusqlite::Row<'_>) -> Result<Provider, rusqlite::Error> {
    Ok(Provider {
        id: row.get(0)?,
        name: row.get(1)?,
        agent: row.get(2)?,
        api_provider_id: row.get(3)?,
        base_url: row.get(4)?,
        api_key: row.get(5)?,
        website_url: row.get(6)?,
        model: row.get(7)?,
        wire_api: row.get(8)?,
        reasoning_effort: row.get(9)?,
        extra_toml: row.get(10)?,
        config_text: row.get(11)?,
        is_current: row.get::<_, i64>(12)? == 1,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn map_api_provider(row: &rusqlite::Row<'_>) -> Result<ApiProvider, rusqlite::Error> {
    let models_json: String = row.get(8)?;
    let models: Vec<RemoteModel> = serde_json::from_str(&models_json).unwrap_or_default();
    let open_ai_auth_json: String = row.get(7)?;

    Ok(ApiProvider {
        id: row.get(0)?,
        name: row.get(1)?,
        provider_type: row.get(2)?,
        wire_api: row.get(3)?,
        base_url: row.get(4)?,
        api_key: row.get(5)?,
        website_url: row.get(6)?,
        open_ai_auth_json: if open_ai_auth_json.trim().is_empty() {
            None
        } else {
            Some(open_ai_auth_json)
        },
        models,
        enabled: row.get::<_, i64>(9)? == 1,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn normalized_api_provider_type(provider_type: &str, has_openai_oauth: bool) -> String {
    let trimmed = provider_type.trim();
    if trimmed.is_empty() {
        "openai-compatible".to_string()
    } else if trimmed.eq_ignore_ascii_case("new-api") {
        "openai-compatible".to_string()
    } else if trimmed.eq_ignore_ascii_case("glm")
        || trimmed.eq_ignore_ascii_case("deepseek")
        || trimmed.eq_ignore_ascii_case("mimo")
    {
        "openai-compatible".to_string()
    } else if trimmed.eq_ignore_ascii_case("openai") {
        if has_openai_oauth {
            "openai_oauth".to_string()
        } else {
            "openai_apikey".to_string()
        }
    } else {
        trimmed.to_string()
    }
}

fn normalized_wire_api(wire_api: &str) -> String {
    match wire_api.trim() {
        "chat" => "chat".to_string(),
        _ => "responses".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn empty_api_provider(id: &str, base_url: &str, api_key: &str, wire_api: &str) -> ApiProvider {
        ApiProvider {
            id: id.to_string(),
            name: "Test API".to_string(),
            provider_type: "openai-compatible".to_string(),
            wire_api: wire_api.to_string(),
            base_url: base_url.to_string(),
            api_key: api_key.to_string(),
            website_url: "https://example.test".to_string(),
            open_ai_auth_json: None,
            models: Vec::new(),
            enabled: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn oauth_api_provider(id: &str) -> ApiProvider {
        ApiProvider {
            id: id.to_string(),
            name: "OpenAI OAuth".to_string(),
            provider_type: "openai_oauth".to_string(),
            wire_api: "responses".to_string(),
            base_url: String::new(),
            api_key: String::new(),
            website_url: "https://chatgpt.com".to_string(),
            open_ai_auth_json: Some(
                r#"{
  "tokens": {
    "access_token": "access-token",
    "refresh_token": "refresh-token"
  }
}"#
                .to_string(),
            ),
            models: Vec::new(),
            enabled: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn linked_codex_provider(api_provider_id: &str) -> Provider {
        Provider {
            id: "agent-1".to_string(),
            name: "Linked Codex".to_string(),
            agent: "codex".to_string(),
            api_provider_id: api_provider_id.to_string(),
            base_url: String::new(),
            api_key: String::new(),
            website_url: String::new(),
            model: "test-model".to_string(),
            wire_api: "responses".to_string(),
            reasoning_effort: "high".to_string(),
            extra_toml: String::new(),
            config_text: "stale custom codex config".to_string(),
            is_current: false,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn with_temp_home(test: impl FnOnce() -> Result<(), AppError>) -> Result<(), AppError> {
        let test_home =
            env::temp_dir().join(format!("codex-switch-db-test-{}", current_time_string()));
        let old_home = env::var_os("HOME");
        let old_userprofile = env::var_os("USERPROFILE");
        env::set_var("HOME", &test_home);
        env::set_var("USERPROFILE", &test_home);

        let result = test();

        if let Some(value) = old_home {
            env::set_var("HOME", value);
        } else {
            env::remove_var("HOME");
        }
        if let Some(value) = old_userprofile {
            env::set_var("USERPROFILE", value);
        } else {
            env::remove_var("USERPROFILE");
        }
        let _ = fs::remove_dir_all(&test_home);

        result
    }

    #[test]
    fn saving_api_provider_updates_linked_agent_provider() {
        with_temp_home(|| {
            let db = Database::new()?;
            db.save_api_provider(empty_api_provider(
                "api-1",
                "https://old.example/v1",
                "old-key",
                "chat",
            ))?;
            let saved_agent = db.save_provider(linked_codex_provider("api-1"))?;
            assert_eq!(saved_agent.base_url, "https://old.example/v1");
            assert_eq!(saved_agent.api_key, "old-key");
            assert_eq!(saved_agent.wire_api, "chat");

            db.save_api_provider(empty_api_provider(
                "api-1",
                "https://new.example/v1",
                "new-key",
                "responses",
            ))?;

            let linked = db.provider_by_id("agent-1")?;
            assert_eq!(linked.base_url, "https://new.example/v1");
            assert_eq!(linked.api_key, "new-key");
            assert_eq!(linked.wire_api, "responses");
            assert!(linked.config_text.is_empty());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn linked_openai_oauth_provider_writes_codex_oauth_config_text() {
        with_temp_home(|| {
            let db = Database::new()?;
            db.save_api_provider(oauth_api_provider("oauth-1"))?;

            let saved_agent = db.save_provider(linked_codex_provider("oauth-1"))?;

            assert!(saved_agent.config_text.contains("\"tokens\""));
            assert!(saved_agent
                .config_text
                .contains("\"access_token\": \"access-token\""));
            assert!(!saved_agent.config_text.contains("OPENAI_API_KEY"));
            Ok(())
        })
        .unwrap();
    }
}
