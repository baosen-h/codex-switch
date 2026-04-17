import { useMemo, useState } from "react";
import type { AppSettings, Provider, SessionRecord } from "../types";

interface DashboardPageProps {
  providers: Provider[];
  sessions: SessionRecord[];
  settings: AppSettings;
  onLaunch: (workspacePath: string, title: string) => Promise<void>;
}

export function DashboardPage({
  providers,
  sessions,
  settings,
  onLaunch,
}: DashboardPageProps) {
  const currentProvider = useMemo(
    () => providers.find((provider) => provider.isCurrent) ?? null,
    [providers],
  );

  const [workspacePath, setWorkspacePath] = useState(settings.defaultWorkspace);
  const [title, setTitle] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);

  const recentSessions = sessions.slice(0, 6);

  const handleLaunch = async () => {
    setIsLaunching(true);
    try {
      await onLaunch(workspacePath, title);
      setTitle("");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Quick launch Codex and see the latest provider/session state.</p>
        </div>
      </header>

      <div className="dashboard-grid">
        <article className="card hero-card">
          <div className="hero-top">
            <div>
              <span className="eyebrow">Current provider</span>
              <h3>{currentProvider?.name ?? "No active provider"}</h3>
              <p>
                {currentProvider
                  ? `${currentProvider.model} · ${currentProvider.baseUrl || "official/default endpoint"}`
                  : "Activate a provider before launching Codex."}
              </p>
            </div>
            <div className="hero-badge">
              {currentProvider ? "Ready" : "Setup needed"}
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Workspace path</span>
              <input
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="F:\\Projects\\your-workspace"
              />
            </label>
            <label className="field">
              <span>Session title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Optional launch title"
              />
            </label>
          </div>

          <div className="actions">
            <button
              className="primary-button"
              disabled={!currentProvider || !workspacePath.trim() || isLaunching}
              onClick={() => void handleLaunch()}
              type="button"
            >
              {isLaunching ? "Launching..." : "Launch Codex"}
            </button>
          </div>
        </article>

        <article className="card">
          <span className="eyebrow">Recent sessions</span>
          <h3>Continuity tracker</h3>
          <div className="session-list">
            {recentSessions.length ? (
              recentSessions.map((session) => (
                <div className="session-row" key={session.id}>
                  <div>
                    <strong>{session.title || "Untitled session"}</strong>
                    <p>{session.workspacePath}</p>
                  </div>
                  <div className="session-meta">
                    <span>{session.providerName}</span>
                    <small>{session.status}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-state">
                No sessions recorded yet. Launch Codex here to begin tracking.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
