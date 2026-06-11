import { BoltIcon, BranchIcon, CopyIcon } from "../../../components/ui";
import type { HandoffMode, SessionRecord } from "../../../types";

interface HandoffChoice {
  mode: HandoffMode;
  title: string;
  description: string;
}

interface SessionHandoffControlsProps {
  session: SessionRecord;
  choices: HandoffChoice[];
  activeHandoffMode: string | null;
  isCopyMenuOpen: boolean;
  labels: {
    loadingHandoff: string;
    handoffPreparing: string;
    copyHandoff: string;
  };
  onCloseMenu: () => void;
  onToggleMenu: () => void;
  onCopyHandoff: (session: SessionRecord, mode: HandoffMode) => void;
}

export function SessionHandoffControls({
  session,
  choices,
  activeHandoffMode,
  isCopyMenuOpen,
  labels,
  onCloseMenu,
  onToggleMenu,
  onCopyHandoff,
}: SessionHandoffControlsProps) {
  return (
    <div className="session-handoff-row" onClick={(event) => event.stopPropagation()}>
      {activeHandoffMode ? (
        <div className="session-handoff-progress" aria-label={labels.loadingHandoff}>
          <span className="session-handoff-progress-bar" />
          <span className="session-handoff-progress-label">{labels.handoffPreparing}</span>
        </div>
      ) : isCopyMenuOpen ? (
        <div className="session-handoff-pills">
          {choices.map((choice) => (
            <button
              key={choice.mode}
              className={`session-handoff-pill session-handoff-pill--${choice.mode}`}
              onClick={() => onCopyHandoff(session, choice.mode)}
              type="button"
              title={choice.description}
            >
              <span className="session-handoff-pill-icon">
                {choice.mode === "fast" ? <BoltIcon size={13} /> : <BranchIcon size={13} />}
              </span>
              <span className="session-handoff-pill-label">{choice.title}</span>
            </button>
          ))}
          <button
            className="session-handoff-pill-close"
            onClick={onCloseMenu}
            type="button"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          className="session-handoff-trigger"
          onClick={onToggleMenu}
          type="button"
          title={labels.copyHandoff}
        >
          <CopyIcon />
        </button>
      )}
    </div>
  );
}
