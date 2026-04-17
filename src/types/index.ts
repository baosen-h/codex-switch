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
  workspacePath: string;
  title: string;
  sessionRef: string;
  status: string;
  notes: string;
  startedAt: string;
  lastActiveAt: string;
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
  title: string;
  sessionRef: string;
  status: string;
  notes: string;
}
