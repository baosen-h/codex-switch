import { convertFileSrc } from "@tauri-apps/api/core";
import type { ApiProvider } from "../../types";
import { modelSupportsImageGeneration } from "../../utils/modelCapabilities";
import type { DrawingMode, DrawingRecord } from "./types";

export function imageModels(provider?: ApiProvider) {
  const models = provider?.models ?? [];
  return models.filter((model) => modelSupportsImageGeneration(model));
}

export function createRecord(provider?: ApiProvider, mode: DrawingMode = "draw"): DrawingRecord {
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

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

export function imageSrc(image: string): string {
  const trimmed = image.trim();
  if (!trimmed || /^(data:|https?:|asset:|blob:)/i.test(trimmed)) return trimmed;
  return convertFileSrc(trimmed);
}

export async function copyImage(image: string) {
  const ClipboardItemCtor = window.ClipboardItem;
  if (navigator.clipboard && ClipboardItemCtor) {
    try {
      const blob = await fetch(imageSrc(image)).then((response) => response.blob());
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

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
