import type { ApiProvider } from "../../types";
import type { ChatTopic } from "./types";

export function firstModel(provider?: ApiProvider): string {
  return provider?.models[0]?.id ?? "";
}

export function createTopic(provider?: ApiProvider): ChatTopic {
  const now = Date.now();
  return {
    id: `topic-${now}-${Math.random().toString(16).slice(2)}`,
    title: "",
    providerId: provider?.id ?? "",
    model: firstModel(provider),
    draft: "",
    draftAttachments: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function topicTitle(topic: ChatTopic, fallback: string): string {
  return topic.title.trim() || topic.messages[0]?.content.trim().slice(0, 32) || fallback;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
