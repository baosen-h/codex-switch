import { useEffect, useState } from "react";
import type { AppSettings } from "../types";
import { useI18n } from "../i18n/context";

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}

export function SettingsPage({ settings, onSave }: SettingsPageProps) {
  const { t } = useI18n();
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
          <h2>{t("settingsTitle")}</h2>
        </div>
      </header>

      <article className="card">
        <div className="form-grid">
          <label className="field">
            <span>{t("codexConfigDir")}</span>
            <input
              value={draft.codexConfigDir}
              onChange={(event) => updateDraft("codexConfigDir", event.target.value)}
              placeholder="C:\\Users\\you\\.codex"
            />
          </label>
          <label className="field">
            <span>{t("defaultWorkspace")}</span>
            <input
              value={draft.defaultWorkspace}
              onChange={(event) => updateDraft("defaultWorkspace", event.target.value)}
              placeholder="F:\\Projects"
            />
          </label>
          <label className="field">
            <span>{t("terminalProgram")}</span>
            <input
              value={draft.terminalProgram}
              onChange={(event) => updateDraft("terminalProgram", event.target.value)}
              placeholder="pwsh"
            />
          </label>
          <label className="checkbox-field">
            <input
              checked={draft.autoRecordSessions}
              onChange={(event) => updateDraft("autoRecordSessions", event.target.checked)}
              type="checkbox"
            />
            <span>{t("autoRecordSessions")}</span>
          </label>
        </div>

        <div className="actions">
          <button
            className="primary-button"
            onClick={() => void onSave(draft)}
            type="button"
          >
            {t("saveSettings")}
          </button>
        </div>
      </article>
    </section>
  );
}
