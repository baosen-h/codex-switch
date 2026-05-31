import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { appApi } from "../api/tauri";
import type { Lang } from "../i18n/translations";
import type { AppUpdateInfo, UpdateDownloadProgress } from "../types";
import { CloseIcon, SyncIcon } from "./UiIcons";

interface UpdateNoticeProps {
  lang: Lang;
  update: AppUpdateInfo | null;
  onDismiss: () => void;
}

export function UpdateNotice({ lang, update, onDismiss }: UpdateNoticeProps) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void listen<UpdateDownloadProgress>("update-download-progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      dispose = unlisten;
    }).catch(() => {
      // Progress is best effort; the update command still works without event delivery.
    });

    return () => {
      dispose?.();
    };
  }, []);

  if (!update) return null;

  const isZh = lang === "zh";
  const progressLabel = !progress
    ? isZh ? "准备下载..." : "Preparing..."
    : progress.status === "verifying"
      ? isZh ? "正在校验..." : "Verifying..."
      : progress.status === "launching"
        ? isZh ? "正在启动安装器..." : "Launching installer..."
        : `${isZh ? "下载中" : "Downloading"} ${progress.percent ?? 0}%`;

  const runUpdate = async () => {
    setInstalling(true);
    setError("");
    setProgress({ status: "downloading", percent: 0 });
    try {
      await appApi.downloadAndInstallUpdate(update);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setInstalling(false);
      setProgress(null);
    }
  };

  return (
    <aside className="update-notice" aria-live="polite">
      <div className="update-notice-main">
        <span className="update-notice-badge">v{update.latestVersion}</span>
        <div>
          <strong>{isZh ? "发现新版本" : "New version available"}</strong>
          <p>{isZh ? "可直接下载并启动安装。" : "Download and install directly in the app."}</p>
        </div>
      </div>
      {installing && (
        <div className="update-notice-progress">
          <div className="update-progress-track">
            <span style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <small>{progressLabel}</small>
        </div>
      )}
      {error && <p className="update-notice-error">{error}</p>}
      <div className="update-notice-actions">
        <button
          className="secondary-button update-notice-open"
          disabled={installing || !update.installerUrl}
          onClick={() => void runUpdate()}
          type="button"
          title={isZh ? "下载并更新" : "Download and update"}
        >
          <SyncIcon size={15} />
          <span>{installing ? (isZh ? "更新中" : "Updating") : (isZh ? "更新" : "Update")}</span>
        </button>
        <button
          className="secondary-button update-notice-close"
          onClick={onDismiss}
          disabled={installing}
          type="button"
          title={isZh ? "本版本不再提醒" : "Dismiss this version"}
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </aside>
  );
}
