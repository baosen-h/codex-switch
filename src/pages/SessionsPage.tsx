import { useEffect, useMemo, useState } from "react";
import type { SessionMessage, SessionRecord } from "../types";
import { useI18n } from "../i18n/context";
import { formatDate, timeAgo } from "../utils/time";

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

export function SessionsPage({ sessions, onLoadMessages, onDelete }: SessionsPageProps) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<SessionMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const roleLabels: Record<string, string> = {
    user: t("roleUser"),
    assistant: t("roleAI"),
    tool: t("roleTool"),
    system: t("roleSystem"),
  };

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesStatus =
        statusFilter === "all" || session.status === statusFilter;

      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      return [
        session.title,
        session.providerName,
        session.workspacePath,
        session.sessionId,
        session.notes,
        session.summary ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, sessions, statusFilter]);

  const selectedSession =
    filteredSessions.find((session) => session.id === selectedSessionId) ??
    sessions.find((session) => session.id === selectedSessionId) ??
    filteredSessions[0] ??
    null;

  useEffect(() => {
    if (!selectedSession) {
      setSelectedSessionId(null);
      setSelectedMessages([]);
      return;
    }

    if (selectedSession.id !== selectedSessionId) {
      setSelectedSessionId(selectedSession.id);
    }
  }, [selectedSession, selectedSessionId]);

  useEffect(() => {
    if (!selectedSession) return;

    let active = true;
    setIsLoadingMessages(true);

    void onLoadMessages(selectedSession.sourcePath)
      .then((messages) => { if (active) setSelectedMessages(messages); })
      .catch(() => { if (active) setSelectedMessages([]); })
      .finally(() => { if (active) setIsLoadingMessages(false); });

    return () => { active = false; };
  }, [onLoadMessages, selectedSession]);

  const handleDelete = async (session: SessionRecord) => {
    setPendingDeleteId(null);
    if (selectedSessionId === session.id) {
      setSelectedSessionId(null);
      setSelectedMessages([]);
    }
    await onDelete(session);
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h2>{t("sessions")}</h2>
        </div>
      </header>

      <article className="card narrow-card">
        <div className="form-grid compact-form-grid">
          <label className="field">
            <span>{t("search")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </label>
          <label className="field">
            <span>{t("status")}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("all")}</option>
              <option value="active">{t("active")}</option>
              <option value="paused">{t("paused")}</option>
              <option value="completed">{t("completed")}</option>
            </select>
          </label>
        </div>
      </article>

      <div className="sessions-layout">
        <article className="card">
          <div className="session-list">
            {filteredSessions.length ? (
              filteredSessions.map((session) => {
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
                            {session.summary ? (
                              <small className="session-summary">{session.summary}</small>
                            ) : null}
                          </div>
                          <div className="session-meta">
                            <span>{session.providerName}</span>
                            <small>{session.lastActiveAt ? timeAgo(session.lastActiveAt, lang) : session.status}</small>
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
          </div>
        </article>

        <article className="card">
          {selectedSession ? (
            <>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">{selectedSession.providerName}</span>
                  <h3>{selectedSession.title || "Untitled session"}</h3>
                  <p>{selectedSession.workspacePath || t("unknownWorkspace")}</p>
                </div>
                <div className="provider-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void navigator.clipboard.writeText(selectedSession.resumeCommand)}
                    type="button"
                  >
                    {t("copyResume")}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      selectedSession.workspacePath
                        ? void navigator.clipboard.writeText(selectedSession.workspacePath)
                        : undefined
                    }
                    type="button"
                  >
                    {t("copyWorkspace")}
                  </button>
                </div>
              </div>

              <div className="session-detail-grid">
                <div>
                  <span className="detail-label">{t("sessionId")}</span>
                  <p>{selectedSession.sessionId}</p>
                </div>
                <div>
                  <span className="detail-label">{t("started")}</span>
                  <p>{selectedSession.startedAt ? formatDate(selectedSession.startedAt) : t("unknown")}</p>
                </div>
                <div>
                  <span className="detail-label">{t("lastActive")}</span>
                  <p>{selectedSession.lastActiveAt ? formatDate(selectedSession.lastActiveAt) : t("unknown")}</p>
                </div>
              </div>

              <div className="resume-command-block">
                <span className="detail-label">{t("resumeCommand")}</span>
                <code>{selectedSession.resumeCommand}</code>
              </div>

              <div className="transcript-panel">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">{t("transcript")}</span>
                    <h3>{t("messages")}</h3>
                  </div>
                </div>
                {isLoadingMessages ? (
                  <p className="empty-state">{t("loadingTranscript")}</p>
                ) : selectedMessages.length ? (
                  <div className="message-list">
                    {selectedMessages.map((message, index) => (
                      <div className="message-card" key={`${message.role}-${index}`}>
                        <div className="message-card-header">
                          <strong>{roleLabels[message.role] ?? message.role}</strong>
                        </div>
                        <p>{message.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">{t("noMessages")}</p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">{t("selectSession")}</p>
          )}
        </article>
      </div>
    </section>
  );
}
