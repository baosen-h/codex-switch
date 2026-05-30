import { useEffect, useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar } from "../components/ProviderAvatar";
import type { AgentKind, ApiProvider, Provider, RemoteModel } from "../types";
import { useI18n } from "../i18n/context";
import { iconForAgent } from "../components/BrandIcons";
import {
  agentTabs,
  defaultModelForAgent,
  emptyProvider,
  patchProviderPreviewField,
  patchProviderPreviewFromFields,
  renderInstructionTemplate,
  renderCodexOAuthPreview,
  renderProviderPreview,
} from "../utils/providerConfig";
import { DeleteIcon, EditIcon, PlayIcon } from "../components/UiIcons";

interface AgentsPageProps {
  apiProviders: ApiProvider[];
  providers: Provider[];
  onSave: (provider: Provider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
}

const AddIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <rect x="5" y="1" width="2" height="10"/>
    <rect x="1" y="5" width="10" height="2"/>
  </svg>
);

const BackIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <rect x="1" y="5" width="7" height="2"/>
    <rect x="1" y="3" width="2" height="2"/>
    <rect x="3" y="1" width="2" height="2"/>
    <rect x="1" y="7" width="2" height="2"/>
    <rect x="3" y="9" width="2" height="2"/>
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M11.5 4.2A5 5 0 0 0 2 5.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M9.2 4.4h2.5V1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.5 9.8A5 5 0 0 0 12 8.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M4.8 9.6H2.3v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export function AgentsPage({
  apiProviders,
  providers,
  onSave,
  onDelete,
  onActivate,
}: AgentsPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKind>("codex");
  const [modelOptions, setModelOptions] = useState<RemoteModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<AgentKind, number> = { codex: 0, claude: 0, gemini: 0 };
    providers.forEach((p) => { counts[p.agent]++; });
    return counts;
  }, [providers]);

  const visibleProviders = useMemo(
    () => sortedProviders.filter((p) => p.agent === activeAgent),
    [sortedProviders, activeAgent],
  );

  const enabledApiProviders = useMemo(
    () =>
      [...apiProviders]
        .filter((provider) => provider.enabled)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apiProviders],
  );

  const selectedApiProvider = useMemo(
    () => enabledApiProviders.find((provider) => provider.id === draft.apiProviderId),
    [draft.apiProviderId, enabledApiProviders],
  );

  const filteredModelOptions = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return modelOptions;

    return modelOptions.filter((model) =>
      [model.id, model.name, model.ownedBy, model.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [modelOptions, modelSearch]);

  const openForm = (provider?: Provider) => {
    const base = provider ?? { ...emptyProvider, agent: activeAgent, model: defaultModelForAgent(activeAgent) };
    const linkedApiProvider = enabledApiProviders.find((item) => item.id === base.apiProviderId);
    const initial: Provider = {
      ...base,
      apiProviderId: base.apiProviderId || linkedApiProvider?.id || "",
      configText: base.configText || renderProviderPreview(base),
    };
    setDraft(initial);
    setModelOptions(linkedApiProvider?.models ?? []);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
    setShowAdvanced(Boolean(provider));
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyProvider);
    setModelOptions([]);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
    setShowAdvanced(false);
    setView("list");
  };

  const updateDraft = (field: keyof Provider, value: string) => {
    if (field === "baseUrl" || field === "apiKey" || field === "apiProviderId") {
      setModelOptions([]);
      setModelSearch("");
      setIsModelListOpen(false);
      setModelListError(null);
    }

    setDraft((cur) => {
      const next = { ...cur, [field]: value };
      return {
        ...next,
        configText: patchProviderPreviewField(next, field, value),
      };
    });
  };

  const applyApiProvider = (apiProviderId: string) => {
    const apiProvider = enabledApiProviders.find((item) => item.id === apiProviderId);
    setModelOptions(apiProvider?.models ?? []);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
    setDraft((cur) => {
      const next = {
        ...cur,
        apiProviderId,
        baseUrl: apiProvider?.baseUrl ?? "",
        apiKey: apiProvider?.apiKey ?? "",
        websiteUrl: apiProvider?.websiteUrl ?? "",
        wireApi: apiProvider?.wireApi ?? cur.wireApi,
      };
      const providerModels = apiProvider?.models ?? [];
      const modelStillAvailable = providerModels.some((model) => model.id === next.model);
      const withModel =
        modelStillAvailable || !apiProvider
          ? next
          : { ...next, model: providerModels[0]?.id ?? defaultModelForAgent(next.agent) };
      const configText =
        withModel.agent === "codex" && apiProvider?.openAiAuthJson
          ? renderCodexOAuthPreview(withModel.model, apiProvider.openAiAuthJson)
          : patchProviderPreviewFromFields(withModel);
      return {
        ...withModel,
        configText,
      };
    });
  };

  const updatePreview = (value: string) => {
    setDraft((cur) => ({
      ...cur,
      configText: value,
    }));
  };

  const resetPreview = () => {
    setDraft((cur) => ({ ...cur, configText: patchProviderPreviewFromFields(cur) }));
  };

  const handleSubmit = async () => {
    await onSave(draft);
    closeForm();
  };

  const loadModelOptions = async () => {
    if (!draft.baseUrl.trim()) {
      setModelListError(t("modelBaseUrlRequired"));
      return;
    }

    setIsLoadingModels(true);
    setModelListError(null);
    setIsModelListOpen(true);

    try {
      const models = await appApi.listProviderModels({
        providerType: selectedApiProvider?.providerType ?? "openai-compatible",
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
      });
      setModelOptions(models);
      setModelSearch("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setModelListError(detail || t("modelListError"));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const agentLabel = (agent: AgentKind): string => {
    if (agent === "claude") return t("agentClaude");
    if (agent === "gemini") return t("agentGemini");
    return t("agentCodex");
  };

  const avatarSourceForProvider = (provider: Provider): Pick<ApiProvider, "name" | "providerType" | "baseUrl"> => {
    const linked = apiProviders.find((item) => item.id === provider.apiProviderId);
    return linked ?? {
      name: provider.name,
      providerType: "openai-compatible",
      baseUrl: `${provider.name} ${provider.baseUrl}`,
    };
  };

  if (view === "form") {
    const isEditing = Boolean(draft.id);
    return (
      <section className="page providers-page">
        <article className="card provider-edit-card">
          <div className="card-heading provider-edit-heading">
            <div>
              <span className="eyebrow">{isEditing ? t("edit") : "New"}</span>
              <h3>{isEditing ? draft.name || "Draft" : t("addProvider")}</h3>
              <div className="agent-chip">
                {iconForAgent(draft.agent)}
                <span>{agentLabel(draft.agent)}</span>
              </div>
            </div>
            <button className="back-button" onClick={closeForm} type="button">
              <BackIcon />
              <span>{t("back")}</span>
            </button>
          </div>

          <div className="provider-editor-layout">
            <div className="provider-form-panel">
              <div className="form-grid compact-form-grid">
                <label className="field">
                  <span>{t("name")}</span>
                  <input value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} placeholder="My Provider" />
                </label>
                <label className="field">
                  <span>{t("apiProvider")}</span>
                  <select value={draft.apiProviderId} onChange={(e) => applyApiProvider(e.target.value)}>
                    <option value="">{t("manualProvider")}</option>
                    {enabledApiProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field model-picker-field">
                  <span>{t("model")}</span>
                  <div className="model-picker">
                    <div className="model-picker-control">
                      <input
                        value={draft.model}
                        onChange={(e) => {
                          updateDraft("model", e.target.value);
                          setModelSearch(e.target.value);
                          if (modelOptions.length) setIsModelListOpen(true);
                        }}
                        onFocus={() => {
                          if (modelOptions.length) setIsModelListOpen(true);
                        }}
                        placeholder={defaultModelForAgent(draft.agent)}
                      />
                      <button
                        className="model-picker-button"
                        disabled={!modelOptions.length && isLoadingModels}
                        onClick={() => {
                          setModelSearch("");
                          if (modelOptions.length) {
                            setIsModelListOpen((open) => !open);
                          } else {
                            void loadModelOptions();
                          }
                        }}
                        title={t("chooseModel")}
                        type="button"
                      >
                        <ChevronDownIcon />
                      </button>
                      <button
                        className="model-picker-button model-picker-fetch"
                        disabled={!draft.baseUrl.trim() || isLoadingModels}
                        onClick={() => void loadModelOptions()}
                        title={modelOptions.length ? t("refreshModels") : t("fetchModels")}
                        type="button"
                      >
                        <RefreshIcon />
                      </button>
                    </div>
                    {isLoadingModels ? (
                      <p className="model-picker-status">{t("loadingModels")}</p>
                    ) : modelListError ? (
                      <p className="model-picker-status model-picker-status-error">{modelListError}</p>
                    ) : null}
                    {isModelListOpen ? (
                      <div className="model-picker-menu">
                        {filteredModelOptions.length ? (
                          filteredModelOptions.map((model) => (
                            <button
                              className={`model-picker-option ${draft.model === model.id ? "active" : ""}`}
                              key={model.id}
                              onClick={() => {
                                updateDraft("model", model.id);
                                setModelSearch("");
                                setIsModelListOpen(false);
                              }}
                              type="button"
                            >
                              <span className="model-picker-option-title">{model.name || model.id}</span>
                              <span className="model-picker-option-meta">
                                {model.name && model.name !== model.id ? model.id : model.ownedBy || model.description || t("modelFromProvider")}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="model-picker-empty">
                            {isLoadingModels ? t("loadingModels") : t("noModelsFound")}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </label>
                <label className="field">
                  <span>{t("baseUrl")}</span>
                  <input value={draft.baseUrl} onChange={(e) => updateDraft("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
                </label>
                <label className="field field-full">
                  <span>{t("apiKey")}</span>
                  <input value={draft.apiKey} onChange={(e) => updateDraft("apiKey", e.target.value)} placeholder="sk-..." type="password" />
                </label>
              </div>

              <div className="template-inline-block">
                <div className="preview-header">
                  <span className="detail-label">{t("templateGuide")}</span>
                </div>
                <p className="preview-hint">{t("templateGuideHint")}</p>
                <textarea
                  className="config-preview template-preview compact-template-preview"
                  value={renderInstructionTemplate(draft.agent)}
                  readOnly
                  rows={8}
                  spellCheck={false}
                />
              </div>

            </div>

            <div className="preview-block provider-preview-panel">
              <div className="preview-header">
                <span className="detail-label">{t("configPreview")}</span>
              </div>
              <p className="preview-hint">{t("configPreviewHint")}</p>
              <textarea
                className="config-preview provider-config-preview"
                value={draft.configText}
                onChange={(e) => updatePreview(e.target.value)}
                rows={26}
                spellCheck={false}
              />
            </div>

            <div className="actions">
              <button
                className="primary-button"
                disabled={!draft.name.trim()}
                onClick={() => void handleSubmit()}
                type="button"
              >
                {isEditing ? t("save") : t("create")}
              </button>
            </div>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="page providers-page">
      <article className="card provider-connected-card">
        <div className="provider-toolbar">
          <div className="provider-tabs provider-tabs-connected">
            {agentTabs.map((agent) => (
              <button
                key={agent}
                type="button"
                className={`provider-tab ${activeAgent === agent ? "active" : ""}`}
                onClick={() => setActiveAgent(agent)}
              >
                {iconForAgent(agent)}
                <span>{agentLabel(agent)}</span>
                <small>{tabCounts[agent]}</small>
              </button>
            ))}
          </div>
          <button className="add-button add-button-compact" onClick={() => openForm()} type="button" title={t("addProvider")}>
            <AddIcon />
          </button>
        </div>

        <div className="provider-list">
          {visibleProviders.length ? (
            visibleProviders.map((provider) => (
              <div className={`provider-row agent-provider-row ${provider.isCurrent ? "provider-row-current" : ""}`} key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    <ProviderAvatar provider={avatarSourceForProvider(provider)} size={56} />
                    <div className="provider-title-text">
                      <strong>{provider.name}</strong>
                    </div>
                  </div>
                  <p>{provider.model || "—"}</p>
                </div>
                <div className="provider-actions">
                  <button className="secondary-button icon-action-button" onClick={() => openForm(provider)} type="button" title={t("edit")}><EditIcon /></button>
                  {!provider.isCurrent ? (
                    <button className="secondary-button icon-action-button" onClick={() => void onActivate(provider.id)} type="button" title={t("enable")}><PlayIcon /></button>
                  ) : null}
                  <button className="danger-button icon-action-button" onClick={() => void onDelete(provider.id)} type="button" title={t("del")}><DeleteIcon /></button>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">{t("noProviders")}</p>
          )}
        </div>
      </article>
    </section>
  );
}
