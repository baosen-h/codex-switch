import { useEffect, useMemo, useState } from "react";
import type { AgentKind, Provider } from "../types";
import { useI18n } from "../i18n/context";
import { iconForAgent } from "../components/BrandIcons";
import {
  agentTabs,
  defaultModelForAgent,
  emptyProvider,
  providerEndpointLabel,
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

export function ProvidersPage({ providers, onSave, onDelete, onActivate }: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKind>("codex");
  const [previewDirty, setPreviewDirty] = useState(false);

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

  // Auto-regen preview from form fields while user hasn't touched the preview.
  useEffect(() => {
    if (view !== "form" || previewDirty) return;
    const regenerated = renderProviderPreview(draft);
    if (regenerated !== draft.configText) {
      setDraft((cur) => ({ ...cur, configText: regenerated }));
    }
  }, [draft.agent, draft.name, draft.baseUrl, draft.apiKey, draft.websiteUrl, draft.model, draft.reasoningEffort, draft.extraToml, view, previewDirty]);

  const openForm = (provider?: Provider) => {
    const base = provider ?? { ...emptyProvider, agent: activeAgent, model: defaultModelForAgent(activeAgent) };
    const initial: Provider = {
      ...base,
      configText: base.configText || renderProviderPreview(base),
    };
    setDraft(initial);
    setShowAdvanced(Boolean(provider));
    setPreviewDirty(Boolean(provider?.configText));
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyProvider);
    setShowAdvanced(false);
    setPreviewDirty(false);
    setView("list");
  };

  const updateDraft = (field: keyof Provider, value: string) =>
    setDraft((cur) => ({ ...cur, [field]: value }));

  const updatePreview = (value: string) => {
    setPreviewDirty(true);
    setDraft((cur) => ({ ...cur, configText: value }));
  };

  const resetPreview = () => {
    setPreviewDirty(false);
    setDraft((cur) => ({ ...cur, configText: renderProviderPreview(cur) }));
  };

  const handleSubmit = async () => {
    await onSave(draft);
    closeForm();
  };

  const agentLabel = (agent: AgentKind): string => {
    if (agent === "claude") return t("agentClaude");
    if (agent === "gemini") return t("agentGemini");
    return t("agentCodex");
  };

  if (view === "form") {
    const isEditing = Boolean(draft.id);
    return (
      <section className="page">
        <header className="page-header">
          <h2>{isEditing ? t("editProvider") : t("newProvider")}</h2>
        </header>

        <article className="card">
          <div className="card-heading">
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

          <div className="form-grid">
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
            <label className="field">
              <span>{t("apiKey")}</span>
              <input value={draft.apiKey} onChange={(e) => updateDraft("apiKey", e.target.value)} placeholder="sk-..." type="password" />
            </label>
          </div>

          {draft.agent === "codex" && (
            <>
              <button className="toggle-advanced" type="button" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? t("hideAdvanced") : t("advanced")}
              </button>
              {showAdvanced && (
                <div className="form-grid">
                  <label className="field">
                    <span>{t("reasoningEffort")}</span>
                    <select value={draft.reasoningEffort} onChange={(e) => updateDraft("reasoningEffort", e.target.value)}>
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                  <label className="field field-full">
                    <span>{t("extraToml")}</span>
                    <textarea value={draft.extraToml} onChange={(e) => updateDraft("extraToml", e.target.value)} placeholder={`[experimental]\nproject_doc = "AGENTS.md"`} rows={4} />
                  </label>
                </div>
              )}
            </>
          )}

          <div className="preview-block">
            <div className="preview-header">
              <span className="detail-label">{t("configPreview")}</span>
              <button
                type="button"
                className="preview-reset"
                onClick={resetPreview}
                disabled={!previewDirty}
                title="Regenerate from form fields"
              >
                ↻
              </button>
            </div>
            <p className="preview-hint">{t("configPreviewHint")}</p>
            <textarea
              className="config-preview"
              value={draft.configText}
              onChange={(e) => updatePreview(e.target.value)}
              rows={16}
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
        </article>
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>{t("providers")}</h2>
      </header>

      <article className="card">
        <div className="provider-tabs">
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

        <div className="card-heading" style={{ marginTop: "0.85rem" }}>
          <div>
            <span className="eyebrow">{t("available")}</span>
            <h3>{visibleProviders.length} {t("configured")}</h3>
          </div>
          <button className="add-button" onClick={() => openForm()} type="button" title="Add provider">
            <AddIcon />
            <span>{t("add")}</span>
          </button>
        </div>

        <div className="provider-list">
          {visibleProviders.length ? (
            visibleProviders.map((provider) => (
              <div className="provider-row" key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    {iconForAgent(provider.agent)}
                    <strong>{provider.name}</strong>
                    {provider.isCurrent ? <span className="pill">Active</span> : null}
                  </div>
                  <p>{provider.model || "—"}</p>
                  <small>{providerEndpointLabel(provider) || t("openaiDefault")}</small>
                </div>
                <div className="provider-actions">
                  <button className="secondary-button" onClick={() => openForm(provider)} type="button">{t("edit")}</button>
                  <button className="secondary-button" onClick={() => void onActivate(provider.id)} type="button">{t("enable")}</button>
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
