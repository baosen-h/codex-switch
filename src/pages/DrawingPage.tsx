import { useMemo, useState } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar } from "../components/ProviderAvatar";
import { useI18n } from "../i18n/context";
import type { ApiProvider } from "../types";

interface DrawingPageProps {
  providers: ApiProvider[];
  onNotify: (message: string, type: "ok" | "err") => void;
}

const imageSizes = ["1024x1024", "1024x576", "576x1024", "768x768"];

const SparkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="7" y="1" width="2" height="4"/>
    <rect x="7" y="11" width="2" height="4"/>
    <rect x="1" y="7" width="4" height="2"/>
    <rect x="11" y="7" width="4" height="2"/>
    <rect x="5" y="5" width="2" height="2"/>
    <rect x="9" y="5" width="2" height="2"/>
    <rect x="5" y="9" width="2" height="2"/>
    <rect x="9" y="9" width="2" height="2"/>
  </svg>
);

function imageModels(provider?: ApiProvider) {
  const models = provider?.models ?? [];
  const filtered = models.filter((model) => /image|dall|flux|sd|kolors|midjourney|mj|seedream|qwen-image/i.test(model.id));
  return filtered.length ? filtered : models;
}

export function DrawingPage({ providers, onNotify }: DrawingPageProps) {
  const { t } = useI18n();
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);
  const [providerId, setProviderId] = useState(enabledProviders[0]?.id ?? "");
  const selectedProvider = enabledProviders.find((provider) => provider.id === providerId) ?? enabledProviders[0];
  const models = imageModels(selectedProvider);
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeModel = model || models[0]?.id || "";

  const selectProvider = (nextId: string) => {
    const provider = enabledProviders.find((item) => item.id === nextId);
    const nextModels = imageModels(provider);
    setProviderId(nextId);
    setModel(nextModels[0]?.id ?? "");
  };

  const generate = async () => {
    if (!selectedProvider || !activeModel || !prompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await appApi.generateImage({
        provider: selectedProvider,
        model: activeModel,
        prompt,
        size,
        count,
      });
      setImages(response.images);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message || t("imageGenerateError"), "err");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="page drawing-page">
      <article className="drawing-shell">
        <aside className="drawing-control-panel">
          <div className="drawing-heading">
            <span className="eyebrow">{t("drawing")}</span>
            <h3>{t("imageStudio")}</h3>
          </div>

          <label className="field">
            <span>{t("apiProvider")}</span>
            <select value={selectedProvider?.id ?? ""} onChange={(event) => selectProvider(event.target.value)}>
              {enabledProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>

          {selectedProvider ? (
            <div className="drawing-provider-card">
              <ProviderAvatar provider={selectedProvider} size={36} />
              <div>
                <strong>{selectedProvider.name}</strong>
                <span>{selectedProvider.providerType}</span>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>{t("model")}</span>
            <select value={activeModel} onChange={(event) => setModel(event.target.value)}>
              {models.length ? (
                models.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)
              ) : (
                <option value="">{t("noModelsFound")}</option>
              )}
            </select>
          </label>

          <label className="field">
            <span>{t("imageSize")}</span>
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              {imageSizes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="field">
            <span>{t("imageCount")}</span>
            <input min={1} max={4} value={count} onChange={(event) => setCount(Number(event.target.value))} type="number" />
          </label>

          <label className="field">
            <span>{t("prompt")}</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} placeholder={t("imagePromptPlaceholder")} />
          </label>

          <button
            className="primary-button icon-text-button"
            disabled={!prompt.trim() || !selectedProvider || !activeModel || isGenerating}
            onClick={() => void generate()}
            type="button"
          >
            <SparkIcon />
            <span>{isGenerating ? t("generating") : t("generate")}</span>
          </button>
        </aside>

        <div className="drawing-artboard">
          {images.length ? (
            <div className="generated-image-grid">
              {images.map((image, index) => (
                <div className="generated-image-frame" key={`${image}-${index}`}>
                  <img src={image} alt="" />
                </div>
              ))}
            </div>
          ) : (
            <div className="drawing-empty-artboard">
              <SparkIcon />
              <span>{t("drawingEmpty")}</span>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
