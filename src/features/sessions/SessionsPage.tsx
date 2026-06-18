import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import type { HandoffMode, HandoffPreview, SessionMessage, SessionRecord } from "../../types";
import { useI18n } from "../../i18n/context";
import { copyText } from "../../utils/clipboard";
import { SessionDetailPanel } from "./components/SessionDetailPanel";
import { SessionFilters } from "./components/SessionFilters";
import { SessionListPanel } from "./components/SessionListPanel";
import {
  filterSessions,
  handoffCacheKey,
  INITIAL_SESSION_BATCH,
  isDeveloperLikeMessage,
  SESSION_BATCH_SIZE,
} from "./sessionUtils";
import type { AgentFilter, SessionsPageProps } from "./types";

export function SessionsPage({
  sessions,
  isIndexing,
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

  const filteredSessions = useMemo(
    () => filterSessions(sessions, deferredQuery, agentFilter),
    [deferredQuery, agentFilter, sessions],
  );

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

  const handleSessionListScroll = (event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 120 && visibleCount < filteredSessions.length) {
      setVisibleCount((current) => Math.min(current + SESSION_BATCH_SIZE, filteredSessions.length));
    }
  };

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
    <section className="page sessions-page">
      <article className="card session-connected-card">
        <SessionFilters
          query={query}
          agentFilter={agentFilter}
          isIndexing={isIndexing}
          labels={{
            search: t("search"),
            searchPlaceholder: t("searchPlaceholder"),
            agentFilter: t("agentFilter"),
            tabAll: t("tabAll"),
            agentCodex: t("agentCodex"),
            agentClaude: t("agentClaude"),
            agentGemini: t("agentGemini"),
            refreshSessions: t("refreshSessions"),
            indexingSessions: lang === "zh" ? "正在索引..." : "Indexing...",
          }}
          onQueryChange={setQuery}
          onAgentFilterChange={setAgentFilter}
          onRefresh={() => void onRefresh()}
        />

        <div className="sessions-layout sessions-layout-connected">
          <SessionListPanel
            sessions={filteredSessions}
            visibleSessions={visibleSessions}
            selectedSession={selectedSession}
            allSessionCount={sessions.length}
            pendingDeleteId={pendingDeleteId}
            copyMenuSessionId={copyMenuSessionId}
            copyingHandoffKey={copyingHandoffKey}
            handoffChoices={handoffChoices}
            lang={lang}
            labels={{
              messagesSuffix: t("messagesSuffix"),
              openResume: t("openResume"),
              copyResume: t("copyResume"),
              loadingHandoff: t("loadingHandoff"),
              handoffPreparing: t("handoffPreparing"),
              copyHandoff: t("copyHandoff"),
              deleteSessionFile: t("deleteSessionFile"),
              delete: t("delete"),
              cancel: t("cancel"),
              noSessionsFilter: t("noSessionsFilter"),
              noSessions: t("noSessions"),
            }}
            onScroll={handleSessionListScroll}
            onSelectSession={setSelectedSessionId}
            onLaunchSession={(session) => void onLaunchSession(session)}
            onSetPendingDeleteId={setPendingDeleteId}
            onDeleteSession={(session) => void handleDelete(session)}
            onSetCopyMenuSessionId={setCopyMenuSessionId}
            onCopyHandoff={(session, mode) => void handleCopyHandoff(session, mode)}
          />

          <SessionDetailPanel
            selectedSession={selectedSession}
            visibleMessages={visibleMessages}
            directoryMessages={directoryMessages}
            expandedMessages={expandedMessages}
            isDirectoryOpen={isDirectoryOpen}
            isLoadingMessages={isLoadingMessages}
            messageRefs={messageRefs}
            roleLabels={roleLabels}
            lang={lang}
            labels={{
              loadingTranscript: t("loadingTranscript"),
              noMessages: t("noMessages"),
              selectSession: t("selectSession"),
              messages: t("messages"),
            }}
            onToggleMessageExpanded={toggleMessageExpanded}
            onSetDirectoryOpen={setIsDirectoryOpen}
            onJumpToMessage={jumpToMessage}
          />
        </div>
      </article>
    </section>
  );
}
