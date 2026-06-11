import { useEffect, useState } from "react";
import { appApi } from "../../api/tauri";
import type { AppSettings, BackgroundColorMode } from "../../types";
import { useI18n } from "../../i18n/context";
import { RELEASES_URL } from "../../utils/appConstants";
import { applyTheme, normalizeAppTheme, switchBackgroundColor } from "../../utils/theme";
import { AppearanceSection } from "./components/AppearanceSection";
import { SettingsActionsSection } from "./components/SettingsActionsSection";
import { SettingsPathSection } from "./components/SettingsPathSection";
import { shellOptions, type PathFieldKey } from "./settingsConfig";
import type { SettingsPageProps } from "./types";

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
    switchBackgroundColor(mode);
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
  const pickDirectory = async (field: PathFieldKey) => {
    try {
      const selected = await appApi.pickDirectory(draft[field]);
      if (selected) updateDraft(field, selected);
    } catch (error) {
      console.error("Failed to pick directory", error);
    }
  };

  const openReleases = async () => {
    await appApi.openExternalUrl(RELEASES_URL);
  };

  return (
    <section className="page settings-page">
      <article className="card settings-workspace">
        <aside className="settings-nav" aria-label={t("settings")}>
          <strong>{t("settings")}</strong>
          <a href="#settings-general">{t("settingsGeneral")}</a>
          <a href="#settings-appearance">{t("settingsAppearance")}</a>
          <a href="#settings-application">{t("settingsApplication")}</a>
        </aside>

        <div className="settings-content">
          <section className="settings-group" id="settings-general">
            <header><h2>{t("settingsGeneral")}</h2><p>{t("settingsGeneralHint")}</p></header>
            <div className="form-grid">
              <SettingsPathSection
                draft={draft}
                selectedShell={selectedShell}
                labels={{
                  codexConfigDir: t("codexConfigDir"),
                  claudeConfigDir: t("claudeConfigDir"),
                  geminiConfigDir: t("geminiConfigDir"),
                  defaultWorkspace: t("defaultWorkspace"),
                  terminalProgram: t("terminalProgram"),
                  browse: t("browse"),
                  autoRecordSessions: t("autoRecordSessions"),
                }}
                onUpdateDraft={updateDraft}
                onPickDirectory={(field) => void pickDirectory(field)}
              />
            </div>
          </section>

          <section className="settings-group" id="settings-appearance">
            <header><h2>{t("settingsAppearance")}</h2><p>{t("settingsAppearanceHint")}</p></header>
            <div className="form-grid">
              <AppearanceSection
                draft={draft}
                labels={{
                  language: t("language"),
                  backgroundColor: t("backgroundColor"),
                  backgroundAuto: t("backgroundAuto"),
                  backgroundDark: t("backgroundDark"),
                  backgroundLight: t("backgroundLight"),
                  theme: t("theme"),
                }}
                t={t}
                onUpdateAndSave={updateAndSave}
                onBackgroundColorChange={handleBackgroundColorChange}
                onThemeChange={handleThemeChange}
              />
            </div>
          </section>

          <section className="settings-group settings-group-actions" id="settings-application">
            <header><h2>{t("settingsApplication")}</h2><p>{t("settingsApplicationHint")}</p></header>
            <div className="form-grid">
              <SettingsActionsSection
                appVersion={__APP_VERSION__}
                labels={{
                  appVersion: t("appVersion"),
                  openReleases: t("openReleases"),
                  guideSettingsTitle: t("guideSettingsTitle"),
                  guideSettingsButton: t("guideSettingsButton"),
                  saveSettings: t("saveSettings"),
                }}
                canSave
                onOpenReleases={() => void openReleases()}
                onOpenGuide={onOpenGuide}
                onSave={() => void onSave(draft)}
              />
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}
