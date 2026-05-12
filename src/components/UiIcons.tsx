import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
} as const;

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...strokeProps}
      {...props}
    >
      {children}
    </svg>
  );
}

export function ProvidersIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="6" rx="2" />
      <rect x="4" y="14" width="16" height="6" rx="2" />
      <path d="M8 7h.01M8 17h.01M12 7h4M12 17h4" />
    </Icon>
  );
}

export function AgentsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M12 3v3" />
      <rect x="5" y="6" width="14" height="12" rx="3" />
      <path d="M8.5 11h.01M15.5 11h.01M9 15h6" />
    </Icon>
  );
}

export function TalkingIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M21 12a7 7 0 0 1-7 7H8l-5 3 1.6-5A7 7 0 1 1 21 12Z" />
      <path d="M8 11h8M8 15h5" />
    </Icon>
  );
}

export function DrawingIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m7 15 3-3 3 3 2-2 3 3" />
      <path d="M8 9h.01" />
    </Icon>
  );
}

export function SessionsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 0 1-4 0v-.08a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 0 1 0-4h.08a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-2l-.05-.05A2 2 0 1 1 7.15 3.8l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10.28 2.6V2a2 2 0 0 1 4 0v.08a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.8 1.8 0 0 0-.36 2 1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 0 1 0 4h-.08A1.8 1.8 0 0 0 19.4 15Z" />
    </Icon>
  );
}

export function SidebarToggleIcon({ collapsed, ...props }: IconProps & { collapsed: boolean }) {
  return (
    <Icon {...props}>
      {collapsed ? <path d="m10 7 5 5-5 5" /> : <path d="m14 7-5 5 5 5" />}
    </Icon>
  );
}

export function MinimizeIcon(props: IconProps = {}) {
  return (
    <Icon size={16} {...props}>
      <path d="M6 18h12" />
    </Icon>
  );
}

export function MaximizeIcon(props: IconProps = {}) {
  return (
    <Icon size={16} {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps = {}) {
  return (
    <Icon size={16} {...props}>
      <path d="m7 7 10 10M17 7 7 17" />
    </Icon>
  );
}
