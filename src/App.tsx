import { useCallback, useEffect, useRef, useState } from "react";
import { appApi } from "./api/tauri";
import { FloatingToast, type ToastState } from "./components/FloatingToast";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { I18nProvider } from "./i18n/context";
import type { Lang } from "./i18n/translations";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AppSettings, DashboardState, PageKey, Provider, SessionRecord } from "./types";
import { applyTheme } from "./utils/theme";

const emptyState: DashboardState = {
  providers: [],
  sessions: [],
  settings: {
    codexConfigDir: "",
    claudeConfigDir: "",
    geminiConfigDir: "",
    defaultWorkspace: "",
    terminalProgram: "pwsh",
    autoRecordSessions: true,
    language: "en",
    theme: "system",
  },
};


let toastSeq = 0;

function upsertProvider(providers: Provider[], provider: Provider): Provider[] {
  const index = providers.findIndex((item) => item.id === provider.id);
  if (index === -1) return [...providers, provider];
  const next = [...providers];
  next[index] = provider;
  return next;
}

function activateProviderInList(providers: Provider[], active: Provider): Provider[] {
  const cleared = providers.map((provider) =>
    provider.agent === active.agent ? { ...provider, isCurrent: false } : provider,
  );
  return upsertProvider(cleared, { ...active, isCurrent: true });
}

function App() {
  const [activePage, setActivePage] = useState<PageKey>("providers");
  const [data, setData] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useRef((message: string, type: ToastState["type"]) => {
    setToast({ message, type, id: ++toastSeq });
  });

  const lang: Lang = (data.settings.language as Lang) || "en";
  const themeMode = data.settings.theme || "system";

  const refresh = useCallback(async (nextMessage?: string) => {
    try {
      const dashboard = await appApi.getDashboard();
      setData(dashboard);
      if (nextMessage) showToast.current(nextMessage, "ok");
    } catch (caught) {
      showToast.current(
        caught instanceof Error ? caught.message : "Failed to load state.",
        "err",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    applyTheme(themeMode);
    if (themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themeMode]);

  const runAction = async <T,>(
    action: () => Promise<T>,
    successMsg?: string,
    onSuccess?: (result: T) => void,
  ) => {
    try {
      const result = await action();
      onSuccess?.(result);
      if (successMsg) showToast.current(successMsg, "ok");
    } catch (caught) {
      showToast.current(
        caught instanceof Error ? caught.message : "Unexpected error.",
        "err",
      );
    }
  };

  const handleSaveProvider = async (provider: Provider) =>
    runAction(
      () => appApi.saveProvider(provider),
      "Provider saved.",
      (saved) => {
        setData((current) => ({
          ...current,
          providers: upsertProvider(current.providers, saved),
        }));
      },
    );

  const handleDeleteProvider = async (id: string) =>
    runAction(
      () => appApi.deleteProvider(id),
      "Provider deleted.",
      () => {
        setData((current) => ({
          ...current,
          providers: current.providers.filter((provider) => provider.id !== id),
        }));
      },
    );

  const handleActivateProvider = async (id: string) =>
    runAction(
      () => appApi.activateProvider(id),
      "Provider activated.",
      (active) => {
        setData((current) => ({
          ...current,
          providers: activateProviderInList(current.providers, active),
        }));
      },
    );

  const handleSaveSettings = async (settings: AppSettings) =>
    runAction(
      () => appApi.saveSettings(settings),
      "Settings saved.",
      (saved) => {
        setData((current) => ({
          ...current,
          settings: saved,
        }));
      },
    );

  const handleDeleteSession = async (session: SessionRecord) =>
    runAction(
      () => appApi.deleteSession(session.sourcePath),
      "Session deleted.",
      () => {
        setData((current) => ({
          ...current,
          sessions: current.sessions.filter((item) => item.id !== session.id),
        }));
      },
    );

  const content = loading ? (
    <div className="loading-screen">{lang === "zh" ? "加载中..." : "LOADING..."}</div>
  ) : activePage === "sessions" ? (
    <SessionsPage
      sessions={data.sessions}
      onLoadMessages={appApi.getSessionMessages}
      onDelete={handleDeleteSession}
    />
  ) : activePage === "settings" ? (
    <SettingsPage settings={data.settings} onSave={handleSaveSettings} />
  ) : (
    <ProvidersPage
      providers={data.providers}
      onActivate={handleActivateProvider}
      onDelete={handleDeleteProvider}
      onSave={handleSaveProvider}
    />
  );

  return (
    <I18nProvider lang={lang}>
      <div className="app-root">
        <TitleBar />
        <div className="app-shell">
          <Sidebar activePage={activePage} onSelect={setActivePage} />
          <main className="main-content">
            {content}
          </main>
        </div>
        <FloatingToast toast={toast} onDismiss={dismissToast} />
      </div>
    </I18nProvider>
  );
}

export default App;
