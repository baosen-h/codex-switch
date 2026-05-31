import { invoke } from "@tauri-apps/api/core";
import type {
  ApiProvider,
  AppUpdateInfo,
  AppSettings,
  ChatRequest,
  ChatResponse,
  CompleteOpenAiOauthResult,
  DashboardState,
  HandoffMode,
  HandoffPreview,
  ImageGenerationRequest,
  ImageGenerationResponse,
  LaunchRequest,
  ModelListRequest,
  ProviderBalance,
  Provider,
  RemoteModel,
  SessionMessage,
  SessionRecord,
  StartOpenAiOauthResult,
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
  launchProvider(providerId: string): Promise<boolean> {
    return invoke("launch_provider", { providerId });
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
  launchSession(session: SessionRecord): Promise<boolean> {
    return invoke("launch_session", { session });
  },
  getProviderBalance(provider: ApiProvider): Promise<ProviderBalance> {
    return invoke("get_provider_balance", { provider });
  },
  checkAppUpdate(currentVersion: string): Promise<AppUpdateInfo | null> {
    return invoke("check_app_update", { currentVersion });
  },
  openExternalUrl(url: string): Promise<boolean> {
    return invoke("open_external_url", { url });
  },
  startOpenAiOauth(openBrowser = true): Promise<StartOpenAiOauthResult> {
    return invoke("start_openai_oauth", { openBrowser });
  },
  submitOpenAiOauthCallback(input: string): Promise<void> {
    return invoke("submit_openai_oauth_callback", { input });
  },
  completeOpenAiOauth(code: string, model?: string): Promise<CompleteOpenAiOauthResult> {
    return invoke("complete_openai_oauth", { code, model });
  },
  pickDirectory(initialPath?: string): Promise<string | null> {
    return invoke("pick_directory", { initialPath });
  },
  saveSettings(settings: AppSettings): Promise<AppSettings> {
    return invoke("save_settings", { settings });
  },
};
