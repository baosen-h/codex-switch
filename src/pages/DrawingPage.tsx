import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent, WheelEvent } from "react";
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

interface ZoomLens {
  visible: boolean;
  x: number;
  y: number;
  backgroundSize: string;
  backgroundPosition: string;
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

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 13V3M8 3 4 7M8 3l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
    <rect x="6" y="2" width="2" height="10"/>
    <rect x="2" y="6" width="10" height="2"/>
  </svg>
);

const ZoomIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M10.2 10.2 13.5 13.5M7 4.8v4.4M4.8 7h4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M10.2 10.2 13.5 13.5M4.8 7h4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const ResetZoomIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M12.7 6.1A5 5 0 1 0 13 8M12.7 3.5v2.6h-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5" y="3" width="8" height="9" rx="1.3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M3 5.5v6.8C3 13.2 3.8 14 4.7 14h5.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2.5v7M5.2 7.1 8 9.9l2.8-2.8M3 13.5h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
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

async function downloadImage(image: string, index: number) {
  const link = document.createElement("a");
  try {
    const blob = await fetch(image).then((response) => response.blob());
    link.href = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(link.href), 8000);
  } catch {
    link.href = image;
  }
  link.download = `codex-switch-image-${index + 1}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function DrawingPage({ providers, onNotify }: DrawingPageProps) {
  const { t } = useI18n();
  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);
  const fallbackProvider = enabledProviders[0];
  const [records, setRecords] = useState<DrawingRecord[]>(() => loadRecords(fallbackProvider));
  const [activeId, setActiveId] = useState(records[0]?.id ?? "");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomLens, setZoomLens] = useState<ZoomLens>({
    visible: false,
    x: 0,
    y: 0,
    backgroundSize: "100% 100%",
    backgroundPosition: "50% 50%",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const zoomStageRef = useRef<HTMLDivElement | null>(null);
  const zoomDrag = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const activeRecord = records.find((record) => record.id === activeId) ?? records[0] ?? createRecord(fallbackProvider);
  const selectedProvider =
    enabledProviders.find((provider) => provider.id === activeRecord.providerId) ?? fallbackProvider;
  const models = imageModels(selectedProvider);
  const activeModel = activeRecord.model || models[0]?.id || "";
  const currentImage = activeRecord.images[currentImageIndex] ?? activeRecord.images[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }, 300);
    return () => window.clearTimeout(timer);
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
    void downloadImage(currentImage, currentImageIndex).then(() => {
      onNotify(t("imageDownloaded"), "ok");
    });
  };

  const openZoomImage = (image: string) => {
    setZoomScale(1);
    setZoomImage(image);
  };

  const closeZoomImage = () => {
    setZoomImage(null);
    setZoomScale(1);
    setZoomLens((lens) => ({ ...lens, visible: false }));
  };

  const zoomBy = (delta: number) => {
    setZoomScale((scale) => Math.max(0.5, Math.min(4, Number((scale + delta).toFixed(2)))));
  };

  const zoomWithWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = zoomStageRef.current;
    if (!stage) {
      zoomBy(event.deltaY > 0 ? -0.15 : 0.15);
      return;
    }

    const rect = stage.getBoundingClientRect();
    const anchorX = event.clientX - rect.left + stage.scrollLeft;
    const anchorY = event.clientY - rect.top + stage.scrollTop;
    const previousScale = zoomScale;
    const nextScale = Math.max(0.5, Math.min(4, Number((zoomScale + (event.deltaY > 0 ? -0.15 : 0.15)).toFixed(2))));
    if (nextScale === previousScale) return;

    setZoomScale(nextScale);
    requestAnimationFrame(() => {
      const ratio = nextScale / previousScale;
      stage.scrollLeft = anchorX * ratio - (event.clientX - rect.left);
      stage.scrollTop = anchorY * ratio - (event.clientY - rect.top);
    });
  };

  const startZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    const stage = zoomStageRef.current;
    if (!stage || event.button !== 0) return;
    zoomDrag.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      left: stage.scrollLeft,
      top: stage.scrollTop,
    };
    setZoomLens((lens) => (lens.visible ? { ...lens, visible: false } : lens));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    const stage = zoomStageRef.current;
    if (!stage || !zoomDrag.current.active) return;
    stage.scrollLeft = zoomDrag.current.left - (event.clientX - zoomDrag.current.x);
    stage.scrollTop = zoomDrag.current.top - (event.clientY - zoomDrag.current.y);
    setZoomLens((lens) => (lens.visible ? { ...lens, visible: false } : lens));
  };

  const stopZoomDrag = (event: PointerEvent<HTMLDivElement>) => {
    zoomDrag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const updateZoomLens = (event: PointerEvent<HTMLDivElement>) => {
    if (!zoomImage || zoomDrag.current.active) return;
    const stage = zoomStageRef.current;
    const image = stage?.querySelector("img");
    if (!stage || !image) return;

    const imageRect = image.getBoundingClientRect();
    const isInsideImage =
      event.clientX >= imageRect.left &&
      event.clientX <= imageRect.right &&
      event.clientY >= imageRect.top &&
      event.clientY <= imageRect.bottom;

    if (!isInsideImage) {
      setZoomLens((lens) => (lens.visible ? { ...lens, visible: false } : lens));
      return;
    }

    const lensSize = 176;
    const lensZoom = 2.35;
    const imageX = event.clientX - imageRect.left;
    const imageY = event.clientY - imageRect.top;
    setZoomLens({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      backgroundSize: `${imageRect.width * lensZoom}px ${imageRect.height * lensZoom}px`,
      backgroundPosition: `${-(imageX * lensZoom - lensSize / 2)}px ${-(imageY * lensZoom - lensSize / 2)}px`,
    });
  };

  const hideZoomLens = () => {
    setZoomLens((lens) => (lens.visible ? { ...lens, visible: false } : lens));
  };

  const generate = async () => {
    if (!selectedProvider || !activeModel || !activeRecord.prompt.trim()) return;
    if (activeRecord.mode === "edit" && !activeRecord.inputImages.length) {
      onNotify(t("uploadImageFirst"), "err");
      return;
    }
    setIsGenerating(true);
    try {
      await nextFrame();
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
            {isGenerating ? (
              <div className="drawing-generating-artboard" role="status" aria-live="polite">
                <div className="drawing-generating-frame">
                  <SparkIcon />
                  <div className="drawing-generating-scan" />
                  <div className="drawing-generating-bars">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <span>{t("generating")}</span>
              </div>
            ) : currentImage ? (
              <div className="drawing-image-preview">
                <button className="drawing-image-open" onClick={() => openZoomImage(currentImage)} type="button" title="Open">
                  <img src={currentImage} alt="" />
                </button>
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void generate();
                }
              }}
              rows={3}
              placeholder={t("imagePromptPlaceholder")}
            />
            <div className="drawing-prompt-actions">
              <button
                className="primary-button drawing-generate-button"
                disabled={!activeRecord.prompt.trim() || !selectedProvider || !activeModel || isGenerating}
                onClick={() => void generate()}
                type="button"
                title={isGenerating ? t("generating") : t("generate")}
              >
                <SendIcon />
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
      {zoomImage ? (
        <div className="image-zoom-modal" onClick={closeZoomImage} role="presentation">
          <button className="image-zoom-close" onClick={closeZoomImage} type="button" title="Close">X</button>
          <div
            className="image-zoom-stage"
            ref={zoomStageRef}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={startZoomDrag}
            onPointerMove={(event) => {
              moveZoomDrag(event);
              updateZoomLens(event);
            }}
            onPointerUp={stopZoomDrag}
            onPointerCancel={stopZoomDrag}
            onPointerLeave={hideZoomLens}
            onWheel={zoomWithWheel}
          >
            <img draggable={false} src={zoomImage} alt="" style={{ width: `${zoomScale * 100}%` }} />
          </div>
          {zoomLens.visible ? (
            <div
              className="image-zoom-lens"
              style={{
                left: zoomLens.x,
                top: zoomLens.y,
                backgroundImage: `url("${zoomImage}")`,
                backgroundSize: zoomLens.backgroundSize,
                backgroundPosition: zoomLens.backgroundPosition,
              }}
            />
          ) : null}
          <div className="image-zoom-toolbar" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => zoomBy(-0.25)} type="button" title="Zoom out"><ZoomOutIcon /></button>
            <button onClick={() => setZoomScale(1)} type="button" title="Reset zoom"><ResetZoomIcon /></button>
            <button onClick={() => zoomBy(0.25)} type="button" title="Zoom in"><ZoomIcon /></button>
            <button onClick={() => void handleCopyImage()} type="button" title={t("copyImage")}><CopyIcon /></button>
            <button onClick={handleDownloadImage} type="button" title={t("downloadImage")}><DownloadIcon /></button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
