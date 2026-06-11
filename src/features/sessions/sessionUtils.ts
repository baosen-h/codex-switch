import type { AgentKind, HandoffMode, SessionMessage, SessionRecord } from "../../types";

export const INITIAL_SESSION_BATCH = 80;
export const SESSION_BATCH_SIZE = 80;
export const COLLAPSED_MESSAGE_CHARS = 1200;

export function isDeveloperLikeMessage(message: SessionMessage): boolean {
  const role = message.role.toLowerCase();
  const text = message.content.trim();
  return (
    role === "developer" ||
    role === "system" ||
    text.startsWith("<environment_context>") ||
    text.startsWith("<current_date>") ||
    text.startsWith("<timezone>") ||
    text.startsWith("<permissions instructions>") ||
    text.startsWith("<collaboration_mode>") ||
    text.startsWith("<skills_instructions>") ||
    text.startsWith("<image") ||
    text.startsWith("<turn_aborted>") ||
    text.startsWith("# Instructions")
  );
}

export function messagePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 54 ? `${compact.slice(0, 54)}...` : compact || "Untitled message";
}

export function shouldShowMessageTime(
  current: SessionMessage,
  previous?: SessionMessage,
): boolean {
  if (!current.timestamp) return false;
  if (!previous?.timestamp) return true;

  const currentTime = new Date(current.timestamp).getTime();
  const previousTime = new Date(previous.timestamp).getTime();
  if (Number.isNaN(currentTime) || Number.isNaN(previousTime)) {
    return current.timestamp !== previous.timestamp;
  }

  return currentTime - previousTime >= 30 * 60 * 1000;
}

export function filterSessions(
  sessions: SessionRecord[],
  query: string,
  agentFilter: AgentKind | "all",
): SessionRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  const byAgent =
    agentFilter === "all"
      ? sessions
      : sessions.filter((session) => session.agent === agentFilter);

  if (!normalizedQuery) return byAgent;

  return byAgent.filter((session) =>
    [
      session.title,
      session.providerName,
      session.workspacePath,
      session.sessionId,
      session.notes,
      session.summary ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function handoffCacheKey(session: SessionRecord, mode: HandoffMode): string {
  return `${session.sessionId}:${session.lastActiveAt}:${mode}`;
}
