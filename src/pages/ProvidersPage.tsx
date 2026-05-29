import { useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar, ProviderTypeAvatar } from "../components/ProviderAvatar";
import type { ApiProvider, ApiProviderType, RemoteModel, WireApi } from "../types";
import { useI18n } from "../i18n/context";
import { DeleteIcon, EditIcon } from "../components/UiIcons";

interface ProvidersPageProps {
  providers: ApiProvider[];
  onSave: (provider: ApiProvider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNotify: (message: string, type: "ok" | "err") => void;
}

const providerTypes: Array<{ value: ApiProviderType; label: string; baseUrl: string; websiteUrl: string }> = [
  { value: "openai-compatible", label: "OpenAI Compatible / New API", baseUrl: "https://api.example.com/v1", websiteUrl: "" },
  { value: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", websiteUrl: "https://platform.openai.com" },
  { value: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", websiteUrl: "https://console.anthropic.com" },
  { value: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", websiteUrl: "https://aistudio.google.com" },
  { value: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", websiteUrl: "https://openrouter.ai" },
  { value: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", websiteUrl: "https://ollama.com" },
  { value: "huggingface", label: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", websiteUrl: "https://huggingface.co" },
];

const normalizeProviderType = (providerType: ApiProviderType): ApiProviderType =>
  providerType === "new-api" ? "openai-compatible" : providerType;

const providerTypeLabel = (providerType: ApiProviderType): string =>
  providerTypes.find((item) => item.value === normalizeProviderType(providerType))?.label ?? providerType;

const emptyApiProvider: ApiProvider = {
  id: "",
  name: "",
  providerType: "openai-compatible",
  wireApi: "responses",
  baseUrl: "",
  apiKey: "",
  websiteUrl: "",
  models: [],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

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

export function ProvidersPage({ providers, onSave, onDelete, onNotify }: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<ApiProvider>(emptyApiProvider);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.enabled && !b.enabled) return -1;
        if (!a.enabled && b.enabled) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );

  const openForm = (provider?: ApiProvider) => {
    setDraft(provider ? { ...provider, providerType: normalizeProviderType(provider.providerType) } : emptyApiProvider);
    setModelListError(null);
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyApiProvider);
    setModelListError(null);
    setView("list");
  };

  const updateDraft = <K extends keyof ApiProvider>(field: K, value: ApiProvider[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === "baseUrl" || field === "apiKey") {
      setModelListError(null);
    }
  };

  const applyProviderType = (providerType: ApiProviderType) => {
    const normalizedType = normalizeProviderType(providerType);
    const preset = providerTypes.find((item) => item.value === normalizedType);
    const previousPreset = providerTypes.find((item) => item.value === normalizeProviderType(draft.providerType));
    setDraft((current) => ({
      ...current,
      providerType: normalizedType,
      baseUrl:
        !current.baseUrl || current.baseUrl === previousPreset?.baseUrl
          ? preset?.baseUrl || ""
          : current.baseUrl,
      websiteUrl:
        !current.websiteUrl || current.websiteUrl === previousPreset?.websiteUrl
          ? preset?.websiteUrl || ""
          : current.websiteUrl,
    }));
  };

  const refreshModels = async () => {
    if (!draft.baseUrl.trim()) {
      setModelListError(t("modelBaseUrlRequired"));
      return;
    }

    setIsLoadingModels(true);
    setModelListError(null);
    try {
      const models = await appApi.listProviderModels({
        providerType: draft.providerType,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
      });
      setDraft((current) => ({ ...current, models }));
      onNotify(`${models.length} ${t("modelsLoaded")}`, "ok");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setModelListError(detail || t("modelListError"));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSubmit = async () => {
    await onSave({ ...draft, providerType: normalizeProviderType(draft.providerType) });
    closeForm();
  };

  const openWebsite = async (url: string) => {
    try {
      await appApi.openExternalUrl(url);
    } catch (error) {
      console.error("Failed to open website", error);
    }
  };

  if (view === "form") {
    const isEditing = Boolean(draft.id);
    return (
      <section className="page providers-page">
        <article className="card provider-edit-card">
          <div className="card-heading provider-edit-heading">
            <div>
              <span className="eyebrow">{isEditing ? t("edit") : t("newProvider")}</span>
              <div className="provider-edit-title">
                <ProviderTypeAvatar providerType={draft.providerType} size={34} />
                <h3>{draft.name || t("apiProvider")}</h3>
              </div>
            </div>
            <button className="back-button" onClick={closeForm} type="button">
              <BackIcon />
              <span>{t("back")}</span>
            </button>
          </div>

          <div className="provider-editor-layout api-provider-editor-layout">
            <div className="provider-form-panel">
              <div className="form-grid compact-form-grid">
                <label className="field">
                  <span>{t("name")}</span>
                  <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="OpenRouter" />
                </label>
                <label className="field">
                  <span>{t("providerType")}</span>
                  <select value={normalizeProviderType(draft.providerType)} onChange={(event) => applyProviderType(event.target.value as ApiProviderType)}>
                    {providerTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Upstream protocol</span>
                  <select value={draft.wireApi} onChange={(event) => updateDraft("wireApi", event.target.value as WireApi)}>
                    <option value="responses">responses · /v1/responses</option>
                    <option value="chat">chat_completions · /chat/completions</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t("baseUrl")}</span>
                  <input value={draft.baseUrl} onChange={(event) => updateDraft("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" />
                </label>
                <label className="field">
                  <span>{t("officialWebsite")}</span>
                  <input value={draft.websiteUrl} onChange={(event) => updateDraft("websiteUrl", event.target.value)} placeholder="https://example.com" />
                </label>
                <label className="field field-full">
                  <span>{t("apiKey")}</span>
                  <input value={draft.apiKey} onChange={(event) => updateDraft("apiKey", event.target.value)} placeholder="sk-..." type="password" />
                </label>
                <label className="checkbox-field">
                  <input checked={draft.enabled} onChange={(event) => updateDraft("enabled", event.target.checked)} type="checkbox" />
                  <span>{t("providerEnabled")}</span>
                </label>
              </div>

              <div className="provider-models-panel">
                <div className="preview-header">
                  <span className="detail-label">{t("modelList")}</span>
                  <button
                    className="secondary-button icon-text-button"
                    disabled={!draft.baseUrl.trim() || isLoadingModels}
                    onClick={() => void refreshModels()}
                    type="button"
                  >
                    <RefreshIcon />
                    <span>{draft.models.length ? t("refreshModels") : t("fetchModels")}</span>
                  </button>
                </div>
                {isLoadingModels ? <p className="model-picker-status">{t("loadingModels")}</p> : null}
                {modelListError ? <p className="model-picker-status model-picker-status-error">{modelListError}</p> : null}
                <div className="api-model-list">
                  {draft.models.length ? (
                    draft.models.map((model) => (
                      <div className="api-model-pill" key={model.id}>
                        <strong>{model.name || model.id}</strong>
                        <span>{model.name && model.name !== model.id ? model.id : model.ownedBy || model.description || t("modelFromProvider")}</span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">{t("noModelsFound")}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="actions">
              <button className="primary-button" disabled={!draft.name.trim()} onClick={() => void handleSubmit()} type="button">
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
          <div className="toolbar-title-block">
            <div>
              <span className="eyebrow">{t("providers")}</span>
              <h2>{t("apiProviders")}</h2>
            </div>
            <span className="toolbar-count">{providers.length}</span>
          </div>
          <button className="add-button add-button-compact" onClick={() => openForm()} type="button" title={t("addProvider")}>
            <AddIcon />
          </button>
        </div>

        <div className="provider-list">
          {sortedProviders.length ? (
            sortedProviders.map((provider) => (
              <div className={`provider-row ${provider.enabled ? "provider-row-current" : ""}`} key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    <ProviderAvatar provider={provider} size={56} />
                    <div className="provider-title-text">
                      <strong>{provider.name}</strong>
                      <small>{providerTypeLabel(provider.providerType)}</small>
                      <small>{provider.wireApi === "chat" ? "chat_completions" : "responses"}</small>
                    </div>
                  </div>
                  <p>{provider.baseUrl || t("openaiDefault")}</p>
                  {provider.websiteUrl.trim() ? (
                    <button className="provider-link" onClick={() => void openWebsite(provider.websiteUrl)} type="button">
                      {provider.websiteUrl}
                    </button>
                  ) : null}
                </div>
                <div className="provider-actions">
                  <span className="provider-model-count">{provider.models.length} {t("models")}</span>
                  <button className="secondary-button icon-action-button" onClick={() => openForm(provider)} type="button" title={t("edit")}><EditIcon /></button>
                  <button className="danger-button icon-action-button" onClick={() => void onDelete(provider.id)} type="button" title={t("del")}><DeleteIcon /></button>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">{t("noApiProviders")}</p>
          )}
        </div>
      </article>
    </section>
  );
}
