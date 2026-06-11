import { useRef } from "react";
import type { ChangeEvent, ClipboardEvent } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import {
  Image as PromptKitImage,
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "../../../components/prompt-kit";
import { Button } from "../../../components/ui/button";
import { imageSrc } from "../drawingUtils";
import type { DrawingRecord } from "../types";
import { SparkIcon } from "./DrawingIcons";

interface DrawingMainPanelProps {
  activeRecord: DrawingRecord;
  activeModel: string;
  currentImage?: string;
  currentImageIndex: number;
  isGenerating: boolean;
  canGenerate: boolean;
  labels: {
    generating: string;
    drawingEmpty: string;
    imagePromptPlaceholder: string;
    inputImage: string;
    delete: string;
    generate: string;
  };
  selectedProviderAvailable: boolean;
  onPatchRecord: (patch: Partial<DrawingRecord>) => void;
  onFilesAdded: (files: File[]) => void;
  onGenerate: () => void;
  onOpenZoomImage: (image: string) => void;
}

function imageData(image: string): { base64: string; mediaType: string } | null {
  const match = image.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export function DrawingMainPanel({
  activeRecord,
  activeModel,
  currentImage,
  currentImageIndex,
  isGenerating,
  canGenerate,
  labels,
  selectedProviderAvailable,
  onPatchRecord,
  onFilesAdded,
  onGenerate,
  onOpenZoomImage,
}: DrawingMainPanelProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const removeInputImage = (index: number) => {
    const nextImages = activeRecord.inputImages.filter((_, itemIndex) => itemIndex !== index);
    onPatchRecord({ inputImages: nextImages, mode: nextImages.length ? "edit" : "draw" });
    if (uploadInputRef.current) {
      uploadInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      onFilesAdded(Array.from(event.target.files));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    onFilesAdded(files);
  };

  return (
    <main className="drawing-main-panel">
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
            <span>{labels.generating}</span>
          </div>
        ) : currentImage ? (
          <div className="drawing-image-preview">
            <button className="drawing-image-open" onClick={() => onOpenZoomImage(currentImage)} type="button" title="Open">
              <img src={imageSrc(currentImage)} alt="" />
            </button>
            <span>{currentImageIndex + 1} / {activeRecord.images.length}</span>
          </div>
        ) : (
          <div className="drawing-empty-artboard">
            <SparkIcon />
            <span>{labels.drawingEmpty}</span>
          </div>
        )}
      </div>

      <div className="drawing-prompt-bar">
        <PromptInput
          className="talking-prompt-input drawing-prompt-input"
          value={activeRecord.prompt}
          onValueChange={(prompt) => onPatchRecord({ prompt })}
          onSubmit={onGenerate}
          isLoading={isGenerating}
          maxHeight={72}
        >
          {activeRecord.inputImages.length ? (
            <div className="draft-attachment-list drawing-input-attachment-list">
              {activeRecord.inputImages.map((image, index) => {
                const preview = imageData(image);
                return (
                  <div className="draft-attachment-chip" key={`${image}-${index}`} onClick={(event) => event.stopPropagation()}>
                    <button
                      className="draft-attachment-preview-button"
                      onClick={() => onOpenZoomImage(image)}
                      title={labels.inputImage}
                      type="button"
                    >
                      {preview ? (
                        <PromptKitImage
                          alt={labels.inputImage}
                          base64={preview.base64}
                          className="draft-attachment-preview"
                          mediaType={preview.mediaType}
                          uint8Array={new Uint8Array()}
                        />
                      ) : (
                        <img className="draft-attachment-preview" src={imageSrc(image)} alt="" />
                      )}
                    </button>
                    <span>{labels.inputImage} {index + 1}</span>
                    <button
                      aria-label={labels.delete}
                      className="draft-attachment-remove"
                      onClick={() => removeInputImage(index)}
                      title={labels.delete}
                      type="button"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          <PromptInputTextarea placeholder={labels.imagePromptPlaceholder} onPaste={handlePaste} maxLength={12000} />

          <PromptInputActions className="prompt-composer-footer">
            <PromptInputAction tooltip={labels.inputImage}>
              <label className="prompt-kit-upload-label">
                <input
                  ref={uploadInputRef}
                  accept="image/*"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                  type="file"
                />
                <Paperclip className="size-5" />
              </label>
            </PromptInputAction>

            <PromptInputAction tooltip={isGenerating ? labels.generating : labels.generate}>
              <Button
                className="chat-send-button drawing-generate-button"
                disabled={!canGenerate || !selectedProviderAvailable || !activeModel || isGenerating}
                onClick={onGenerate}
                title={isGenerating ? labels.generating : labels.generate}
                size="icon"
              >
                <ArrowUp className="size-5" />
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
    </main>
  );
}
