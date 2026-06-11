import type { ApiProvider, AppSettings } from "../../types";

export interface SettingsPageProps {
  apiProviders: ApiProvider[];
  settings: AppSettings;
  onOpenGuide: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}
