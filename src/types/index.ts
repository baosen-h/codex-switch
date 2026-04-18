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
  lastActiveAt: string;
}

export interface SessionMessage {
  role: string;
  content: string;
}

export interface AppSettings {
  codexConfigDir: string;
  defaultWorkspace: string;
  terminalProgram: string;
  autoRecordSessions: boolean;
  language: string;
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
