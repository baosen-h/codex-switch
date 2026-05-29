import type { CSSProperties } from "react";
import {
  IconBranch,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCommentStroked,
  IconHistory,
  IconImageStroked,
  IconMaximize,
  IconMinus,
  IconServerStroked,
  IconSettingStroked,
  IconTerminal,
} from "@douyinfe/semi-icons";

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

function semiIconStyle(size = 18, style?: CSSProperties): CSSProperties {
  return {
    fontSize: size,
    width: size,
    height: size,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    ...style,
  };
}

export function ProvidersIcon({ size, style, ...props }: IconProps = {}) {
  return <IconServerStroked {...props} style={semiIconStyle(size, style)} />;
}

export function AgentsIcon({ size, style, ...props }: IconProps = {}) {
  return <IconTerminal {...props} style={semiIconStyle(size, style)} />;
}

export function TalkingIcon({ size, style, ...props }: IconProps = {}) {
  return <IconCommentStroked {...props} style={semiIconStyle(size, style)} />;
}

export function DrawingIcon({ size, style, ...props }: IconProps = {}) {
  return <IconImageStroked {...props} style={semiIconStyle(size, style)} />;
}

export function SessionsIcon({ size, style, ...props }: IconProps = {}) {
  return <IconHistory {...props} style={semiIconStyle(size, style)} />;
}

export function SettingsIcon({ size, style, ...props }: IconProps = {}) {
  return <IconSettingStroked {...props} style={semiIconStyle(size, style)} />;
}

export function SwitchLogoIcon({ size = 22, style, ...props }: IconProps = {}) {
  return <IconBranch {...props} style={semiIconStyle(size, style)} />;
}

export function SidebarToggleIcon({
  collapsed,
  size,
  style,
  ...props
}: IconProps & { collapsed: boolean }) {
  const Icon = collapsed ? IconChevronRight : IconChevronLeft;
  return <Icon {...props} style={semiIconStyle(size, style)} />;
}

export function MinimizeIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconMinus {...props} style={semiIconStyle(size, style)} />;
}

export function MaximizeIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconMaximize {...props} style={semiIconStyle(size, style)} />;
}

export function CloseIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconClose {...props} style={semiIconStyle(size, style)} />;
}
