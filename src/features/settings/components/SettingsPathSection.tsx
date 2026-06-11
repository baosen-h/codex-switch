import type { AppSettings } from "../../../types";
import { shellOptions, type PathFieldKey } from "../settingsConfig";

interface SettingsPathSectionProps {
  draft: AppSettings;
  selectedShell: string;
  labels: {
    codexConfigDir: string;
    claudeConfigDir: string;
    geminiConfigDir: string;
    defaultWorkspace: string;
    terminalProgram: string;
    browse: string;
    autoRecordSessions: string;
  };
  onUpdateDraft: (field: keyof AppSettings, value: string | boolean) => void;
  onPickDirectory: (field: PathFieldKey) => void;
}

export function SettingsPathSection({
  draft,
  selectedShell,
  labels,
  onUpdateDraft,
  onPickDirectory,
}: SettingsPathSectionProps) {
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
          onChange={(event) => onUpdateDraft(field, event.target.value)}
          placeholder={placeholder}
        />
        <button
          className="secondary-button browse-button"
          onClick={() => onPickDirectory(field)}
          type="button"
        >
          {labels.browse}
        </button>
      </div>
    </label>
  );

  return (
    <>
      {renderPathField("codexConfigDir", labels.codexConfigDir, "C:\\Users\\you\\.codex")}
      {renderPathField("claudeConfigDir", labels.claudeConfigDir, "C:\\Users\\you\\.claude")}
      {renderPathField("geminiConfigDir", labels.geminiConfigDir, "C:\\Users\\you\\.gemini")}
      {renderPathField("defaultWorkspace", labels.defaultWorkspace, "F:\\Projects")}
      <label className="field">
        <span>{labels.terminalProgram}</span>
        <select
          value={selectedShell}
          onChange={(event) =>
            onUpdateDraft("terminalProgram", event.target.value === "__custom__" ? "" : event.target.value)
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
            onChange={(event) => onUpdateDraft("terminalProgram", event.target.value)}
            placeholder="pwsh"
          />
        </label>
      ) : null}
      <label className="checkbox-field">
        <input
          checked={draft.autoRecordSessions}
          onChange={(event) => onUpdateDraft("autoRecordSessions", event.target.checked)}
          type="checkbox"
        />
        <span>{labels.autoRecordSessions}</span>
      </label>
    </>
  );
}
