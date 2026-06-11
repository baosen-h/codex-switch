import { getCurrentWindow } from "@tauri-apps/api/window";
import { appApi } from "../../api/tauri";
import { APP_NAME, RELEASES_URL } from "../../utils/appConstants";
import { CloseIcon, MaximizeIcon, MinimizeIcon } from "../ui/UiIcons";

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
        <span className="titlebar-title">{APP_NAME}</span>
        <button
          className="titlebar-version"
          onClick={() => void appApi.openExternalUrl(RELEASES_URL)}
          type="button"
          title="Open releases"
        >
          v{__APP_VERSION__}
        </button>
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
