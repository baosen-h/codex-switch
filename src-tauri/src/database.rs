use crate::codex::default_codex_config_dir;
use crate::error::AppError;
use crate::models::{AppSettings, DashboardState, Provider, SessionRecord, SessionUpdateInput};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn new() -> Result<Self, AppError> {
        let app_dir = Self::app_data_dir()?;
        fs::create_dir_all(&app_dir)?;
        let db_path = app_dir.join("codex-switch-mini.db");
        let connection = Connection::open(db_path)?;

        let database = Self { connection };
        database.initialize()?;
        Ok(database)
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
              base_url TEXT NOT NULL DEFAULT '',
              api_key TEXT NOT NULL DEFAULT '',
              model TEXT NOT NULL,
              reasoning_effort TEXT NOT NULL DEFAULT 'high',
              extra_toml TEXT NOT NULL DEFAULT '',
              is_current INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              provider_id TEXT NOT NULL,
              provider_name TEXT NOT NULL,
              workspace_path TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              session_ref TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'active',
              notes TEXT NOT NULL DEFAULT '',
              started_at TEXT NOT NULL,
              last_active_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            "#,
        )?;

        self.ensure_setting(
            "codex_config_dir",
            default_codex_config_dir().to_string_lossy().to_string(),
        )?;
        self.ensure_setting("default_workspace", String::new())?;
        self.ensure_setting("terminal_program", "pwsh".to_string())?;
        self.ensure_setting("auto_record_sessions", "true".to_string())?;

        Ok(())
    }

    fn ensure_setting(&self, key: &str, value: String) -> Result<(), AppError> {
        self.connection.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn dashboard(&self) -> Result<DashboardState, AppError> {
        Ok(DashboardState {
            providers: self.providers()?,
            sessions: self.sessions()?,
            settings: self.settings()?,
        })
    }

    pub fn providers(&self) -> Result<Vec<Provider>, AppError> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT id, name, base_url, api_key, model, reasoning_effort, extra_toml, is_current, created_at, updated_at
            FROM providers
            ORDER BY is_current DESC, updated_at DESC
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            Ok(Provider {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                api_key: row.get(3)?,
                model: row.get(4)?,
                reasoning_effort: row.get(5)?,
                extra_toml: row.get(6)?,
                is_current: row.get::<_, i64>(7)? == 1,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;

        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn provider_by_id(&self, id: &str) -> Result<Provider, AppError> {
        self.connection
            .query_row(
                r#"
                SELECT id, name, base_url, api_key, model, reasoning_effort, extra_toml, is_current, created_at, updated_at
                FROM providers
                WHERE id = ?1
                "#,
                params![id],
                |row| {
                    Ok(Provider {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        base_url: row.get(2)?,
                        api_key: row.get(3)?,
                        model: row.get(4)?,
                        reasoning_effort: row.get(5)?,
                        extra_toml: row.get(6)?,
                        is_current: row.get::<_, i64>(7)? == 1,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                    })
                },
            )
            .map_err(AppError::from)
    }

    pub fn save_provider(&self, provider: Provider) -> Result<Provider, AppError> {
        let now = Utc::now().to_rfc3339();
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

        self.connection.execute(
            r#"
            INSERT INTO providers (
              id, name, base_url, api_key, model, reasoning_effort, extra_toml, is_current, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE((SELECT is_current FROM providers WHERE id = ?1), 0), ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              base_url = excluded.base_url,
              api_key = excluded.api_key,
              model = excluded.model,
              reasoning_effort = excluded.reasoning_effort,
              extra_toml = excluded.extra_toml,
              updated_at = excluded.updated_at
            "#,
            params![
                provider_id,
                provider.name.trim(),
                provider.base_url.trim(),
                provider.api_key.trim(),
                provider.model.trim(),
                provider.reasoning_effort.trim(),
                provider.extra_toml.trim(),
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
        self.connection.execute("UPDATE providers SET is_current = 0", [])?;
        self.connection.execute(
            "UPDATE providers SET is_current = 1, updated_at = ?2 WHERE id = ?1",
            params![id, Utc::now().to_rfc3339()],
        )?;

        self.provider_by_id(id)
    }

    pub fn current_provider(&self) -> Result<Provider, AppError> {
        let id = self
            .connection
            .query_row(
                "SELECT id FROM providers WHERE is_current = 1 LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| AppError::message("No active provider configured"))?;

        self.provider_by_id(&id)
    }

    pub fn sessions(&self) -> Result<Vec<SessionRecord>, AppError> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT id, provider_id, provider_name, workspace_path, title, session_ref, status, notes, started_at, last_active_at
            FROM sessions
            ORDER BY last_active_at DESC
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            Ok(SessionRecord {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                provider_name: row.get(2)?,
                workspace_path: row.get(3)?,
                title: row.get(4)?,
                session_ref: row.get(5)?,
                status: row.get(6)?,
                notes: row.get(7)?,
                started_at: row.get(8)?,
                last_active_at: row.get(9)?,
            })
        })?;

        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn create_session(
        &self,
        provider: &Provider,
        workspace_path: &str,
        title: &str,
    ) -> Result<SessionRecord, AppError> {
        let now = Utc::now().to_rfc3339();
        let session = SessionRecord {
            id: format!("session-{}", Uuid::new_v4()),
            provider_id: provider.id.clone(),
            provider_name: provider.name.clone(),
            workspace_path: workspace_path.to_string(),
            title: title.to_string(),
            session_ref: String::new(),
            status: "active".to_string(),
            notes: String::new(),
            started_at: now.clone(),
            last_active_at: now.clone(),
        };

        self.connection.execute(
            r#"
            INSERT INTO sessions (
              id, provider_id, provider_name, workspace_path, title, session_ref, status, notes, started_at, last_active_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                session.id,
                session.provider_id,
                session.provider_name,
                session.workspace_path,
                session.title,
                session.session_ref,
                session.status,
                session.notes,
                session.started_at,
                session.last_active_at
            ],
        )?;

        Ok(session)
    }

    pub fn update_session(&self, input: SessionUpdateInput) -> Result<SessionRecord, AppError> {
        let now = Utc::now().to_rfc3339();
        self.connection.execute(
            r#"
            UPDATE sessions
            SET title = ?2, session_ref = ?3, status = ?4, notes = ?5, last_active_at = ?6
            WHERE id = ?1
            "#,
            params![
                input.id,
                input.title.trim(),
                input.session_ref.trim(),
                input.status.trim(),
                input.notes.trim(),
                now
            ],
        )?;

        self.connection
            .query_row(
                r#"
                SELECT id, provider_id, provider_name, workspace_path, title, session_ref, status, notes, started_at, last_active_at
                FROM sessions
                WHERE id = ?1
                "#,
                params![input.id],
                |row| {
                    Ok(SessionRecord {
                        id: row.get(0)?,
                        provider_id: row.get(1)?,
                        provider_name: row.get(2)?,
                        workspace_path: row.get(3)?,
                        title: row.get(4)?,
                        session_ref: row.get(5)?,
                        status: row.get(6)?,
                        notes: row.get(7)?,
                        started_at: row.get(8)?,
                        last_active_at: row.get(9)?,
                    })
                },
            )
            .map_err(AppError::from)
    }

    pub fn settings(&self) -> Result<AppSettings, AppError> {
        Ok(AppSettings {
            codex_config_dir: self.setting("codex_config_dir")?,
            default_workspace: self.setting("default_workspace")?,
            terminal_program: self.setting("terminal_program")?,
            auto_record_sessions: self.setting("auto_record_sessions")? == "true",
        })
    }

    pub fn save_settings(&self, settings: AppSettings) -> Result<AppSettings, AppError> {
        self.set_setting("codex_config_dir", settings.codex_config_dir.clone())?;
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
        self.settings()
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
}
