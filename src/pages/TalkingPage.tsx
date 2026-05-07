import { useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar } from "../components/ProviderAvatar";
import { useI18n } from "../i18n/context";
import type { ApiProvider, ChatMessage } from "../types";

interface TalkingPageProps {
  providers: ApiProvider[];
  onNotify: (message: string, type: "ok" | "err") => void;
}

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2 2h12v3h-2v2h-2v2H8v2H6v3H2z"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <rect x="5" y="1" width="2" height="10"/>
    <rect x="1" y="5" width="10" height="2"/>
  </svg>
);

function firstModel(provider?: ApiProvider): string {
  return provider?.models[0]?.id ?? "";
}

export function TalkingPage({ providers, onNotify }: TalkingPageProps) {
  const { t } = useI18n();
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);
  const [providerId, setProviderId] = useState(enabledProviders[0]?.id ?? "");
  const selectedProvider = enabledProviders.find((provider) => provider.id === providerId) ?? enabledProviders[0];
  const [model, setModel] = useState(firstModel(selectedProvider));
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const modelOptions = selectedProvider?.models ?? [];
  const activeModel = model || firstModel(selectedProvider);

  const selectProvider = (nextId: string) => {
    const nextProvider = enabledProviders.find((provider) => provider.id === nextId);
    setProviderId(nextId);
    setModel(firstModel(nextProvider));
  };

  const startNewTopic = () => {
    setMessages([]);
    setDraft("");
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || !selectedProvider || !activeModel) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setIsSending(true);

    try {
      const response = await appApi.sendChatMessage({
        provider: selectedProvider,
        model: activeModel,
        messages: nextMessages,
      });
      setMessages([...nextMessages, { role: "assistant", content: response.content }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message || t("chatSendError"), "err");
      setMessages(messages);
      setDraft(content);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="page talking-page">
      <article className="chat-shell">
        <aside className="conversation-rail">
          <div className="rail-header">
            <span className="eyebrow">{t("talking")}</span>
            <button className="add-button add-button-compact" onClick={startNewTopic} type="button" title={t("newTopic")}>
              <PlusIcon />
            </button>
          </div>
          <button className="conversation-topic active" type="button">
            <strong>{t("defaultTopic")}</strong>
            <span>{messages.length} {t("messages")}</span>
          </button>
        </aside>

        <div className="chat-main-panel">
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
              <select value={activeModel} onChange={(event) => setModel(event.target.value)}>
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
            {messages.length ? (
              messages.map((message, index) => (
                <div className={`chat-message ${message.role === "user" ? "chat-message-user" : "chat-message-ai"}`} key={`${message.role}-${index}`}>
                  <div className="chat-message-body">{message.content}</div>
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
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={t("chatPlaceholder")}
              rows={3}
            />
            <button
              className="primary-button chat-send-button"
              disabled={!draft.trim() || !selectedProvider || !activeModel || isSending}
              onClick={() => void send()}
              type="button"
            >
              <SendIcon />
              <span>{isSending ? t("sending") : t("send")}</span>
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
