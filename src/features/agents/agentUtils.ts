import type { AgentKind, ApiProvider, Provider, RemoteModel } from "../../types";

export function filterModels(models: RemoteModel[], query: string): RemoteModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return models;

  return models.filter((model) =>
    [model.id, model.name, model.ownedBy, model.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery)),
  );
}

export function sortAgentProviders(providers: Provider[]): Provider[] {
  return [...providers].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function countProvidersByAgent(providers: Provider[]): Record<AgentKind, number> {
  const counts: Record<AgentKind, number> = { codex: 0, claude: 0, gemini: 0 };
  providers.forEach((provider) => {
    counts[provider.agent]++;
  });
  return counts;
}

export function avatarSourceForProvider(
  provider: Provider,
  apiProviders: ApiProvider[],
): Pick<ApiProvider, "name" | "providerType" | "baseUrl"> {
  const linked = apiProviders.find((item) => item.id === provider.apiProviderId);
  return linked ?? {
    name: provider.name,
    providerType: "openai-compatible",
    baseUrl: `${provider.name} ${provider.baseUrl}`,
  };
}
