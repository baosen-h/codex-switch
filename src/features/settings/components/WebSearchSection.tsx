import type { AppSettings } from "../../../types";
import {
  fetchProviderOptions,
  searchProviderOptions,
  splitMultilineList,
} from "../settingsConfig";

interface WebSearchSectionProps {
  webSearch: AppSettings["webSearch"];
  onUpdateWebSearch: <K extends keyof AppSettings["webSearch"]>(
    field: K,
    value: AppSettings["webSearch"][K],
  ) => void;
}

export function WebSearchSection({ webSearch, onUpdateWebSearch }: WebSearchSectionProps) {
  const searchProviderOption = searchProviderOptions.find(
    (provider) => provider.id === webSearch.searchProviderId,
  );
  const fetchProviderOption = fetchProviderOptions.find(
    (provider) => provider.id === webSearch.fetchProviderId,
  );

  return (
    <>
      <div className="field field-full">
        <span>Automatic web search</span>
        <small>
          Configure once here. Models decide when to search; there is no chat mode switch.
          Provider-native search remains preferred when available.
        </small>
      </div>
      <label className="field">
        <span>Search provider</span>
        <select
          value={webSearch.searchProviderId}
          onChange={(event) => {
            const providerId = event.target.value;
            const option = searchProviderOptions.find((provider) => provider.id === providerId);
            onUpdateWebSearch("searchProviderId", providerId);
            if (option) {
              onUpdateWebSearch("searchApiUrl", option.apiUrl);
            }
            if (providerId !== webSearch.searchProviderId) {
              onUpdateWebSearch("searchApiKeys", []);
            }
          }}
        >
          <option value="">Not configured</option>
          {searchProviderOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>URL fetch provider</span>
        <select
          value={webSearch.fetchProviderId}
          onChange={(event) => {
            const providerId = event.target.value;
            const option = fetchProviderOptions.find((provider) => provider.id === providerId);
            onUpdateWebSearch("fetchProviderId", providerId);
            onUpdateWebSearch("fetchApiUrl", option?.apiUrl ?? "");
            if (providerId !== webSearch.fetchProviderId) {
              onUpdateWebSearch("fetchApiKeys", []);
            }
          }}
        >
          {fetchProviderOptions.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </label>
      {searchProviderOption ? (
        <>
          <label className="field">
            <span>{searchProviderOption.name} API URL</span>
            <input
              value={webSearch.searchApiUrl}
              onChange={(event) => onUpdateWebSearch("searchApiUrl", event.target.value)}
              placeholder={searchProviderOption.apiUrl}
            />
          </label>
          {searchProviderOption.requiresKey ? (
            <label className="field">
              <span>{searchProviderOption.name} API keys</span>
              <textarea
                value={webSearch.searchApiKeys.join("\n")}
                onChange={(event) => onUpdateWebSearch("searchApiKeys", splitMultilineList(event.target.value))}
                placeholder="One API key per line"
                rows={3}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {fetchProviderOption?.id === "jina" ? (
        <>
          <label className="field">
            <span>Jina Reader API URL</span>
            <input
              value={webSearch.fetchApiUrl}
              onChange={(event) => onUpdateWebSearch("fetchApiUrl", event.target.value)}
              placeholder={fetchProviderOption.apiUrl}
            />
          </label>
          <label className="field">
            <span>Jina Reader API keys</span>
            <textarea
              value={webSearch.fetchApiKeys.join("\n")}
              onChange={(event) => onUpdateWebSearch("fetchApiKeys", splitMultilineList(event.target.value))}
              placeholder="One API key per line"
              rows={3}
            />
          </label>
        </>
      ) : null}
      <label className="field">
        <span>Maximum search results</span>
        <input
          min={1}
          max={20}
          type="number"
          value={webSearch.maxResults}
          onChange={(event) => onUpdateWebSearch("maxResults", Number(event.target.value) || 1)}
        />
      </label>
      <label className="field">
        <span>Excluded domains</span>
        <textarea
          value={webSearch.excludeDomains.join("\n")}
          onChange={(event) => onUpdateWebSearch("excludeDomains", splitMultilineList(event.target.value))}
          placeholder={"example.com\nspam.example"}
          rows={3}
        />
      </label>
    </>
  );
}
