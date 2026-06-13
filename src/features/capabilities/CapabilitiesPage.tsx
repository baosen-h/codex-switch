import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Boxes,
  CheckCircle2,
  Eye,
  Link,
  MessageSquare,
  Search,
  Wrench,
} from "lucide-react";
import { appApi } from "../../api/tauri";
import { iconForAgent, ModelCapabilityBadges, ProviderAvatar } from "../../components/domain";
import { useI18n } from "../../i18n/context";
import type { AgentKind, AppSettings, CapabilitiesState, CapabilityCounts } from "../../types";
import { modelSupportsVisionText } from "../../utils/modelCapabilities";
import {
  defaultWebSearchSettings,
  fetchProviderOptions,
  isWebSearchConfigurationValid,
  searchProviderOptions,
  splitMultilineList,
} from "../settings/settingsConfig";
import type { CapabilitiesPageProps } from "./types";
import { CapabilityManager } from "./CapabilityManagers";
import { WebSearchProviderIcon } from "./WebSearchProviderIcon";

type CapabilityKey = "vision" | "search" | "mcp" | "skills";
const countAgents: AgentKind[] = ["codex", "claude", "gemini"];

function AgentCountChips({ counts }: { counts: CapabilityCounts }) {
  return (
    <span className="capability-agent-counts">
      {countAgents.map((agent) => (
        <span key={agent} title={`${agent}: ${counts[agent]}`}>
          {iconForAgent(agent)}
          <b>{counts[agent]}</b>
        </span>
      ))}
    </span>
  );
}

export function CapabilitiesPage({ apiProviders, settings, onSave }: CapabilitiesPageProps) {
  const { t } = useI18n();
  const [activeCapability, setActiveCapability] = useState<CapabilityKey>("vision");
  const [capabilityState, setCapabilityState] = useState<CapabilitiesState | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [draft, setDraft] = useState(settings);

  useEffect(() => setDraft(settings), [settings]);
  const reloadCapabilities = async () => {
    try {
      setCapabilityState(await appApi.getCapabilitiesState());
      setCapabilityError("");
    } catch (error) {
      setCapabilityError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void reloadCapabilities();
  }, []);

  const visionProviders = useMemo(
    () => apiProviders
      .filter((provider) => provider.enabled && provider.models.some(modelSupportsVisionText))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [apiProviders],
  );
  const visionProvider = visionProviders.find((provider) => provider.id === draft.visionApiProviderId);
  const visionModels = (visionProvider?.models ?? []).filter(modelSupportsVisionText);
  const visionModel = visionModels.find((model) => model.id === draft.visionModel);
  const visionValid = !draft.visionFallbackEnabled || Boolean(visionProvider && visionModel);
  const webSearch = draft.webSearch ?? defaultWebSearchSettings;
  const webSearchValid = isWebSearchConfigurationValid(webSearch);
  const canSave = visionValid && webSearchValid;

  const updateSetting = <K extends keyof AppSettings>(field: K, value: AppSettings[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateWebSearch = <K extends keyof AppSettings["webSearch"]>(
    field: K,
    value: AppSettings["webSearch"][K],
  ) => {
    setDraft((current) => ({
      ...current,
      webSearch: { ...(current.webSearch ?? defaultWebSearchSettings), [field]: value },
    }));
  };

  const selectVisionProvider = (providerId: string) => {
    const provider = visionProviders.find((candidate) => candidate.id === providerId);
    const firstModel = provider?.models.find(modelSupportsVisionText);
    setDraft((current) => ({
      ...current,
      visionApiProviderId: providerId,
      visionModel: firstModel?.id ?? "",
    }));
  };

  const searchProvider = searchProviderOptions.find(
    (provider) => provider.id === webSearch.searchProviderId,
  );
  const fetchProvider = fetchProviderOptions.find(
    (provider) => provider.id === webSearch.fetchProviderId,
  );

  const capabilityItems = [
    {
      key: "vision" as const,
      label: t("capabilityVision"),
      hint: t("capabilityVisionHint"),
      configured: visionValid && draft.visionFallbackEnabled,
      Icon: Eye,
    },
    {
      key: "search" as const,
      label: t("capabilitySearch"),
      hint: t("capabilitySearchHint"),
      configured: webSearchValid && Boolean(webSearch.searchProviderId),
      Icon: Search,
    },
    {
      key: "mcp" as const,
      label: t("capabilityMcp"),
      hint: t("capabilityMcpHint"),
      counts: capabilityState?.mcpCounts,
      configured: Boolean(capabilityState?.mcpServers.length),
      Icon: Boxes,
    },
    {
      key: "skills" as const,
      label: t("capabilitySkills"),
      hint: t("capabilitySkillsHint"),
      counts: capabilityState?.skillCounts,
      configured: Boolean(capabilityState?.skills.length),
      Icon: Wrench,
    },
  ];

  return (
    <section className="page capabilities-page">
      <article className="card capabilities-workspace">
        <aside className="capabilities-nav" aria-label={t("capabilities")}>
          <header>
            <h2>{t("capabilities")}</h2>
          </header>
          <div className="capability-menu">
            {capabilityItems.map(({ key, label, hint, counts, configured, Icon }) => (
              <button
                className={`capability-menu-item ${activeCapability === key ? "active" : ""}`}
                key={key}
                onClick={() => setActiveCapability(key)}
                type="button"
              >
                <span className="capability-menu-icon"><Icon size={18} /></span>
                <span className="capability-menu-copy">
                  <strong>{label}</strong>
                  {counts ? <AgentCountChips counts={counts} /> : <small>{hint}</small>}
                </span>
                <span className={`capability-status-dot ${configured ? "configured" : ""}`} />
              </button>
            ))}
            {capabilityError ? <p className="capability-nav-error">{capabilityError}</p> : null}
          </div>
        </aside>

        <div className={`capabilities-content ${activeCapability === "mcp" || activeCapability === "skills" ? "capability-manager-content" : ""}`}>
          {activeCapability === "mcp" && capabilityState ? (
            <CapabilityManager kind="mcp" state={capabilityState} onReload={reloadCapabilities} />
          ) : activeCapability === "skills" && capabilityState ? (
            <CapabilityManager kind="skills" state={capabilityState} onReload={reloadCapabilities} />
          ) : activeCapability === "vision" ? (
            <>
              <header className="capability-header">
                <span className="capability-header-icon"><Eye size={22} /></span>
                <div><h1>{t("capabilityVision")}</h1><p>{t("capabilityVisionHint")}</p></div>
                <span className={`capability-state ${visionValid && draft.visionFallbackEnabled ? "ready" : ""}`}>
                  <CheckCircle2 size={14} />
                  {visionValid && draft.visionFallbackEnabled
                    ? t("capabilityConfigured")
                    : t("capabilityNeedsSetup")}
                </span>
              </header>

              <section className="capability-setting-group">
                <div className="capability-setting-row">
                  <div className="capability-setting-title">
                    <span className="setting-row-icon"><Eye size={17} /></span>
                    <div><strong>{t("visionFallback")}</strong><small>{t("capabilityVisionHint")}</small></div>
                  </div>
                  <label className="switch-control">
                    <input
                      checked={draft.visionFallbackEnabled}
                      onChange={(event) => updateSetting("visionFallbackEnabled", event.target.checked)}
                      type="checkbox"
                    />
                    <span />
                  </label>
                </div>
              </section>

              <section className={`capability-setting-group ${draft.visionFallbackEnabled ? "" : "disabled"}`}>
                <div className="capability-setting-row">
                  <div className="capability-setting-title">
                    {visionProvider
                      ? <ProviderAvatar provider={visionProvider} size={28} />
                      : <span className="setting-row-icon"><Bot size={17} /></span>}
                    <strong>{t("visionProvider")}</strong>
                  </div>
                  <select
                    disabled={!draft.visionFallbackEnabled}
                    value={draft.visionApiProviderId}
                    onChange={(event) => selectVisionProvider(event.target.value)}
                  >
                    <option value="">{t("notConfigured")}</option>
                    {visionProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                  </select>
                </div>
                <div className="capability-setting-row capability-model-row">
                  <div className="capability-setting-title">
                    <span className="setting-row-icon"><Eye size={17} /></span>
                    <strong>{t("visionModel")}</strong>
                  </div>
                  <div className="capability-model-control">
                    <select
                      disabled={!draft.visionFallbackEnabled || !visionProvider}
                      value={draft.visionModel}
                      onChange={(event) => updateSetting("visionModel", event.target.value)}
                    >
                      <option value="">{t("notConfigured")}</option>
                      {visionModels.map((model) => (
                        <option key={model.id} value={model.id}>{model.name || model.id}</option>
                      ))}
                    </select>
                    {visionModel ? <ModelCapabilityBadges model={visionModel} /> : null}
                  </div>
                </div>
              </section>

              <section className={`capability-setting-group ${draft.visionFallbackEnabled ? "" : "disabled"}`}>
                <div className="capability-section-title">{t("visionAvailability")}</div>
                <div className="capability-scope-grid">
                  {[
                    ["visionChatEnabled", t("talking"), MessageSquare],
                    ["visionCodexEnabled", t("agentCodex"), "codex"],
                    ["visionClaudeEnabled", t("agentClaude"), "claude"],
                    ["visionGeminiEnabled", t("agentGemini"), "gemini"],
                  ].map(([field, label, Icon]) => (
                    <label className="capability-scope-option" key={field as string}>
                      {typeof Icon === "string" ? iconForAgent(Icon as "codex" | "claude" | "gemini") : <Icon size={17} />}
                      <span>{label as string}</span>
                      <input
                        checked={Boolean(draft[field as keyof AppSettings])}
                        disabled={!draft.visionFallbackEnabled}
                        onChange={(event) => updateSetting(
                          field as keyof AppSettings,
                          event.target.checked as never,
                        )}
                        type="checkbox"
                      />
                    </label>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <header className="capability-header">
                <span className="capability-header-icon"><Search size={22} /></span>
                <div><h1>{t("capabilitySearch")}</h1><p>{t("capabilitySearchHint")}</p></div>
                <span className={`capability-state ${webSearchValid && webSearch.searchProviderId ? "ready" : ""}`}>
                  <CheckCircle2 size={14} />
                  {webSearchValid && webSearch.searchProviderId
                    ? t("capabilityConfigured")
                    : t("capabilityNeedsSetup")}
                </span>
              </header>

              <section className="capability-setting-group">
                <div className="capability-setting-row">
                  <div className="capability-setting-title">
                    <span className="setting-row-icon"><Search size={17} /></span>
                    <strong>{t("searchProvider")}</strong>
                  </div>
                  <div className="provider-select-control">
                    <WebSearchProviderIcon
                      providerId={searchProvider?.id ?? ""}
                      providerName={searchProvider?.name ?? t("notConfigured")}
                    />
                    <select
                      value={webSearch.searchProviderId}
                      onChange={(event) => {
                        const providerId = event.target.value;
                        const option = searchProviderOptions.find((provider) => provider.id === providerId);
                        setDraft((current) => ({
                          ...current,
                          webSearch: {
                            ...(current.webSearch ?? defaultWebSearchSettings),
                            searchProviderId: providerId,
                            searchApiUrl: option?.apiUrl ?? "",
                            searchApiKeys: providerId === webSearch.searchProviderId
                              ? webSearch.searchApiKeys
                              : [],
                          },
                        }));
                      }}
                    >
                      <option value="">{t("notConfigured")}</option>
                      {searchProviderOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="capability-setting-row">
                  <div className="capability-setting-title">
                    <span className="setting-row-icon"><Link size={17} /></span>
                    <strong>{t("fetchProvider")}</strong>
                  </div>
                  <div className="provider-select-control">
                    <WebSearchProviderIcon
                      providerId={fetchProvider?.id ?? ""}
                      providerName={fetchProvider?.name ?? t("notConfigured")}
                    />
                    <select
                      value={webSearch.fetchProviderId}
                      onChange={(event) => {
                        const providerId = event.target.value;
                        const option = fetchProviderOptions.find((provider) => provider.id === providerId);
                        setDraft((current) => ({
                          ...current,
                          webSearch: {
                            ...(current.webSearch ?? defaultWebSearchSettings),
                            fetchProviderId: providerId,
                            fetchApiUrl: option?.apiUrl ?? "",
                            fetchApiKeys: providerId === webSearch.fetchProviderId
                              ? webSearch.fetchApiKeys
                              : [],
                          },
                        }));
                      }}
                    >
                      {fetchProviderOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {searchProvider ? (
                <section className="capability-setting-group capability-form-stack">
                  <label className="field">
                    <span>{searchProvider.name} API URL</span>
                    <input
                      value={webSearch.searchApiUrl}
                      onChange={(event) => updateWebSearch("searchApiUrl", event.target.value)}
                    />
                  </label>
                  {searchProvider.requiresKey ? (
                    <label className="field">
                      <span>{searchProvider.name} {t("apiKeys")}</span>
                      <input
                        type="password"
                        placeholder={t("apiKeyPlaceholder")}
                        value={webSearch.searchApiKeys[0] ?? ""}
                        onChange={(event) => updateWebSearch(
                          "searchApiKeys",
                          event.target.value.trim() ? [event.target.value] : [],
                        )}
                      />
                    </label>
                  ) : null}
                </section>
              ) : null}

              {fetchProvider?.id === "jina" ? (
                <section className="capability-setting-group capability-form-stack">
                  <label className="field">
                    <span>Jina Reader API URL</span>
                    <input
                      value={webSearch.fetchApiUrl}
                      onChange={(event) => updateWebSearch("fetchApiUrl", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Jina Reader {t("apiKeys")}</span>
                    <input
                      type="password"
                      placeholder={t("apiKeyPlaceholder")}
                      value={webSearch.fetchApiKeys[0] ?? ""}
                      onChange={(event) => updateWebSearch(
                        "fetchApiKeys",
                        event.target.value.trim() ? [event.target.value] : [],
                      )}
                    />
                  </label>
                </section>
              ) : null}

              <section className="capability-setting-group capability-form-grid">
                <label className="field">
                  <span>{t("maximumResults")}</span>
                  <input
                    min={1}
                    max={20}
                    type="number"
                    value={webSearch.maxResults}
                    onChange={(event) => updateWebSearch("maxResults", Number(event.target.value) || 1)}
                  />
                </label>
                <label className="field">
                  <span>{t("contentTokenLimit")}</span>
                  <input
                    min={500}
                    max={32000}
                    step={500}
                    type="number"
                    value={webSearch.cutoffTokens}
                    onChange={(event) => updateWebSearch("cutoffTokens", Number(event.target.value) || 500)}
                  />
                </label>
                <label className="field field-full">
                  <span>{t("excludedDomains")}</span>
                  <textarea
                    rows={3}
                    placeholder={"example.com\nspam.example"}
                    value={webSearch.excludeDomains.join("\n")}
                    onChange={(event) => updateWebSearch("excludeDomains", splitMultilineList(event.target.value))}
                  />
                </label>
              </section>
            </>
          )}

          {activeCapability === "vision" || activeCapability === "search" ? (
            <footer className="capabilities-footer">
              <button
                className="primary-button"
                disabled={!canSave}
                onClick={() => void onSave(draft)}
                type="button"
              >
                {t("saveCapabilities")}
              </button>
            </footer>
          ) : null}
        </div>
      </article>
    </section>
  );
}
