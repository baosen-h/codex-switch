import type { AppSettings } from "../../types";

export interface SettingsPageProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
}
