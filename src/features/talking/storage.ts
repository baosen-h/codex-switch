import type { ApiProvider, ChatMessage } from "../../types";
import { TALKING_STORAGE_KEY } from "./constants";
import { createTopic } from "./topicUtils";
import type { ChatTopic } from "./types";

export function sanitizeMessageForStorage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    attachments: message.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
    })),
  };
}

export function sanitizeTopicForStorage(topic: ChatTopic): ChatTopic {
  return {
    ...topic,
    draftAttachments: [],
    messages: topic.messages.map(sanitizeMessageForStorage),
  };
}

export function loadTopics(provider?: ApiProvider): ChatTopic[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TALKING_STORAGE_KEY) || "[]") as ChatTopic[];
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((topic) => ({
        ...topic,
        draftAttachments: [],
        messages: (topic.messages ?? []).map(sanitizeMessageForStorage),
      }));
    }
  } catch {
    // Ignore invalid saved chat state and start fresh.
  }
  return [createTopic(provider)];
}

export function saveTopics(topics: ChatTopic[]): void {
  localStorage.setItem(
    TALKING_STORAGE_KEY,
    JSON.stringify(topics.map(sanitizeTopicForStorage)),
  );
}
