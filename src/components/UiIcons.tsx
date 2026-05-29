import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.8,
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
      <path d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16V8a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M8 9h8M8 12h5M8 15h8" />
    </Icon>
  );
}

export function AgentsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v3" />
      <path d="M7.5 6.5h9A2.5 2.5 0 0 1 19 9v7.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M9 11.25h.01M15 11.25h.01M9.5 15.25h5" />
    </Icon>
  );
}

export function TalkingIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M5.5 18.5 3.75 21l.4-3.3A8 8 0 1 1 12 20a8.7 8.7 0 0 1-6.5-1.5Z" />
      <path d="M8 10.5h8M8 14h5.5" />
    </Icon>
  );
}

export function DrawingIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M5 19h14" />
      <path d="m14.5 5.5 4 4L9 19H5v-4L14.5 5.5Z" />
      <path d="m13 7 4 4" />
    </Icon>
  );
}

export function SessionsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.5h15" />
      <path d="M7.5 3.5v6" />
      <path d="M16.5 3.5v6" />
      <path d="M6.5 6.5h11A2.5 2.5 0 0 1 20 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V9a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="M8 13h4.5M8 16h8" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps = {}) {
  return (
    <Icon {...props}>
      <path d="M6 8.25h12" />
      <path d="M9 12h9" />
      <path d="M6 15.75h12" />
      <path d="M8.5 6.5v3.5" />
      <path d="M15.5 10.25v3.5" />
      <path d="M11.5 14v3.5" />
    </Icon>
  );
}

export function SwitchLogoIcon(props: IconProps = {}) {
  return (
    <Icon size={22} {...props}>
      <path d="M7 7.5h7.5a3 3 0 0 1 0 6H9.5a3 3 0 0 0 0 6H17" />
      <path d="M7 7.5 4.5 10 7 12.5" />
      <path d="M17 19.5 19.5 17 17 14.5" />
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
      <path d="M7 12h10" />
    </Icon>
  );
}

export function MaximizeIcon(props: IconProps = {}) {
  return (
    <Icon size={16} {...props}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
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
