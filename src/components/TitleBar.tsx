import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon, MaximizeIcon, MinimizeIcon } from "./UiIcons";

const isTauriRuntime = "__TAURI_INTERNALS__" in window;
const appWindow = isTauriRuntime ? getCurrentWindow() : null;

export function TitleBar() {
  return (
    <div className="titlebar">
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onMouseDown={(e) => { if (e.button === 0) void appWindow?.startDragging(); }}
      >
        <span className="titlebar-title">Codex Switch</span>
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => void appWindow?.minimize()}
          type="button"
          title="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          className="titlebar-btn"
          onClick={() => void appWindow?.toggleMaximize()}
          type="button"
          title="Maximize"
        >
          <MaximizeIcon />
        </button>
        <button
          className="titlebar-btn titlebar-btn-close"
          onClick={() => void appWindow?.hide()}
          type="button"
          title="Close to tray"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
