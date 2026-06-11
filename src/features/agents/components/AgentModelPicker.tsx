import { ModelCapabilityBadges } from "../../../components/domain";
import type { AgentKind, RemoteModel } from "../../../types";
import { defaultModelForAgent } from "../../../utils/providerConfig";
import { ChevronDownIcon, RefreshIcon } from "./AgentIcons";

interface AgentModelPickerProps {
  agent: AgentKind;
  model: string;
  modelOptions: RemoteModel[];
  filteredModelOptions: RemoteModel[];
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  baseUrl: string;
  labels: {
    model: string;
    chooseModel: string;
    refreshModels: string;
    fetchModels: string;
    loadingModels: string;
    noModelsFound: string;
    modelFromProvider: string;
  };
  onModelInput: (model: string) => void;
  onToggleOpen: () => void;
  onOpenIfOptions: () => void;
  onFetchModels: () => void;
  onSelectModel: (model: string) => void;
}

export function AgentModelPicker({
  agent,
  model,
  modelOptions,
  filteredModelOptions,
  isOpen,
  isLoading,
  error,
  baseUrl,
  labels,
  onModelInput,
  onToggleOpen,
  onOpenIfOptions,
  onFetchModels,
  onSelectModel,
}: AgentModelPickerProps) {
  return (
    <label className="field model-picker-field">
      <span>{labels.model}</span>
      <div className="model-picker">
        <div className="model-picker-control">
          <input
            value={model}
            onChange={(event) => onModelInput(event.target.value)}
            onFocus={onOpenIfOptions}
            placeholder={defaultModelForAgent(agent)}
          />
          <button
            className="model-picker-button"
            disabled={!modelOptions.length && isLoading}
            onClick={onToggleOpen}
            title={labels.chooseModel}
            type="button"
          >
            <ChevronDownIcon />
          </button>
          <button
            className="model-picker-button model-picker-fetch"
            disabled={!baseUrl.trim() || isLoading}
            onClick={onFetchModels}
            title={modelOptions.length ? labels.refreshModels : labels.fetchModels}
            type="button"
          >
            <RefreshIcon />
          </button>
        </div>
        {isLoading ? (
          <p className="model-picker-status">{labels.loadingModels}</p>
        ) : error ? (
          <p className="model-picker-status model-picker-status-error">{error}</p>
        ) : null}
        {isOpen ? (
          <div className="model-picker-menu">
            {filteredModelOptions.length ? (
              filteredModelOptions.map((option) => (
                <button
                  className={`model-picker-option ${model === option.id ? "active" : ""}`}
                  key={option.id}
                  onClick={() => onSelectModel(option.id)}
                  type="button"
                >
                  <span className="model-picker-option-title">{option.name || option.id}</span>
                  <span className="model-picker-option-meta">
                    {option.name && option.name !== option.id ? option.id : option.ownedBy || option.description || labels.modelFromProvider}
                  </span>
                  <ModelCapabilityBadges model={option} />
                </button>
              ))
            ) : (
              <div className="model-picker-empty">
                {isLoading ? labels.loadingModels : labels.noModelsFound}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
