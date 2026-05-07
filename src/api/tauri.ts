import { invoke } from "@tauri-apps/api/core";
import type {
  ApiProvider,
  AppSettings,
  ChatRequest,
  ChatResponse,
  DashboardState,
  HandoffMode,
  HandoffPreview,
  ImageGenerationRequest,
  ImageGenerationResponse,
  LaunchRequest,
  ModelListRequest,
  Provider,
  RemoteModel,
  SessionMessage,
} from "../types";

export const appApi = {
  getDashboard(): Promise<DashboardState> {
    return invoke("get_dashboard");
  },
  saveProvider(provider: Provider): Promise<Provider> {
    return invoke("save_provider", { provider });
  },
  saveApiProvider(provider: ApiProvider): Promise<ApiProvider> {
    return invoke("save_api_provider", { provider });
  },
  deleteApiProvider(id: string): Promise<boolean> {
    return invoke("delete_api_provider", { id });
  },
  deleteProvider(id: string): Promise<boolean> {
    return invoke("delete_provider", { id });
  },
  activateProvider(id: string): Promise<Provider> {
    return invoke("activate_provider", { id });
  },
  listProviderModels(request: ModelListRequest): Promise<RemoteModel[]> {
    return invoke("list_provider_models", { request });
  },
  sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    return invoke("send_chat_message", { request });
  },
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    return invoke("generate_image", { request });
  },
  launchCodex(payload: LaunchRequest): Promise<boolean> {
    return invoke("launch_codex", { request: payload });
  },
  getSessionMessages(sourcePath: string): Promise<SessionMessage[]> {
    return invoke("get_session_messages", { sourcePath });
  },
  buildSessionHandoff(sourcePath: string, mode: HandoffMode): Promise<HandoffPreview> {
    return invoke("build_session_handoff", { sourcePath, mode });
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
