import type { PageKey } from "../types";

interface SidebarProps {
  activePage: PageKey;
  onSelect: (page: PageKey) => void;
}

const items: Array<{ key: PageKey; label: string; hint: string }> = [
  { key: "dashboard", label: "Dashboard", hint: "Launch and overview" },
  { key: "providers", label: "Providers", hint: "Switch Codex backends" },
  { key: "sessions", label: "Sessions", hint: "Track continuity" },
  { key: "settings", label: "Settings", hint: "Paths and behavior" },
];

export function Sidebar({ activePage, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <div>
          <h1>Codex Switch Mini</h1>
          <p>Private provider and session manager</p>
        </div>
      </div>

      <nav className="nav-list">
        {items.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${activePage === item.key ? "active" : ""}`}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>
    </aside>
  );
}
