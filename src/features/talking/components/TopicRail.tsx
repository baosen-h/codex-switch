import type { ChatTopic } from "../types";
import { topicTitle } from "../topicUtils";
import { PlusIcon, TrashIcon } from "./TalkingIcons";

interface TopicRailProps {
  topics: ChatTopic[];
  activeTopic: ChatTopic;
  defaultTopicLabel: string;
  messagesLabel: string;
  talkingLabel: string;
  newTopicLabel: string;
  deleteLabel: string;
  onSelectTopic: (id: string) => void;
  onNewTopic: () => void;
  onDeleteTopic: (id: string) => void;
}

export function TopicRail({
  topics,
  activeTopic,
  defaultTopicLabel,
  messagesLabel,
  talkingLabel,
  newTopicLabel,
  deleteLabel,
  onSelectTopic,
  onNewTopic,
  onDeleteTopic,
}: TopicRailProps) {
  return (
    <aside className="conversation-rail">
      <div className="rail-header">
        <div>
          <span className="eyebrow">{talkingLabel}</span>
          <h2>{topicTitle(activeTopic, defaultTopicLabel)}</h2>
        </div>
        <button className="add-button add-button-compact" onClick={onNewTopic} type="button" title={newTopicLabel}>
          <PlusIcon />
        </button>
      </div>
      <div className="conversation-topic-list">
        {topics.map((topic) => (
          <div className={`conversation-topic-item ${topic.id === activeTopic.id ? "active" : ""}`} key={topic.id}>
            <button
              className="conversation-topic"
              onClick={() => onSelectTopic(topic.id)}
              type="button"
            >
              <strong>{topicTitle(topic, defaultTopicLabel)}</strong>
              <span>{topic.messages.length} {messagesLabel}</span>
            </button>
            <button
              className="conversation-topic-delete"
              onClick={() => onDeleteTopic(topic.id)}
              title={deleteLabel}
              type="button"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
