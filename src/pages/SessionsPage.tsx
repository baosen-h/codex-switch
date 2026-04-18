import { useEffect, useMemo, useState } from "react";
import type { SessionMessage, SessionRecord } from "../types";

interface SessionsPageProps {
  sessions: SessionRecord[];
  onLoadMessages: (sourcePath: string) => Promise<SessionMessage[]>;
  onDelete: (session: SessionRecord) => Promise<void>;
}

const roleLabels: Record<string, string> = {
  user: "User",
  assistant: "AI",
  tool: "Tool",
  system: "System",
};

export function SessionsPage({ sessions, onLoadMessages, onDelete }: SessionsPageProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<SessionMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sessions.filter((session) => {
      const matchesStatus =
        statusFilter === "all" || session.status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

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
    if (!selectedSession) {
      return;
    }

    let active = true;
    setIsLoadingMessages(true);

    void onLoadMessages(selectedSession.sourcePath)
      .then((messages) => {
        if (active) {
          setSelectedMessages(messages);
        }
      })
      .catch(() => {
        if (active) {
          setSelectedMessages([]);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      active = false;
    };
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
          <h2>Sessions</h2>
          <p>Track workspace/provider continuity and keep resume references together.</p>
        </div>
      </header>

      <article className="card narrow-card">
        <div className="form-grid compact-form-grid">
          <label className="field">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Workspace, provider, notes, session ref..."
            />
          </label>
          <label className="field">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">all</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="completed">completed</option>
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
                        <span>Delete session file?</span>
                        <div className="delete-confirm-actions">
                          <button
                            className="danger-button"
                            onClick={() => void handleDelete(session)}
                            type="button"
                          >
                            Delete
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => setPendingDeleteId(null)}
                            type="button"
                          >
                            Cancel
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
                            <small>{session.status}</small>
                            <button
                              className="session-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteId(session.id);
                              }}
                              type="button"
                              title="Delete session"
                            >
                              ✕
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
                {sessions.length
                  ? "No sessions match the current filter."
                  : "No Codex session files found yet. Launch Codex to create history."}
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
                  <p>{selectedSession.workspacePath || "Unknown workspace"}</p>
                </div>
                <div className="provider-actions">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void navigator.clipboard.writeText(selectedSession.resumeCommand)
                    }
                    type="button"
                  >
                    Copy resume
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
                    Copy workspace
                  </button>
                </div>
              </div>

              <div className="session-detail-grid">
                <div>
                  <span className="detail-label">Session id</span>
                  <p>{selectedSession.sessionId}</p>
                </div>
                <div>
                  <span className="detail-label">Started</span>
                  <p>{selectedSession.startedAt || "Unknown"}</p>
                </div>
                <div>
                  <span className="detail-label">Last active</span>
                  <p>{selectedSession.lastActiveAt || "Unknown"}</p>
                </div>
              </div>

              <div className="resume-command-block">
                <span className="detail-label">Resume command</span>
                <code>{selectedSession.resumeCommand}</code>
              </div>

              <div className="transcript-panel">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Transcript</span>
                    <h3>Messages</h3>
                  </div>
                </div>
                {isLoadingMessages ? (
                  <p className="empty-state">Loading transcript...</p>
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
                  <p className="empty-state">
                    No parsed messages found for this session yet.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">
              Select a session to inspect its transcript and resume command.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
