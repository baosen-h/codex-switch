import { useEffect, useState } from "react";
import type { AppSettings, ThemeMode } from "../types";
import { useI18n } from "../i18n/context";
import { switchThemeWithReveal } from "../utils/theme";

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

  const updateAndSave = (field: keyof AppSettings, value: string | boolean) => {
    const next = { ...draft, [field]: value } as AppSettings;
    setDraft(next);
    void onSave(next);
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as ThemeMode;
    const rect = event.currentTarget.getBoundingClientRect();
    switchThemeWithReveal(mode, rect.left + rect.width / 2, rect.top + rect.height / 2);
    updateAndSave("theme", mode);
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
          <label className="field">
            <span>{t("language")}</span>
            <select
              value={draft.language}
              onChange={(event) => updateAndSave("language", event.target.value)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <label className="field">
            <span>{t("theme")}</span>
            <select value={draft.theme} onChange={handleThemeChange}>
              <option value="system">{t("themeSystem")}</option>
              <option value="dark">{t("themeDark")}</option>
              <option value="light">{t("themeLight")}</option>
            </select>
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
