import { useEffect, useState } from "react";
import type { ApiProvider } from "../../../types";
import { createTopic, firstModel } from "../topicUtils";
import { loadTopics, saveTopics } from "../storage";
import type { ChatTopic } from "../types";

export function useTalkingTopics(fallbackProvider?: ApiProvider) {
  const [topics, setTopics] = useState<ChatTopic[]>(() => loadTopics(fallbackProvider));
  const [activeId, setActiveId] = useState(topics[0]?.id ?? "");

  const activeTopic = topics.find((topic) => topic.id === activeId)
    ?? topics[0]
    ?? createTopic(fallbackProvider);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveTopics(topics);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [topics]);

  const patchActiveTopic = (patch: Partial<ChatTopic>) => {
    setTopics((current) =>
      current.map((topic) =>
        topic.id === activeTopic.id ? { ...topic, ...patch, updatedAt: Date.now() } : topic,
      ),
    );
  };

  const startNewTopic = () => {
    const next = createTopic(fallbackProvider);
    setTopics((current) => [next, ...current]);
    setActiveId(next.id);
  };

  const deleteTopic = (id: string) => {
    setTopics((current) => {
      const next = current.filter((topic) => topic.id !== id);
      if (!next.length) {
        const fresh = createTopic(fallbackProvider);
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  useEffect(() => {
    if (!fallbackProvider || activeTopic.providerId) return;
    patchActiveTopic({ providerId: fallbackProvider.id, model: firstModel(fallbackProvider) });
  }, [fallbackProvider?.id, activeTopic.providerId]);

  return {
    topics,
    setTopics,
    activeId,
    setActiveId,
    activeTopic,
    patchActiveTopic,
    startNewTopic,
    deleteTopic,
  };
}
