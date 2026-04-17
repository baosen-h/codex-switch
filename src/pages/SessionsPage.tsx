import { useState } from "react";
import type { SessionRecord } from "../types";

interface SessionsPageProps {
  sessions: SessionRecord[];
  onSave: (
    session: Pick<
      SessionRecord,
      "id" | "title" | "sessionRef" | "status" | "notes"
    >,
  ) => Promise<void>;
}

export function SessionsPage({ sessions, onSave }: SessionsPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftRef, setDraftRef] = useState("");
  const [draftStatus, setDraftStatus] = useState("active");
  const [draftNotes, setDraftNotes] = useState("");

  const startEdit = (session: SessionRecord) => {
    setEditingId(session.id);
    setDraftTitle(session.title);
    setDraftRef(session.sessionRef);
    setDraftStatus(session.status);
    setDraftNotes(session.notes);
  };

  const resetEdit = () => {
    setEditingId(null);
    setDraftTitle("");
    setDraftRef("");
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

      <article className="card">
        <div className="session-list">
          {sessions.length ? (
            sessions.map((session) => {
              const isEditing = editingId === session.id;

              return (
                <div className="session-editor" key={session.id}>
                  <div className="session-row">
                    <div>
                      <strong>{session.title || "Untitled session"}</strong>
                      <p>{session.workspacePath}</p>
                    </div>
                    <div className="session-meta">
                      <span>{session.providerName}</span>
                      <small>{session.status}</small>
                    </div>
                  </div>

                  <div className="session-detail-grid">
                    <div>
                      <span className="detail-label">Session ref</span>
                      <p>{session.sessionRef || "Not set yet"}</p>
                    </div>
                    <div>
                      <span className="detail-label">Started</span>
                      <p>{session.startedAt}</p>
                    </div>
                    <div>
                      <span className="detail-label">Last active</span>
                      <p>{session.lastActiveAt}</p>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="form-grid session-form">
                      <label className="field">
                        <span>Title</span>
                        <input
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Session ref</span>
                        <input
                          value={draftRef}
                          onChange={(event) => setDraftRef(event.target.value)}
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
                              id: session.id,
                              title: draftTitle,
                              sessionRef: draftRef,
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
                        onClick={() => startEdit(session)}
                        type="button"
                      >
                        Edit continuity data
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="empty-state">
              No session records yet. Launch Codex from the dashboard to start
              building continuity history.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
