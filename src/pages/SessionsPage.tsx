import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AgentKind, SessionMessage, SessionRecord } from "../types";
import { useI18n } from "../i18n/context";
import { formatConversationTime, timeAgo } from "../utils/time";

const PixelX = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
    <rect x="0" y="0" width="2" height="2"/>
    <rect x="6" y="0" width="2" height="2"/>
    <rect x="2" y="2" width="2" height="2"/>
    <rect x="4" y="2" width="2" height="2"/>
    <rect x="2" y="4" width="2" height="2"/>
    <rect x="4" y="4" width="2" height="2"/>
    <rect x="0" y="6" width="2" height="2"/>
    <rect x="6" y="6" width="2" height="2"/>
  </svg>
);

interface SessionsPageProps {
  sessions: SessionRecord[];
  onLoadMessages: (sourcePath: string) => Promise<SessionMessage[]>;
  onDelete: (session: SessionRecord) => Promise<void>;
}

type AgentFilter = AgentKind | "all";
const INITIAL_SESSION_BATCH = 80;
const SESSION_BATCH_SIZE = 80;

async function copyText(value: string) {
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

export function SessionsPage({ sessions, onLoadMessages, onDelete }: SessionsPageProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<SessionMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_SESSION_BATCH);
  const deferredQuery = useDeferredValue(query);
  const messageCache = useRef<Map<string, SessionMessage[]>>(new Map());
  const roleLabels: Record<string, string> = {
    user: t("roleUser"),
    assistant: t("roleAI"),
    tool: t("roleTool"),
    system: t("roleSystem"),
  };

  const shouldShowMessageTime = (
    current: SessionMessage,
    previous?: SessionMessage,
  ): boolean => {
    if (!current.timestamp) return false;
    if (!previous?.timestamp) return true;

    const currentTime = new Date(current.timestamp).getTime();
    const previousTime = new Date(previous.timestamp).getTime();
    if (Number.isNaN(currentTime) || Number.isNaN(previousTime)) {
      return current.timestamp !== previous.timestamp;
    }

    return currentTime - previousTime >= 30 * 60 * 1000;
  };

  const filteredSessions = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
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
  }, [deferredQuery, agentFilter, sessions]);

  const selectedSession =
    filteredSessions.find((session) => session.id === selectedSessionId) ??
    sessions.find((session) => session.id === selectedSessionId) ??
    null;

  const visibleSessions = useMemo(
    () => filteredSessions.slice(0, visibleCount),
    [filteredSessions, visibleCount],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_SESSION_BATCH);
  }, [deferredQuery, agentFilter, sessions.length]);

  useEffect(() => {
    if (!selectedSession) {
      setSelectedMessages([]);
      setIsLoadingMessages(false);
    }
  }, [selectedSession, selectedSessionId]);

  const selectedSourcePath = selectedSession?.sourcePath ?? null;

  useEffect(() => {
    if (!selectedSourcePath) return;

    const cached = messageCache.current.get(selectedSourcePath);
    if (cached) {
      setSelectedMessages(cached);
      setIsLoadingMessages(false);
      return;
    }

    let active = true;
    setIsLoadingMessages(true);

    void onLoadMessages(selectedSourcePath)
      .then((messages) => {
        if (!active) return;
        messageCache.current.set(selectedSourcePath, messages);
        setSelectedMessages(messages);
      })
      .catch(() => {
        if (!active) return;
        setSelectedMessages([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoadingMessages(false);
      });

    return () => {
      active = false;
    };
  }, [onLoadMessages, selectedSourcePath]);

  const handleDelete = async (session: SessionRecord) => {
    setPendingDeleteId(null);
    if (selectedSessionId === session.id) {
      setSelectedSessionId(null);
    }
    await onDelete(session);
  };

  const handleSessionListScroll = (event: React.UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 120 && visibleCount < filteredSessions.length) {
      setVisibleCount((current) => Math.min(current + SESSION_BATCH_SIZE, filteredSessions.length));
    }
  };

  return (
    <section className="page">
      <article className="card session-connected-card">
        <div className="session-connected-top">
          <div className="filter-row session-filter-row">
            <label className="field session-filter-search">
              <span>{t("search")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            </label>
            <label className="field session-filter-agent">
              <span>{t("agentFilter")}</span>
              <select
                value={agentFilter}
                onChange={(event) => setAgentFilter(event.target.value as AgentFilter)}
              >
                <option value="all">{t("tabAll")}</option>
                <option value="codex">{t("agentCodex")}</option>
                <option value="claude">{t("agentClaude")}</option>
                <option value="gemini">{t("agentGemini")}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="sessions-layout sessions-layout-connected">
          <article className="session-panel session-list-panel">
            <div className="session-scroll session-scroll-list" onScroll={handleSessionListScroll}>
              <div className="session-list">
            {filteredSessions.length ? (
              visibleSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const isPendingDelete = pendingDeleteId === session.id;

                return (
                  <div
                    className={`session-editor ${isSelected ? "selected" : ""}`}
                    key={session.id}
                  >
                    {isPendingDelete ? (
                      <div className="delete-confirm">
                        <span>{t("deleteSessionFile")}</span>
                        <div className="delete-confirm-actions">
                          <button
                            className="danger-button"
                            onClick={() => void handleDelete(session)}
                            type="button"
                          >
                            {t("delete")}
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => setPendingDeleteId(null)}
                            type="button"
                          >
                            {t("cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="session-list-item"
                        onClick={() => setSelectedSessionId(session.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedSessionId(session.id)}
                      >
                        <div className="session-row">
                          <div>
                            <strong>{session.title || "Untitled session"}</strong>
                            <p>{session.workspacePath}</p>
                            <div className="session-command-row">
                              <button
                                className="session-command-line"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(session.resumeCommand);
                                }}
                                type="button"
                                title={session.resumeCommand}
                              >
                                {session.resumeCommand}
                              </button>
                              <button
                                className="session-command-copy"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(session.resumeCommand);
                                }}
                                type="button"
                                title={t("copyResume")}
                              >
                                ⧉
                              </button>
                            </div>
                          </div>
                          <div className="session-meta">
                            <span>{session.providerName}</span>
                            <small>{session.messageCount} {t("messagesSuffix")}</small>
                            {session.lastActiveAt ? (
                              <small>{timeAgo(session.lastActiveAt, lang)}</small>
                            ) : null}
                            <button
                              className="session-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteId(session.id);
                              }}
                              type="button"
                              title="Delete session"
                            >
                              <PixelX />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="empty-state">
                {sessions.length ? t("noSessionsFilter") : t("noSessions")}
              </p>
            )}
            {visibleSessions.length < filteredSessions.length ? (
              <p className="empty-state">
                {visibleSessions.length}/{filteredSessions.length}
              </p>
            ) : null}
              </div>
            </div>
          </article>

          <article className="session-panel session-detail-panel">
            <div className="session-scroll session-scroll-detail">
              {selectedSession ? (
                <div className="session-chat-layout">
                  <div className="session-chat-header">
                    <h3>{selectedSession.title || "Untitled session"}</h3>
                  </div>

                  <div className="session-message-pane">
                    {isLoadingMessages ? (
                      <p className="empty-state">{t("loadingTranscript")}</p>
                    ) : selectedMessages.length ? (
                      <div className="message-list">
                        {selectedMessages.map((message, index) => (
                          <div key={`${selectedSession.id}-${message.role}-${index}`}>
                            {shouldShowMessageTime(message, selectedMessages[index - 1]) ? (
                              <div className="message-time">
                                {formatConversationTime(message.timestamp ?? "", lang)}
                              </div>
                            ) : null}
                            <div
                              className={`message-row message-row-${message.role}`}
                            >
                              <div className={`message-card message-card-${message.role}`}>
                                <div className="message-card-header">
                                  <strong>{roleLabels[message.role] ?? message.role}</strong>
                                </div>
                                <p>{message.content}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">{t("noMessages")}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="empty-state">{t("selectSession")}</p>
              )}
            </div>
          </article>
        </div>
      </article>
    </section>
  );
}
