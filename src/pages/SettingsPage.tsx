import { useEffect, useState } from "react";
import type { AppSettings } from "../types";

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}

export function SettingsPage({ settings, onSave }: SettingsPageProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = (field: keyof AppSettings, value: string | boolean) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Choose Codex config location and local launch behavior.</p>
        </div>
      </header>

      <article className="card">
        <div className="form-grid">
          <label className="field">
            <span>Codex config directory</span>
            <input
              value={draft.codexConfigDir}
              onChange={(event) =>
                updateDraft("codexConfigDir", event.target.value)
              }
              placeholder="C:\\Users\\you\\.codex"
            />
          </label>
          <label className="field">
            <span>Default workspace</span>
            <input
              value={draft.defaultWorkspace}
              onChange={(event) =>
                updateDraft("defaultWorkspace", event.target.value)
              }
              placeholder="F:\\Projects"
            />
          </label>
          <label className="field">
            <span>Terminal program</span>
            <input
              value={draft.terminalProgram}
              onChange={(event) =>
                updateDraft("terminalProgram", event.target.value)
              }
              placeholder="pwsh"
            />
          </label>
          <label className="checkbox-field">
            <input
              checked={draft.autoRecordSessions}
              onChange={(event) =>
                updateDraft("autoRecordSessions", event.target.checked)
              }
              type="checkbox"
            />
            <span>Auto-record sessions launched from this app</span>
          </label>
        </div>

        <div className="actions">
          <button
            className="primary-button"
            onClick={() => void onSave(draft)}
            type="button"
          >
            Save settings
          </button>
        </div>
      </article>
    </section>
  );
}
