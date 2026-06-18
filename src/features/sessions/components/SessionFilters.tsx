import { RefreshIcon } from "../../../components/ui";
import type { AgentFilter } from "../types";

interface SessionFiltersProps {
  query: string;
  agentFilter: AgentFilter;
  isIndexing: boolean;
  labels: {
    search: string;
    searchPlaceholder: string;
    agentFilter: string;
    tabAll: string;
    agentCodex: string;
    agentClaude: string;
    agentGemini: string;
    refreshSessions: string;
    indexingSessions: string;
  };
  onQueryChange: (query: string) => void;
  onAgentFilterChange: (filter: AgentFilter) => void;
  onRefresh: () => void;
}

export function SessionFilters({
  query,
  agentFilter,
  isIndexing,
  labels,
  onQueryChange,
  onAgentFilterChange,
  onRefresh,
}: SessionFiltersProps) {
  return (
    <div className="session-connected-top">
      <div className="filter-row session-filter-row">
        <label className="field session-filter-search">
          <span>{labels.search}</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={labels.searchPlaceholder}
          />
        </label>
        <label className="field session-filter-agent">
          <span>{labels.agentFilter}</span>
          <select
            value={agentFilter}
            onChange={(event) => onAgentFilterChange(event.target.value as AgentFilter)}
          >
            <option value="all">{labels.tabAll}</option>
            <option value="codex">{labels.agentCodex}</option>
            <option value="claude">{labels.agentClaude}</option>
            <option value="gemini">{labels.agentGemini}</option>
          </select>
        </label>
        <button
          className="session-refresh-button"
          disabled={isIndexing}
          onClick={onRefresh}
          type="button"
          title={isIndexing ? labels.indexingSessions : labels.refreshSessions}
        >
          <RefreshIcon />
        </button>
        {isIndexing ? <span className="session-index-status">{labels.indexingSessions}</span> : null}
      </div>
    </div>
  );
}
