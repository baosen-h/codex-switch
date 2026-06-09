import { useCallback, useEffect, useRef, useState } from "react";
import { appApi } from "./api/tauri";
import { FloatingToast, type ToastState } from "./components/FloatingToast";
import { OnboardingGuide } from "./components/OnboardingGuide";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { UpdateNotice } from "./components/UpdateNotice";
import { I18nProvider } from "./i18n/context";
import type { Lang } from "./i18n/translations";
import { AgentsPage } from "./pages/AgentsPage";
import { DrawingPage } from "./pages/DrawingPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TalkingPage } from "./pages/TalkingPage";
import type { ApiProvider, AppSettings, AppUpdateInfo, DashboardState, PageKey, Provider, SessionRecord } from "./types";
import { DISMISSED_UPDATE_KEY, GUIDE_SEEN_KEY } from "./utils/appConstants";
import { applyBackgroundColor, applyBackgroundScene, applyTheme, normalizeAppTheme, normalizeBackgroundScene } from "./utils/theme";

const emptyState: DashboardState = {
  apiProviders: [],
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
    backgroundColor: "system",
    backgroundScene: "none",
    theme: "professional",
    visionFallbackEnabled: false,
    visionApiProviderId: "",
    visionModel: "",
    visionChatEnabled: true,
    visionCodexEnabled: true,
    visionClaudeEnabled: true,
    visionGeminiEnabled: true,
    webSearch: {
      searchProviderId: "",
      searchApiUrl: "",
      searchApiKeys: [],
      fetchProviderId: "direct",
      fetchApiUrl: "",
      fetchApiKeys: [],
      maxResults: 5,
      excludeDomains: [],
      cutoffTokens: 4000,
    },
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

function upsertApiProvider(providers: ApiProvider[], provider: ApiProvider): ApiProvider[] {
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useRef((message: string, type: ToastState["type"]) => {
    setToast({ message, type, id: ++toastSeq });
  });

  const lang: Lang = (data.settings.language as Lang) || "en";
  const backgroundColorMode = data.settings.backgroundColor || "system";
  const backgroundScene = normalizeBackgroundScene(data.settings.backgroundScene);
  const theme = normalizeAppTheme(data.settings.theme);

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

  const checkUpdate = useCallback(async () => {
    try {
      const update = await appApi.checkAppUpdate(__APP_VERSION__);
      if (!update) return;
      if (window.localStorage.getItem(DISMISSED_UPDATE_KEY) === update.latestVersion) return;
      setAppUpdate(update);
    } catch {
      // Update checks should never affect normal startup or offline use.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleFocus = () => {
      void checkUpdate();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkUpdate();
    };
    const interval = window.setInterval(() => void checkUpdate(), 15 * 60 * 1000);

    void checkUpdate();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkUpdate]);

  useEffect(() => {
    if (loading) return;
    try {
      if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) {
        window.localStorage.setItem(GUIDE_SEEN_KEY, "true");
        setGuideOpen(true);
      }
    } catch {
      setGuideOpen(true);
    }
  }, [loading]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyBackgroundScene(backgroundScene);
  }, [backgroundScene]);

  useEffect(() => {
    applyBackgroundColor(backgroundColorMode);
    if (backgroundColorMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => applyBackgroundColor("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [backgroundColorMode]);

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

  const handleSaveApiProvider = async (provider: ApiProvider) => {
    try {
      await appApi.saveApiProvider(provider);
      await refresh("Provider saved.");
    } catch (caught) {
      showToast.current(
        caught instanceof Error ? caught.message : "Unexpected error.",
        "err",
      );
    }
  };

  const handleDeleteApiProvider = async (id: string) =>
    runAction(
      () => appApi.deleteApiProvider(id),
      "Provider deleted.",
      () => {
        setData((current) => ({
          ...current,
          apiProviders: current.apiProviders.filter((provider) => provider.id !== id),
          providers: current.providers.map((provider) =>
            provider.apiProviderId === id ? { ...provider, apiProviderId: "" } : provider,
          ),
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

  const handleLaunchSession = async (session: SessionRecord) =>
    runAction(
      () => appApi.launchSession(session),
      "Session opened.",
    );

  const handleLaunchProvider = async (id: string) =>
    runAction(
      () => appApi.launchProvider(id),
      "Terminal opened.",
    );

  const dismissUpdate = useCallback(() => {
    if (appUpdate) {
      try {
        window.localStorage.setItem(DISMISSED_UPDATE_KEY, appUpdate.latestVersion);
      } catch {
        // localStorage can be unavailable in restricted WebViews; dismissal still works for this run.
      }
    }
    setAppUpdate(null);
  }, [appUpdate]);

  const content = loading ? (
    <div className="loading-screen">{lang === "zh" ? "加载中..." : "LOADING..."}</div>
  ) : activePage === "providers" ? (
    <ProvidersPage
      providers={data.apiProviders}
      onDelete={handleDeleteApiProvider}
      onSave={handleSaveApiProvider}
      onNotify={(message, type) => showToast.current(message, type)}
    />
  ) : activePage === "talking" ? (
      <TalkingPage
        providers={data.apiProviders}
        visionFallbackAvailable={
          data.settings.visionFallbackEnabled
          && data.settings.visionChatEnabled
          && Boolean(data.settings.visionApiProviderId)
          && Boolean(data.settings.visionModel)
        }
        onNotify={(message, type) => showToast.current(message, type)}
      />
  ) : activePage === "drawing" ? (
    <DrawingPage
      providers={data.apiProviders}
      onNotify={(message, type) => showToast.current(message, type)}
    />
  ) : activePage === "sessions" ? (
    <SessionsPage
      sessions={data.sessions}
      onBuildHandoff={appApi.buildSessionHandoff}
      onLoadMessages={appApi.getSessionMessages}
      onDelete={handleDeleteSession}
      onLaunchSession={handleLaunchSession}
      onRefresh={() => refresh("Sessions refreshed.")}
      onNotify={(message, type) => showToast.current(message, type)}
    />
  ) : activePage === "settings" ? (
    <SettingsPage
      apiProviders={data.apiProviders}
      settings={data.settings}
      onOpenGuide={() => setGuideOpen(true)}
      onSave={handleSaveSettings}
    />
  ) : (
    <AgentsPage
      apiProviders={data.apiProviders}
      providers={data.providers}
      onActivate={handleActivateProvider}
      onDelete={handleDeleteProvider}
      onLaunchProvider={handleLaunchProvider}
      onSave={handleSaveProvider}
    />
  );

  return (
    <I18nProvider lang={lang}>
      <div className="app-root">
        <TitleBar />
        <div className={`app-shell ${sidebarCollapsed ? "app-shell-sidebar-collapsed" : ""}`}>
          <Sidebar
            activePage={activePage}
            collapsed={sidebarCollapsed}
            onSelect={setActivePage}
            onCollapsedChange={setSidebarCollapsed}
          />
          <main className="main-content">
            {content}
          </main>
        </div>
        <OnboardingGuide
          open={guideOpen}
          activePage={activePage}
          onSelectPage={setActivePage}
          onClose={() => setGuideOpen(false)}
        />
        <UpdateNotice lang={lang} update={appUpdate} onDismiss={dismissUpdate} />
        <FloatingToast toast={toast} onDismiss={dismissToast} />
      </div>
    </I18nProvider>
  );
}

export default App;
