import { useMemo, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import { appApi } from "../../api/tauri";
import { AiImageZoomModal } from "../../components/ai";
import { useI18n } from "../../i18n/context";
import type { ChatMessage } from "../../types";
import { copyText } from "../../utils/clipboard";
import { getModelVisionCapability, modelSupportsChat } from "../../utils/modelCapabilities";
import { fileToChatAttachment } from "./attachments";
import { ChatMessageList } from "./components/ChatMessageList";
import { ChatTopbar } from "./components/ChatTopbar";
import { PromptComposer } from "./components/PromptComposer";
import { TopicRail } from "./components/TopicRail";
import { useTalkingTopics } from "./hooks/useTalkingTopics";
import { sanitizeMessageForStorage } from "./storage";
import { firstModel, nextFrame } from "./topicUtils";
import type { TalkingPageProps } from "./types";

export function TalkingPage({ providers, visionFallbackAvailable = false, onNotify }: TalkingPageProps) {
  const { t } = useI18n();
  const [isSending, setIsSending] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const roleLabels: Record<ChatMessage["role"], string> = {
    user: t("roleUser"),
    assistant: t("roleAI"),
    system: t("roleSystem"),
  };
  const enabledProviders = useMemo(
    () =>
      providers.filter(
        (provider) => provider.enabled && provider.models.some(modelSupportsChat),
      ),
    [providers],
  );
  const fallbackProvider = enabledProviders[0];
  const {
    topics,
    setTopics,
    activeId,
    setActiveId,
    activeTopic,
    patchActiveTopic,
    startNewTopic,
    deleteTopic,
  } = useTalkingTopics(fallbackProvider);

  const selectedProvider =
    enabledProviders.find((provider) => provider.id === activeTopic.providerId) ?? fallbackProvider;
  const modelOptions = selectedProvider?.models ?? [];
  const activeModel = activeTopic.model || firstModel(selectedProvider);
  const selectedModel = modelOptions.find((item) => item.id === activeModel);
  const visionCapability = getModelVisionCapability(selectedModel);
  const canUseImages = Boolean(
    selectedModel && (visionCapability !== "text-only" || visionFallbackAvailable),
  );

  const selectProvider = (nextId: string) => {
    const nextProvider = enabledProviders.find((provider) => provider.id === nextId);
    patchActiveTopic({ providerId: nextId, model: firstModel(nextProvider) });
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

  const copyZoomImage = async (image: string) => {
    try {
      await copyText(image);
      onNotify(t("imageCopied"), "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message, "err");
    }
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
        <TopicRail
          topics={topics}
          activeTopic={activeTopic}
          defaultTopicLabel={t("defaultTopic")}
          messagesLabel={t("messages")}
          talkingLabel={t("talking")}
          newTopicLabel={t("newTopic")}
          deleteLabel={t("delete")}
          onSelectTopic={setActiveId}
          onNewTopic={startNewTopic}
          onDeleteTopic={deleteTopic}
        />

        <div className="chat-main-panel" onDragOver={handleDragOver} onDrop={handleDrop}>
          <ChatTopbar
            providers={enabledProviders}
            selectedProvider={selectedProvider}
            modelOptions={modelOptions}
            activeModel={activeModel}
            apiProviderLabel={t("apiProvider")}
            modelLabel={t("model")}
            noModelsFoundLabel={t("noModelsFound")}
            onSelectProvider={selectProvider}
            onSelectModel={(model) => patchActiveTopic({ model })}
          />

          <ChatMessageList
            messages={activeTopic.messages}
            isSending={isSending}
            roleLabels={roleLabels}
            emptyLabel={t("selectProviderToTalk")}
            thinkingLabel={t("chatThinking")}
            copyLabel={t("copyImage")}
            onNotify={onNotify}
          />

          <PromptComposer
            draft={activeTopic.draft}
            draftAttachments={activeTopic.draftAttachments ?? []}
            canUseImages={canUseImages}
            canSend={Boolean((activeTopic.draft.trim() || (activeTopic.draftAttachments ?? []).length) && selectedProvider && activeModel)}
            isSending={isSending}
            chatPlaceholder={t("chatPlaceholder")}
            deleteLabel={t("delete")}
            sendLabel={t("send")}
            sendingLabel={t("sending")}
            onDraftChange={(draft) => patchActiveTopic({ draft })}
            onSend={() => void send()}
            onRemoveAttachment={removeDraftAttachment}
            onOpenAttachmentImage={setZoomImage}
            onFilesAdded={(files, imageOnly) => void addDraftAttachments(files, imageOnly)}
            onPaste={handlePaste}
          />
        </div>
      </article>

      <AiImageZoomModal
        image={zoomImage}
        copyLabel={t("copyImage")}
        onClose={() => setZoomImage(null)}
        onCopyImage={(image) => void copyZoomImage(image)}
      />
    </section>
  );
}
