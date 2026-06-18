import { ProviderTypeAvatar } from "../../../components/domain";
import type { ApiProvider, ApiProviderType, RemoteModel } from "../../../types";
import { normalizeProviderType, providerTypes } from "../providerConfig";
import { BackIcon } from "./ProviderIcons";
import { OpenAiOAuthPanel } from "./OpenAiOAuthPanel";
import { ProviderModelsPanel } from "./ProviderModelsPanel";

interface ProviderFormProps {
  draft: ApiProvider;
  isLoadingModels: boolean;
  modelListError: string | null;
  oauth: {
    isBusy: boolean;
    status: string;
    authUrl: string;
    manualMode: boolean;
    callbackInput: string;
  };
  labels: {
    edit: string;
    newProvider: string;
    apiProvider: string;
    back: string;
    name: string;
    providerType: string;
    baseUrl: string;
    officialWebsite: string;
    apiKey: string;
    providerEnabled: string;
    modelList: string;
    refreshModels: string;
    fetchModels: string;
    loadingModels: string;
    noModelsFound: string;
    modelFromProvider: string;
    save: string;
    create: string;
  };
  onClose: () => void;
  onUpdateDraft: <K extends keyof ApiProvider>(field: K, value: ApiProvider[K]) => void;
  onApplyProviderType: (providerType: ApiProviderType) => void;
  onRefreshModels: () => void;
  onManualModelMetadata: (model: RemoteModel) => void | Promise<void>;
  onSubmit: () => void;
  onOauthCallbackInputChange: (value: string) => void;
  onStartOauthLogin: () => void;
  onGenerateOauthUrl: () => void;
  onSubmitOauthCallback: () => void;
}

export function ProviderForm({
  draft,
  isLoadingModels,
  modelListError,
  oauth,
  labels,
  onClose,
  onUpdateDraft,
  onApplyProviderType,
  onRefreshModels,
  onManualModelMetadata,
  onSubmit,
  onOauthCallbackInputChange,
  onStartOauthLogin,
  onGenerateOauthUrl,
  onSubmitOauthCallback,
}: ProviderFormProps) {
  const isEditing = Boolean(draft.id);
  const providerType = normalizeProviderType(draft.providerType);

  return (
    <section className="provider-detail-panel">
        <div className="card-heading provider-edit-heading">
          <div>
            <span className="eyebrow">{isEditing ? labels.edit : labels.newProvider}</span>
            <div className="provider-edit-title">
              <ProviderTypeAvatar providerType={draft.providerType} size={34} />
              <h3>{draft.name || labels.apiProvider}</h3>
            </div>
          </div>
          <button className="back-button" onClick={onClose} type="button">
            <BackIcon />
            <span>{labels.back}</span>
          </button>
        </div>

        <div className="provider-editor-layout api-provider-editor-layout">
          <div className="provider-form-panel">
            <div className="form-grid compact-form-grid">
              <label className="field">
                <span>{labels.name}</span>
                <input value={draft.name} onChange={(event) => onUpdateDraft("name", event.target.value)} placeholder="OpenRouter" />
              </label>
              <label className="field">
                <span>{labels.providerType}</span>
                <select value={providerType} onChange={(event) => onApplyProviderType(event.target.value as ApiProviderType)}>
                  {providerTypes.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Wire format</span>
                <select value={draft.wireApi} onChange={(event) => onUpdateDraft("wireApi", event.target.value as ApiProvider["wireApi"])}>
                  <option value="responses">Responses API</option>
                  <option value="chat">Chat Completions</option>
                </select>
              </label>
              {providerType !== "openai_oauth" ? (
                <label className="field">
                  <span>{labels.baseUrl}</span>
                  <input value={draft.baseUrl} onChange={(event) => onUpdateDraft("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" />
                </label>
              ) : null}
              <label className="field">
                <span>{labels.officialWebsite}</span>
                <input value={draft.websiteUrl} onChange={(event) => onUpdateDraft("websiteUrl", event.target.value)} placeholder="https://example.com" />
              </label>
              {providerType !== "openai_oauth" ? (
                <label className="field field-full">
                  <span>{labels.apiKey}</span>
                  <input value={draft.apiKey} onChange={(event) => onUpdateDraft("apiKey", event.target.value)} placeholder="sk-..." type="password" />
                </label>
              ) : null}
              {providerType === "openai_oauth" ? (
                <OpenAiOAuthPanel
                  isBusy={oauth.isBusy}
                  status={oauth.status}
                  authUrl={oauth.authUrl}
                  manualMode={oauth.manualMode}
                  callbackInput={oauth.callbackInput}
                  onCallbackInputChange={onOauthCallbackInputChange}
                  onStartLogin={onStartOauthLogin}
                  onGenerateUrl={onGenerateOauthUrl}
                  onSubmitCallback={onSubmitOauthCallback}
                />
              ) : null}
              <label className="checkbox-field">
                <input checked={draft.enabled} onChange={(event) => onUpdateDraft("enabled", event.target.checked)} type="checkbox" />
                <span>{labels.providerEnabled}</span>
              </label>
            </div>

            <ProviderModelsPanel
              models={draft.models}
              baseUrl={draft.baseUrl}
              isLoadingModels={isLoadingModels}
              modelListError={modelListError}
              labels={{
                modelList: labels.modelList,
                refreshModels: labels.refreshModels,
                fetchModels: labels.fetchModels,
                loadingModels: labels.loadingModels,
                noModelsFound: labels.noModelsFound,
                modelFromProvider: labels.modelFromProvider,
              }}
              onRefreshModels={onRefreshModels}
              onManualModelMetadata={onManualModelMetadata}
            />
          </div>

          <div className="actions">
            <button className="primary-button" disabled={!draft.name.trim()} onClick={onSubmit} type="button">
              {isEditing ? labels.save : labels.create}
            </button>
          </div>
        </div>
    </section>
  );
}
