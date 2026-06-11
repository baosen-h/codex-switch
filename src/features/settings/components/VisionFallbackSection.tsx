import { ModelCapabilityBadges } from "../../../components/domain";
import type { ApiProvider, AppSettings, RemoteModel } from "../../../types";
import { modelSupportsVisionText } from "../../../utils/modelCapabilities";
import { ChevronDownIcon } from "./SettingsIcons";

interface VisionFallbackSectionProps {
  draft: AppSettings;
  visionProviders: ApiProvider[];
  visionProvider?: ApiProvider;
  visionModels: RemoteModel[];
  visionModel?: RemoteModel;
  visionProviderOpen: boolean;
  visionModelOpen: boolean;
  onUpdateDraft: (field: keyof AppSettings, value: string | boolean) => void;
  onSetDraft: (updater: (current: AppSettings) => AppSettings) => void;
  onSetVisionProviderOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  onSetVisionModelOpen: (open: boolean | ((open: boolean) => boolean)) => void;
}

export function VisionFallbackSection({
  draft,
  visionProviders,
  visionProvider,
  visionModels,
  visionModel,
  visionProviderOpen,
  visionModelOpen,
  onUpdateDraft,
  onSetDraft,
  onSetVisionProviderOpen,
  onSetVisionModelOpen,
}: VisionFallbackSectionProps) {
  return (
    <>
      <label className="checkbox-field field-full">
        <input
          checked={draft.visionFallbackEnabled}
          onChange={(event) => onUpdateDraft("visionFallbackEnabled", event.target.checked)}
          type="checkbox"
        />
        <span>Vision fallback for text-only models</span>
      </label>
      {draft.visionFallbackEnabled ? (
        <>
          <label className="field">
            <span>Vision API provider</span>
            <div className="model-picker vision-picker">
              <button
                className="vision-picker-control"
                onClick={() => {
                  onSetVisionProviderOpen((open) => !open);
                  onSetVisionModelOpen(false);
                }}
                type="button"
              >
                <span>{visionProvider?.name ?? "Select provider"}</span>
                <ChevronDownIcon />
              </button>
              {visionProviderOpen ? (
                <div className="model-picker-menu vision-picker-menu">
                  {visionProviders.length ? visionProviders.map((provider) => (
                    <button
                      className={`model-picker-option ${draft.visionApiProviderId === provider.id ? "active" : ""}`}
                      key={provider.id}
                      onClick={() => {
                        const models = provider.models.filter(modelSupportsVisionText);
                        onSetDraft((current) => ({
                          ...current,
                          visionApiProviderId: provider.id,
                          visionModel: models[0]?.id ?? "",
                        }));
                        onSetVisionProviderOpen(false);
                      }}
                      type="button"
                    >
                      <span className="model-picker-option-title">{provider.name}</span>
                      <span className="model-picker-option-meta">
                        {provider.providerType} · {provider.models.filter(modelSupportsVisionText).length} vision models
                      </span>
                    </button>
                  )) : (
                    <div className="model-picker-empty">No provider has a verified image-to-text model.</div>
                  )}
                </div>
              ) : null}
            </div>
          </label>
          <label className="field">
            <span>Vision model</span>
            <div className="model-picker vision-picker">
              <button
                className="vision-picker-control"
                disabled={!visionProvider}
                onClick={() => {
                  onSetVisionModelOpen((open) => !open);
                  onSetVisionProviderOpen(false);
                }}
                type="button"
              >
                <span>{visionModel?.name || visionModel?.id || "Select model"}</span>
                <ChevronDownIcon />
              </button>
              {visionModelOpen ? (
                <div className="model-picker-menu vision-picker-menu">
                  {visionModels.map((model) => (
                    <button
                      className={`model-picker-option ${draft.visionModel === model.id ? "active" : ""}`}
                      key={model.id}
                      onClick={() => {
                        onUpdateDraft("visionModel", model.id);
                        onSetVisionModelOpen(false);
                      }}
                      type="button"
                    >
                      <span className="model-picker-option-title">{model.name || model.id}</span>
                      <span className="model-picker-option-meta">
                        {model.name && model.name !== model.id ? model.id : model.description || "Image input · text output"}
                      </span>
                      <ModelCapabilityBadges model={model} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
        </>
      ) : null}
    </>
  );
}
