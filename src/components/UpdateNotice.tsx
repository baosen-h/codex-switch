import { appApi } from "../api/tauri";
import type { Lang } from "../i18n/translations";
import type { AppUpdateInfo } from "../types";
import { CloseIcon, GlobeIcon } from "./UiIcons";

interface UpdateNoticeProps {
  lang: Lang;
  update: AppUpdateInfo | null;
  onDismiss: () => void;
}

export function UpdateNotice({ lang, update, onDismiss }: UpdateNoticeProps) {
  if (!update) return null;

  const isZh = lang === "zh";

  return (
    <aside className="update-notice" aria-live="polite">
      <div className="update-notice-main">
        <span className="update-notice-badge">v{update.latestVersion}</span>
        <div>
          <strong>{isZh ? "发现新版本" : "New version available"}</strong>
          <p>{isZh ? "打开发布页下载最新安装包。" : "Open the release page to download the latest build."}</p>
        </div>
      </div>
      <div className="update-notice-actions">
        <button
          className="secondary-button update-notice-open"
          onClick={() => void appApi.openExternalUrl(update.releaseUrl)}
          type="button"
          title={isZh ? "打开发布页" : "Open release"}
        >
          <GlobeIcon size={15} />
          <span>{isZh ? "发布页" : "Release"}</span>
        </button>
        <button
          className="secondary-button update-notice-close"
          onClick={onDismiss}
          type="button"
          title={isZh ? "本版本不再提醒" : "Dismiss this version"}
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </aside>
  );
}
