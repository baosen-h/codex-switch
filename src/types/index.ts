export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
  extraToml: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  providerId: string;
  providerName: string;
  sessionId: string;
  workspacePath: string;
  title: string;
  summary?: string;
  sourcePath: string;
  resumeCommand: string;
  status: string;
  notes: string;
  startedAt: string;
  startedAtMs: number;
  lastActiveAt: string;
  lastActiveAtMs: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  ts?: number;
}

export interface AppSettings {
  codexConfigDir: string;
  defaultWorkspace: string;
  terminalProgram: string;
  autoRecordSessions: boolean;
}

export interface DashboardState {
  providers: Provider[];
  sessions: SessionRecord[];
  settings: AppSettings;
}

export type PageKey = "dashboard" | "providers" | "sessions" | "settings";

export interface LaunchRequest {
  workspacePath: string;
  title?: string;
}

export interface SessionUpdateInput {
  id: string;
  providerId: string;
  sessionId: string;
  sourcePath: string;
  title: string;
  status: string;
  notes: string;
}
