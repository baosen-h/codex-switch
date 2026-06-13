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
  | "openai_oauth"
  | "openai_apikey"
  | "anthropic"
  | "anthropic-compatible"
  | "gemini"
  | "glm"
  | "deepseek"
  | "mimo"
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
export type AppTheme = "professional" | "graphite" | "indigo" | "teal" | "amber" | "slate" | "rose" | "violet";

export type WebSearchCapability = "searchKeywords" | "fetchUrls";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  sourceInput: string;
}

export interface WebSearchResponse {
  providerId: string;
  capability: WebSearchCapability;
  inputs: string[];
  results: WebSearchResult[];
}

export interface WebSearchSettings {
  searchProviderId: string;
  searchApiUrl: string;
  searchApiKeys: string[];
  fetchProviderId: string;
  fetchApiUrl: string;
  fetchApiKeys: string[];
  maxResults: number;
  excludeDomains: string[];
  cutoffTokens: number;
}

export interface AppSettings {
  codexConfigDir: string;
  claudeConfigDir: string;
  geminiConfigDir: string;
  defaultWorkspace: string;
  terminalProgram: string;
  autoRecordSessions: boolean;
  language: string;
  backgroundColor: BackgroundColorMode;
  theme: AppTheme;
  visionFallbackEnabled: boolean;
  visionApiProviderId: string;
  visionModel: string;
  visionChatEnabled: boolean;
  visionCodexEnabled: boolean;
  visionClaudeEnabled: boolean;
  visionGeminiEnabled: boolean;
  webSearch: WebSearchSettings;
}

export interface DashboardState {
  apiProviders: ApiProvider[];
  providers: Provider[];
  sessions: SessionRecord[];
  settings: AppSettings;
}

export type PageKey =
  | "providers"
  | "agents"
  | "talking"
  | "drawing"
  | "sessions"
  | "capabilities"
  | "settings";

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
  authJson: string;
}

export interface CapabilityTargets {
  codex: boolean;
  claude: boolean;
  gemini: boolean;
}

export interface ConfigValue {
  value: string;
  secret: boolean;
  credentialId: string;
  template?: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface McpServer {
  id: string;
  targetKey: string;
  name: string;
  description: string;
  transport: "stdio" | "http" | "sse";
  command: string;
  args: string[];
  workingDirectory: string;
  url: string;
  env: Record<string, ConfigValue>;
  headers: Record<string, ConfigValue>;
  targets: CapabilityTargets;
  lastTestStatus: string;
  lastTestError: string;
  lastTestAt: string;
  cachedTools: McpTool[];
  createdAt: string;
  updatedAt: string;
}

export interface McpTestResult {
  status: string;
  error: string;
  output: string;
  tools: McpTool[];
  testedAt: string;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  transport: "stdio" | "http" | "sse";
  command: string;
  args: string[];
  workingDirectory: string;
  url: string;
  env: Record<string, ConfigValue>;
  headers: Record<string, ConfigValue>;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  sourcePath: string;
  sourceKind: "app" | "external";
  syncMode: "copy" | "reference";
  targets: CapabilityTargets;
  createdAt: string;
  updatedAt: string;
}

export interface SkillMarketResult {
  id: string;
  skillId: string;
  name: string;
  description: string;
  source: string;
  installs: number;
  url: string;
}

export type MarketplaceCapability = "skills" | "mcp";

export interface MarketplaceSource {
  id: string;
  capabilityType: MarketplaceCapability;
  name: string;
  sourceType: string;
  baseUrl: string;
  enabled: boolean;
  sortOrder: number;
  builtIn: boolean;
  credentialId: string;
  hasCredential: boolean;
}

export interface MarketplaceInstallSpec {
  transport: string;
  command: string;
  args: string[];
  url: string;
  packageType: string;
  packageName: string;
  envKeys: string[];
  headerKeys: string[];
  headerTemplates: Record<string, string>;
  requiredHeaderKeys: string[];
}

export interface MarketplaceResult {
  id: string;
  capabilityType: MarketplaceCapability;
  canonicalId: string;
  name: string;
  description: string;
  author: string;
  version: string;
  sourceId: string;
  sourceName: string;
  sourceIds: string[];
  sourceUrl: string;
  artifactUrl: string;
  artifactSha256: string;
  installReference: string;
  downloads: number;
  warnings: string[];
  installSpec: MarketplaceInstallSpec;
  installedId: string;
  updateAvailable: boolean;
}

export interface MarketplaceSourceStatus {
  sourceId: string;
  sourceName: string;
  status: string;
  error: string;
  resultCount: number;
}

export interface MarketplaceSearchResponse {
  results: MarketplaceResult[];
  sources: MarketplaceSourceStatus[];
}

export interface SkillMarketPreview {
  result: MarketplaceResult;
  instructions: string;
  files: string[];
  contentHash: string;
}

export interface MarketplaceInstallRequest {
  result: MarketplaceResult;
  targets: CapabilityTargets;
  env: Record<string, ConfigValue>;
  headers: Record<string, ConfigValue>;
}

export interface RuntimeAvailability {
  node: boolean;
  npx: boolean;
  uv: boolean;
  uvx: boolean;
}

export interface McpImportPreview {
  servers: McpServer[];
  errors: string[];
}

export interface SyncTargetResult {
  agent: AgentKind;
  status: string;
  error: string;
}

export interface CapabilitySyncResult {
  results: SyncTargetResult[];
}

export interface CapabilityCounts {
  codex: number;
  claude: number;
  gemini: number;
  status: string;
}

export interface CapabilitiesState {
  mcpServers: McpServer[];
  mcpPresets: McpPreset[];
  skills: Skill[];
  mcpCounts: CapabilityCounts;
  skillCounts: CapabilityCounts;
  availableTargets: CapabilityTargets;
}
