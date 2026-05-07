import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { appApi } from "../api/tauri";
import { ProviderAvatar } from "../components/ProviderAvatar";
import { useI18n } from "../i18n/context";
import type { ApiProvider } from "../types";

interface DrawingPageProps {
  providers: ApiProvider[];
  onNotify: (message: string, type: "ok" | "err") => void;
}

type DrawingMode = "draw" | "edit";

interface DrawingRecord {
  id: string;
  mode: DrawingMode;
  providerId: string;
  model: string;
  prompt: string;
  size: string;
  quality: string;
  background: string;
  count: number;
  inputImages: string[];
  images: string[];
  createdAt: number;
}

const STORAGE_KEY = "codex-switch-drawing-records-v1";
const imageSizes = ["auto", "1024x1024", "1024x576", "576x1024", "768x768"];
const qualityOptions = ["auto", "low", "medium", "high"];
const backgroundOptions = ["auto", "transparent", "opaque"];

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

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
    <rect x="6" y="2" width="2" height="10"/>
    <rect x="2" y="6" width="10" height="2"/>
  </svg>
);

function imageModels(provider?: ApiProvider) {
  const models = provider?.models ?? [];
  const filtered = models.filter((model) => /image|dall|flux|sd|kolors|midjourney|mj|seedream|qwen-image|gpt-image/i.test(model.id));
  return filtered.length ? filtered : models;
}

function createRecord(provider?: ApiProvider, mode: DrawingMode = "draw"): DrawingRecord {
  const models = imageModels(provider);
  return {
    id: `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    mode,
    providerId: provider?.id ?? "",
    model: models[0]?.id ?? "",
    prompt: "",
    size: "auto",
    quality: "auto",
    background: "auto",
    count: 1,
    inputImages: [],
    images: [],
    createdAt: Date.now(),
  };
}

function loadRecords(provider?: ApiProvider): DrawingRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as DrawingRecord[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Ignore invalid localStorage data and recreate below.
  }
  return [createRecord(provider)];
}

function recordTitle(record: DrawingRecord): string {
  return record.prompt.trim().slice(0, 28) || (record.mode === "edit" ? "Image edit" : "New image");
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

async function copyImage(image: string) {
  const ClipboardItemCtor = window.ClipboardItem;
  if (navigator.clipboard && ClipboardItemCtor) {
    try {
      const blob = await fetch(image).then((response) => response.blob());
      await navigator.clipboard.write([new ClipboardItemCtor({ [blob.type || "image/png"]: blob })]);
      return;
    } catch {
      // Remote image URLs can be blocked by CORS; copying the URL is still useful.
    }
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(image);
    return;
  }
  throw new Error("Clipboard is not available.");
}

function downloadImage(image: string, index: number) {
  const link = document.createElement("a");
  link.href = image;
  link.download = `codex-switch-image-${index + 1}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function DrawingPage({ providers, onNotify }: DrawingPageProps) {
  const { t } = useI18n();
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);
  const fallbackProvider = enabledProviders[0];
  const [records, setRecords] = useState<DrawingRecord[]>(() => loadRecords(fallbackProvider));
  const [activeId, setActiveId] = useState(records[0]?.id ?? "");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeRecord = records.find((record) => record.id === activeId) ?? records[0] ?? createRecord(fallbackProvider);
  const selectedProvider =
    enabledProviders.find((provider) => provider.id === activeRecord.providerId) ?? fallbackProvider;
  const models = imageModels(selectedProvider);
  const activeModel = activeRecord.model || models[0]?.id || "";
  const currentImage = activeRecord.images[currentImageIndex] ?? activeRecord.images[0];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const patchActiveRecord = (patch: Partial<DrawingRecord>) => {
    setRecords((current) =>
      current.map((record) => (record.id === activeRecord.id ? { ...record, ...patch } : record)),
    );
  };

  const addRecord = () => {
    const next = createRecord(fallbackProvider, activeRecord.mode);
    setRecords((current) => [next, ...current]);
    setActiveId(next.id);
    setCurrentImageIndex(0);
  };

  const deleteRecord = (id: string) => {
    setRecords((current) => {
      const next = current.filter((record) => record.id !== id);
      if (!next.length) {
        const fresh = createRecord(fallbackProvider);
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
    setCurrentImageIndex(0);
  };

  const selectProvider = (nextId: string) => {
    const provider = enabledProviders.find((item) => item.id === nextId);
    const nextModels = imageModels(provider);
    patchActiveRecord({ providerId: nextId, model: nextModels[0]?.id ?? "" });
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).map(fileToDataUrl));
    patchActiveRecord({ mode: "edit", inputImages: [...activeRecord.inputImages, ...images] });
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    void uploadImages(files).finally(() => {
      event.currentTarget.value = "";
    });
  };

  const handleCopyImage = async () => {
    if (!currentImage) return;
    try {
      await copyImage(currentImage);
      onNotify(t("imageCopied"), "ok");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message, "err");
    }
  };

  const handleDownloadImage = () => {
    if (!currentImage) return;
    downloadImage(currentImage, currentImageIndex);
    onNotify(t("imageDownloaded"), "ok");
  };

  const generate = async () => {
    if (!selectedProvider || !activeModel || !activeRecord.prompt.trim()) return;
    if (activeRecord.mode === "edit" && !activeRecord.inputImages.length) {
      onNotify(t("uploadImageFirst"), "err");
      return;
    }
    setIsGenerating(true);
    try {
      const response = await appApi.generateImage({
        provider: selectedProvider,
        model: activeModel,
        prompt: activeRecord.prompt,
        size: activeRecord.size,
        quality: activeRecord.quality,
        background: activeRecord.background,
        count: activeRecord.count,
        inputImages: activeRecord.mode === "edit" ? activeRecord.inputImages : [],
      });
      patchActiveRecord({ images: response.images });
      setCurrentImageIndex(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onNotify(message || t("imageGenerateError"), "err");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="page drawing-page">
      <article className="drawing-workspace">
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

          {activeRecord.mode === "edit" ? (
            <>
              <label className="field">
                <span>{t("inputImage")}</span>
                <label className="drawing-upload-box">
                  <input accept="image/*" multiple onChange={handleUploadChange} type="file" />
                  <SparkIcon />
                  <span>{t("uploadImage")}</span>
                </label>
              </label>

              {activeRecord.inputImages.length ? (
                <div className="drawing-input-strip">
                  {activeRecord.inputImages.map((image, index) => (
                    <button
                      className="drawing-reference-thumb"
                      key={`${image}-${index}`}
                      onClick={() =>
                        patchActiveRecord({
                          inputImages: activeRecord.inputImages.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                      title={t("delete")}
                      type="button"
                    >
                      <img src={image} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <label className="field">
            <span>{t("model")}</span>
            <select value={activeModel} onChange={(event) => patchActiveRecord({ model: event.target.value })}>
              {models.length ? (
                models.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)
              ) : (
                <option value="">{t("noModelsFound")}</option>
              )}
            </select>
          </label>

          <label className="field">
            <span>{t("imageSize")}</span>
            <select value={activeRecord.size} onChange={(event) => patchActiveRecord({ size: event.target.value })}>
              {imageSizes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="field">
            <span>{t("quality")}</span>
            <select value={activeRecord.quality} onChange={(event) => patchActiveRecord({ quality: event.target.value })}>
              {qualityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="field">
            <span>{t("background")}</span>
            <select value={activeRecord.background} onChange={(event) => patchActiveRecord({ background: event.target.value })}>
              {backgroundOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="field">
            <span>{t("imageCount")}</span>
            <input
              min={1}
              max={4}
              value={activeRecord.count}
              onChange={(event) => patchActiveRecord({ count: Number(event.target.value) })}
              type="number"
            />
          </label>
        </aside>

        <main className="drawing-main-panel">
          <div className="drawing-mode-switch">
            <button
              className={activeRecord.mode === "draw" ? "active" : ""}
              onClick={() => patchActiveRecord({ mode: "draw" })}
              type="button"
            >
              {t("drawMode")}
            </button>
            <button
              className={activeRecord.mode === "edit" ? "active" : ""}
              onClick={() => patchActiveRecord({ mode: "edit" })}
              type="button"
            >
              {t("editMode")}
            </button>
          </div>

          <div className="drawing-canvas-area">
            {currentImage ? (
              <div className="drawing-image-preview">
                <img src={currentImage} alt="" />
                <span>{currentImageIndex + 1} / {activeRecord.images.length}</span>
              </div>
            ) : (
              <div className="drawing-empty-artboard">
                <SparkIcon />
                <span>{t("drawingEmpty")}</span>
              </div>
            )}
          </div>

          <div className="drawing-prompt-bar">
            <textarea
              value={activeRecord.prompt}
              onChange={(event) => patchActiveRecord({ prompt: event.target.value })}
              rows={3}
              placeholder={t("imagePromptPlaceholder")}
            />
            <div className="drawing-prompt-actions">
              {currentImage ? (
                <>
                  <button className="secondary-button" onClick={() => void handleCopyImage()} type="button">{t("copyImage")}</button>
                  <button className="secondary-button" onClick={handleDownloadImage} type="button">{t("downloadImage")}</button>
                </>
              ) : null}
              <button
                className="primary-button icon-text-button"
                disabled={!activeRecord.prompt.trim() || !selectedProvider || !activeModel || isGenerating}
                onClick={() => void generate()}
                type="button"
              >
                <SparkIcon />
                <span>{isGenerating ? t("generating") : t("generate")}</span>
              </button>
            </div>
          </div>
        </main>

        <aside className="drawing-record-rail">
          <button className="drawing-add-record" onClick={addRecord} type="button" title={t("add")}>
            <PlusIcon />
          </button>
          <div className="drawing-record-list">
            {records.map((record) => (
              <button
                className={`drawing-record-thumb ${record.id === activeRecord.id ? "active" : ""}`}
                key={record.id}
                onClick={() => {
                  setActiveId(record.id);
                  setCurrentImageIndex(0);
                }}
                type="button"
              >
                {record.images[0] ? <img src={record.images[0]} alt="" /> : <span>{record.mode === "edit" ? t("editMode") : t("drawMode")}</span>}
                <small>{recordTitle(record)}</small>
              </button>
            ))}
          </div>
          <button className="danger-button drawing-delete-record" onClick={() => deleteRecord(activeRecord.id)} type="button">
            {t("delete")}
          </button>
          {activeRecord.images.length > 1 ? (
            <div className="drawing-output-strip">
              {activeRecord.images.map((image, index) => (
                <button
                  className={index === currentImageIndex ? "active" : ""}
                  key={`${image}-${index}`}
                  onClick={() => setCurrentImageIndex(index)}
                  type="button"
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </aside>
      </article>
    </section>
  );
}
