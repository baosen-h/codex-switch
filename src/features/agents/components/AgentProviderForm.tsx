import { iconForAgent } from "../../../components/domain";
import type { AgentKind, ApiProvider, Provider, RemoteModel } from "../../../types";
import { renderInstructionTemplate } from "../../../utils/providerConfig";
import { BackIcon } from "./AgentIcons";
import { AgentModelPicker } from "./AgentModelPicker";

interface AgentProviderFormProps {
  draft: Provider;
  enabledApiProviders: ApiProvider[];
  modelOptions: RemoteModel[];
  filteredModelOptions: RemoteModel[];
  isModelListOpen: boolean;
  isLoadingModels: boolean;
  modelListError: string | null;
  labels: {
    edit: string;
    addProvider: string;
    back: string;
    name: string;
    apiProvider: string;
    manualProvider: string;
    model: string;
    chooseModel: string;
    refreshModels: string;
    fetchModels: string;
    loadingModels: string;
    noModelsFound: string;
    modelFromProvider: string;
    baseUrl: string;
    apiKey: string;
    templateGuide: string;
    templateGuideHint: string;
    configPreview: string;
    configPreviewHint: string;
    deepSeekOneMillionContext: string;
    deepSeekOneMillionContextHint: string;
    codexWebSearchTool: string;
    codexWebSearchToolHint: string;
    save: string;
    create: string;
  };
  showDeepSeekOneMillionContext: boolean;
  deepSeekOneMillionContextEnabled: boolean;
  showCodexWebSearchTool: boolean;
  codexWebSearchToolEnabled: boolean;
  agentLabel: (agent: AgentKind) => string;
  onClose: () => void;
  onUpdateDraft: (field: keyof Provider, value: string) => void;
  onApplyApiProvider: (apiProviderId: string) => void;
  onModelInput: (model: string) => void;
  onToggleModelList: () => void;
  onOpenModelListIfOptions: () => void;
  onFetchModels: () => void;
  onSelectModel: (model: string) => void;
  onUpdatePreview: (value: string) => void;
  onToggleDeepSeekOneMillionContext: (enabled: boolean) => void;
  onToggleCodexWebSearchTool: (enabled: boolean) => void;
  onSubmit: () => void;
}

export function AgentProviderForm({
  draft,
  enabledApiProviders,
  modelOptions,
  filteredModelOptions,
  isModelListOpen,
  isLoadingModels,
  modelListError,
  labels,
  showDeepSeekOneMillionContext,
  deepSeekOneMillionContextEnabled,
  showCodexWebSearchTool,
  codexWebSearchToolEnabled,
  agentLabel,
  onClose,
  onUpdateDraft,
  onApplyApiProvider,
  onModelInput,
  onToggleModelList,
  onOpenModelListIfOptions,
  onFetchModels,
  onSelectModel,
  onUpdatePreview,
  onToggleDeepSeekOneMillionContext,
  onToggleCodexWebSearchTool,
  onSubmit,
}: AgentProviderFormProps) {
  const isEditing = Boolean(draft.id);

  return (
    <section className="page providers-page">
      <article className="provider-edit-card agent-provider-edit-card">
        <div className="card-heading provider-edit-heading">
          <div>
            <span className="eyebrow">{isEditing ? labels.edit : "New"}</span>
            <h3>{isEditing ? draft.name || "Draft" : labels.addProvider}</h3>
            <div className="agent-chip">
              {iconForAgent(draft.agent)}
              <span>{agentLabel(draft.agent)}</span>
            </div>
          </div>
          <button className="back-button" onClick={onClose} type="button">
            <BackIcon />
            <span>{labels.back}</span>
          </button>
        </div>

        <div className="provider-editor-layout agent-provider-editor-layout">
          <div className="provider-form-panel">
            <div className="form-grid compact-form-grid">
              <label className="field">
                <span>{labels.name}</span>
                <input value={draft.name} onChange={(event) => onUpdateDraft("name", event.target.value)} placeholder="My Provider" />
              </label>
              <label className="field">
                <span>{labels.apiProvider}</span>
                <select value={draft.apiProviderId} onChange={(event) => onApplyApiProvider(event.target.value)}>
                  <option value="">{labels.manualProvider}</option>
                  {enabledApiProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <AgentModelPicker
                agent={draft.agent}
                model={draft.model}
                modelOptions={modelOptions}
                filteredModelOptions={filteredModelOptions}
                isOpen={isModelListOpen}
                isLoading={isLoadingModels}
                error={modelListError}
                baseUrl={draft.baseUrl}
                labels={{
                  model: labels.model,
                  chooseModel: labels.chooseModel,
                  refreshModels: labels.refreshModels,
                  fetchModels: labels.fetchModels,
                  loadingModels: labels.loadingModels,
                  noModelsFound: labels.noModelsFound,
                  modelFromProvider: labels.modelFromProvider,
                }}
                onModelInput={onModelInput}
                onToggleOpen={onToggleModelList}
                onOpenIfOptions={onOpenModelListIfOptions}
                onFetchModels={onFetchModels}
                onSelectModel={onSelectModel}
              />
              <label className="field">
                <span>{labels.baseUrl}</span>
                <input value={draft.baseUrl} onChange={(event) => onUpdateDraft("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label className="field field-full">
                <span>{labels.apiKey}</span>
                <input value={draft.apiKey} onChange={(event) => onUpdateDraft("apiKey", event.target.value)} placeholder="sk-..." type="password" />
              </label>
              {showDeepSeekOneMillionContext ? (
                <label className="checkbox-field field-full">
                  <input
                    checked={deepSeekOneMillionContextEnabled}
                    onChange={(event) => onToggleDeepSeekOneMillionContext(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {labels.deepSeekOneMillionContext}
                    <small>{labels.deepSeekOneMillionContextHint}</small>
                  </span>
                </label>
              ) : null}
              {showCodexWebSearchTool ? (
                <label className="checkbox-field field-full">
                  <input
                    checked={codexWebSearchToolEnabled}
                    onChange={(event) => onToggleCodexWebSearchTool(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {labels.codexWebSearchTool}
                    <small>{labels.codexWebSearchToolHint}</small>
                  </span>
                </label>
              ) : null}
            </div>

            <div className="template-inline-block">
              <div className="preview-header">
                <span className="detail-label">{labels.templateGuide}</span>
              </div>
              <p className="preview-hint">{labels.templateGuideHint}</p>
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
              <span className="detail-label">{labels.configPreview}</span>
            </div>
            <p className="preview-hint">{labels.configPreviewHint}</p>
            <textarea
              className="config-preview provider-config-preview"
              value={draft.configText}
              onChange={(event) => onUpdatePreview(event.target.value)}
              rows={26}
              spellCheck={false}
            />
          </div>

          <div className="actions">
            <button
              className="primary-button"
              disabled={!draft.name.trim()}
              onClick={onSubmit}
              type="button"
            >
              {isEditing ? labels.save : labels.create}
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
