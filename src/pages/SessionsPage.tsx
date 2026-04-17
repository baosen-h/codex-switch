import { useMemo, useState } from "react";
import type { SessionMessage, SessionRecord } from "../types";

interface SessionsPageProps {
  sessions: SessionRecord[];
  selectedSessionId: string | null;
  selectedMessages: SessionMessage[];
  isLoadingMessages: boolean;
  onSelect: (session: SessionRecord) => Promise<void>;
  onSave: (
    session: Pick<
      SessionRecord,
      "id" | "providerId" | "sessionId" | "sourcePath" | "title" | "status" | "notes"
    >,
  ) => Promise<void>;
}

const roleLabels: Record<string, string> = {
  user: "User",
  assistant: "AI",
  tool: "Tool",
  system: "System",
};

export function SessionsPage({
  sessions,
  selectedSessionId,
  selectedMessages,
  isLoadingMessages,
  onSelect,
  onSave,
}: SessionsPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStatus, setDraftStatus] = useState("active");
  const [draftNotes, setDraftNotes] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const startEdit = (session: SessionRecord) => {
    setEditingId(session.id);
    setDraftTitle(session.title);
    setDraftStatus(session.status);
    setDraftNotes(session.notes);
  };

  const resetEdit = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftStatus("active");
    setDraftNotes("");
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
              const isEditing = editingId === session.id;
              const isSelected = selectedSession?.id === session.id;

              return (
                <button
                  className={`session-editor session-list-item ${isSelected ? "selected" : ""}`}
                  key={session.id}
                  onClick={() => void onSelect(session)}
                  type="button"
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
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="empty-state">
              {sessions.length
                ? "No sessions match the current filter."
                : "No session records yet. Launch Codex from the dashboard to start building continuity history."}
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

              {editingId === selectedSession.id ? (
                <div className="form-grid session-form">
                  <label className="field">
                    <span>Title</span>
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={draftStatus}
                      onChange={(event) => setDraftStatus(event.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="completed">completed</option>
                    </select>
                  </label>
                  <label className="field field-full">
                    <span>Notes</span>
                    <textarea
                      rows={4}
                      value={draftNotes}
                      onChange={(event) => setDraftNotes(event.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button
                      className="primary-button"
                      onClick={() =>
                        void onSave({
                          id: selectedSession.id,
                          providerId: selectedSession.providerId,
                          sessionId: selectedSession.sessionId,
                          sourcePath: selectedSession.sourcePath,
                          title: draftTitle,
                          status: draftStatus,
                          notes: draftNotes,
                        }).then(resetEdit)
                      }
                      type="button"
                    >
                      Save session
                    </button>
                    <button
                      className="secondary-button"
                      onClick={resetEdit}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button
                    className="secondary-button"
                    onClick={() => startEdit(selectedSession)}
                    type="button"
                  >
                    Edit continuity data
                  </button>
                </div>
              )}

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
