import { useMemo, useState } from "react";
import { appApi } from "../../api/tauri";
import { useI18n } from "../../i18n/context";
import { modelSupportsImageGeneration } from "../../utils/modelCapabilities";
import { DrawingControlPanel } from "./components/DrawingControlPanel";
import { DrawingMainPanel } from "./components/DrawingMainPanel";
import { DrawingRecordRail } from "./components/DrawingRecordRail";
import { ImageZoomModal } from "./components/ImageZoomModal";
import { copyImage, fileToDataUrl, imageModels, nextFrame } from "./drawingUtils";
import { useDrawingRecords } from "./hooks/useDrawingRecords";
import { useImageZoom } from "./hooks/useImageZoom";
import type { DrawingPageProps } from "./types";

export function DrawingPage({ providers, onNotify }: DrawingPageProps) {
  const { t } = useI18n();
  const [isGenerating, setIsGenerating] = useState(false);

  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.enabled && provider.models.some(modelSupportsImageGeneration)),
    [providers],
  );
  const fallbackProvider = enabledProviders[0];
  const {
    records,
    setRecords,
    activeRecord,
    currentImageIndex,
    setCurrentImageIndex,
    patchActiveRecord,
    addRecord,
    deleteRecord,
    selectRecord,
  } = useDrawingRecords(fallbackProvider);
  const {
    zoomImage,
    zoomScale,
    zoomStageRef,
    setZoomScale,
    openZoomImage,
    closeZoomImage,
    zoomBy,
    zoomWithWheel,
    startZoomDrag,
    moveZoomDrag,
    stopZoomDrag,
  } = useImageZoom();

  const selectedProvider =
    enabledProviders.find((provider) => provider.id === activeRecord.providerId) ?? fallbackProvider;
  const models = imageModels(selectedProvider);
  const activeModel = activeRecord.model || models[0]?.id || "";
  const currentImage = activeRecord.images[currentImageIndex] ?? activeRecord.images[0];

  const selectProvider = (nextId: string) => {
    const provider = enabledProviders.find((item) => item.id === nextId);
    const nextModels = imageModels(provider);
    patchActiveRecord({ providerId: nextId, model: nextModels[0]?.id ?? "" });
  };

  const uploadImages = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).map(fileToDataUrl));
    patchActiveRecord({ mode: "edit", inputImages: [...activeRecord.inputImages, ...images] });
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

  const generate = async () => {
    if (!selectedProvider || !activeModel || !activeRecord.prompt.trim()) return;
    if (activeRecord.mode === "edit" && !activeRecord.inputImages.length) {
      onNotify(t("uploadImageFirst"), "err");
      return;
    }
    setIsGenerating(true);
    try {
      await nextFrame();
      const requestedCount = Math.max(1, Math.min(4, activeRecord.count));
      const collectedImages: string[] = [];
      while (collectedImages.length < requestedCount) {
        const response = await appApi.generateImage({
          provider: selectedProvider,
          model: activeModel,
          prompt: activeRecord.prompt,
          size: activeRecord.size,
          quality: activeRecord.quality,
          background: activeRecord.background,
          count: Math.max(1, requestedCount - collectedImages.length),
          inputImages: activeRecord.mode === "edit" ? activeRecord.inputImages : [],
        });
        if (!response.images.length) break;
        collectedImages.push(...response.images);
        if (response.images.length < 1) break;
      }
      if (!collectedImages.length) {
        throw new Error(t("imageGenerateError"));
      }
      patchActiveRecord({ images: collectedImages.slice(0, requestedCount) });
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
        <DrawingControlPanel
          providers={enabledProviders}
          selectedProvider={selectedProvider}
          models={models}
          activeModel={activeModel}
          activeRecord={activeRecord}
          labels={{
            drawing: t("drawing"),
            imageStudio: t("imageStudio"),
            apiProvider: t("apiProvider"),
            model: t("model"),
            noModelsFound: t("noModelsFound"),
            imageSize: t("imageSize"),
            quality: t("quality"),
            background: t("background"),
            imageCount: t("imageCount"),
          }}
          onSelectProvider={selectProvider}
          onPatchRecord={patchActiveRecord}
        />

        <DrawingMainPanel
          activeRecord={activeRecord}
          activeModel={activeModel}
          currentImage={currentImage}
          currentImageIndex={currentImageIndex}
          isGenerating={isGenerating}
          canGenerate={Boolean(activeRecord.prompt.trim())}
          labels={{
            generating: t("generating"),
            drawingEmpty: t("drawingEmpty"),
            imagePromptPlaceholder: t("imagePromptPlaceholder"),
            inputImage: t("inputImage"),
            delete: t("delete"),
            generate: t("generate"),
          }}
          selectedProviderAvailable={Boolean(selectedProvider)}
          onPatchRecord={patchActiveRecord}
          onFilesAdded={(files) => void uploadImages(files)}
          onGenerate={() => void generate()}
          onOpenZoomImage={openZoomImage}
        />

        <DrawingRecordRail
          records={records}
          activeRecord={activeRecord}
          currentImageIndex={currentImageIndex}
          labels={{
            add: t("add"),
            delete: t("delete"),
            drawMode: t("drawMode"),
            editMode: t("editMode"),
          }}
          onAddRecord={addRecord}
          onSelectRecord={selectRecord}
          onDeleteRecord={deleteRecord}
          onSelectImage={setCurrentImageIndex}
        />
      </article>

      <ImageZoomModal
        image={zoomImage}
        zoomScale={zoomScale}
        stageRef={zoomStageRef}
        copyImageLabel={t("copyImage")}
        onClose={closeZoomImage}
        onCopyImage={() => void handleCopyImage()}
        onZoomBy={zoomBy}
        onResetZoom={() => setZoomScale(1)}
        onWheel={zoomWithWheel}
        onPointerDown={startZoomDrag}
        onPointerMove={moveZoomDrag}
        onPointerUp={stopZoomDrag}
      />
    </section>
  );
}
