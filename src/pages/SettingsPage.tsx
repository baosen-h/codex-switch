import { useEffect, useState } from "react";
import { appApi } from "../api/tauri";
import type { AppSettings, AppTheme, BackgroundColorMode, BackgroundScene } from "../types";
import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/context";
import { applyTheme, normalizeAppTheme, normalizeBackgroundScene, switchBackgroundColorWithReveal } from "../utils/theme";

interface SettingsPageProps {
  settings: AppSettings;
  onOpenGuide: () => void;
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

const themeOptions: Array<{ value: AppTheme; labelKey: TranslationKey }> = [
  { value: "professional", labelKey: "themeProfessional" },
  { value: "graphite", labelKey: "themeGraphite" },
  { value: "indigo", labelKey: "themeIndigo" },
  { value: "teal", labelKey: "themeTeal" },
  { value: "amber", labelKey: "themeAmber" },
  { value: "slate", labelKey: "themeSlate" },
  { value: "rose", labelKey: "themeRose" },
  { value: "violet", labelKey: "themeViolet" },
];

const backgroundSceneOptions: Array<{ value: BackgroundScene; labelKey: TranslationKey }> = [
  { value: "none", labelKey: "backgroundSceneNone" },
  { value: "anime", labelKey: "backgroundSceneAnime" },
  { value: "animeSakura", labelKey: "backgroundSceneSakura" },
  { value: "animeNight", labelKey: "backgroundSceneNight" },
  { value: "mikuStage", labelKey: "backgroundSceneMikuStage" },
  { value: "raidenShogun", labelKey: "backgroundSceneRaidenShogun" },
  { value: "lumineGold", labelKey: "backgroundSceneLumineGold" },
  { value: "hutaoLantern", labelKey: "backgroundSceneHutaoLantern" },
  { value: "ayakaSnow", labelKey: "backgroundSceneAyakaSnow" },
  { value: "yaeSakura", labelKey: "backgroundSceneYaeSakura" },
  { value: "nahidaDream", labelKey: "backgroundSceneNahidaDream" },
  { value: "furinaStage", labelKey: "backgroundSceneFurinaStage" },
  { value: "keqingViolet", labelKey: "backgroundSceneKeqingViolet" },
  { value: "animeCyberGirl", labelKey: "backgroundSceneCyberGirl" },
  { value: "animeIdolPink", labelKey: "backgroundSceneIdolPink" },
  { value: "animeMaidCafe", labelKey: "backgroundSceneMaidCafe" },
  { value: "animeWitchNight", labelKey: "backgroundSceneWitchNight" },
  { value: "animeSchoolRooftop", labelKey: "backgroundSceneSchoolRooftop" },
  { value: "animeKimonoFestival", labelKey: "backgroundSceneKimonoFestival" },
  { value: "animeMechaPilot", labelKey: "backgroundSceneMechaPilot" },
];

export function SettingsPage({ settings, onOpenGuide, onSave }: SettingsPageProps) {
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

  const handleBackgroundColorChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as BackgroundColorMode;
    const rect = event.currentTarget.getBoundingClientRect();
    switchBackgroundColorWithReveal(mode, rect.left + rect.width / 2, rect.top + rect.height / 2);
    updateAndSave("backgroundColor", mode);
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = normalizeAppTheme(event.target.value);
    applyTheme(mode);
    updateAndSave("theme", mode);
  };

  const selectedShell = shellOptions.some((option) => option.value === draft.terminalProgram)
    ? draft.terminalProgram
    : "__custom__";
  const selectedScene = normalizeBackgroundScene(draft.backgroundScene);

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
            <span>{t("backgroundColor")}</span>
            <select value={draft.backgroundColor} onChange={handleBackgroundColorChange}>
              <option value="system">{t("backgroundAuto")}</option>
              <option value="dark">{t("backgroundDark")}</option>
              <option value="light">{t("backgroundLight")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("backgroundScene")}</span>
            <select
              value={selectedScene}
              onChange={(event) => updateAndSave("backgroundScene", event.target.value)}
            >
              {backgroundSceneOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("theme")}</span>
            <select value={normalizeAppTheme(draft.theme)} onChange={handleThemeChange}>
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </label>
          <label className="field field-full">
            <span>{t("appVersion")}</span>
            <div className="update-row">
              <button className="secondary-button" onClick={() => void appApi.openExternalUrl("https://github.com/baosen-h/codex-switch/releases")} type="button">
                {t("openReleases")} v{__APP_VERSION__}
              </button>
            </div>
          </label>
          <label className="checkbox-field">
            <input
              checked={draft.autoRecordSessions}
              onChange={(event) => updateDraft("autoRecordSessions", event.target.checked)}
              type="checkbox"
            />
            <span>{t("autoRecordSessions")}</span>
          </label>
          <div className="field">
            <span>{t("guideSettingsTitle")}</span>
            <button className="secondary-button" onClick={onOpenGuide} type="button">
              {t("guideSettingsButton")}
            </button>
          </div>
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
