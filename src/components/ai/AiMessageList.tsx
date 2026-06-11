import { Copy, Paperclip } from "lucide-react";
import { useState } from "react";
import type { ChatAttachment, ChatMessage } from "../../types";
import { copyText } from "../../utils/clipboard";
import {
  ChatContainerContent,
  ChatContainerRoot,
  ChatContainerScrollAnchor,
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
  ThinkingBar,
} from "../prompt-kit";
import { Button } from "../ui/button";

export interface AiMessageListProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  roleLabels: Record<ChatMessage["role"], string>;
  emptyLabel: string;
  thinkingLabel: string;
  copyLabel: string;
  onNotify: (message: string, type: "ok" | "err") => void;
  getAttachmentLabel: (attachment: ChatAttachment) => string;
}

function roleFallback(role: ChatMessage["role"]): string {
  if (role === "assistant") return "AI";
  if (role === "user") return "U";
  return "S";
}

export function AiMessageList({
  messages,
  isLoading = false,
  roleLabels,
  emptyLabel,
  thinkingLabel,
  copyLabel,
  onNotify,
  getAttachmentLabel,
}: AiMessageListProps) {
  const [copiedMessages, setCopiedMessages] = useState<Record<string, boolean>>({});

  const handleCopy = (key: string, content: string) => {
    void copyText(content).then(() => {
      onNotify(copyLabel, "ok");
      setCopiedMessages((current) => ({ ...current, [key]: true }));
      window.setTimeout(() => {
        setCopiedMessages((current) => ({ ...current, [key]: false }));
      }, 2000);
    });
  };

  return (
    <ChatContainerRoot className="ai-message-list">
      <ChatContainerContent className="ai-message-content">
        {messages.length ? (
          messages.map((message, index) => {
            const isUser = message.role === "user";
            const messageKey = `${message.role}-${index}`;

            return (
              <Message
                className={isUser ? "ai-message ai-message-user" : "ai-message ai-message-assistant"}
                key={messageKey}
              >
                {!isUser ? <MessageAvatar alt={roleLabels[message.role]} className="ai-message-avatar" fallback={roleFallback(message.role)} src="" /> : null}

                <div className="ai-message-stack">
                  {message.content ? (
                    <MessageContent markdown={!isUser} className={isUser ? "ai-message-user-content" : "ai-message-assistant-content"}>
                      {message.content}
                    </MessageContent>
                  ) : null}

                  {message.attachments?.length ? (
                    <div className="ai-attachment-list">
                      {message.attachments.map((attachment) => (
                        <span className="ai-attachment-chip" key={attachment.id}>
                          <Paperclip className="size-4" />
                          {getAttachmentLabel(attachment)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {!isUser && message.content ? (
                    <MessageActions className="ai-message-actions">
                      <MessageAction tooltip={copyLabel}>
                        <Button
                          aria-label={`${copyLabel} ${roleLabels[message.role]}`}
                          className="ai-message-action"
                          onClick={() => handleCopy(messageKey, message.content)}
                          size="icon"
                          title={copyLabel}
                          variant="ghost"
                        >
                          <Copy className={copiedMessages[messageKey] ? "text-green-500" : ""} />
                        </Button>
                      </MessageAction>
                    </MessageActions>
                  ) : null}
                </div>
              </Message>
            );
          })
        ) : (
          <div className="ai-empty-state">
            <span>{emptyLabel}</span>
          </div>
        )}

        {isLoading ? <ThinkingBar className="ai-thinking" text={thinkingLabel} /> : null}
        <ChatContainerScrollAnchor />
      </ChatContainerContent>
    </ChatContainerRoot>
  );
}
