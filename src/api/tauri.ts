import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  DashboardState,
  LaunchRequest,
  Provider,
  SessionRecord,
  SessionUpdateInput,
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
  launchCodex(payload: LaunchRequest): Promise<SessionRecord> {
    return invoke("launch_codex", { request: payload });
  },
  saveSettings(settings: AppSettings): Promise<AppSettings> {
    return invoke("save_settings", { settings });
  },
  updateSession(session: SessionUpdateInput): Promise<SessionRecord> {
    return invoke("update_session", { session });
  },
};
