import { useRef } from "react";
import type { ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import {
  Image as PromptKitImage,
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "../../../components/prompt-kit";
import { Button } from "../../../components/ui/button";
import type { ChatAttachment } from "../../../types";
import { attachmentLabel } from "../attachments";

function imageData(attachment: ChatAttachment): { base64: string; mediaType: string } | null {
  if (attachment.kind !== "image" || !attachment.dataUrl) return null;
  const match = attachment.dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

interface PromptComposerProps {
  draft: string;
  draftAttachments: ChatAttachment[];
  canUseImages: boolean;
  canSend: boolean;
  isSending: boolean;
  chatPlaceholder: string;
  deleteLabel: string;
  sendLabel: string;
  sendingLabel: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRemoveAttachment: (id: string) => void;
  onOpenAttachmentImage: (image: string) => void;
  onFilesAdded: (files: File[], imageOnly?: boolean) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function PromptComposer({
  draft,
  draftAttachments,
  canUseImages,
  canSend,
  isSending,
  chatPlaceholder,
  deleteLabel,
  sendLabel,
  sendingLabel,
  onDraftChange,
  onSend,
  onRemoveAttachment,
  onOpenAttachmentImage,
  onFilesAdded,
  onPaste,
}: PromptComposerProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      onFilesAdded(Array.from(event.target.files));
    }
  };

  return (
    <div className="chat-inputbar">
      <PromptInput
        className="talking-prompt-input"
        value={draft}
        onValueChange={onDraftChange}
        onSubmit={onSend}
        isLoading={isSending}
        maxHeight={42}
      >
        {draftAttachments.length ? (
          <div className="draft-attachment-list">
            {draftAttachments.map((attachment) => {
              const preview = imageData(attachment);

              return (
                <div className="draft-attachment-chip" key={attachment.id} onClick={(event) => event.stopPropagation()}>
                  {preview ? (
                    <button
                      className="draft-attachment-preview-button"
                      onClick={() => onOpenAttachmentImage(attachment.dataUrl ?? "")}
                      title={attachment.name}
                      type="button"
                    >
                      <PromptKitImage
                        alt={attachment.name}
                        base64={preview.base64}
                        className="draft-attachment-preview"
                        mediaType={preview.mediaType}
                        uint8Array={new Uint8Array()}
                      />
                    </button>
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                  <span>{attachmentLabel(attachment)}</span>
                  <button
                    aria-label={deleteLabel}
                    className="draft-attachment-remove"
                    onClick={() => {
                      onRemoveAttachment(attachment.id);
                      if (uploadInputRef.current) {
                        uploadInputRef.current.value = "";
                      }
                    }}
                    title={deleteLabel}
                    type="button"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <PromptInputTextarea placeholder={chatPlaceholder} onPaste={onPaste} maxLength={12000} />

        <PromptInputActions className="prompt-composer-footer">
          <PromptInputAction tooltip="Attach files">
            <label className="prompt-kit-upload-label">
              <input
                ref={uploadInputRef}
                className="hidden"
                multiple
                onChange={handleFileChange}
                type="file"
                accept={canUseImages ? undefined : "text/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.c,.cpp,.h,.hpp"}
              />
              <Paperclip className="size-5" />
            </label>
          </PromptInputAction>

          <PromptInputAction tooltip={isSending ? sendingLabel : sendLabel}>
            <Button
              className="chat-send-button"
              disabled={!canSend && !isSending}
              onClick={onSend}
              title={isSending ? sendingLabel : sendLabel}
              size="icon"
            >
              {isSending ? <Square className="size-5 fill-current" /> : <ArrowUp className="size-5" />}
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}

export type PromptDragHandlers = {
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};
