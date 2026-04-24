import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  DashboardState,
  LaunchRequest,
  Provider,
  SessionMessage,
} from "../types";

export const appApi = {
  getDashboard(): Promise<DashboardState> {
    return invoke("get_dashboard");
  },
  saveProvider(provider: Provider): Promise<Provider> {
    return invoke("save_provider", { provider });
  },
  deleteProvider(id: string): Promise<boolean> {
    return invoke("delete_provider", { id });
  },
  activateProvider(id: string): Promise<Provider> {
    return invoke("activate_provider", { id });
  },
  launchCodex(payload: LaunchRequest): Promise<boolean> {
    return invoke("launch_codex", { request: payload });
  },
  getSessionMessages(sourcePath: string): Promise<SessionMessage[]> {
    return invoke("get_session_messages", { sourcePath });
  },
  deleteSession(sourcePath: string): Promise<boolean> {
    return invoke("delete_session", { sourcePath });
  },
  openExternalUrl(url: string): Promise<boolean> {
    return invoke("open_external_url", { url });
  },
  pickDirectory(initialPath?: string): Promise<string | null> {
    return invoke("pick_directory", { initialPath });
  },
  saveSettings(settings: AppSettings): Promise<AppSettings> {
    return invoke("save_settings", { settings });
  },
};
