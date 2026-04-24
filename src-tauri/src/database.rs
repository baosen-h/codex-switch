use crate::agent_writer::{
    default_claude_config_dir, default_codex_config_dir, default_gemini_config_dir,
};
use crate::error::AppError;
use crate::models::{AppSettings, DashboardState, Provider, SessionRecord};
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
        let connection = Connection::open(app_dir.join("codex-switch-mini.db"))?;

        let database = Self { connection };
        database.initialize()?;
        Ok(database)
    }

    pub fn dashboard(&self) -> Result<DashboardState, AppError> {
        let settings = self.settings()?;
        let providers = self.providers()?;

        Ok(DashboardState {
            sessions: self.live_sessions(&settings.codex_config_dir),
            providers,
            settings,
        })
    }

    pub fn providers(&self) -> Result<Vec<Provider>, AppError> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT id, name, agent, base_url, api_key, website_url, model, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
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
                SELECT id, name, agent, base_url, api_key, website_url, model, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
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
              id, name, agent, base_url, api_key, website_url, model, reasoning_effort, extra_toml, config_text, is_current, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, COALESCE((SELECT is_current FROM providers WHERE id = ?1), 0), ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              agent = excluded.agent,
              base_url = excluded.base_url,
              api_key = excluded.api_key,
              website_url = excluded.website_url,
              model = excluded.model,
              reasoning_effort = excluded.reasoning_effort,
              extra_toml = excluded.extra_toml,
              config_text = excluded.config_text,
              updated_at = excluded.updated_at
            "#,
            params![
                provider_id,
                provider.name.trim(),
                agent,
                provider.base_url.trim(),
                provider.api_key.trim(),
                provider.website_url.trim(),
                provider.model.trim(),
                provider.reasoning_effort.trim(),
                provider.extra_toml.trim(),
                provider.config_text,
                created_at,
                now
            ],
        )?;

        self.provider_by_id(&provider_id)
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

        self.provider_by_id(id)
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

    pub fn settings(&self) -> Result<AppSettings, AppError> {
        Ok(AppSettings {
            codex_config_dir: self.setting("codex_config_dir")?,
            claude_config_dir: self.setting("claude_config_dir")?,
            gemini_config_dir: self.setting("gemini_config_dir")?,
            default_workspace: self.setting("default_workspace")?,
            terminal_program: self.setting("terminal_program")?,
            auto_record_sessions: self.setting("auto_record_sessions")? == "true",
            language: self.setting("language")?,
            theme: self.setting("theme")?,
        })
    }

    pub fn save_settings(&self, settings: AppSettings) -> Result<AppSettings, AppError> {
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
        self.set_setting("theme", settings.theme.clone())?;
        self.settings()
    }

    fn app_data_dir() -> Result<PathBuf, AppError> {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::message("Unable to determine home directory"))?;
        Ok(home.join(".codex-switch-mini"))
    }

    fn initialize(&self) -> Result<(), AppError> {
        self.connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS providers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              agent TEXT NOT NULL DEFAULT 'codex',
              base_url TEXT NOT NULL DEFAULT '',
              api_key TEXT NOT NULL DEFAULT '',
              website_url TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL,
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
            "config_text",
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
            "#,
        )?;

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
        self.ensure_setting("theme", "system".to_string())?;

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

fn map_provider(row: &rusqlite::Row<'_>) -> Result<Provider, rusqlite::Error> {
    Ok(Provider {
        id: row.get(0)?,
        name: row.get(1)?,
        agent: row.get(2)?,
        base_url: row.get(3)?,
        api_key: row.get(4)?,
        website_url: row.get(5)?,
        model: row.get(6)?,
        reasoning_effort: row.get(7)?,
        extra_toml: row.get(8)?,
        config_text: row.get(9)?,
        is_current: row.get::<_, i64>(10)? == 1,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}
