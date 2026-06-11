import { AiMessageList } from "../../../components/ai";
import type { ChatMessage } from "../../../types";
import { attachmentLabel } from "../attachments";

interface ChatMessageListProps {
  messages: ChatMessage[];
  isSending: boolean;
  roleLabels: Record<ChatMessage["role"], string>;
  emptyLabel: string;
  thinkingLabel: string;
  copyLabel: string;
  onNotify: (message: string, type: "ok" | "err") => void;
}

export function ChatMessageList({
  messages,
  isSending,
  roleLabels,
  emptyLabel,
  thinkingLabel,
  copyLabel,
  onNotify,
}: ChatMessageListProps) {
  return (
    <AiMessageList
      messages={messages}
      isLoading={isSending}
      roleLabels={roleLabels}
      emptyLabel={emptyLabel}
      thinkingLabel={thinkingLabel}
      copyLabel={copyLabel}
      onNotify={onNotify}
      getAttachmentLabel={attachmentLabel}
    />
  );
}
