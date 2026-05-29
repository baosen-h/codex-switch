import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { AgentKind, HandoffMode, HandoffPreview, SessionMessage, SessionRecord } from "../types";
import { useI18n } from "../i18n/context";
import { formatConversationTime, timeAgo } from "../utils/time";
import { CopyIcon, DeleteIcon, ListIcon, PlayIcon, RefreshIcon } from "../components/UiIcons";

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
  onBuildHandoff: (sourcePath: string, mode: HandoffMode) => Promise<HandoffPreview>;
  onLoadMessages: (sourcePath: string) => Promise<SessionMessage[]>;
  onDelete: (session: SessionRecord) => Promise<void>;
  onLaunchSession: (session: SessionRecord) => Promise<void>;
  onRefresh: () => void | Promise<void>;
  onNotify: (message: string, type: "ok" | "err") => void;
}

type AgentFilter = AgentKind | "all";
const INITIAL_SESSION_BATCH = 80;
const SESSION_BATCH_SIZE = 80;
const COLLAPSED_MESSAGE_CHARS = 1200;

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

function isDeveloperLikeMessage(message: SessionMessage): boolean {
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

function messagePreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 54 ? `${compact.slice(0, 54)}...` : compact || "Untitled message";
}

export function SessionsPage({
  sessions,
  onBuildHandoff,
  onLoadMessages,
  onDelete,
  onLaunchSession,
  onRefresh,
  onNotify,
}: SessionsPageProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<AgentFilter>("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<SessionMessage[]>([]);
  const [copyMenuSessionId, setCopyMenuSessionId] = useState<string | null>(null);
  const [copyingHandoffKey, setCopyingHandoffKey] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_SESSION_BATCH);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(() => new Set());
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const messageCache = useRef<Map<string, SessionMessage[]>>(new Map());
  const handoffCache = useRef<Map<string, HandoffPreview>>(new Map());
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const roleLabels: Record<string, string> = {
    user: t("roleUser"),
    assistant: t("roleAI"),
    tool: t("roleTool"),
    system: t("roleSystem"),
  };
  const handoffChoices: Array<{ mode: HandoffMode; title: string; description: string }> = [
    {
      mode: "fast",
      title: t("handoffFast"),
      description: t("handoffFastHint"),
    },
    {
      mode: "slow",
      title: t("handoffSlow"),
      description: t("handoffSlowHint"),
    },
  ];

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

  const visibleMessages = useMemo(
    () => selectedMessages.filter((message) => !isDeveloperLikeMessage(message)),
    [selectedMessages],
  );

  const directoryMessages = useMemo(
    () =>
      visibleMessages
        .map((message, index) => ({ message, index, key: `${selectedSession?.id ?? "session"}-${index}` }))
        .filter((item) => item.message.role === "user"),
    [selectedSession?.id, visibleMessages],
  );

  useEffect(() => {
    setVisibleCount(INITIAL_SESSION_BATCH);
  }, [deferredQuery, agentFilter, sessions.length]);

  useEffect(() => {
    if (!selectedSession) {
      setSelectedMessages([]);
      setIsLoadingMessages(false);
      setIsDirectoryOpen(false);
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

  useEffect(() => {
    setExpandedMessages(new Set());
    setIsDirectoryOpen(false);
    messageRefs.current.clear();
  }, [selectedSourcePath]);

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

  const handoffCacheKey = (session: SessionRecord, mode: HandoffMode) =>
    `${session.sessionId}:${session.lastActiveAt}:${mode}`;

  const handleCopyHandoff = async (session: SessionRecord, mode: HandoffMode) => {
    const cacheKey = handoffCacheKey(session, mode);
    const progressKey = `${session.id}:${mode}`;
    setCopyMenuSessionId(null);
    setCopyingHandoffKey(progressKey);
    try {
      const preview =
        handoffCache.current.get(cacheKey) ?? (await onBuildHandoff(session.sourcePath, mode));
      handoffCache.current.set(cacheKey, preview);
      await copyText(preview.content);
      onNotify(t("handoffCopied"), "ok");
    } catch (caught) {
      onNotify(
        caught instanceof Error ? caught.message : t("handoffGenerateError"),
        "err",
      );
    } finally {
      setCopyingHandoffKey((current) => (current === progressKey ? null : current));
    }
  };

  const toggleMessageExpanded = (key: string) => {
    setExpandedMessages((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const jumpToMessage = (key: string) => {
    messageRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setIsDirectoryOpen(false);
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
            <button className="session-refresh-button" onClick={() => void onRefresh()} type="button" title={t("refreshSessions")}>
              <RefreshIcon />
            </button>
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
                const activeHandoffMode = copyingHandoffKey?.startsWith(`${session.id}:`)
                  ? copyingHandoffKey.split(":")[1]
                  : null;
                const isCopyMenuOpen = copyMenuSessionId === session.id;

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
                          <div className="session-info">
                            <div className="session-header">
                              <strong>{session.title || "Untitled session"}</strong>
                              <div className="session-badges">
                                <span className="session-badge session-badge--agent">{session.providerName}</span>
                                <span className="session-badge session-badge--count">{session.messageCount} {t("messagesSuffix")}</span>
                                {session.lastActiveAt ? (
                                  <span className="session-badge session-badge--time">{timeAgo(session.lastActiveAt, lang)}</span>
                                ) : null}
                              </div>
                            </div>
                            <p>{session.workspacePath}</p>
                            <div className="session-actions-row">
                              <button
                                className="session-action-btn session-action-btn--resume"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onLaunchSession(session);
                                }}
                                type="button"
                                title={`${t("openResume")}: ${session.resumeCommand}`}
                              >
                                <PlayIcon />
                              </button>
                              <button
                                className="session-action-btn session-action-btn--copy"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(session.resumeCommand);
                                }}
                                type="button"
                                title={`${t("copyResume")}: ${session.resumeCommand}`}
                              >
                                <CopyIcon />
                              </button>
                              <div className="session-handoff-row" onClick={(e) => e.stopPropagation()}>
                                {activeHandoffMode ? (
                                  <div className="session-handoff-progress" aria-label={t("loadingHandoff")}>
                                    <span className="session-handoff-progress-bar" />
                                    <span className="session-handoff-progress-label">{t("handoffPreparing")}</span>
                                  </div>
                                ) : isCopyMenuOpen ? (
                                  <div className="session-handoff-pills">
                                    {handoffChoices.map((choice) => (
                                      <button
                                        key={choice.mode}
                                        className={`session-handoff-pill session-handoff-pill--${choice.mode}`}
                                        onClick={() => void handleCopyHandoff(session, choice.mode)}
                                        type="button"
                                        title={choice.description}
                                      >
                                        <span className="session-handoff-pill-icon">
                                          {choice.mode === "fast" ? "⚡" : "📋"}
                                        </span>
                                        <span className="session-handoff-pill-label">{choice.title}</span>
                                      </button>
                                    ))}
                                    <button
                                      className="session-handoff-pill-close"
                                      onClick={() => setCopyMenuSessionId(null)}
                                      type="button"
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="session-handoff-trigger"
                                    onClick={() =>
                                      setCopyMenuSessionId((current) =>
                                        current === session.id ? null : session.id,
                                      )
                                    }
                                    type="button"
                                    title={t("copyHandoff")}
                                  >
                                    <CopyIcon />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="session-meta">
                            <button
                              className="session-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteId(session.id);
                              }}
                              type="button"
                              title="Delete session"
                            >
                              <DeleteIcon size={13} />
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
                    ) : visibleMessages.length ? (
                      <div className="message-list">
                        {visibleMessages.map((message, index) => {
                          const messageKey = `${selectedSession.id}-${index}`;
                          const isLong = message.content.length > COLLAPSED_MESSAGE_CHARS;
                          const isExpanded = expandedMessages.has(messageKey);
                          const displayContent =
                            isLong && !isExpanded
                              ? `${message.content.slice(0, COLLAPSED_MESSAGE_CHARS).trimEnd()}...`
                              : message.content;

                          return (
                          <div
                            key={messageKey}
                            ref={(node) => {
                              if (node) {
                                messageRefs.current.set(messageKey, node);
                              } else {
                                messageRefs.current.delete(messageKey);
                              }
                            }}
                          >
                            {shouldShowMessageTime(message, visibleMessages[index - 1]) ? (
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
                                  <button
                                    className="message-copy-button"
                                    onClick={() => void copyText(message.content)}
                                    type="button"
                                    title="Copy"
                                  >
                                    <CopyIcon />
                                  </button>
                                </div>
                                <p>{displayContent}</p>
                                {isLong ? (
                                  <button
                                    className="message-unfold-button"
                                    onClick={() => toggleMessageExpanded(messageKey)}
                                    type="button"
                                  >
                                    {isExpanded ? "Collapse" : `Unfold full content (${Math.ceil(message.content.length / 1000)}k)`}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="empty-state">{t("noMessages")}</p>
                    )}
                  </div>
                  {directoryMessages.length ? (
                    <>
                      <button
                        className="session-directory-trigger"
                        onClick={() => setIsDirectoryOpen((current) => !current)}
                        type="button"
                        title="Conversation directory"
                      >
                        <ListIcon />
                      </button>
                      {isDirectoryOpen ? (
                        <div className="session-directory-panel">
                          <div className="session-directory-header">
                            <strong>{t("messages")}</strong>
                            <button onClick={() => setIsDirectoryOpen(false)} type="button" title="Close">X</button>
                          </div>
                          <div className="session-directory-list">
                            {directoryMessages.map((item, order) => (
                              <button
                                key={item.key}
                                onClick={() => jumpToMessage(item.key)}
                                type="button"
                              >
                                <span>{order + 1}</span>
                                <strong>{messagePreview(item.message.content)}</strong>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
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
