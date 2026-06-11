import {
  AttachIcon as SemiAttachIcon,
  DeleteIcon,
  ImageIcon as SemiImageIcon,
  PlusIcon as SemiPlusIcon,
  SendIcon as SemiSendIcon,
} from "../../../components/ui";

export const SendIcon = () => <SemiSendIcon size={17} />;
export const PlusIcon = () => <SemiPlusIcon size={16} />;
export const TrashIcon = () => <DeleteIcon size={14} />;
export const AttachIcon = () => <SemiAttachIcon size={14} />;
export const ImageIcon = () => <SemiImageIcon size={14} />;

export const BracesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6.2 3.2H5.4c-1 0-1.5.5-1.5 1.5v1.1c0 .8-.4 1.4-1.1 1.6.7.2 1.1.8 1.1 1.6v1.3c0 1 .5 1.5 1.5 1.5h.8M9.8 3.2h.8c1 0 1.5.5 1.5 1.5v1.1c0 .8.4 1.4 1.1 1.6-.7.2-1.1.8-1.1 1.6v1.3c0 1-.5 1.5-1.5 1.5h-.8"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);
