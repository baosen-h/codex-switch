import {
  EditIcon,
  ImageIcon as SemiImageIcon,
  PlusIcon as SemiPlusIcon,
  SendIcon as SemiSendIcon,
  SyncIcon,
} from "../../../components/ui";

export { EditIcon, SemiImageIcon };

export const SparkIcon = () => <SyncIcon size={18} />;
export const SendIcon = () => <SemiSendIcon size={17} />;
export const PlusIcon = () => <SemiPlusIcon size={16} />;

export const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 4.5h10M6.2 4.5V3h3.6v1.5M5 6.3l.5 6.2h5l.5-6.2"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const CloseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </svg>
);

export const ZoomIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M10.2 10.2 13.5 13.5M7 4.8v4.4M4.8 7h4.4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  </svg>
);

export const ZoomOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.2 10.2 13.5 13.5M4.8 7h4.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
  </svg>
);

export const ResetZoomIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M12.7 6.1A5 5 0 1 0 13 8M12.7 3.5v2.6h-2.6"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  </svg>
);

export const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5" y="3" width="8" height="9" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 5.5v6.8C3 13.2 3.8 14 4.7 14h5.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
  </svg>
);
