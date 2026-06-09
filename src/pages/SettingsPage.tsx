import { useEffect, useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import type { ApiProvider, AppSettings, AppTheme, BackgroundColorMode, BackgroundScene } from "../types";
import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/context";
import { RELEASES_URL } from "../utils/appConstants";
import { applyTheme, normalizeAppTheme, normalizeBackgroundScene, switchBackgroundColorWithReveal } from "../utils/theme";
import { modelSupportsVisionText } from "../utils/modelCapabilities";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";

interface SettingsPageProps {
  apiProviders: ApiProvider[];
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
  { value: "raidenShogun", labelKey: "backgroundSceneRaidenShogun" },
  { value: "lumineGold", labelKey: "backgroundSceneLumineGold" },
  { value: "hutaoLantern", labelKey: "backgroundSceneHutaoLantern" },
  { value: "ayakaSnow", labelKey: "backgroundSceneAyakaSnow" },
  { value: "yaeSakura", labelKey: "backgroundSceneYaeSakura" },
  { value: "nahidaDream", labelKey: "backgroundSceneNahidaDream" },
  { value: "furinaStage", labelKey: "backgroundSceneFurinaStage" },
  { value: "keqingViolet", labelKey: "backgroundSceneKeqingViolet" },
];

const defaultWebSearchSettings: AppSettings["webSearch"] = {
  searchProviderId: "",
  searchApiUrl: "",
  searchApiKeys: [],
  fetchProviderId: "direct",
  fetchApiUrl: "",
  fetchApiKeys: [],
  maxResults: 5,
  excludeDomains: [],
  cutoffTokens: 4000,
};

const searchProviderOptions = [
  { id: "tavily", name: "Tavily", apiUrl: "https://api.tavily.com/search", requiresKey: true },
  { id: "zhipu", name: "Zhipu", apiUrl: "https://open.bigmodel.cn/api/paas/v4/web_search", requiresKey: true },
  { id: "exa", name: "Exa", apiUrl: "https://api.exa.ai/search", requiresKey: true },
  { id: "bocha", name: "Bocha", apiUrl: "https://api.bochaai.com/v1/web-search", requiresKey: true },
  { id: "searxng", name: "SearXNG", apiUrl: "http://localhost:8080/search", requiresKey: false },
  { id: "jina", name: "Jina", apiUrl: "https://s.jina.ai", requiresKey: true },
] as const;

const fetchProviderOptions = [
  { id: "direct", name: "Direct fetch", apiUrl: "", requiresKey: false },
  { id: "jina", name: "Jina Reader", apiUrl: "https://r.jina.ai", requiresKey: true },
] as const;

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

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
  const searchProviderOption = searchProviderOptions.find(
    (provider) => provider.id === webSearch.searchProviderId,
  );
  const fetchProviderOption = fetchProviderOptions.find(
    (provider) => provider.id === webSearch.fetchProviderId,
  );
  const webSearchConfigurationValid =
    (!webSearch.searchProviderId ||
      Boolean(searchProviderOption) &&
        (!searchProviderOption?.requiresKey || webSearch.searchApiKeys.some((key) => key.trim()))) &&
    Boolean(fetchProviderOption) &&
    (!fetchProviderOption?.requiresKey || webSearch.fetchApiKeys.some((key) => key.trim()));

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
              <button className="secondary-button" onClick={() => void appApi.openExternalUrl(RELEASES_URL)} type="button">
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
          <label className="checkbox-field field-full">
            <input
              checked={draft.visionFallbackEnabled}
              onChange={(event) => updateDraft("visionFallbackEnabled", event.target.checked)}
              type="checkbox"
            />
            <span>Vision fallback for text-only models</span>
          </label>
          {draft.visionFallbackEnabled ? (
            <>
              <label className="field">
                <span>Vision API provider</span>
                <div className="model-picker vision-picker">
                  <button
                    className="vision-picker-control"
                    onClick={() => {
                      setVisionProviderOpen((open) => !open);
                      setVisionModelOpen(false);
                    }}
                    type="button"
                  >
                    <span>{visionProvider?.name ?? "Select provider"}</span>
                    <ChevronDownIcon />
                  </button>
                  {visionProviderOpen ? (
                    <div className="model-picker-menu vision-picker-menu">
                      {visionProviders.length ? visionProviders.map((provider) => (
                        <button
                          className={`model-picker-option ${draft.visionApiProviderId === provider.id ? "active" : ""}`}
                          key={provider.id}
                          onClick={() => {
                            const models = provider.models.filter(modelSupportsVisionText);
                            setDraft((current) => ({
                              ...current,
                              visionApiProviderId: provider.id,
                              visionModel: models[0]?.id ?? "",
                            }));
                            setVisionProviderOpen(false);
                          }}
                          type="button"
                        >
                          <span className="model-picker-option-title">{provider.name}</span>
                          <span className="model-picker-option-meta">
                            {provider.providerType} · {provider.models.filter(modelSupportsVisionText).length} vision models
                          </span>
                        </button>
                      )) : (
                        <div className="model-picker-empty">No provider has a verified image-to-text model.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="field">
                <span>Vision model</span>
                <div className="model-picker vision-picker">
                  <button
                    className="vision-picker-control"
                    disabled={!visionProvider}
                    onClick={() => {
                      setVisionModelOpen((open) => !open);
                      setVisionProviderOpen(false);
                    }}
                    type="button"
                  >
                    <span>{visionModel?.name || visionModel?.id || "Select model"}</span>
                    <ChevronDownIcon />
                  </button>
                  {visionModelOpen ? (
                    <div className="model-picker-menu vision-picker-menu">
                      {visionModels.map((model) => (
                        <button
                          className={`model-picker-option ${draft.visionModel === model.id ? "active" : ""}`}
                          key={model.id}
                          onClick={() => {
                            updateDraft("visionModel", model.id);
                            setVisionModelOpen(false);
                          }}
                          type="button"
                        >
                          <span className="model-picker-option-title">{model.name || model.id}</span>
                          <span className="model-picker-option-meta">
                            {model.name && model.name !== model.id ? model.id : model.description || "Image input · text output"}
                          </span>
                          <ModelCapabilityBadges model={model} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>
            </>
          ) : null}
          <div className="field field-full">
            <span>Automatic web search</span>
            <small>
              Configure once here. Models decide when to search; there is no chat mode switch.
              Provider-native search remains preferred when available.
            </small>
          </div>
          <label className="field">
            <span>Search provider</span>
            <select
              value={webSearch.searchProviderId}
              onChange={(event) => {
                const providerId = event.target.value;
                const option = searchProviderOptions.find((provider) => provider.id === providerId);
                updateWebSearch("searchProviderId", providerId);
                if (option) {
                  updateWebSearch("searchApiUrl", option.apiUrl);
                }
                if (providerId !== webSearch.searchProviderId) {
                  updateWebSearch("searchApiKeys", []);
                }
              }}
            >
              <option value="">Not configured</option>
              {searchProviderOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>URL fetch provider</span>
            <select
              value={webSearch.fetchProviderId}
              onChange={(event) => {
                const providerId = event.target.value;
                const option = fetchProviderOptions.find((provider) => provider.id === providerId);
                updateWebSearch("fetchProviderId", providerId);
                updateWebSearch("fetchApiUrl", option?.apiUrl ?? "");
                if (providerId !== webSearch.fetchProviderId) {
                  updateWebSearch("fetchApiKeys", []);
                }
              }}
            >
              {fetchProviderOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>
          {searchProviderOption ? (
            <>
              <label className="field">
                <span>{searchProviderOption.name} API URL</span>
                <input
                  value={webSearch.searchApiUrl}
                  onChange={(event) => updateWebSearch("searchApiUrl", event.target.value)}
                  placeholder={searchProviderOption.apiUrl}
                />
              </label>
              {searchProviderOption.requiresKey ? (
                <label className="field">
                  <span>{searchProviderOption.name} API keys</span>
                  <textarea
                    value={webSearch.searchApiKeys.join("\n")}
                    onChange={(event) =>
                      updateWebSearch(
                        "searchApiKeys",
                        event.target.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
                      )
                    }
                    placeholder="One API key per line"
                    rows={3}
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {fetchProviderOption?.id === "jina" ? (
            <>
              <label className="field">
                <span>Jina Reader API URL</span>
                <input
                  value={webSearch.fetchApiUrl}
                  onChange={(event) => updateWebSearch("fetchApiUrl", event.target.value)}
                  placeholder={fetchProviderOption.apiUrl}
                />
              </label>
              <label className="field">
                <span>Jina Reader API keys</span>
                <textarea
                  value={webSearch.fetchApiKeys.join("\n")}
                  onChange={(event) =>
                    updateWebSearch(
                      "fetchApiKeys",
                      event.target.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
                    )
                  }
                  placeholder="One API key per line"
                  rows={3}
                />
              </label>
            </>
          ) : null}
          <label className="field">
            <span>Maximum search results</span>
            <input
              min={1}
              max={20}
              type="number"
              value={webSearch.maxResults}
              onChange={(event) => updateWebSearch("maxResults", Number(event.target.value) || 1)}
            />
          </label>
          <label className="field">
            <span>Excluded domains</span>
            <textarea
              value={webSearch.excludeDomains.join("\n")}
              onChange={(event) =>
                updateWebSearch(
                  "excludeDomains",
                  event.target.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
                )
              }
              placeholder={"example.com\nspam.example"}
              rows={3}
            />
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
            disabled={
              (draft.visionFallbackEnabled && !visionConfigurationValid) ||
              !webSearchConfigurationValid
            }
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
