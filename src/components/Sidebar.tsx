import type { PageKey } from "../types";
import { useI18n } from "../i18n/context";
import {
  AgentsIcon,
  DrawingIcon,
  ProvidersIcon,
  SessionsIcon,
  SettingsIcon,
  SidebarToggleIcon,
  SwitchLogoIcon,
  TalkingIcon,
} from "./UiIcons";

interface SidebarProps {
  activePage: PageKey;
  collapsed: boolean;
  onSelect: (page: PageKey) => void;
  onToggleCollapsed: () => void;
}

export function Sidebar({ activePage, collapsed, onSelect, onToggleCollapsed }: SidebarProps) {
  const { t } = useI18n();

  const items: Array<{ key: PageKey; label: string; Icon: () => JSX.Element }> = [
    { key: "providers", label: t("providers"), Icon: ProvidersIcon },
    { key: "agents",    label: t("agents"),    Icon: AgentsIcon },
    { key: "talking",   label: t("talking"),   Icon: TalkingIcon },
    { key: "drawing",   label: t("drawing"),   Icon: DrawingIcon },
    { key: "sessions",  label: t("sessions"),  Icon: SessionsIcon },
    { key: "settings",  label: t("settings"),  Icon: SettingsIcon },
  ];

  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <SwitchLogoIcon />
        </div>
        <h1>Codex Switch</h1>
      </div>

      <button
        className="sidebar-fold-button"
        onClick={onToggleCollapsed}
        type="button"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <SidebarToggleIcon collapsed={collapsed} />
      </button>

      <nav className="nav-list">
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`nav-item ${activePage === key ? "active" : ""}`}
            onClick={() => onSelect(key)}
            type="button"
            title={collapsed ? label : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
