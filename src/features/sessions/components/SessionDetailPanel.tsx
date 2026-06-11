import type { MutableRefObject } from "react";
import { Copy } from "lucide-react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAvatar,
  MessageContent,
} from "../../../components/prompt-kit";
import { Button } from "../../../components/ui/button";
import { ListIcon } from "../../../components/ui";
import type { SessionMessage, SessionRecord } from "../../../types";
import { copyText } from "../../../utils/clipboard";
import { formatConversationTime } from "../../../utils/time";
import {
  COLLAPSED_MESSAGE_CHARS,
  messagePreview,
  shouldShowMessageTime,
} from "../sessionUtils";

interface DirectoryMessage {
  message: SessionMessage;
  index: number;
  key: string;
}

interface SessionDetailPanelProps {
  selectedSession: SessionRecord | null;
  visibleMessages: SessionMessage[];
  directoryMessages: DirectoryMessage[];
  expandedMessages: Set<string>;
  isDirectoryOpen: boolean;
  isLoadingMessages: boolean;
  messageRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  roleLabels: Record<string, string>;
  lang: "en" | "zh";
  labels: {
    loadingTranscript: string;
    noMessages: string;
    selectSession: string;
    messages: string;
  };
  onToggleMessageExpanded: (key: string) => void;
  onSetDirectoryOpen: (updater: boolean | ((current: boolean) => boolean)) => void;
  onJumpToMessage: (key: string) => void;
}

function roleFallback(role: string): string {
  if (role === "assistant") return "AI";
  if (role === "user") return "U";
  return role.slice(0, 1).toUpperCase();
}

export function SessionDetailPanel({
  selectedSession,
  visibleMessages,
  directoryMessages,
  expandedMessages,
  isDirectoryOpen,
  isLoadingMessages,
  messageRefs,
  roleLabels,
  lang,
  labels,
  onToggleMessageExpanded,
  onSetDirectoryOpen,
  onJumpToMessage,
}: SessionDetailPanelProps) {
  return (
    <article className="session-panel session-detail-panel">
      <div className="session-scroll session-scroll-detail">
        {selectedSession ? (
          <div className="session-chat-layout">
            <div className="session-chat-header">
              <h3>{selectedSession.title || "Untitled session"}</h3>
            </div>

            <div className="session-message-pane">
              {isLoadingMessages ? (
                <p className="empty-state">{labels.loadingTranscript}</p>
              ) : visibleMessages.length ? (
                <div className="message-list session-ai-message-list">
                  {visibleMessages.map((message, index) => {
                    const messageKey = `${selectedSession.id}-${index}`;
                    const isUser = message.role === "user";
                    const isLong = message.content.length > COLLAPSED_MESSAGE_CHARS;
                    const isExpanded = expandedMessages.has(messageKey);
                    const displayContent =
                      isLong && !isExpanded
                        ? `${message.content.slice(0, COLLAPSED_MESSAGE_CHARS).trimEnd()}...`
                        : message.content;

                    return (
                      <div
                        key={messageKey}
                        ref={(node) => {
                          if (node) {
                            messageRefs.current.set(messageKey, node);
                          } else {
                            messageRefs.current.delete(messageKey);
                          }
                        }}
                      >
                        {shouldShowMessageTime(message, visibleMessages[index - 1]) ? (
                          <div className="message-time">
                            {formatConversationTime(message.timestamp ?? "", lang)}
                          </div>
                        ) : null}
                        <Message
                          className={isUser ? "ai-message ai-message-user session-ai-message" : "ai-message ai-message-assistant session-ai-message"}
                        >
                          {!isUser ? (
                            <MessageAvatar
                              alt={roleLabels[message.role] ?? message.role}
                              className="ai-message-avatar"
                              fallback={roleFallback(message.role)}
                              src=""
                            />
                          ) : null}
                          <div className="ai-message-stack">
                            <MessageContent markdown={!isUser} className={isUser ? "ai-message-user-content" : "ai-message-assistant-content"}>
                              {displayContent}
                            </MessageContent>
                            {!isUser && message.content ? (
                              <MessageActions className="ai-message-actions">
                                <MessageAction tooltip="Copy">
                                  <Button
                                    aria-label={`Copy ${roleLabels[message.role] ?? message.role}`}
                                    className="ai-message-action"
                                    onClick={() => void copyText(message.content)}
                                    size="icon"
                                    title="Copy"
                                    variant="ghost"
                                  >
                                    <Copy />
                                  </Button>
                                </MessageAction>
                              </MessageActions>
                            ) : null}
                            {isLong ? (
                              <button
                                className="message-unfold-button"
                                onClick={() => onToggleMessageExpanded(messageKey)}
                                type="button"
                              >
                                {isExpanded ? "Collapse" : `Unfold full content (${Math.ceil(message.content.length / 1000)}k)`}
                              </button>
                            ) : null}
                          </div>
                        </Message>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">{labels.noMessages}</p>
              )}
            </div>
            {directoryMessages.length ? (
              <>
                <button
                  className="session-directory-trigger"
                  onClick={() => onSetDirectoryOpen((current) => !current)}
                  type="button"
                  title="Conversation directory"
                >
                  <ListIcon />
                </button>
                {isDirectoryOpen ? (
                  <div className="session-directory-panel">
                    <div className="session-directory-header">
                      <strong>{labels.messages}</strong>
                      <button onClick={() => onSetDirectoryOpen(false)} type="button" title="Close">X</button>
                    </div>
                    <div className="session-directory-list">
                      {directoryMessages.map((item, order) => (
                        <button
                          key={item.key}
                          onClick={() => onJumpToMessage(item.key)}
                          type="button"
                        >
                          <span>{order + 1}</span>
                          <strong>{messagePreview(item.message.content)}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">{labels.selectSession}</p>
        )}
      </div>
    </article>
  );
}
