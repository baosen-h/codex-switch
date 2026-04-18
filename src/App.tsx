import { useCallback, useEffect, useRef, useState } from "react";
import { appApi } from "./api/tauri";
import { FloatingToast, type ToastState } from "./components/FloatingToast";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AppSettings, DashboardState, PageKey, Provider, SessionRecord } from "./types";

const emptyState: DashboardState = {
  providers: [],
  sessions: [],
  settings: {
    codexConfigDir: "",
    defaultWorkspace: "",
    terminalProgram: "pwsh",
    autoRecordSessions: true,
  },
};

let toastSeq = 0;

function App() {
  const [activePage, setActivePage] = useState<PageKey>("providers");
  const [data, setData] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useRef((message: string, type: ToastState["type"]) => {
    setToast({ message, type, id: ++toastSeq });
  });

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async (nextMessage?: string) => {
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
  };

  const runAction = async (
    action: () => Promise<void>,
    successMsg?: string,
  ) => {
    try {
      await action();
      if (successMsg) showToast.current(successMsg, "ok");
    } catch (caught) {
      showToast.current(
        caught instanceof Error ? caught.message : "Unexpected error.",
        "err",
      );
    }
  };

  const handleSaveProvider = async (provider: Provider) =>
    runAction(async () => {
      await appApi.saveProvider(provider);
      await refresh();
    }, "Provider saved.");

  const handleDeleteProvider = async (id: string) =>
    runAction(async () => {
      await appApi.deleteProvider(id);
      await refresh();
    }, "Provider deleted.");

  const handleActivateProvider = async (id: string) =>
    runAction(async () => {
      await appApi.activateProvider(id);
      await refresh();
    }, "Provider activated.");

  const handleSaveSettings = async (settings: AppSettings) =>
    runAction(async () => {
      await appApi.saveSettings(settings);
      await refresh();
    }, "Settings saved.");

  const handleDeleteSession = async (session: SessionRecord) =>
    runAction(async () => {
      await appApi.deleteSession(session.sourcePath);
      await refresh();
    }, "Session deleted.");

  const content = loading ? (
    <div className="loading-screen">LOADING...</div>
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
  );
}

export default App;
