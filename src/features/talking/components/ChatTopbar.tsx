import { ModelAvatar, ProviderAvatar } from "../../../components/domain";
import type { ApiProvider, RemoteModel } from "../../../types";

interface ChatTopbarProps {
  providers: ApiProvider[];
  selectedProvider?: ApiProvider;
  modelOptions: RemoteModel[];
  activeModel: string;
  apiProviderLabel: string;
  modelLabel: string;
  noModelsFoundLabel: string;
  onSelectProvider: (id: string) => void;
  onSelectModel: (model: string) => void;
}

export function ChatTopbar({
  providers,
  selectedProvider,
  modelOptions,
  activeModel,
  apiProviderLabel,
  modelLabel,
  noModelsFoundLabel,
  onSelectProvider,
  onSelectModel,
}: ChatTopbarProps) {
  const selectedModel = modelOptions.find((item) => item.id === activeModel);

  return (
    <header className="chat-topbar">
      <label className="chat-select">
        <span>{apiProviderLabel}</span>
        <select value={selectedProvider?.id ?? ""} onChange={(event) => onSelectProvider(event.target.value)}>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>
      <label className="chat-select">
        <span>{modelLabel}</span>
        <span className="model-select-control">
          {selectedModel ? <ModelAvatar model={selectedModel} size={26} /> : null}
          <select value={activeModel} onChange={(event) => onSelectModel(event.target.value)}>
            {modelOptions.length ? (
              modelOptions.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)
            ) : (
              <option value="">{noModelsFoundLabel}</option>
            )}
          </select>
        </span>
      </label>
      {selectedProvider ? <ProviderAvatar provider={selectedProvider} size={38} /> : null}
    </header>
  );
}
