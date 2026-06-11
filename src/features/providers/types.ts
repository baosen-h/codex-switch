import type { ApiProvider } from "../../types";

export interface ProvidersPageProps {
  providers: ApiProvider[];
  onSave: (provider: ApiProvider) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNotify: (message: string, type: "ok" | "err") => void;
}
