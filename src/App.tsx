import { useEffect, useMemo, useState } from "react";
import { appApi } from "./api/tauri";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { DashboardPage } from "./pages/DashboardPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  AppSettings,
  DashboardState,
  PageKey,
  Provider,
  SessionRecord,
} from "./types";

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
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [data, setData] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const currentProvider = useMemo(
    () => data.providers.find((provider) => provider.isCurrent) ?? null,
    [data.providers],
  );

  const refresh = async (nextMessage?: string) => {
    const dashboard = await appApi.getDashboard();
    setData(dashboard);
    if (nextMessage) {
      setMessage(nextMessage);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Failed to load application state.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const runAction = async (action: () => Promise<void>) => {
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error.");
    }
  };

  const handleSaveProvider = async (provider: Provider) => {
    await runAction(async () => {
      await appApi.saveProvider(provider);
      await refresh("Provider saved.");
    });
  };

  const handleDeleteProvider = async (id: string) => {
    await runAction(async () => {
      await appApi.deleteProvider(id);
      await refresh("Provider deleted.");
    });
  };

  const handleActivateProvider = async (id: string) => {
    await runAction(async () => {
      await appApi.activateProvider(id);
      await refresh("Provider enabled and Codex config written.");
    });
  };

  const handleLaunch = async (workspacePath: string, title: string) => {
    await runAction(async () => {
      await appApi.launchCodex({ workspacePath, title });
      await refresh("Codex launched and session recorded.");
      setActivePage("sessions");
    });
  };

  const handleSaveSettings = async (settings: AppSettings) => {
    await runAction(async () => {
      await appApi.saveSettings(settings);
      await refresh("Settings saved.");
    });
  };

  const handleSaveSession = async (
    session: Pick<SessionRecord, "id" | "title" | "sessionRef" | "status" | "notes">,
  ) => {
    await runAction(async () => {
      await appApi.updateSession(session);
      await refresh("Session updated.");
    });
  };

  let content;
  if (loading) {
    content = <div className="loading-screen">Loading Codex Switch Mini...</div>;
  } else {
    switch (activePage) {
      case "providers":
        content = (
          <ProvidersPage
            providers={data.providers}
            onActivate={handleActivateProvider}
            onDelete={handleDeleteProvider}
            onSave={handleSaveProvider}
          />
        );
        break;
      case "sessions":
        content = (
          <SessionsPage
            sessions={data.sessions}
            onSave={handleSaveSession}
          />
        );
        break;
      case "settings":
        content = (
          <SettingsPage
            settings={data.settings}
            onSave={handleSaveSettings}
          />
        );
        break;
      default:
        content = (
          <DashboardPage
            providers={data.providers}
            sessions={data.sessions}
            settings={data.settings}
            onLaunch={handleLaunch}
          />
        );
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onSelect={setActivePage} />
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Active route</span>
            <h2>{currentProvider?.name ?? "No active provider"}</h2>
          </div>
          <div className="topbar-chip">
            {currentProvider?.model ?? "Configure provider first"}
          </div>
        </header>
        <StatusBar error={error} message={message} />
        {content}
      </main>
    </div>
  );
}

export default App;
