import { useEffect, useMemo, useState } from "react";
import { appApi } from "../../api/tauri";
import type { AppSettings, BackgroundColorMode } from "../../types";
import { useI18n } from "../../i18n/context";
import { RELEASES_URL } from "../../utils/appConstants";
import { applyTheme, normalizeAppTheme, normalizeBackgroundScene, switchBackgroundColorWithReveal } from "../../utils/theme";
import { modelSupportsVisionText } from "../../utils/modelCapabilities";
import { AppearanceSection } from "./components/AppearanceSection";
import { SettingsActionsSection } from "./components/SettingsActionsSection";
import { SettingsPathSection } from "./components/SettingsPathSection";
import { VisionFallbackSection } from "./components/VisionFallbackSection";
import { WebSearchSection } from "./components/WebSearchSection";
import {
  defaultWebSearchSettings,
  isWebSearchConfigurationValid,
  shellOptions,
  type PathFieldKey,
} from "./settingsConfig";
import type { SettingsPageProps } from "./types";

export function SettingsPage({ apiProviders, settings, onOpenGuide, onSave }: SettingsPageProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [visionProviderOpen, setVisionProviderOpen] = useState(false);
  const [visionModelOpen, setVisionModelOpen] = useState(false);

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

  const updateWebSearch = <K extends keyof AppSettings["webSearch"]>(
    field: K,
    value: AppSettings["webSearch"][K],
  ) => {
    setDraft((current) => ({
      ...current,
      webSearch: {
        ...(current.webSearch ?? defaultWebSearchSettings),
        [field]: value,
      },
    }));
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
  const visionProviders = useMemo(
    () =>
      apiProviders
        .filter(
          (provider) =>
            provider.enabled && provider.models.some(modelSupportsVisionText),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apiProviders],
  );
  const visionProvider = visionProviders.find(
    (provider) => provider.id === draft.visionApiProviderId,
  );
  const visionModels = useMemo(
    () => (visionProvider?.models ?? []).filter(modelSupportsVisionText),
    [visionProvider],
  );
  const visionModel = visionModels.find((model) => model.id === draft.visionModel);
  const visionConfigurationValid = Boolean(visionProvider && visionModel);
  const webSearch = draft.webSearch ?? defaultWebSearchSettings;
  const canSave =
    (!draft.visionFallbackEnabled || visionConfigurationValid) &&
    isWebSearchConfigurationValid(webSearch);

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
      <article className="card">
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
          <AppearanceSection
            draft={draft}
            selectedScene={selectedScene}
            labels={{
              language: t("language"),
              backgroundColor: t("backgroundColor"),
              backgroundAuto: t("backgroundAuto"),
              backgroundDark: t("backgroundDark"),
              backgroundLight: t("backgroundLight"),
              backgroundScene: t("backgroundScene"),
              theme: t("theme"),
            }}
            t={t}
            onUpdateAndSave={updateAndSave}
            onBackgroundColorChange={handleBackgroundColorChange}
            onThemeChange={handleThemeChange}
          />
          <VisionFallbackSection
            draft={draft}
            visionProviders={visionProviders}
            visionProvider={visionProvider}
            visionModels={visionModels}
            visionModel={visionModel}
            visionProviderOpen={visionProviderOpen}
            visionModelOpen={visionModelOpen}
            onUpdateDraft={updateDraft}
            onSetDraft={setDraft}
            onSetVisionProviderOpen={setVisionProviderOpen}
            onSetVisionModelOpen={setVisionModelOpen}
          />
          <WebSearchSection webSearch={webSearch} onUpdateWebSearch={updateWebSearch} />
          <SettingsActionsSection
            appVersion={__APP_VERSION__}
            labels={{
              appVersion: t("appVersion"),
              openReleases: t("openReleases"),
              guideSettingsTitle: t("guideSettingsTitle"),
              guideSettingsButton: t("guideSettingsButton"),
              saveSettings: t("saveSettings"),
            }}
            canSave={canSave}
            onOpenReleases={() => void openReleases()}
            onOpenGuide={onOpenGuide}
            onSave={() => void onSave(draft)}
          />
        </div>
      </article>
    </section>
  );
}
