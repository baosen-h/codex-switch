import { useEffect, useMemo, useState } from "react";
import { appApi } from "./api/tauri";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { AppSettings, DashboardState, PageKey, Provider } from "./types";

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

function App() {
  const [activePage, setActivePage] = useState<PageKey>("providers");
  const [data, setData] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentProvider = useMemo(
    () => data.providers.find((provider) => provider.isCurrent) ?? null,
    [data.providers],
  );

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async (nextMessage?: string) => {
    try {
      const dashboard = await appApi.getDashboard();
      setData(dashboard);
      if (nextMessage) {
        setMessage(nextMessage);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load application state.",
      );
    } finally {
      setLoading(false);
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    }
  };

  const handleSaveProvider = async (provider: Provider) =>
    runAction(async () => {
      await appApi.saveProvider(provider);
      await refresh("Provider saved.");
    });

  const handleDeleteProvider = async (id: string) =>
    runAction(async () => {
      await appApi.deleteProvider(id);
      await refresh("Provider deleted.");
    });

  const handleActivateProvider = async (id: string) =>
    runAction(async () => {
      await appApi.activateProvider(id);
      await refresh("Provider activated.");
    });

  const handleSaveSettings = async (settings: AppSettings) =>
    runAction(async () => {
      await appApi.saveSettings(settings);
      await refresh("Settings saved.");
    });

  const content = loading ? (
    <div className="loading-screen">LOADING...</div>
  ) : activePage === "sessions" ? (
    <SessionsPage
      sessions={data.sessions}
      onLoadMessages={appApi.getSessionMessages}
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
    <div className="app-shell">
      <Sidebar activePage={activePage} onSelect={setActivePage} />
      <main className="main-content">
        <header className="topbar">
          <div>
            <h2>{currentProvider?.name ?? "No active provider"}</h2>
          </div>
          <div className="topbar-chip">
            {currentProvider?.model ?? "—"}
          </div>
        </header>
        <StatusBar error={error} message={message} />
        {content}
      </main>
    </div>
  );
}

export default App;
