import type { CSSProperties } from "react";
import appLogo from "../../src-tauri/icons/icon.png";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCommentStroked,
  IconCopyStroked,
  IconDeleteStroked,
  IconEditStroked,
  IconHistory,
  IconImageStroked,
  IconList,
  IconMaximize,
  IconMinus,
  IconPaperclip,
  IconPlay,
  IconPlus,
  IconBolt,
  IconBranch,
  IconEyeOpenedStroked,
  IconFolderOpen,
  IconGlobeStroked,
  IconRefresh,
  IconSendStroked,
  IconServerStroked,
  IconSettingStroked,
  IconSync,
  IconTerminal,
  IconUpload,
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

export function ImageIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconImageStroked {...props} style={semiIconStyle(size, style)} />;
}

export function SessionsIcon({ size, style, ...props }: IconProps = {}) {
  return <IconHistory {...props} style={semiIconStyle(size, style)} />;
}

export function SettingsIcon({ size, style, ...props }: IconProps = {}) {
  return <IconSettingStroked {...props} style={semiIconStyle(size, style)} />;
}

export function SwitchLogoIcon({ size = 22, style, ...props }: IconProps = {}) {
  return (
    <img
      {...props}
      alt=""
      aria-hidden="true"
      src={appLogo}
      style={{
        width: size,
        height: size,
        display: "block",
        objectFit: "contain",
        flexShrink: 0,
        ...style,
      }}
    />
  );
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

export function PlusIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconPlus {...props} style={semiIconStyle(size, style)} />;
}

export function RefreshIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconRefresh {...props} style={semiIconStyle(size, style)} />;
}

export function SyncIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconSync {...props} style={semiIconStyle(size, style)} />;
}

export function SendIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconSendStroked {...props} style={semiIconStyle(size, style)} />;
}

export function DeleteIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconDeleteStroked {...props} style={semiIconStyle(size, style)} />;
}

export function EditIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconEditStroked {...props} style={semiIconStyle(size, style)} />;
}

export function CopyIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconCopyStroked {...props} style={semiIconStyle(size, style)} />;
}

export function PlayIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconPlay {...props} style={semiIconStyle(size, style)} />;
}

export function UploadIcon({ size = 18, style, ...props }: IconProps = {}) {
  return <IconUpload {...props} style={semiIconStyle(size, style)} />;
}

export function AttachIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconPaperclip {...props} style={semiIconStyle(size, style)} />;
}

export function ListIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconList {...props} style={semiIconStyle(size, style)} />;
}

export function LaunchIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconTerminal {...props} style={semiIconStyle(size, style)} />;
}

export function ResumeIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconFolderOpen {...props} style={semiIconStyle(size, style)} />;
}

export function BranchIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconBranch {...props} style={semiIconStyle(size, style)} />;
}

export function BoltIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconBolt {...props} style={semiIconStyle(size, style)} />;
}

export function GlobeIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconGlobeStroked {...props} style={semiIconStyle(size, style)} />;
}

export function VisionIcon({ size = 16, style, ...props }: IconProps = {}) {
  return <IconEyeOpenedStroked {...props} style={semiIconStyle(size, style)} />;
}
