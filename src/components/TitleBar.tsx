import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

const MinIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <rect x="1" y="4" width="8" height="2"/>
  </svg>
);

const MaxIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <rect x="1" y="1" width="8" height="2"/>
    <rect x="1" y="1" width="2" height="8"/>
    <rect x="7" y="1" width="2" height="8"/>
    <rect x="1" y="7" width="8" height="2"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
    <rect x="1" y="1" width="2" height="2"/>
    <rect x="7" y="1" width="2" height="2"/>
    <rect x="3" y="3" width="2" height="2"/>
    <rect x="5" y="3" width="2" height="2"/>
    <rect x="3" y="5" width="2" height="2"/>
    <rect x="5" y="5" width="2" height="2"/>
    <rect x="1" y="7" width="2" height="2"/>
    <rect x="7" y="7" width="2" height="2"/>
  </svg>
);

export function TitleBar() {
  return (
    <div className="titlebar">
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onMouseDown={(e) => { if (e.button === 0) void appWindow.startDragging(); }}
      >
        <span className="titlebar-title">CODEX-SWITCH</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => void appWindow.minimize()}
          type="button"
          title="Minimize"
        >
          <MinIcon />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => void appWindow.toggleMaximize()}
          type="button"
          title="Maximize"
        >
          <MaxIcon />
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => void appWindow.hide()}
          type="button"
          title="Close to tray"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
