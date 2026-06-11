import type { AppSettings } from "../../types";

export interface SettingsPageProps {
  settings: AppSettings;
  onOpenGuide: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}
