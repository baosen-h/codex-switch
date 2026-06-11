import { invoke } from "@tauri-apps/api/core";
import type {
  ApiProvider,
  AppUpdateInfo,
  AppSettings,
  CapabilitiesState,
  CapabilitySyncResult,
  ChatRequest,
  ChatResponse,
  CompleteOpenAiOauthResult,
  DashboardState,
  HandoffMode,
  HandoffPreview,
  ImageGenerationRequest,
  ImageGenerationResponse,
  LaunchRequest,
  McpPreset,
  McpServer,
  McpTestResult,
  ModelListRequest,
  ProviderBalance,
  Provider,
  RemoteModel,
  SessionMessage,
  SessionRecord,
  StartOpenAiOauthResult,
  Skill,
  SkillMarketResult,
  WebSearchResponse,
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
  downloadAndInstallUpdate(update: AppUpdateInfo): Promise<boolean> {
    return invoke("download_and_install_update", { update });
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
  searchWeb(keywords: string[]): Promise<WebSearchResponse> {
    return invoke("search_web", { keywords });
  },
  fetchWebUrls(urls: string[]): Promise<WebSearchResponse> {
    return invoke("fetch_web_urls", { urls });
  },
  getCapabilitiesState(): Promise<CapabilitiesState> {
    return invoke("get_capabilities_state");
  },
  saveMcpServer(server: McpServer): Promise<[McpServer, CapabilitySyncResult]> {
    return invoke("save_mcp_server", { server });
  },
  deleteMcpServer(id: string): Promise<CapabilitySyncResult> {
    return invoke("delete_mcp_server", { id });
  },
  testMcpServer(server: McpServer): Promise<McpTestResult> {
    return invoke("test_mcp_server", { server });
  },
  previewMcpConfig(server: McpServer, agent: string): Promise<string> {
    return invoke("preview_mcp_config", { server, agent });
  },
  syncMcpCapabilities(id?: string): Promise<CapabilitySyncResult> {
    return invoke("sync_mcp_capabilities", { id });
  },
  saveMcpPreset(preset: McpPreset): Promise<McpPreset> {
    return invoke("save_mcp_preset", { preset });
  },
  deleteMcpPreset(id: string): Promise<void> {
    return invoke("delete_mcp_preset", { id });
  },
  importSkill(sourcePath: string): Promise<[Skill, CapabilitySyncResult]> {
    return invoke("import_skill", { sourcePath });
  },
  searchSkillMarket(query: string): Promise<SkillMarketResult[]> {
    return invoke("search_skill_market", { query });
  },
  saveSkill(skill: Skill): Promise<[Skill, CapabilitySyncResult]> {
    return invoke("save_skill", { skill });
  },
  deleteSkill(id: string): Promise<CapabilitySyncResult> {
    return invoke("delete_skill", { id });
  },
  previewSkill(skill: Skill): Promise<string> {
    return invoke("preview_skill", { skill });
  },
  syncSkillCapabilities(): Promise<CapabilitySyncResult> {
    return invoke("sync_skill_capabilities");
  },
};
