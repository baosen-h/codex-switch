export type AgentKind = "codex" | "claude" | "gemini";
export type WireApi = "responses" | "chat";

export interface Provider {
  id: string;
  name: string;
  agent: AgentKind;
  apiProviderId: string;
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;
  model: string;
  wireApi: WireApi;
  reasoningEffort: string;
  extraToml: string;
  configText: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ApiProviderType =
  | "openai-compatible"
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "new-api"
  | "openrouter"
  | "huggingface";

export interface ApiProvider {
  id: string;
  name: string;
  providerType: ApiProviderType;
  wireApi: WireApi;
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;
  openAiAuthJson?: string;
  models: RemoteModel[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelListRequest {
  providerType?: ApiProviderType;
  baseUrl: string;
  apiKey: string;
}

export interface RemoteModel {
  id: string;
  name?: string;
  ownedBy?: string;
  description?: string;
  capabilities?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "file";
  dataUrl?: string;
  text?: string;
}

export interface ChatRequest {
  provider: ApiProvider;
  model: string;
  messages: ChatMessage[];
}

export interface ChatResponse {
  content: string;
}

export interface ImageGenerationRequest {
  provider: ApiProvider;
  model: string;
  prompt: string;
  size: string;
  count: number;
  quality?: string;
  background?: string;
  inputImages?: string[];
}

export interface ImageGenerationResponse {
  images: string[];
}

export interface ProviderBalance {
  strategy: string;
  remaining?: number;
  unit: string;
  isActive: boolean;
  nextResetAt?: number;
  label: string;
  planType?: string;
  fiveHourLeft?: number;
  fiveHourReset?: string;
  fiveHourResetAt?: number;
  fiveHourLabel?: string;
  weeklyLeft?: number;
  weeklyReset?: string;
  weeklyResetAt?: number;
  weeklyLabel?: string;
  creditsBalance?: number;
  hasCredits?: boolean;
}

export interface AppUpdateInfo {
  latestVersion: string;
  releaseUrl: string;
  installerUrl?: string;
  installerName?: string;
  installerDigest?: string;
  releaseName?: string;
  publishedAt?: string;
}

export interface UpdateDownloadProgress {
  status: "downloading" | "verifying" | "launching";
  percent?: number;
}

export interface SessionRecord {
  id: string;
  providerId: string;
  providerName: string;
  providerModel: string;
  agent: AgentKind;
  sessionId: string;
  workspacePath: string;
  title: string;
  summary?: string;
  sourcePath: string;
  resumeCommand: string;
  status: string;
  notes: string;
  messageCount: number;
  startedAt: string;
  lastActiveAt: string;
}

export interface SessionMessage {
  role: string;
  content: string;
  timestamp?: string;
}

export type HandoffMode = "fast" | "slow";

export interface HandoffPreview {
  mode: string;
  title: string;
  sessionId: string;
  sourceAgent: string;
  content: string;
}

export type BackgroundColorMode = "system" | "dark" | "light";
export type BackgroundScene =
  | "none"
  | "anime"
  | "animeSakura"
  | "animeNight"
  | "mikuStage"
  | "raidenShogun"
  | "lumineGold"
  | "hutaoLantern"
  | "ayakaSnow"
  | "yaeSakura"
  | "nahidaDream"
  | "furinaStage"
  | "keqingViolet"
  | "animeCyberGirl"
  | "animeIdolPink"
  | "animeMaidCafe"
  | "animeWitchNight"
  | "animeSchoolRooftop"
  | "animeKimonoFestival"
  | "animeMechaPilot";
export type AppTheme = "professional" | "graphite" | "indigo" | "teal" | "amber" | "slate" | "rose" | "violet";

export interface AppSettings {
  codexConfigDir: string;
  claudeConfigDir: string;
  geminiConfigDir: string;
  defaultWorkspace: string;
  terminalProgram: string;
  autoRecordSessions: boolean;
  language: string;
  backgroundColor: BackgroundColorMode;
  backgroundScene: BackgroundScene;
  theme: AppTheme;
}

export interface DashboardState {
  apiProviders: ApiProvider[];
  providers: Provider[];
  sessions: SessionRecord[];
  settings: AppSettings;
}

export type PageKey = "providers" | "agents" | "talking" | "drawing" | "sessions" | "settings";

export interface LaunchRequest {
  workspacePath: string;
}

export interface StartOpenAiOauthResult {
  authUrl: string;
  manualCallbackRequired: boolean;
  message?: string;
}

export interface CompleteOpenAiOauthResult {
  email: string;
  configText: string;
  authJson: string;
}
