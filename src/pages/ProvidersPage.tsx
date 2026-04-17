import { useMemo, useState } from "react";
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
  description: string;
  values: Partial<Provider>;
}> = [
  {
    id: "official",
    title: "OpenAI Official",
    description: "Default Codex/OpenAI flow with no custom base URL.",
    values: {
      name: "OpenAI Official",
      baseUrl: "",
      apiKey: "",
      model: "gpt-5.4",
      reasoningEffort: "high",
      extraToml: "",
    },
  },
  {
    id: "compatible",
    title: "OpenAI Compatible",
    description: "Custom provider with API key + base URL routing.",
    values: {
      name: "Custom Compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      model: "gpt-5.4",
      reasoningEffort: "high",
      extraToml: "[project]\napproval_policy = \"never\"",
    },
  },
  {
    id: "azure",
    title: "Azure OpenAI",
    description: "Starter shape for Azure-style Codex access.",
    values: {
      name: "Azure OpenAI",
      baseUrl: "https://YOUR_RESOURCE_NAME.openai.azure.com/openai",
      apiKey: "",
      model: "gpt-5.4",
      reasoningEffort: "high",
      extraToml:
        "[model_providers.custom.query_params]\n\"api-version\" = \"2025-04-01-preview\"",
    },
  },
];

export function ProvidersPage({
  providers,
  onSave,
  onDelete,
  onActivate,
}: ProvidersPageProps) {
  const [draft, setDraft] = useState<Provider>(emptyProvider);

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((left, right) => {
        if (left.isCurrent && !right.isCurrent) {
          return -1;
        }
        if (!left.isCurrent && right.isCurrent) {
          return 1;
        }
        return left.name.localeCompare(right.name);
      }),
    [providers],
  );

  const isEditing = Boolean(draft.id);

  const updateDraft = (field: keyof Provider, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    await onSave(draft);
    setDraft(emptyProvider);
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setDraft((current) => ({
      ...emptyProvider,
      ...current,
      ...preset.values,
      id: "",
      isCurrent: false,
      createdAt: "",
      updatedAt: "",
    }));
  };

  return (
    <section className="page providers-layout">
      <header className="page-header">
        <div>
          <h2>Providers</h2>
          <p>Create Codex-compatible providers and switch between them visually.</p>
        </div>
      </header>

      <div className="providers-grid">
        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">{isEditing ? "Edit" : "New"} provider</span>
              <h3>{isEditing ? draft.name || "Provider draft" : "Add provider"}</h3>
            </div>
          </div>

          <div className="preset-grid">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className="preset-card"
                onClick={() => applyPreset(preset.id)}
                type="button"
              >
                <strong>{preset.title}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="OpenAI Compatible"
              />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                value={draft.baseUrl}
                onChange={(event) => updateDraft("baseUrl", event.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className="field">
              <span>API key</span>
              <input
                value={draft.apiKey}
                onChange={(event) => updateDraft("apiKey", event.target.value)}
                placeholder="sk-..."
                type="password"
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={draft.model}
                onChange={(event) => updateDraft("model", event.target.value)}
                placeholder="gpt-5.4"
              />
            </label>
            <label className="field">
              <span>Reasoning effort</span>
              <select
                value={draft.reasoningEffort}
                onChange={(event) =>
                  updateDraft("reasoningEffort", event.target.value)
                }
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className="field field-full">
              <span>Extra TOML</span>
              <textarea
                value={draft.extraToml}
                onChange={(event) => updateDraft("extraToml", event.target.value)}
                placeholder={`[experimental]
project_doc = "AGENTS.md"`}
                rows={6}
              ></textarea>
            </label>
          </div>

          <div className="actions">
            <button
              className="primary-button"
              disabled={!draft.name.trim() || !draft.model.trim()}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {isEditing ? "Save provider" : "Create provider"}
            </button>
            {isEditing ? (
              <button
                className="secondary-button"
                onClick={() => setDraft(emptyProvider)}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </article>

        <article className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Available providers</span>
              <h3>{providers.length} configured</h3>
            </div>
          </div>

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
                    <small>{provider.baseUrl || "OpenAI official/default routing"}</small>
                  </div>
                  <div className="provider-actions">
                    <button
                      className="secondary-button"
                      onClick={() => setDraft(provider)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void onActivate(provider.id)}
                      type="button"
                    >
                      Enable
                    </button>
                    <button
                      className="danger-button"
                      onClick={() => void onDelete(provider.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">
                No providers yet. Create the first one on the left.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
