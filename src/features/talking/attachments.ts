import type { ChatAttachment } from "../../types";
import { MAX_ATTACHMENT_BYTES, MAX_TEXT_ATTACHMENT_BYTES } from "./constants";

export function isTextLikeFile(file: File): boolean {
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

export async function fileToChatAttachment(file: File, imageOnly = false): Promise<ChatAttachment> {
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

export function attachmentLabel(attachment: ChatAttachment): string {
  const sizeKb = Math.max(1, Math.round(attachment.size / 1024));
  return `${attachment.name} · ${sizeKb} KB`;
}
