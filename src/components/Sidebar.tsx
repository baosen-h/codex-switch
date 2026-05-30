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
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Sidebar({ activePage, collapsed, onSelect, onCollapsedChange }: SidebarProps) {
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
      {collapsed ? (
        <button
          className="brand brand-action brand-action-collapsed"
          onClick={() => onCollapsedChange(false)}
          type="button"
          title="Open sidebar"
        >
          <span className="brand-mark brand-mark-logo">
            <SwitchLogoIcon />
          </span>
          <span className="brand-mark brand-mark-open">
            <SidebarToggleIcon collapsed />
          </span>
        </button>
      ) : (
        <div className="brand brand-expanded">
          <div className="brand-title">
            <span className="brand-mark">
              <SwitchLogoIcon />
            </span>
            <h1>Codex Switch</h1>
          </div>
          <button
            className="sidebar-inline-toggle"
            onClick={() => onCollapsedChange(true)}
            type="button"
            title="Close sidebar"
          >
            <SidebarToggleIcon collapsed={false} />
          </button>
        </div>
      )}

      <nav className="nav-list">
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            data-page={key}
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
