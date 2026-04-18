import { useEffect, useMemo, useRef, useState } from "react";
import type { Provider } from "../types";

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

const presets: Array<{
  id: string;
  title: string;
  values: Partial<Provider>;
}> = [
  {
    id: "official",
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
];

interface Toast {
  message: string;
  type: "ok" | "err";
}

export function ProvidersPage({ providers, onSave, onDelete, onActivate }: ProvidersPageProps) {
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent) return -1;
        if (!a.isCurrent && b.isCurrent) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );

  const showToast = (message: string, type: Toast["type"]) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const isEditing = Boolean(draft.id);
  const updateDraft = (field: keyof Provider, value: string) =>
    setDraft((cur) => ({ ...cur, [field]: value }));

  const handleSubmit = async () => {
    await onSave(draft);
    setDraft(emptyProvider);
    setShowAdvanced(false);
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft((cur) => ({ ...emptyProvider, ...cur, ...preset.values, id: "", isCurrent: false, createdAt: "", updatedAt: "" }));
  };

  const handleActivate = async (provider: Provider) => {
    try {
      await onActivate(provider.id);
      showToast(`✓ ${provider.name} activated`, "ok");
    } catch (err) {
      showToast(`✗ ${err instanceof Error ? err.message : "Failed"}`, "err");
    }
  };

  return (
    <section className="page providers-layout">
      <header className="page-header">
        <h2>Providers</h2>
      </header>

      <div className="providers-grid">
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{isEditing ? "Edit" : "New"}</span>
              <h3>{isEditing ? draft.name || "Draft" : "Add provider"}</h3>
            </div>
          </div>

          <div className="preset-grid">
            {presets.map((preset) => (
              <button key={preset.id} className="preset-card" onClick={() => applyPreset(preset.id)} type="button">
                <strong>{preset.title}</strong>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input value={draft.name} onChange={(e) => updateDraft("name", e.target.value)} placeholder="My Provider" />
            </label>
            <label className="field">
              <span>Model</span>
              <input value={draft.model} onChange={(e) => updateDraft("model", e.target.value)} placeholder="gpt-5.4" />
            </label>
          </div>

          <button className="toggle-advanced" type="button" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "▲ Hide advanced" : "▼ Advanced"}
          </button>

          {showAdvanced && (
            <div className="form-grid">
              <label className="field">
                <span>Base URL</span>
                <input value={draft.baseUrl} onChange={(e) => updateDraft("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label className="field">
                <span>API key</span>
                <input value={draft.apiKey} onChange={(e) => updateDraft("apiKey", e.target.value)} placeholder="sk-..." type="password" />
              </label>
              <label className="field">
                <span>Reasoning effort</span>
                <select value={draft.reasoningEffort} onChange={(e) => updateDraft("reasoningEffort", e.target.value)}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className="field field-full">
                <span>Extra TOML</span>
                <textarea value={draft.extraToml} onChange={(e) => updateDraft("extraToml", e.target.value)} placeholder={`[experimental]\nproject_doc = "AGENTS.md"`} rows={5} />
              </label>
            </div>
          )}

          <div className="actions">
            <button className="primary-button" disabled={!draft.name.trim() || !draft.model.trim()} onClick={() => void handleSubmit()} type="button">
              {isEditing ? "Save" : "Create"}
            </button>
            {isEditing && (
              <button className="secondary-button" onClick={() => { setDraft(emptyProvider); setShowAdvanced(false); }} type="button">
                Cancel
              </button>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Available</span>
              <h3>{providers.length} configured</h3>
            </div>
          </div>

          {toast && (
            <div className={`provider-toast provider-toast-${toast.type}`}>
              {toast.message}
            </div>
          )}

          <div className="provider-list">
            {sortedProviders.length ? (
              sortedProviders.map((provider) => (
                <div className="provider-row" key={provider.id}>
                  <div>
                    <div className="provider-title">
                      <strong>{provider.name}</strong>
                      {provider.isCurrent ? <span className="pill">Active</span> : null}
                    </div>
                    <p>{provider.model}</p>
                    <small>{provider.baseUrl || "OpenAI default"}</small>
                  </div>
                  <div className="provider-actions">
                    <button className="secondary-button" onClick={() => { setDraft(provider); setShowAdvanced(true); }} type="button">Edit</button>
                    <button className="secondary-button" onClick={() => void handleActivate(provider)} type="button">Enable</button>
                    <button className="danger-button" onClick={() => void onDelete(provider.id)} type="button">Del</button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">No providers yet.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
