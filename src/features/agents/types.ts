import type { ApiProvider, Provider } from "../../types";

export interface AgentsPageProps {
  apiProviders: ApiProvider[];
  providers: Provider[];
  onSave: (provider: Provider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onLaunchProvider: (id: string) => Promise<void>;
}
