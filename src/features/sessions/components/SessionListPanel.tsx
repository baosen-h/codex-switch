import type { UIEvent } from "react";
import { CopyIcon, DeleteIcon, ResumeIcon } from "../../../components/ui";
import type { HandoffMode, SessionRecord } from "../../../types";
import { copyText } from "../../../utils/clipboard";
import { timeAgo } from "../../../utils/time";
import { SessionHandoffControls } from "./SessionHandoffControls";

interface HandoffChoice {
  mode: HandoffMode;
  title: string;
  description: string;
}

interface SessionListPanelProps {
  sessions: SessionRecord[];
  visibleSessions: SessionRecord[];
  selectedSession: SessionRecord | null;
  allSessionCount: number;
  pendingDeleteId: string | null;
  copyMenuSessionId: string | null;
  copyingHandoffKey: string | null;
  handoffChoices: HandoffChoice[];
  lang: "en" | "zh";
  labels: {
    messagesSuffix: string;
    openResume: string;
    copyResume: string;
    loadingHandoff: string;
    handoffPreparing: string;
    copyHandoff: string;
    deleteSessionFile: string;
    delete: string;
    cancel: string;
    noSessionsFilter: string;
    noSessions: string;
  };
  onScroll: (event: UIEvent<HTMLElement>) => void;
  onSelectSession: (id: string) => void;
  onLaunchSession: (session: SessionRecord) => void;
  onSetPendingDeleteId: (id: string | null) => void;
  onDeleteSession: (session: SessionRecord) => void;
  onSetCopyMenuSessionId: (updater: string | null | ((current: string | null) => string | null)) => void;
  onCopyHandoff: (session: SessionRecord, mode: HandoffMode) => void;
}

export function SessionListPanel({
  sessions,
  visibleSessions,
  selectedSession,
  allSessionCount,
  pendingDeleteId,
  copyMenuSessionId,
  copyingHandoffKey,
  handoffChoices,
  lang,
  labels,
  onScroll,
  onSelectSession,
  onLaunchSession,
  onSetPendingDeleteId,
  onDeleteSession,
  onSetCopyMenuSessionId,
  onCopyHandoff,
}: SessionListPanelProps) {
  return (
    <article className="session-panel session-list-panel">
      <div className="session-scroll session-scroll-list" onScroll={onScroll}>
        <div className="session-list">
          {sessions.length ? (
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
                      <span>{labels.deleteSessionFile}</span>
                      <div className="delete-confirm-actions">
                        <button
                          className="danger-button"
                          onClick={() => onDeleteSession(session)}
                          type="button"
                        >
                          {labels.delete}
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => onSetPendingDeleteId(null)}
                          type="button"
                        >
                          {labels.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="session-list-item"
                      onClick={() => onSelectSession(session.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => event.key === "Enter" && onSelectSession(session.id)}
                    >
                      <div className="session-row">
                        <div className="session-info">
                          <div className="session-header">
                            <strong>{session.title || "Untitled session"}</strong>
                            <div className="session-badges">
                              <span className="session-badge session-badge--agent">{session.providerName}</span>
                              {session.messageCount > 0 ? (
                                <span className="session-badge session-badge--count">{session.messageCount} {labels.messagesSuffix}</span>
                              ) : null}
                              {session.lastActiveAt ? (
                                <span className="session-badge session-badge--time">{timeAgo(session.lastActiveAt, lang)}</span>
                              ) : null}
                            </div>
                          </div>
                          <p>{session.workspacePath}</p>
                          <div className="session-actions-row">
                            <button
                              className="session-action-btn session-action-btn--resume"
                              onClick={(event) => {
                                event.stopPropagation();
                                onLaunchSession(session);
                              }}
                              type="button"
                              title={`${labels.openResume}: ${session.resumeCommand}`}
                            >
                              <ResumeIcon />
                            </button>
                            <button
                              className="session-action-btn session-action-btn--copy"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyText(session.resumeCommand);
                              }}
                              type="button"
                              title={`${labels.copyResume}: ${session.resumeCommand}`}
                            >
                              <CopyIcon />
                            </button>
                            <SessionHandoffControls
                              session={session}
                              choices={handoffChoices}
                              activeHandoffMode={activeHandoffMode}
                              isCopyMenuOpen={isCopyMenuOpen}
                              labels={{
                                loadingHandoff: labels.loadingHandoff,
                                handoffPreparing: labels.handoffPreparing,
                                copyHandoff: labels.copyHandoff,
                              }}
                              onCloseMenu={() => onSetCopyMenuSessionId(null)}
                              onToggleMenu={() =>
                                onSetCopyMenuSessionId((current) =>
                                  current === session.id ? null : session.id,
                                )
                              }
                              onCopyHandoff={onCopyHandoff}
                            />
                          </div>
                        </div>
                        <div className="session-meta">
                          <button
                            className="session-delete-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSetPendingDeleteId(session.id);
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
              {allSessionCount ? labels.noSessionsFilter : labels.noSessions}
            </p>
          )}
          {visibleSessions.length < sessions.length ? (
            <p className="empty-state">
              {visibleSessions.length}/{sessions.length}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
