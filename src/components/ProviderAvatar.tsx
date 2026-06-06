import type { ApiProvider, ApiProviderType } from "../types";
import anthropicLogo from "../assets/provider-icons/anthropic.png";
import deepSeekLogo from "../assets/provider-icons/deepseek.png";
import geminiLogo from "../assets/provider-icons/google.png";
import huggingFaceLogo from "../assets/provider-icons/huggingface.webp";
import ollamaLogo from "../assets/provider-icons/ollama.png";
import openAiLogo from "../assets/provider-icons/openai.png";
import openRouterLogo from "../assets/provider-icons/openrouter.png";
import xiaomiLogo from "../assets/provider-icons/xiaomi.png";
import zhipuLogo from "../assets/provider-icons/zhipu.png";

const providerTypeLogos: Partial<Record<ApiProviderType, string>> = {
  openai_oauth: openAiLogo,
  openai_apikey: openAiLogo,
  anthropic: anthropicLogo,
  "anthropic-compatible": anthropicLogo,
  gemini: geminiLogo,
  ollama: ollamaLogo,
  openrouter: openRouterLogo,
  huggingface: huggingFaceLogo,
};

const keywordLogos: Array<[RegExp, string]> = [
  [/deepseek|deepseek\.com|deepseek-ai/i, deepSeekLogo],
  [/\bmimo\b|xiaomi|mi\.com|mimo-v/i, xiaomiLogo],
  [/zhipu|bigmodel|glm/i, zhipuLogo],
  [/openrouter/i, openRouterLogo],
  [/anthropic/i, anthropicLogo],
  [/gemini|google/i, geminiLogo],
  [/hugging\s*face|huggingface/i, huggingFaceLogo],
  [/ollama/i, ollamaLogo],
  [/openai|chatgpt/i, openAiLogo],
];

type ProviderAvatarSource = Pick<ApiProvider, "name" | "providerType" | "baseUrl">;

function providerLogo(provider: ProviderAvatarSource): string {
  const haystack = `${provider.name} ${provider.providerType} ${provider.baseUrl}`;
  return keywordLogos.find(([pattern]) => pattern.test(haystack))?.[1] ?? providerTypeLogos[provider.providerType] ?? "";
}

function fallbackLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "P";
}

function providerTypeLetter(providerType: ApiProviderType): string {
  if (providerType === "openai-compatible") return "O";
  if (providerType === "anthropic-compatible") return "A";
  if (providerType === "new-api") return "N";
  return providerType.trim().charAt(0).toUpperCase() || "P";
}

export function ProviderAvatar({ provider, size = 34 }: { provider: ProviderAvatarSource; size?: number }) {
  const logo = providerLogo(provider);

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {logo ? <img src={logo} alt="" draggable={false} /> : <span>{fallbackLetter(provider.name)}</span>}
    </span>
  );
}

export function ProviderTypeAvatar({ providerType, size = 30 }: { providerType: ApiProviderType; size?: number }) {
  const logo = providerTypeLogos[providerType] ?? "";

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {logo ? <img src={logo} alt="" draggable={false} /> : <span>{providerTypeLetter(providerType)}</span>}
    </span>
  );
}
