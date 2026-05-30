import type { RemoteModel } from "../types";

const DEDICATED_IMAGE_MODELS = [
  "dall-e(?:-[\\w-]+)?",
  "gpt-image(?:-[\\w-]+)?",
  "grok-2-image(?:-[\\w-]+)?",
  "imagen(?:-[\\w-]+)?",
  "flux(?:-[\\w-]+)?",
  "stable-?diffusion(?:-[\\w-]+)?",
  "stabilityai(?:-[\\w-]+)?",
  "sd-[\\w-]+",
  "sdxl(?:-[\\w-]+)?",
  "cogview(?:-[\\w-]+)?",
  "qwen-image(?:-[\\w-]+)?",
  "janus(?:-[\\w-]+)?",
  "midjourney(?:-[\\w-]+)?",
  "mj-[\\w-]+",
  "z-image(?:-[\\w-]+)?",
  "longcat-image(?:-[\\w-]+)?",
  "hunyuanimage(?:-[\\w-]+)?",
  "seedream(?:-[\\w-]+)?",
  "kandinsky(?:-[\\w-]+)?",
];

const IMAGE_REGEX = new RegExp(DEDICATED_IMAGE_MODELS.join("|"), "i");

const VISION_ALLOWED = [
  "llava",
  "moondream",
  "minicpm",
  "gemini-1\\.5",
  "gemini-2\\.0",
  "gemini-2\\.5",
  "gemini-3(?:\\.\\d)?-(?:flash|pro)(?:-preview)?",
  "gemini-(flash|pro|flash-lite)-latest",
  "gemini-exp",
  "claude-3",
  "claude-haiku-4",
  "claude-sonnet-4",
  "claude-opus-4",
  "vision",
  "glm-4(?:\\.\\d+)?v(?:-[\\w-]+)?",
  "qwen-vl",
  "qwen2-vl",
  "qwen2\\.5-vl",
  "qwen3-vl",
  "qwen3\\.[5-9](?:-[\\w-]+)?",
  "qwen2\\.5-omni",
  "qwen3-omni(?:-[\\w-]+)?",
  "qvq",
  "internvl2",
  "grok-vision-beta",
  "grok-4(?:-[\\w-]+)?",
  "pixtral",
  "gpt-4(?:-[\\w-]+)",
  "gpt-4\\.1(?:-[\\w-]+)?",
  "gpt-4o(?:-[\\w-]+)?",
  "gpt-4\\.5(?:-[\\w-]+)",
  "gpt-5(?:-[\\w-]+)?",
  "chatgpt-4o(?:-[\\w-]+)?",
  "o1(?:-[\\w-]+)?",
  "o3(?:-[\\w-]+)?",
  "o4(?:-[\\w-]+)?",
  "deepseek-vl(?:[\\w-]+)?",
  "kimi-k2\\.[56](?:-[\\w-]+)?",
  "kimi-latest",
  "gemma-?[3-4](?:[-.\\w]+)?",
  "doubao-seed-1[.-][68](?:-[\\w-]+)?",
  "doubao-seed-2[.-]0(?:-[\\w-]+)?",
  "doubao-seed-code(?:-[\\w-]+)?",
  "kimi-thinking-preview",
  "gemma3(?:[-:\\w]+)?",
  "kimi-vl-a3b-thinking(?:-[\\w-]+)?",
  "llama-guard-4(?:-[\\w-]+)?",
  "llama-4(?:-[\\w-]+)?",
  "step-1o(?:.*vision)?",
  "step-1v(?:-[\\w-]+)?",
  "qwen-omni(?:-[\\w-]+)?",
  "mistral-large-(2512|latest)",
  "mistral-medium-(2508|latest)",
  "mistral-small-(2506|latest)",
  "mimo-v2-omni(?:-[\\w-]+)?",
  "glm-5v-turbo",
];
const VISION_REGEX = new RegExp(`\\b(${VISION_ALLOWED.join("|")})\\b`, "i");

function lowerId(model: Pick<RemoteModel, "id" | "name">): string {
  return `${model.id} ${model.name ?? ""}`.toLowerCase();
}

function capabilityList(model: RemoteModel): string[] {
  return [...(model.capabilities ?? []), ...(model.inputModalities ?? []), ...(model.outputModalities ?? [])]
    .map((value) => value.toLowerCase());
}

export function modelSupportsVision(model: RemoteModel): boolean {
  const caps = capabilityList(model);
  if (caps.includes("image_recognition") || caps.includes("image")) return true;
  const id = lowerId(model);
  return VISION_REGEX.test(id);
}

export function modelSupportsImageGeneration(model: RemoteModel): boolean {
  const caps = capabilityList(model);
  if (caps.includes("image_generation")) return true;
  const id = lowerId(model);
  return IMAGE_REGEX.test(id);
}

