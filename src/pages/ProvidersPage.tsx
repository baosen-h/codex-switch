import { useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import type { AgentKind, Provider } from "../types";
import { useI18n } from "../i18n/context";
import { iconForAgent } from "../components/BrandIcons";
import {
  agentTabs,
  defaultModelForAgent,
  emptyProvider,
  patchProviderPreviewField,
  patchProviderPreviewFromFields,
  providerEndpointLabel,
  renderInstructionTemplate,
  renderProviderPreview,
} from "../utils/providerConfig";

interface ProvidersPageProps {
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

export function ProvidersPage({
  providers,
  onSave,
  onDelete,
  onActivate,
}: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKind>("codex");

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

  const openForm = (provider?: Provider) => {
    const base = provider ?? { ...emptyProvider, agent: activeAgent, model: defaultModelForAgent(activeAgent) };
    const initial: Provider = {
      ...base,
      configText: base.configText || renderProviderPreview(base),
    };
    setDraft(initial);
    setShowAdvanced(Boolean(provider));
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyProvider);
    setShowAdvanced(false);
    setView("list");
  };

  const updateDraft = (field: keyof Provider, value: string) =>
    setDraft((cur) => {
      const next = { ...cur, [field]: value };
      return {
        ...next,
        configText: patchProviderPreviewField(next, field, value),
      };
    });

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

  const openWebsite = async (url: string) => {
    try {
      await appApi.openExternalUrl(url);
    } catch (error) {
      console.error("Failed to open website", error);
    }
  };

  const agentLabel = (agent: AgentKind): string => {
    if (agent === "claude") return t("agentClaude");
    if (agent === "gemini") return t("agentGemini");
    return t("agentCodex");
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
                  <span>{t("model")}</span>
                  <input value={draft.model} onChange={(e) => updateDraft("model", e.target.value)} placeholder={defaultModelForAgent(draft.agent)} />
                </label>
                <label className="field">
                  <span>{t("baseUrl")}</span>
                  <input value={draft.baseUrl} onChange={(e) => updateDraft("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
                </label>
                <label className="field">
                  <span>{t("officialWebsite")}</span>
                  <input value={draft.websiteUrl} onChange={(e) => updateDraft("websiteUrl", e.target.value)} placeholder="https://example.com" />
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
          <button className="add-button add-button-compact" onClick={() => openForm()} type="button" title="Add provider">
            <AddIcon />
          </button>
        </div>

        <div className="provider-list">
          {visibleProviders.length ? (
            visibleProviders.map((provider) => (
              <div className={`provider-row ${provider.isCurrent ? "provider-row-current" : ""}`} key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    {iconForAgent(provider.agent)}
                    <strong>{provider.name}</strong>
                  </div>
                  <p>{provider.model || "—"}</p>
                  {provider.websiteUrl.trim() ? (
                    <button
                      className="provider-link"
                      onClick={() => void openWebsite(provider.websiteUrl)}
                      type="button"
                    >
                      {providerEndpointLabel(provider)}
                    </button>
                  ) : null}
                </div>
                <div className="provider-actions">
                  <button className="secondary-button" onClick={() => openForm(provider)} type="button">{t("edit")}</button>
                  {!provider.isCurrent ? (
                    <button className="secondary-button" onClick={() => void onActivate(provider.id)} type="button">{t("enable")}</button>
                  ) : null}
                  <button className="danger-button" onClick={() => void onDelete(provider.id)} type="button">{t("del")}</button>
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
