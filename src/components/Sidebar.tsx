import type { PageKey } from "../types";

interface SidebarProps {
  activePage: PageKey;
  onSelect: (page: PageKey) => void;
}

const PlugIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="2" y="1" width="4" height="5"/>
    <rect x="10" y="1" width="4" height="5"/>
    <rect x="1" y="6" width="14" height="5"/>
    <rect x="6" y="11" width="4" height="4"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="3" y="1" width="10" height="2"/>
    <rect x="1" y="3" width="2" height="10"/>
    <rect x="13" y="3" width="2" height="10"/>
    <rect x="3" y="13" width="10" height="2"/>
    <rect x="7" y="4" width="2" height="5"/>
    <rect x="7" y="9" width="4" height="2"/>
  </svg>
);

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="6" y="1" width="4" height="2"/>
    <rect x="6" y="13" width="4" height="2"/>
    <rect x="1" y="6" width="2" height="4"/>
    <rect x="13" y="6" width="2" height="4"/>
    <rect x="4" y="4" width="2" height="2"/>
    <rect x="10" y="4" width="2" height="2"/>
    <rect x="4" y="10" width="2" height="2"/>
    <rect x="10" y="10" width="2" height="2"/>
    <rect x="5" y="5" width="6" height="6"/>
  </svg>
);

const items: Array<{ key: PageKey; label: string; Icon: () => JSX.Element }> = [
  { key: "providers", label: "Providers", Icon: PlugIcon },
  { key: "sessions",  label: "Sessions",  Icon: ClockIcon },
  { key: "settings",  label: "Settings",  Icon: GearIcon },
];

export function Sidebar({ activePage, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">C</div>
        <h1>Codex Switch</h1>
      </div>

      <nav className="nav-list">
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`nav-item ${activePage === key ? "active" : ""}`}
            onClick={() => onSelect(key)}
            type="button"
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
