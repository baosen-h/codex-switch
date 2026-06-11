import { iconForAgent, ProviderAvatar } from "../../../components/domain";
import { DeleteIcon, EditIcon, LaunchIcon, PlayIcon } from "../../../components/ui";
import type { AgentKind, ApiProvider, Provider } from "../../../types";
import { agentTabs } from "../../../utils/providerConfig";
import { AddIcon } from "./AgentIcons";

interface AgentProviderListProps {
  activeAgent: AgentKind;
  providers: Provider[];
  tabCounts: Record<AgentKind, number>;
  apiProviders: ApiProvider[];
  labels: {
    addProvider: string;
    edit: string;
    openCli: string;
    enable: string;
    del: string;
    noProviders: string;
  };
  agentLabel: (agent: AgentKind) => string;
  avatarSourceForProvider: (provider: Provider, apiProviders: ApiProvider[]) => Pick<ApiProvider, "name" | "providerType" | "baseUrl">;
  onSelectAgent: (agent: AgentKind) => void;
  onAddProvider: () => void;
  onEditProvider: (provider: Provider) => void;
  onLaunchProvider: (id: string) => void;
  onActivateProvider: (id: string) => void;
  onDeleteProvider: (id: string) => void;
}

export function AgentProviderList({
  activeAgent,
  providers,
  tabCounts,
  apiProviders,
  labels,
  agentLabel,
  avatarSourceForProvider,
  onSelectAgent,
  onAddProvider,
  onEditProvider,
  onLaunchProvider,
  onActivateProvider,
  onDeleteProvider,
}: AgentProviderListProps) {
  return (
    <section className="page providers-page">
      <article className="card provider-connected-card">
        <div className="provider-toolbar">
          <div className="provider-tabs provider-tabs-connected">
            {agentTabs.map((agent) => (
              <button
                key={agent}
                type="button"
                className={`provider-tab ${activeAgent === agent ? "active" : ""}`}
                onClick={() => onSelectAgent(agent)}
              >
                {iconForAgent(agent)}
                <span>{agentLabel(agent)}</span>
                <small>{tabCounts[agent]}</small>
              </button>
            ))}
          </div>
          <button className="add-button add-button-compact" onClick={onAddProvider} type="button" title={labels.addProvider}>
            <AddIcon />
          </button>
        </div>

        <div className="provider-list">
          {providers.length ? (
            providers.map((provider) => (
              <div className={`provider-row agent-provider-row ${provider.isCurrent ? "provider-row-current" : ""}`} key={provider.id}>
                <div className="provider-info">
                  <div className="provider-title">
                    <ProviderAvatar provider={avatarSourceForProvider(provider, apiProviders)} size={28} />
                    <div className="provider-title-text">
                      <strong>{provider.name}</strong>
                    </div>
                  </div>
                  <p>{provider.model || "—"}</p>
                </div>
                <div className="provider-actions">
                  <button className="secondary-button icon-action-button" onClick={() => onEditProvider(provider)} type="button" title={labels.edit}><EditIcon /></button>
                  <button className="secondary-button icon-action-button" onClick={() => onLaunchProvider(provider.id)} type="button" title={labels.openCli}><LaunchIcon /></button>
                  {!provider.isCurrent ? (
                    <button className="secondary-button icon-action-button" onClick={() => onActivateProvider(provider.id)} type="button" title={labels.enable}><PlayIcon /></button>
                  ) : null}
                  <button className="danger-button icon-action-button" onClick={() => onDeleteProvider(provider.id)} type="button" title={labels.del}><DeleteIcon /></button>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">{labels.noProviders}</p>
          )}
        </div>
      </article>
    </section>
  );
}
