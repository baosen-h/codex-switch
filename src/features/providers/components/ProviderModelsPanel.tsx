import { ModelCapabilityBadges } from "../../../components/domain";
import type { RemoteModel } from "../../../types";
import { RefreshIcon } from "./ProviderIcons";

interface ProviderModelsPanelProps {
  models: RemoteModel[];
  baseUrl: string;
  isLoadingModels: boolean;
  modelListError: string | null;
  labels: {
    modelList: string;
    refreshModels: string;
    fetchModels: string;
    loadingModels: string;
    noModelsFound: string;
    modelFromProvider: string;
  };
  onRefreshModels: () => void;
}

export function ProviderModelsPanel({
  models,
  baseUrl,
  isLoadingModels,
  modelListError,
  labels,
  onRefreshModels,
}: ProviderModelsPanelProps) {
  return (
    <div className="provider-models-panel">
      <div className="preview-header">
        <span className="detail-label">{labels.modelList}</span>
        <button
          className="secondary-button icon-text-button"
          disabled={!baseUrl.trim() || isLoadingModels}
          onClick={onRefreshModels}
          type="button"
        >
          <RefreshIcon />
          <span>{models.length ? labels.refreshModels : labels.fetchModels}</span>
        </button>
      </div>
      {isLoadingModels ? <p className="model-picker-status">{labels.loadingModels}</p> : null}
      {modelListError ? <p className="model-picker-status model-picker-status-error">{modelListError}</p> : null}
      <div className="api-model-list">
        {models.length ? (
          models.map((model) => (
            <div className="api-model-pill" key={model.id}>
              <div className="api-model-pill-main">
                <strong>{model.name || model.id}</strong>
                <span>{model.name && model.name !== model.id ? model.id : model.ownedBy || model.description || labels.modelFromProvider}</span>
              </div>
              <ModelCapabilityBadges model={model} />
            </div>
          ))
        ) : (
          <p className="empty-state">{labels.noModelsFound}</p>
        )}
      </div>
    </div>
  );
}
