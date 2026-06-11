import type { ApiProvider, AppSettings } from "../../types";

export interface CapabilitiesPageProps {
  apiProviders: ApiProvider[];
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}
