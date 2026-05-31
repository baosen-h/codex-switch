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
  "mimo-v2\\.5(?:[-.\\w]+)?",
  "glm-5v-turbo",
];
const VISION_REGEX = new RegExp(`\\b(${VISION_ALLOWED.join("|")})\\b`, "i");

const REASONING_REGEX = /\b(o[134](?:-[\w.]+)?|gpt-5(?:-[\w.]+)?|deepseek-(?:r|reasoner|v[34])(?:[-.\w]+)?|mimo-v2(?:\.5)?(?:[-.\w]+)?|qwq|qvq|gemini-2\.5(?:-[\w.]+)?|claude-(?:sonnet|opus|haiku)-4(?:[-.\w]+)?)\b/i;
const FUNCTION_REGEX = /\b(gpt-[45](?:[-.\w]+)?|o[134](?:[-.\w]+)?|claude-(?:3|4)(?:[-.\w]+)?|gemini-(?:1\.5|2|3)(?:[-.\w]+)?|deepseek-v[34](?:[-.\w]+)?|qwen(?:2|3)?(?:[-.\w]+)?|glm-[45](?:[-.\w]+)?|mistral-(?:large|medium|small)(?:[-.\w]+)?)\b/i;
const WEB_REGEX = /\b(search|web|sonar|perplexity)\b/i;

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

export function modelSupportsChat(model: RemoteModel): boolean {
  const caps = capabilityList(model);
  if (caps.some((cap) => cap.includes("embedding") || cap.includes("rerank"))) return false;
  if (caps.includes("image_generation")) return false;
  const id = lowerId(model);
  if (IMAGE_REGEX.test(id)) return false;
  return true;
}

export type ModelCapabilityTag = "vision" | "reasoning" | "function" | "web" | "image";

export function getModelCapabilityTags(model: RemoteModel): ModelCapabilityTag[] {
  const caps = capabilityList(model);
  const id = lowerId(model);
  const tags: ModelCapabilityTag[] = [];
  if (caps.includes("image_recognition") || VISION_REGEX.test(id)) tags.push("vision");
  if (caps.includes("reasoning") || REASONING_REGEX.test(id)) tags.push("reasoning");
  if (caps.includes("function_call") || FUNCTION_REGEX.test(id)) tags.push("function");
  if (caps.includes("web_search") || WEB_REGEX.test(id)) tags.push("web");
  if (caps.includes("image_generation") || IMAGE_REGEX.test(id)) tags.push("image");
  return tags;
}
