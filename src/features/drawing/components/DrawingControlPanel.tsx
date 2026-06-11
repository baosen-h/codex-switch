import { ProviderAvatar } from "../../../components/domain";
import type { ApiProvider, RemoteModel } from "../../../types";
import { backgroundOptions, imageSizes, qualityOptions } from "../constants";
import type { DrawingRecord } from "../types";

interface DrawingControlPanelProps {
  providers: ApiProvider[];
  selectedProvider?: ApiProvider;
  models: RemoteModel[];
  activeModel: string;
  activeRecord: DrawingRecord;
  labels: {
    drawing: string;
    imageStudio: string;
    apiProvider: string;
    model: string;
    noModelsFound: string;
    imageSize: string;
    quality: string;
    background: string;
    imageCount: string;
  };
  onSelectProvider: (id: string) => void;
  onPatchRecord: (patch: Partial<DrawingRecord>) => void;
}

export function DrawingControlPanel({
  providers,
  selectedProvider,
  models,
  activeModel,
  activeRecord,
  labels,
  onSelectProvider,
  onPatchRecord,
}: DrawingControlPanelProps) {
  return (
    <aside className="drawing-control-panel">
      <div className="drawing-heading">
        <span className="eyebrow">{labels.drawing}</span>
        <h3>{labels.imageStudio}</h3>
      </div>

      <label className="field">
        <span>{labels.apiProvider}</span>
        <select value={selectedProvider?.id ?? ""} onChange={(event) => onSelectProvider(event.target.value)}>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>

      {selectedProvider ? (
        <div className="drawing-provider-card">
          <ProviderAvatar provider={selectedProvider} size={36} />
          <div>
            <strong>{selectedProvider.name}</strong>
            <span>{selectedProvider.providerType}</span>
          </div>
        </div>
      ) : null}

      <label className="field">
        <span>{labels.model}</span>
        <select value={activeModel} onChange={(event) => onPatchRecord({ model: event.target.value })}>
          {models.length ? (
            models.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)
          ) : (
            <option value="">{labels.noModelsFound}</option>
          )}
        </select>
      </label>

      <label className="field">
        <span>{labels.imageSize}</span>
        <select value={activeRecord.size} onChange={(event) => onPatchRecord({ size: event.target.value })}>
          {imageSizes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="field">
        <span>{labels.quality}</span>
        <select value={activeRecord.quality} onChange={(event) => onPatchRecord({ quality: event.target.value })}>
          {qualityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="field">
        <span>{labels.background}</span>
        <select value={activeRecord.background} onChange={(event) => onPatchRecord({ background: event.target.value })}>
          {backgroundOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>

      <label className="field">
        <span>{labels.imageCount}</span>
        <input
          min={1}
          max={4}
          value={activeRecord.count}
          onChange={(event) => onPatchRecord({ count: Number(event.target.value) })}
          type="number"
        />
      </label>
    </aside>
  );
}
