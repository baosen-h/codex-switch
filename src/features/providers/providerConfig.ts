import type { ApiProvider, ApiProviderType } from "../../types";

export const providerTypes: Array<{ value: ApiProviderType; label: string; baseUrl: string; websiteUrl: string }> = [
  { value: "openai-compatible", label: "OpenAI Compatible / New API", baseUrl: "https://api.example.com/v1", websiteUrl: "" },
  { value: "anthropic-compatible", label: "Anthropic Compatible", baseUrl: "https://api.example.com", websiteUrl: "" },
  { value: "openai_oauth", label: "OpenAI OAuth", baseUrl: "", websiteUrl: "https://chatgpt.com" },
  { value: "openai_apikey", label: "OpenAI API Key", baseUrl: "https://api.openai.com/v1", websiteUrl: "https://platform.openai.com" },
  { value: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", websiteUrl: "https://console.anthropic.com" },
  { value: "gemini", label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", websiteUrl: "https://aistudio.google.com" },
  { value: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", websiteUrl: "https://openrouter.ai" },
  { value: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", websiteUrl: "https://ollama.com" },
  { value: "huggingface", label: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", websiteUrl: "https://huggingface.co" },
];

export const emptyApiProvider: ApiProvider = {
  id: "",
  name: "",
  providerType: "openai-compatible",
  wireApi: "responses",
  baseUrl: "",
  apiKey: "",
  websiteUrl: "",
  openAiAuthJson: undefined,
  models: [],
  enabled: true,
  createdAt: "",
  updatedAt: "",
};

export function normalizeProviderType(providerType: ApiProviderType): ApiProviderType {
  return providerType === "new-api" || providerType === "glm" || providerType === "deepseek" || providerType === "mimo"
    ? "openai-compatible"
    : providerType;
}

export function providerTypeLabel(providerType: ApiProviderType): string {
  return providerTypes.find((item) => item.value === normalizeProviderType(providerType))?.label ?? providerType;
}

export function inferProviderType(provider: Pick<ApiProvider, "name" | "providerType" | "baseUrl" | "websiteUrl">): ApiProviderType {
  return normalizeProviderType(provider.providerType);
}

export function websiteLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}` || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}
