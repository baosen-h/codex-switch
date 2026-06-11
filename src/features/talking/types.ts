import type { ApiProvider, ChatAttachment, ChatMessage } from "../../types";

export interface TalkingPageProps {
  providers: ApiProvider[];
  visionFallbackAvailable?: boolean;
  onNotify: (message: string, type: "ok" | "err") => void;
}

export interface ChatTopic {
  id: string;
  title: string;
  providerId: string;
  model: string;
  draft: string;
  draftAttachments: ChatAttachment[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}
