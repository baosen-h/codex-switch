import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { appApi } from "../api/tauri";
import { ModelCapabilityBadges } from "../components/ModelCapabilityBadges";
import { ProviderAvatar, ProviderTypeAvatar } from "../components/ProviderAvatar";
import type { ApiProvider, ApiProviderType, ProviderBalance } from "../types";
import { useI18n } from "../i18n/context";
import { DeleteIcon, EditIcon, RefreshIcon as SemiRefreshIcon } from "../components/UiIcons";
import { inferWireApiForApiProvider } from "../utils/providerConfig";

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
  wireApi: "chat",
  baseUrl: "",
  apiKey: "",
  websiteUrl: "",
  openAiAuthJson: undefined,
  models: [],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

const BALANCE_STORAGE_KEY = "codex-switch-provider-balance-v1";

function loadBalanceMap(): Record<string, ProviderBalance | { error: string }> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BALANCE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function websiteLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}` || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
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

export function ProvidersPage({ providers, onSave, onDelete, onNotify }: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<ApiProvider>(emptyApiProvider);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [balanceMap, setBalanceMap] = useState<Record<string, ProviderBalance | { error: string }>>(loadBalanceMap);
  const [loadingBalanceId, setLoadingBalanceId] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState("");
  const [oauthCallbackInput, setOauthCallbackInput] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState("");
  const [oauthManualMode, setOauthManualMode] = useState(false);
  const [isOauthBusy, setIsOauthBusy] = useState(false);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.enabled && !b.enabled) return -1;
        if (!a.enabled && b.enabled) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );

  useEffect(() => {
    try {
      localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(balanceMap));
    } catch {
      // Balance cache is best-effort UI state.
    }
  }, [balanceMap]);

  const openForm = (provider?: ApiProvider) => {
    setDraft(provider ? { ...provider, providerType: normalizeProviderType(provider.providerType) } : emptyApiProvider);
    setModelListError(null);
    setOauthStatus("");
    setOauthCallbackInput("");
    setOauthAuthUrl("");
    setOauthManualMode(false);
    setIsOauthBusy(false);
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyApiProvider);
    setModelListError(null);
    setOauthStatus("");
    setOauthCallbackInput("");
    setOauthAuthUrl("");
    setOauthManualMode(false);
    setIsOauthBusy(false);
    setView("list");
  };

  useEffect(() => {
    if (view !== "form" || normalizeProviderType(draft.providerType) !== "openai") return;
    let active = true;
    const unlisten = listen<string>("openai-oauth-code", async (event) => {
      if (!active) return;
      setIsOauthBusy(true);
      setOauthStatus("OAuth code received. Exchanging token...");
      try {
        const result = await appApi.completeOpenAiOauth(event.payload, draft.models[0]?.id);
        setDraft((current) => ({
          ...current,
          name: current.name.trim() || result.email || "OpenAI OAuth",
          providerType: "openai",
          baseUrl: "",
          apiKey: "",
          websiteUrl: "https://chatgpt.com",
          openAiAuthJson: result.authJson,
          enabled: true,
        }));
        setOauthStatus("OAuth complete. Save this API provider, then select it on Agents.");
        setOauthManualMode(false);
        setOauthCallbackInput("");
      } catch (error) {
        setOauthStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setIsOauthBusy(false);
      }
    });
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, [view, draft.providerType, draft.models]);

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
      wireApi: inferWireApiForApiProvider({ providerType: normalizedType, baseUrl: current.baseUrl }),
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
    const normalizedProviderType = normalizeProviderType(draft.providerType);
    await onSave({
      ...draft,
      providerType: normalizedProviderType,
      wireApi: inferWireApiForApiProvider({ providerType: normalizedProviderType, baseUrl: draft.baseUrl }),
    });
    closeForm();
  };

  const startOfficialOpenAiOauth = async () => {
    setIsOauthBusy(true);
    setOauthStatus("Generating OpenAI OAuth URL...");
    setOauthManualMode(false);
    setOauthCallbackInput("");
    setOauthAuthUrl("");
    try {
      const result = await appApi.startOpenAiOauth(true);
      setOauthAuthUrl(result.authUrl);
      if (result.manualCallbackRequired) {
        setOauthManualMode(true);
        setOauthStatus(result.message || "Finish login in the browser, then paste the callback URL below.");
      } else {
        setOauthStatus("Browser opened. Finish OpenAI login there.");
      }
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOauthBusy(false);
    }
  };

  const copyOfficialOpenAiOauthUrl = async () => {
    setIsOauthBusy(true);
    setOauthStatus("Generating OpenAI OAuth URL...");
    setOauthManualMode(true);
    setOauthCallbackInput("");
    try {
      const result = await appApi.startOpenAiOauth(false);
      setOauthAuthUrl(result.authUrl);
      setOauthStatus("OAuth URL generated. Open it in your browser, finish login, then paste the callback URL below.");
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOauthBusy(false);
    }
  };

  const submitOfficialOpenAiCallback = async () => {
    if (!oauthCallbackInput.trim()) return;
    setIsOauthBusy(true);
    setOauthStatus("Reading callback URL...");
    try {
      await appApi.submitOpenAiOauthCallback(oauthCallbackInput);
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
      setIsOauthBusy(false);
    }
  };

  const openWebsite = async (url: string) => {
    try {
      await appApi.openExternalUrl(url);
    } catch (error) {
      console.error("Failed to open website", error);
    }
  };

  const refreshBalance = async (provider: ApiProvider) => {
    setLoadingBalanceId(provider.id);
    try {
      const balance = await appApi.getProviderBalance(provider);
      setBalanceMap((current) => ({ ...current, [provider.id]: balance }));
    } catch (error) {
      setBalanceMap((current) => ({
        ...current,
        [provider.id]: { error: error instanceof Error ? error.message : String(error) },
      }));
    } finally {
      setLoadingBalanceId((current) => (current === provider.id ? null : current));
    }
  };

  const balanceText = (balance?: ProviderBalance | { error: string }) => {
    if (!balance) return "--";
    if ("error" in balance) return "—";
    if (typeof balance.creditsBalance === "number") {
      return `${balance.creditsBalance.toFixed(2)} USD`;
    }
    if (balance.remaining !== undefined) {
      return `${balance.remaining.toFixed(balance.unit === "%" ? 0 : 2)} ${balance.unit}`;
    }
    return balance.strategy;
  };

  const balanceTitle = (balance?: ProviderBalance | { error: string }) => {
    if (!balance) return "Refresh balance";
    if ("error" in balance) return balance.error;
    return `${balance.label} · ${balance.strategy}`;
  };

  const quotaTone = (value?: number) => {
    if (value === undefined) return "";
    if (value >= 50) return "green";
    if (value >= 20) return "orange";
    return "red";
  };

  const renderQuotaCard = (label: string, value?: number, reset?: string, variant: "five-hour" | "weekly" = "five-hour") => {
    const tone = quotaTone(value);
    const height = Math.max(8, Math.min(100, value ?? 0));
    return (
      <div className={`quota-mini-card quota-mini-card-${variant}`}>
        <div className={`quota-mini-bg ${tone}`} style={{ height: `${height}%` }} />
        <div className="quota-mini-content">
          <span className="quota-label">{label}</span>
          <span className="quota-time">{reset || "--"}</span>
          <strong className={`quota-percent ${tone}`}>{value ?? "--"}%</strong>
        </div>
      </div>
    );
  };

  const renderBalancePanel = (provider: ApiProvider, balance?: ProviderBalance | { error: string }) => {
    const quotaBalance =
      balance && !("error" in balance) && (balance.fiveHourLeft !== undefined || balance.weeklyLeft !== undefined)
        ? balance
        : null;
    const openAiQuota = provider.providerType === "openai";
    return (
      <div className={`provider-balance-panel ${openAiQuota ? "provider-balance-panel-quota" : ""}`} title={balanceTitle(balance)}>
        {openAiQuota ? (
          <>
            <button
              className="icon-button balance-refresh-button"
              disabled={loadingBalanceId === provider.id}
              onClick={() => void refreshBalance(provider)}
              type="button"
              title={balanceTitle(balance)}
            >
              <SemiRefreshIcon />
            </button>
            {quotaBalance ? (
              <div className="provider-quota-grid">
                {renderQuotaCard(quotaBalance.fiveHourLabel || t("quotaFiveHour"), quotaBalance.fiveHourLeft, quotaBalance.fiveHourReset, "five-hour")}
                {renderQuotaCard(quotaBalance.weeklyLabel || t("quotaWeekly"), quotaBalance.weeklyLeft, quotaBalance.weeklyReset, "weekly")}
              </div>
            ) : null}
          </>
        ) : (
          <div className="provider-balance-row">
            <strong className={`provider-balance-value ${balance && "error" in balance ? "provider-balance-error" : ""}`}>
              {loadingBalanceId === provider.id ? "..." : balanceText(balance)}
            </strong>
            <button
              className="icon-button balance-refresh-button"
              disabled={loadingBalanceId === provider.id}
              onClick={() => void refreshBalance(provider)}
              type="button"
              title={balanceTitle(balance)}
            >
              <SemiRefreshIcon />
            </button>
          </div>
        )}
      </div>
    );
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
                {normalizeProviderType(draft.providerType) === "openai" ? (
                  <div className="field field-full oauth-panel">
                    <span>Official OpenAI OAuth</span>
                    <div className="oauth-actions">
                      <button
                        className="secondary-button"
                        disabled={isOauthBusy}
                        onClick={() => void startOfficialOpenAiOauth()}
                        type="button"
                      >
                        Login with OpenAI
                      </button>
                      <button
                        className="secondary-button"
                        disabled={isOauthBusy}
                        onClick={() => void copyOfficialOpenAiOauthUrl()}
                        type="button"
                      >
                        Generate URL
                      </button>
                    </div>
                    {oauthStatus ? <p className="model-picker-status">{oauthStatus}</p> : null}
                    {oauthAuthUrl ? (
                      <textarea
                        className="config-preview oauth-url-preview"
                        readOnly
                        rows={3}
                        value={oauthAuthUrl}
                        spellCheck={false}
                      />
                    ) : null}
                    {oauthManualMode ? (
                      <div className="oauth-manual-callback">
                        <textarea
                          className="config-preview oauth-url-preview"
                          rows={4}
                          value={oauthCallbackInput}
                          onChange={(event) => setOauthCallbackInput(event.target.value)}
                          placeholder="http://localhost:1455/auth/callback?code=...&state=..."
                          spellCheck={false}
                        />
                        <button
                          className="secondary-button"
                          disabled={isOauthBusy || !oauthCallbackInput.trim()}
                          onClick={() => void submitOfficialOpenAiCallback()}
                          type="button"
                        >
                          Finish OAuth
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
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
                        <div className="api-model-pill-main">
                          <strong>{model.name || model.id}</strong>
                          <span>{model.name && model.name !== model.id ? model.id : model.ownedBy || model.description || t("modelFromProvider")}</span>
                        </div>
                        <ModelCapabilityBadges model={model} />
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
            sortedProviders.map((provider) => {
              const balance = balanceMap[provider.id];
              return (
                <div className={`provider-row api-provider-row ${provider.enabled ? "provider-row-current" : ""}`} key={provider.id}>
                  <div className="provider-info">
                    <div className="provider-title">
                      <ProviderAvatar provider={provider} size={56} />
                      <div className="provider-title-text">
                        <strong>{provider.name}</strong>
                        <small>{providerTypeLabel(provider.providerType)}</small>
                      </div>
                    </div>
                    {provider.websiteUrl.trim() ? (
                      <button className="provider-link" onClick={() => void openWebsite(provider.websiteUrl)} title={provider.websiteUrl} type="button">
                        {websiteLabel(provider.websiteUrl)}
                      </button>
                    ) : null}
                    {renderBalancePanel(provider, balance)}
                  </div>
                  <div className="provider-actions">
                    <span className="provider-model-count">
                      {provider.models.length} {t("models")}
                    </span>
                    <button className="secondary-button icon-action-button" onClick={() => openForm(provider)} type="button" title={t("edit")}>
                      <EditIcon />
                    </button>
                    <button className="danger-button icon-action-button" onClick={() => void onDelete(provider.id)} type="button" title={t("del")}>
                      <DeleteIcon />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-state">{t("noApiProviders")}</p>
          )}
        </div>
      </article>
    </section>
  );
}
