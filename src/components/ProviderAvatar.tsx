import type { ApiProvider, ApiProviderType } from "../types";
import anthropicLogo from "../assets/provider-icons/anthropic.png";
import geminiLogo from "../assets/provider-icons/google.png";
import huggingFaceLogo from "../assets/provider-icons/huggingface.webp";
import newApiLogo from "../assets/provider-icons/newapi.png";
import ollamaLogo from "../assets/provider-icons/ollama.png";
import openAiLogo from "../assets/provider-icons/openai.png";
import openRouterLogo from "../assets/provider-icons/openrouter.png";

const providerTypeLogos: Record<ApiProviderType, string> = {
  "openai-compatible": openAiLogo,
  openai: openAiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  ollama: ollamaLogo,
  "new-api": newApiLogo,
  openrouter: openRouterLogo,
  huggingface: huggingFaceLogo,
};

const keywordLogos: Array<[RegExp, string]> = [
  [/openrouter/i, openRouterLogo],
  [/anthropic|claude/i, anthropicLogo],
  [/gemini|google/i, geminiLogo],
  [/hugging\s*face|huggingface/i, huggingFaceLogo],
  [/ollama/i, ollamaLogo],
  [/new\s*api|new-api/i, newApiLogo],
  [/openai|gpt/i, openAiLogo],
];

function providerLogo(provider: Pick<ApiProvider, "name" | "providerType" | "baseUrl">): string {
  const haystack = `${provider.name} ${provider.providerType} ${provider.baseUrl}`;
  return keywordLogos.find(([pattern]) => pattern.test(haystack))?.[1] ?? providerTypeLogos[provider.providerType];
}

function fallbackLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "P";
}

export function ProviderAvatar({ provider, size = 34 }: { provider: ApiProvider; size?: number }) {
  const logo = providerLogo(provider);

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {logo ? <img src={logo} alt="" draggable={false} /> : <span>{fallbackLetter(provider.name)}</span>}
    </span>
  );
}

export function ProviderTypeAvatar({ providerType, size = 30 }: { providerType: ApiProviderType; size?: number }) {
  const logo = providerTypeLogos[providerType] ?? openAiLogo;

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <img src={logo} alt="" draggable={false} />
    </span>
  );
}
