import type { AppSettings, AppTheme } from "../../types";
import type { TranslationKey } from "../../i18n/translations";

export type PathFieldKey =
  | "codexConfigDir"
  | "claudeConfigDir"
  | "geminiConfigDir"
  | "defaultWorkspace";

export const shellOptions = [
  { label: "PowerShell", value: "pwsh" },
  { label: "Bash", value: "bash" },
  { label: "CMD", value: "cmd" },
  { label: "Fish", value: "fish" },
  { label: "Nushell", value: "nu" },
];

export const themeOptions: Array<{ value: AppTheme; labelKey: TranslationKey }> = [
  { value: "professional", labelKey: "themeProfessional" },
  { value: "graphite", labelKey: "themeGraphite" },
  { value: "indigo", labelKey: "themeIndigo" },
  { value: "teal", labelKey: "themeTeal" },
  { value: "amber", labelKey: "themeAmber" },
  { value: "slate", labelKey: "themeSlate" },
  { value: "rose", labelKey: "themeRose" },
  { value: "violet", labelKey: "themeViolet" },
];

export const defaultWebSearchSettings: AppSettings["webSearch"] = {
  searchProviderId: "",
  searchApiUrl: "",
  searchApiKeys: [],
  fetchProviderId: "direct",
  fetchApiUrl: "",
  fetchApiKeys: [],
  maxResults: 5,
  excludeDomains: [],
  cutoffTokens: 4000,
};

export const searchProviderOptions = [
  { id: "tavily", name: "Tavily", apiUrl: "https://api.tavily.com/search", requiresKey: true },
  { id: "zhipu", name: "Zhipu", apiUrl: "https://open.bigmodel.cn/api/paas/v4/web_search", requiresKey: true },
  { id: "exa", name: "Exa", apiUrl: "https://api.exa.ai/search", requiresKey: true },
  { id: "bocha", name: "Bocha", apiUrl: "https://api.bochaai.com/v1/web-search", requiresKey: true },
  { id: "searxng", name: "SearXNG", apiUrl: "http://localhost:8080/search", requiresKey: false },
  { id: "jina", name: "Jina", apiUrl: "https://s.jina.ai", requiresKey: true },
] as const;

export const fetchProviderOptions = [
  { id: "direct", name: "Direct fetch", apiUrl: "", requiresKey: false },
  { id: "jina", name: "Jina Reader", apiUrl: "https://r.jina.ai", requiresKey: true },
] as const;

export function splitMultilineList(value: string): string[] {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

export function isWebSearchConfigurationValid(webSearch: AppSettings["webSearch"]): boolean {
  const searchProviderOption = searchProviderOptions.find(
    (provider) => provider.id === webSearch.searchProviderId,
  );
  const fetchProviderOption = fetchProviderOptions.find(
    (provider) => provider.id === webSearch.fetchProviderId,
  );

  return (
    (!webSearch.searchProviderId ||
      Boolean(searchProviderOption) &&
        (!searchProviderOption?.requiresKey || webSearch.searchApiKeys.some((key) => key.trim()))) &&
    Boolean(fetchProviderOption) &&
    (!fetchProviderOption?.requiresKey || webSearch.fetchApiKeys.some((key) => key.trim()))
  );
}
