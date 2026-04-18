import { useMemo, useState } from "react";
import type { Provider } from "../types";
import { useI18n } from "../i18n/context";

interface ProvidersPageProps {
  providers: Provider[];
  onSave: (provider: Provider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
}

const emptyProvider: Provider = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "gpt-5.4",
  reasoningEffort: "high",
  extraToml: "",
  isCurrent: false,
  createdAt: "",
  updatedAt: "",
};

/* ── Pixel-art brand icons ──────────────────────────────────────── */

const OpenAIIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="4" y="0" width="4" height="2" fill="#EEEEEE"/>
    <rect x="2" y="2" width="2" height="2" fill="#EEEEEE"/>
    <rect x="8" y="2" width="2" height="2" fill="#EEEEEE"/>
    <rect x="0" y="4" width="2" height="4" fill="#EEEEEE"/>
    <rect x="10" y="4" width="2" height="4" fill="#EEEEEE"/>
    <rect x="2" y="8" width="2" height="2" fill="#EEEEEE"/>
    <rect x="8" y="8" width="2" height="2" fill="#EEEEEE"/>
    <rect x="4" y="10" width="4" height="2" fill="#EEEEEE"/>
  </svg>
);

const ClaudeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="4" y="0" width="4" height="2" fill="#D97757"/>
    <rect x="2" y="2" width="8" height="2" fill="#D97757"/>
    <rect x="0" y="4" width="12" height="4" fill="#D97757"/>
    <rect x="2" y="8" width="8" height="2" fill="#D97757"/>
    <rect x="4" y="10" width="4" height="2" fill="#D97757"/>
  </svg>
);

const GeminiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="4" y="0" width="4" height="4" fill="#4285F4"/>
    <rect x="0" y="4" width="4" height="4" fill="#4285F4"/>
    <rect x="4" y="4" width="4" height="4" fill="#4285F4"/>
    <rect x="8" y="4" width="4" height="4" fill="#4285F4"/>
    <rect x="4" y="8" width="4" height="4" fill="#4285F4"/>
  </svg>
);

const AzureIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="0" y="0" width="12" height="12" fill="#0078D4"/>
    <rect x="2" y="2" width="3" height="3" fill="#003D8A"/>
    <rect x="7" y="2" width="3" height="3" fill="#003D8A"/>
    <rect x="2" y="7" width="3" height="3" fill="#003D8A"/>
    <rect x="7" y="7" width="3" height="3" fill="#003D8A"/>
  </svg>
);

const CustomIcon = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="0" y="0" width="5" height="5" fill="#ffbc42"/>
    <rect x="7" y="0" width="5" height="5" fill="#ffbc42"/>
    <rect x="0" y="7" width="5" height="5" fill="#ffbc42"/>
    <rect x="7" y="7" width="5" height="5" fill="#ffbc42"/>
  </svg>
);

type PresetId = "openai" | "compatible" | "azure" | "claude" | "gemini";

function getIconByPreset(id: PresetId) {
  if (id === "openai")     return <OpenAIIcon />;
  if (id === "claude")     return <ClaudeIcon />;
  if (id === "gemini")     return <GeminiIcon />;
  if (id === "azure")      return <AzureIcon />;
  return <CustomIcon />;
}

function getIconByUrl(baseUrl: string) {
  if (!baseUrl || baseUrl.includes("openai.com")) return <OpenAIIcon />;
  if (baseUrl.includes("anthropic"))              return <ClaudeIcon />;
  if (baseUrl.includes("googleapis"))             return <GeminiIcon />;
  if (baseUrl.includes("azure"))                  return <AzureIcon />;
  return <CustomIcon />;
}

/* ── Presets ─────────────────────────────────────────────────────── */

const presets: Array<{ id: PresetId; title: string; values: Partial<Provider> }> = [
  {
    id: "openai",
    title: "OpenAI",
    values: { name: "OpenAI Official", baseUrl: "", apiKey: "", model: "gpt-5.4", reasoningEffort: "high", extraToml: "" },
  },
  {
    id: "compatible",
    title: "Compatible",
    values: { name: "Custom Compatible", baseUrl: "https://api.example.com/v1", apiKey: "", model: "gpt-5.4", reasoningEffort: "high", extraToml: "[project]\napproval_policy = \"never\"" },
  },
  {
    id: "azure",
    title: "Azure",
    values: { name: "Azure OpenAI", baseUrl: "https://YOUR_RESOURCE.openai.azure.com/openai", apiKey: "", model: "gpt-5.4", reasoningEffort: "high", extraToml: "[model_providers.custom.query_params]\n\"api-version\" = \"2025-04-01-preview\"" },
  },
  {
    id: "claude",
    title: "Claude",
    values: { name: "Anthropic Claude", baseUrl: "https://api.anthropic.com/v1", apiKey: "", model: "claude-opus-4-5", reasoningEffort: "high", extraToml: "" },
  },
  {
    id: "gemini",
    title: "Gemini",
    values: { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "", model: "gemini-2.5-pro", reasoningEffort: "high", extraToml: "" },
  },
];

/* ── Icons ───────────────────────────────────────────────────────── */

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

/* ── Component ───────────────────────────────────────────────────── */

export function ProvidersPage({ providers, onSave, onDelete, onActivate }: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );

  const openForm = (provider?: Provider) => {
    setDraft(provider ?? emptyProvider);
    setShowAdvanced(Boolean(provider));
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyProvider);
    setShowAdvanced(false);
    setView("list");
  };

  const updateDraft = (field: keyof Provider, value: string) =>
    setDraft((cur) => ({ ...cur, [field]: value }));

  const handleSubmit = async () => {
    await onSave(draft);
    closeForm();
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft((cur) => ({ ...emptyProvider, ...cur, ...preset.values, id: "", isCurrent: false, createdAt: "", updatedAt: "" }));
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
            </div>
            <button className="back-button" onClick={closeForm} type="button">
              <BackIcon />
              <span>{t("back")}</span>
            </button>
          </div>

          <div className="preset-grid">
            {presets.map((preset) => (
              <button key={preset.id} className="preset-card" onClick={() => applyPreset(preset.id)} type="button">
                {getIconByPreset(preset.id)}
                <strong>{preset.title}</strong>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t("name")}</span>
              <input value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} placeholder="My Provider" />
            </label>
            <label className="field">
              <span>{t("model")}</span>
              <input value={draft.model} onChange={(e) => updateDraft("model", e.target.value)} placeholder="gpt-5.4" />
            </label>
          </div>

          <button className="toggle-advanced" type="button" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? t("hideAdvanced") : t("advanced")}
          </button>

          {showAdvanced && (
            <div className="form-grid">
              <label className="field">
                <span>{t("baseUrl")}</span>
                <input value={draft.baseUrl} onChange={(e) => updateDraft("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label className="field">
                <span>{t("apiKey")}</span>
                <input value={draft.apiKey} onChange={(e) => updateDraft("apiKey", e.target.value)} placeholder="sk-..." type="password" />
              </label>
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
                <textarea value={draft.extraToml} onChange={(e) => updateDraft("extraToml", e.target.value)} placeholder={`[experimental]\nproject_doc = "AGENTS.md"`} rows={5} />
              </label>
            </div>
          )}

          <div className="actions">
            <button
              className="primary-button"
              disabled={!draft.name.trim() || !draft.model.trim()}
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
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("available")}</span>
            <h3>{providers.length} {t("configured")}</h3>
          </div>
          <button className="add-button" onClick={() => openForm()} type="button" title="Add provider">
            <AddIcon />
            <span>{t("add")}</span>
          </button>
        </div>

        <div className="provider-list">
          {sortedProviders.length ? (
            sortedProviders.map((provider) => (
              <div className="provider-row" key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    {getIconByUrl(provider.baseUrl)}
                    <strong>{provider.name}</strong>
                    {provider.isCurrent ? <span className="pill">Active</span> : null}
                  </div>
                  <p>{provider.model}</p>
                  <small>{provider.baseUrl || t("openaiDefault")}</small>
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
