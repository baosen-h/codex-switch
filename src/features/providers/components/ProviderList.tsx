import { ProviderAvatar } from "../../../components/domain";
import { DeleteIcon, EditIcon } from "../../../components/ui";
import type { ApiProvider } from "../../../types";
import type { ProviderBalanceState } from "../balanceStorage";
import { inferProviderType, providerTypeLabel, websiteLabel } from "../providerConfig";
import { AddIcon } from "./ProviderIcons";
import { ProviderBalancePanel } from "./ProviderBalancePanel";

interface ProviderListProps {
  providers: ApiProvider[];
  balanceMap: Record<string, ProviderBalanceState>;
  loadingBalanceId: string | null;
  labels: {
    providers: string;
    apiProviders: string;
    addProvider: string;
    models: string;
    edit: string;
    del: string;
    noApiProviders: string;
  };
  onAddProvider: () => void;
  onEditProvider: (provider: ApiProvider) => void;
  onDeleteProvider: (id: string) => void;
  onOpenWebsite: (url: string) => void;
  onRefreshBalance: (provider: ApiProvider) => void;
}

export function ProviderList({
  providers,
  balanceMap,
  loadingBalanceId,
  labels,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onOpenWebsite,
  onRefreshBalance,
}: ProviderListProps) {
  return (
    <section className="page providers-page">
      <article className="card provider-connected-card">
        <div className="provider-toolbar">
          <div className="toolbar-title-block">
            <div>
              <span className="eyebrow">{labels.providers}</span>
              <h2>{labels.apiProviders}</h2>
            </div>
            <span className="toolbar-count">{providers.length}</span>
          </div>
          <button className="add-button add-button-compact" onClick={onAddProvider} type="button" title={labels.addProvider}>
            <AddIcon />
          </button>
        </div>

        <div className="provider-list">
          {providers.length ? (
            providers.map((provider) => {
              const balance = balanceMap[provider.id];
              return (
                <div className={`provider-row api-provider-row ${provider.enabled ? "provider-row-current" : ""}`} key={provider.id}>
                  <div className="provider-info">
                    <div className="provider-title">
                      <ProviderAvatar provider={provider} size={56} />
                      <div className="provider-title-text">
                        <strong>{provider.name}</strong>
                        <small>{providerTypeLabel(inferProviderType(provider))}</small>
                      </div>
                    </div>
                    {provider.websiteUrl.trim() ? (
                      <button className="provider-link" onClick={() => onOpenWebsite(provider.websiteUrl)} title={provider.websiteUrl} type="button">
                        {websiteLabel(provider.websiteUrl)}
                      </button>
                    ) : null}
                    <ProviderBalancePanel
                      provider={provider}
                      balance={balance}
                      loadingBalanceId={loadingBalanceId}
                      onRefreshBalance={onRefreshBalance}
                    />
                  </div>
                  <div className="provider-actions">
                    <span className="provider-model-count">
                      {provider.models.length} {labels.models}
                    </span>
                    <button className="secondary-button icon-action-button" onClick={() => onEditProvider(provider)} type="button" title={labels.edit}>
                      <EditIcon />
                    </button>
                    <button className="danger-button icon-action-button" onClick={() => onDeleteProvider(provider.id)} type="button" title={labels.del}>
                      <DeleteIcon />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-state">{labels.noApiProviders}</p>
          )}
        </div>
      </article>
    </section>
  );
}
