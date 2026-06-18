import type { HandoffMode, HandoffPreview, SessionMessage, SessionRecord } from "../../types";

export interface SessionsPageProps {
  sessions: SessionRecord[];
  isIndexing: boolean;
  onBuildHandoff: (sourcePath: string, mode: HandoffMode) => Promise<HandoffPreview>;
  onLoadMessages: (sourcePath: string) => Promise<SessionMessage[]>;
  onDelete: (session: SessionRecord) => Promise<void>;
  onLaunchSession: (session: SessionRecord) => Promise<void>;
  onRefresh: () => void | Promise<void>;
  onNotify: (message: string, type: "ok" | "err") => void;
}

export type AgentFilter = "codex" | "claude" | "gemini" | "all";
