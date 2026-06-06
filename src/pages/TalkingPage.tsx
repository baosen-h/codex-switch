import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar } from "../components/ProviderAvatar";
import { useI18n } from "../i18n/context";
import type { ApiProvider, ChatAttachment, ChatMessage } from "../types";
import { getModelVisionCapability, modelSupportsChat } from "../utils/modelCapabilities";
import { AttachIcon as SemiAttachIcon, DeleteIcon, ImageIcon as SemiImageIcon, PlusIcon as SemiPlusIcon, SendIcon as SemiSendIcon } from "../components/UiIcons";

interface TalkingPageProps {
  providers: ApiProvider[];
  visionFallbackAvailable?: boolean;
  onNotify: (message: string, type: "ok" | "err") => void;
}

interface ChatTopic {
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

const STORAGE_KEY = "codex-switch-talking-topics-v1";
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_BYTES = 240 * 1024;

const SendIcon = () => (
  <SemiSendIcon size={17} />
);

const PlusIcon = () => (
  <SemiPlusIcon size={16} />
);

const TrashIcon = () => (
  <DeleteIcon size={14} />
);

const AttachIcon = () => (
  <SemiAttachIcon size={14} />
);

const ImageIcon = () => (
  <SemiImageIcon size={14} />
);

const BracesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6.2 3.2H5.4c-1 0-1.5.5-1.5 1.5v1.1c0 .8-.4 1.4-1.1 1.6.7.2 1.1.8 1.1 1.6v1.3c0 1 .5 1.5 1.5 1.5h.8M9.8 3.2h.8c1 0 1.5.5 1.5 1.5v1.1c0 .8.4 1.4 1.1 1.6-.7.2-1.1.8-1.1 1.6v1.3c0 1-.5 1.5-1.5 1.5h-.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

function firstModel(provider?: ApiProvider): string {
  return provider?.models[0]?.id ?? "";
}

function createTopic(provider?: ApiProvider): ChatTopic {
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

function loadTopics(provider?: ApiProvider): ChatTopic[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ChatTopic[];
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

function topicTitle(topic: ChatTopic, fallback: string): string {
  return topic.title.trim() || topic.messages[0]?.content.trim().slice(0, 32) || fallback;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sanitizeMessageForStorage(message: ChatMessage): ChatMessage {
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

function sanitizeTopicForStorage(topic: ChatTopic): ChatTopic {
  return {
    ...topic,
    draftAttachments: [],
    messages: topic.messages.map(sanitizeMessageForStorage),
  };
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(c|cpp|cs|css|csv|go|html?|java|js|json|jsx|log|md|py|rs|ts|tsx|txt|xml|ya?ml)$/i.test(file.name);
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function fileToChatAttachment(file: File, imageOnly = false): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than 12 MB.`);
  }
  const isImage = file.type.startsWith("image/");
  if (imageOnly && !isImage) {
    throw new Error(`${file.name} is not an image.`);
  }
  const base = {
    id: `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };

  if (isImage) {
    return {
      ...base,
      kind: "image",
      dataUrl: await fileToDataUrl(file),
    };
  }

  if (isTextLikeFile(file)) {
    const truncated = file.size > MAX_TEXT_ATTACHMENT_BYTES;
    const text = await file.slice(0, MAX_TEXT_ATTACHMENT_BYTES).text();
    return {
      ...base,
      kind: "file",
      text: truncated ? `${text}\n\n[File truncated at ${MAX_TEXT_ATTACHMENT_BYTES} bytes.]` : text,
    };
  }

  return {
    ...base,
    kind: "file",
    text: `[Binary file attached: ${file.name}, ${file.type || "unknown MIME"}, ${file.size} bytes. Content was not readable as text.]`,
  };
}

function attachmentLabel(attachment: ChatAttachment): string {
  const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
  return `${attachment.name} · ${sizeKb} KB`;
}

export function TalkingPage({ providers, visionFallbackAvailable = false, onNotify }: TalkingPageProps) {
  const { t } = useI18n();
  const enabledProviders = useMemo(
    () =>
      providers.filter(
        (provider) => provider.enabled && provider.models.some(modelSupportsChat),
      ),
    [providers],
  );
  const fallbackProvider = enabledProviders[0];
  const [topics, setTopics] = useState<ChatTopic[]>(() => loadTopics(fallbackProvider));
  const [activeId, setActiveId] = useState(topics[0]?.id ?? "");
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const activeTopic = topics.find((topic) => topic.id === activeId) ?? topics[0] ?? createTopic(fallbackProvider);
  const selectedProvider =
    enabledProviders.find((provider) => provider.id === activeTopic.providerId) ?? fallbackProvider;
  const modelOptions = selectedProvider?.models ?? [];
  const activeModel = activeTopic.model || firstModel(selectedProvider);
  const selectedModel = modelOptions.find((item) => item.id === activeModel);
  const visionCapability = getModelVisionCapability(selectedModel);
  const canUseImages = Boolean(
    selectedModel && (visionCapability !== "text-only" || visionFallbackAvailable),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(topics.map(sanitizeTopicForStorage)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [topics]);

  useEffect(() => {
    if (!fallbackProvider || activeTopic.providerId) return;
    patchActiveTopic({ providerId: fallbackProvider.id, model: firstModel(fallbackProvider) });
  }, [fallbackProvider?.id, activeTopic.providerId]);

  const patchActiveTopic = (patch: Partial<ChatTopic>) => {
    setTopics((current) =>
      current.map((topic) =>
        topic.id === activeTopic.id ? { ...topic, ...patch, updatedAt: Date.now() } : topic,
      ),
    );
  };

  const selectProvider = (nextId: string) => {
    const nextProvider = enabledProviders.find((provider) => provider.id === nextId);
    patchActiveTopic({ providerId: nextId, model: firstModel(nextProvider) });
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

  const addDraftAttachments = async (files: FileList | File[] | null, imageOnly = false) => {
    if (!files?.length) return;
    const hasImage = Array.from(files).some((file) => file.type.startsWith("image/"));
    if ((imageOnly || hasImage) && !canUseImages) {
      onNotify("Selected model does not support image input.", "err");
      return;
    }
    try {
      const attachments = await Promise.all(Array.from(files).map((file) => fileToChatAttachment(file, imageOnly)));
      patchActiveTopic({ draftAttachments: [...(activeTopic.draftAttachments ?? []), ...attachments] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message, "err");
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>, imageOnly = false) => {
    const files = event.currentTarget.files;
    void addDraftAttachments(files, imageOnly).finally(() => {
      event.currentTarget.value = "";
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    if (!canUseImages) {
      onNotify("Selected model does not support image input.", "err");
      return;
    }
    event.preventDefault();
    void addDraftAttachments(files, true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    const imageOnly = Array.from(event.dataTransfer.files).every((file) => file.type.startsWith("image/"));
    void addDraftAttachments(event.dataTransfer.files, imageOnly);
  };

  const removeDraftAttachment = (id: string) => {
    patchActiveTopic({
      draftAttachments: (activeTopic.draftAttachments ?? []).filter((attachment) => attachment.id !== id),
    });
  };

  const send = async () => {
    const content = activeTopic.draft.trim();
    const draftAttachments = activeTopic.draftAttachments ?? [];
    if ((!content && !draftAttachments.length) || !selectedProvider || !activeModel) return;

    const previousMessages = activeTopic.messages;
    const previousDraft = activeTopic.draft;
    const previousAttachments = draftAttachments;
    const outgoingMessage: ChatMessage = { role: "user", content, attachments: draftAttachments };
    const displayMessage = sanitizeMessageForStorage(outgoingMessage);
    const nextMessages: ChatMessage[] = [...previousMessages, displayMessage];
    const outboundMessages: ChatMessage[] = [...previousMessages, outgoingMessage];
    const nextTitle =
      activeTopic.messages.length === 0
        ? content.slice(0, 32) || draftAttachments[0]?.name || t("defaultTopic")
        : activeTopic.title;
    patchActiveTopic({ messages: nextMessages, draft: "", draftAttachments: [], title: nextTitle });
    setIsSending(true);

    try {
      await nextFrame();
      const response = await appApi.sendChatMessage({
        provider: selectedProvider,
        model: activeModel,
        messages: outboundMessages,
      });
      setTopics((current) =>
        current.map((topic) =>
          topic.id === activeTopic.id
            ? {
                ...topic,
                messages: [...nextMessages, { role: "assistant", content: response.content }],
                updatedAt: Date.now(),
              }
            : topic,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message || t("chatSendError"), "err");
      patchActiveTopic({ messages: previousMessages, draft: previousDraft, draftAttachments: previousAttachments });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="page talking-page">
      <article className="chat-shell">
        <aside className="conversation-rail">
          <div className="rail-header">
            <div>
              <span className="eyebrow">{t("talking")}</span>
              <h2>{topicTitle(activeTopic, t("defaultTopic"))}</h2>
            </div>
            <button className="add-button add-button-compact" onClick={startNewTopic} type="button" title={t("newTopic")}>
              <PlusIcon />
            </button>
          </div>
          <div className="conversation-topic-list">
            {topics.map((topic) => (
              <div className={`conversation-topic-item ${topic.id === activeTopic.id ? "active" : ""}`} key={topic.id}>
                <button
                  className="conversation-topic"
                  onClick={() => setActiveId(topic.id)}
                  type="button"
                >
                  <strong>{topicTitle(topic, t("defaultTopic"))}</strong>
                  <span>{topic.messages.length} {t("messages")}</span>
                </button>
                <button
                  className="conversation-topic-delete"
                  onClick={() => deleteTopic(topic.id)}
                  title={t("delete")}
                  type="button"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="chat-main-panel" onDragOver={handleDragOver} onDrop={handleDrop}>
          <header className="chat-topbar">
            <label className="chat-select">
              <span>{t("apiProvider")}</span>
              <select value={selectedProvider?.id ?? ""} onChange={(event) => selectProvider(event.target.value)}>
                {enabledProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </label>
            <label className="chat-select">
              <span>{t("model")}</span>
              <select value={activeModel} onChange={(event) => patchActiveTopic({ model: event.target.value })}>
                {modelOptions.length ? (
                  modelOptions.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)
                ) : (
                  <option value="">{t("noModelsFound")}</option>
                )}
              </select>
            </label>
            {selectedProvider ? <ProviderAvatar provider={selectedProvider} size={38} /> : null}
          </header>

          <div className="chat-messages">
            {activeTopic.messages.length ? (
              activeTopic.messages.map((message, index) => (
                <div className={`chat-message ${message.role === "user" ? "chat-message-user" : "chat-message-ai"}`} key={`${message.role}-${index}`}>
                  <div className="chat-message-body">
                    {message.content ? <span>{message.content}</span> : null}
                    {message.attachments?.length ? (
                      <div className="chat-attachment-list">
                        {message.attachments.map((attachment) => (
                          <span className="chat-attachment-chip" key={attachment.id}>{attachmentLabel(attachment)}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="chat-empty-state">
                <span>{t("selectProviderToTalk")}</span>
              </div>
            )}
            {isSending ? <div className="chat-thinking">{t("chatThinking")}</div> : null}
          </div>

          <div className="chat-inputbar">
            <textarea
              value={activeTopic.draft}
              onChange={(event) => patchActiveTopic({ draft: event.target.value })}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={t("chatPlaceholder")}
              rows={3}
            />
            {(activeTopic.draftAttachments ?? []).length ? (
              <div className="draft-attachment-list">
                {(activeTopic.draftAttachments ?? []).map((attachment) => (
                  <button
                    className="draft-attachment-chip"
                    key={attachment.id}
                    onClick={() => removeDraftAttachment(attachment.id)}
                    title={t("delete")}
                    type="button"
                  >
                    {attachmentLabel(attachment)}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              className="hidden-file-input"
              multiple
              onChange={(event) => handleFileInput(event)}
              type="file"
            />
            <input
              ref={imageInputRef}
              accept="image/*"
              className="hidden-file-input"
              multiple
              onChange={(event) => handleFileInput(event, true)}
              type="file"
            />
            <div className="prompt-tool-row">
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file"><AttachIcon /></button>
              {canUseImages ? (
                <button type="button" onClick={() => imageInputRef.current?.click()} title="Attach image"><ImageIcon /></button>
              ) : null}
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach text/code file"><BracesIcon /></button>
            </div>
            <button
              className="primary-button chat-send-button"
              disabled={(!activeTopic.draft.trim() && !(activeTopic.draftAttachments ?? []).length) || !selectedProvider || !activeModel || isSending}
              onClick={() => void send()}
              type="button"
              title={isSending ? t("sending") : t("send")}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
