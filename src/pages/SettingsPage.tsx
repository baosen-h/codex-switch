import { useEffect, useState } from "react";
import { appApi } from "../api/tauri";
import type { AppSettings, ThemeMode } from "../types";
import { useI18n } from "../i18n/context";
import { switchThemeWithReveal } from "../utils/theme";

interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}

type PathFieldKey =
  | "codexConfigDir"
  | "claudeConfigDir"
  | "geminiConfigDir"
  | "defaultWorkspace";

const shellOptions = [
  { label: "PowerShell", value: "pwsh" },
  { label: "Bash", value: "bash" },
  { label: "CMD", value: "cmd" },
  { label: "Fish", value: "fish" },
  { label: "Nushell", value: "nu" },
];

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

  const selectedShell = shellOptions.some((option) => option.value === draft.terminalProgram)
    ? draft.terminalProgram
    : "__custom__";

  const pickDirectory = async (field: PathFieldKey) => {
    try {
      const selected = await appApi.pickDirectory(draft[field]);
      if (selected) updateDraft(field, selected);
    } catch (error) {
      console.error("Failed to pick directory", error);
    }
  };

  const renderPathField = (
    field: PathFieldKey,
    label: string,
    placeholder: string,
  ) => (
    <label className="field">
      <span>{label}</span>
      <div className="field-input-row">
        <input
          value={draft[field]}
          onChange={(event) => updateDraft(field, event.target.value)}
          placeholder={placeholder}
        />
        <button
          className="secondary-button browse-button"
          onClick={() => void pickDirectory(field)}
          type="button"
        >
          {t("browse")}
        </button>
      </div>
    </label>
  );

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <h2>{t("settingsTitle")}</h2>
        </div>
      </header>

      <article className="card">
        <div className="form-grid">
          {renderPathField("codexConfigDir", t("codexConfigDir"), "C:\\Users\\you\\.codex")}
          {renderPathField("claudeConfigDir", t("claudeConfigDir"), "C:\\Users\\you\\.claude")}
          {renderPathField("geminiConfigDir", t("geminiConfigDir"), "C:\\Users\\you\\.gemini")}
          {renderPathField("defaultWorkspace", t("defaultWorkspace"), "F:\\Projects")}
          <label className="field">
            <span>{t("terminalProgram")}</span>
            <select
              value={selectedShell}
              onChange={(event) =>
                updateDraft("terminalProgram", event.target.value === "__custom__" ? "" : event.target.value)
              }
            >
              {shellOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
          </label>
          {selectedShell === "__custom__" ? (
            <label className="field">
              <span>Custom shell command</span>
              <input
                value={draft.terminalProgram}
                onChange={(event) => updateDraft("terminalProgram", event.target.value)}
                placeholder="pwsh"
              />
            </label>
          ) : null}
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
