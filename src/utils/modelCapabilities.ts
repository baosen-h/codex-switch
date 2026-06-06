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

function normalizeModalities(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    for (const part of value.toLowerCase().split(/[,+\s]+/)) {
      const entry = part.trim();
      if (!entry || seen.has(entry)) continue;
      seen.add(entry);
      normalized.push(entry);
    }
  }
  return normalized;
}

export function modelSupportsVision(model: RemoteModel): boolean {
  return getModelVisionCapability(model) === "vision";
}

export type ModelVisionCapability = "vision" | "text-only" | "unknown";

export function getModelVisionCapability(model: RemoteModel | undefined): ModelVisionCapability {
  if (!model) return "unknown";
  const input = normalizeModalities(model.inputModalities);
  const caps = normalizeModalities(model.capabilities);
  if (input.includes("image") || caps.includes("image") || caps.includes("image_recognition")) {
    return "vision";
  }
  return input.length ? "text-only" : "unknown";
}

export function modelSupportsVisionText(model: RemoteModel): boolean {
  const modalityFlow = getModelModalityFlow(model);
  return Boolean(
    modalityFlow
    && modalityFlow.input.includes("image")
    && modalityFlow.output.includes("text"),
  );
}

export function modelSupportsImageGeneration(model: RemoteModel): boolean {
  const modalityFlow = getModelModalityFlow(model);
  if (modalityFlow) return modalityFlow.output.includes("image");
  const caps = capabilityList(model);
  if (caps.includes("image_generation")) return true;
  const id = lowerId(model);
  return IMAGE_REGEX.test(id);
}

export function modelSupportsChat(model: RemoteModel): boolean {
  const modalityFlow = getModelModalityFlow(model);
  if (modalityFlow) return modalityFlow.output.includes("text");
  const caps = capabilityList(model);
  if (caps.some((cap) => cap.includes("embedding") || cap.includes("rerank"))) return false;
  if (caps.includes("image_generation")) return false;
  const id = lowerId(model);
  if (IMAGE_REGEX.test(id)) return false;
  return true;
}

export type ModelCapabilityTag = "vision" | "reasoning" | "function" | "web" | "image";

export interface ModelModalityFlow {
  input: string[];
  output: string[];
}

export function getModelModalityFlow(model: RemoteModel): ModelModalityFlow | null {
  const input = normalizeModalities(model.inputModalities);
  const output = normalizeModalities(model.outputModalities);
  if (!input.length && !output.length) return null;
  return {
    input: input.length ? input : ["unknown"],
    output: output.length ? output : ["unknown"],
  };
}

export function getModelDisplayModalityFlow(model: RemoteModel): ModelModalityFlow | null {
  const explicitFlow = getModelModalityFlow(model);
  if (explicitFlow) return explicitFlow;
  return { input: ["unknown"], output: ["unknown"] };
}

export function getModelCapabilityTags(model: RemoteModel): ModelCapabilityTag[] {
  const modalityFlow = getModelModalityFlow(model);
  if (modalityFlow) {
    const tags: ModelCapabilityTag[] = [];
    const inputs = new Set(modalityFlow.input);
    const outputs = new Set(modalityFlow.output);
    if (inputs.has("image")) tags.push("vision");
    if (outputs.has("image")) tags.push("image");
    return tags;
  }

  const caps = capabilityList(model);
  const id = lowerId(model);
  const tags: ModelCapabilityTag[] = [];
  if (caps.includes("image_recognition") || caps.includes("image")) tags.push("vision");
  if (caps.includes("reasoning") || REASONING_REGEX.test(id)) tags.push("reasoning");
  if (caps.includes("function_call") || FUNCTION_REGEX.test(id)) tags.push("function");
  if (caps.includes("web_search") || WEB_REGEX.test(id)) tags.push("web");
  if (caps.includes("image_generation") || IMAGE_REGEX.test(id)) tags.push("image");
  return tags;
}
