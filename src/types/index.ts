export type AgentKind = "codex" | "claude" | "gemini";

export interface Provider {
  id: string;
  name: string;
  agent: AgentKind;
  baseUrl: string;
  apiKey: string;
  websiteUrl: string;
  model: string;
  reasoningEffort: string;
  extraToml: string;
  configText: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  providerId: string;
  providerName: string;
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

export type ThemeMode = "system" | "dark" | "light";

export interface AppSettings {
  codexConfigDir: string;
  claudeConfigDir: string;
  geminiConfigDir: string;
  defaultWorkspace: string;
  terminalProgram: string;
  autoRecordSessions: boolean;
  language: string;
  theme: ThemeMode;
}

export interface DashboardState {
  providers: Provider[];
  sessions: SessionRecord[];
  settings: AppSettings;
}

export type PageKey = "providers" | "sessions" | "settings";

export interface LaunchRequest {
  workspacePath: string;
}
