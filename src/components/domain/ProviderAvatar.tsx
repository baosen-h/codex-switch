import type { ApiProvider, ApiProviderType, RemoteModel } from "../../types";
import deepSeekLogo from "../../assets/provider-icons/deepseek.png";
import huggingFaceLogo from "../../assets/provider-icons/huggingface.webp";
import newApiLogo from "../../assets/provider-icons/newapi.png";
import ollamaLogo from "../../assets/provider-icons/ollama.png";
import openRouterLogo from "../../assets/provider-icons/openrouter.png";
import xiaomiLogo from "../../assets/provider-icons/xiaomi.png";
import zhipuLogo from "../../assets/provider-icons/zhipu.png";
import { iconForAgent } from "./BrandIcons";

type IconSource =
  | { kind: "agent"; agent: "codex" | "claude" | "gemini" }
  | { kind: "image"; src: string }
  | { kind: "letter"; letter: string };

const providerTypeIcons: Partial<Record<ApiProviderType, IconSource>> = {
  openai_oauth: { kind: "agent", agent: "codex" },
  openai_apikey: { kind: "agent", agent: "codex" },
  anthropic: { kind: "agent", agent: "claude" },
  "anthropic-compatible": { kind: "agent", agent: "claude" },
  gemini: { kind: "agent", agent: "gemini" },
  ollama: { kind: "image", src: ollamaLogo },
  openrouter: { kind: "image", src: openRouterLogo },
  huggingface: { kind: "image", src: huggingFaceLogo },
  "openai-compatible": { kind: "image", src: newApiLogo },
  "new-api": { kind: "image", src: newApiLogo },
};

const keywordIcons: Array<[RegExp, IconSource]> = [
  [/claude|anthropic/i, { kind: "agent", agent: "claude" }],
  [/\bgpt\b|gpt-|openai|chatgpt|\bo[134]\b|o1-|o3-|o4-/i, { kind: "agent", agent: "codex" }],
  [/gemini|google|palm|bison/i, { kind: "agent", agent: "gemini" }],
  [/deepseek|deepseek\.com|deepseek-ai|deepseek[_-]/i, { kind: "image", src: deepSeekLogo }],
  [/\bmimo\b|xiaomi|mi\.com|mimo-v/i, { kind: "image", src: xiaomiLogo }],
  [/zhipu|bigmodel|glm/i, { kind: "image", src: zhipuLogo }],
  [/openrouter/i, { kind: "image", src: openRouterLogo }],
  [/hugging\s*face|huggingface/i, { kind: "image", src: huggingFaceLogo }],
  [/ollama/i, { kind: "image", src: ollamaLogo }],
  [/new-api|newapi/i, { kind: "image", src: newApiLogo }],
];

type ProviderAvatarSource = Pick<ApiProvider, "name" | "providerType" | "baseUrl">;

function providerIcon(provider: ProviderAvatarSource): IconSource {
  const haystack = `${provider.name} ${provider.providerType} ${provider.baseUrl}`;
  return keywordIcons.find(([pattern]) => pattern.test(haystack))?.[1]
    ?? providerTypeIcons[provider.providerType]
    ?? { kind: "letter", letter: fallbackLetter(provider.name) };
}

function modelIcon(model: RemoteModel): IconSource {
  const haystack = `${model.id} ${model.name ?? ""} ${model.ownedBy ?? ""} ${model.description ?? ""}`;
  return keywordIcons.find(([pattern]) => pattern.test(haystack))?.[1]
    ?? { kind: "letter", letter: fallbackLetter(model.name || model.id || model.ownedBy || "M") };
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

function IconBody({ icon }: { icon: IconSource }) {
  if (icon.kind === "agent") return iconForAgent(icon.agent);
  if (icon.kind === "image") return <img src={icon.src} alt="" draggable={false} />;
  return <span>{icon.letter}</span>;
}

export function ProviderAvatar({ provider, size = 34 }: { provider: ProviderAvatarSource; size?: number }) {
  const icon = providerIcon(provider);

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <IconBody icon={icon} />
    </span>
  );
}

export function ProviderTypeAvatar({ providerType, size = 30 }: { providerType: ApiProviderType; size?: number }) {
  const icon = providerTypeIcons[providerType] ?? { kind: "letter" as const, letter: providerTypeLetter(providerType) };

  return (
    <span className="provider-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <IconBody icon={icon} />
    </span>
  );
}

export function ModelAvatar({ model, size = 28 }: { model: RemoteModel; size?: number }) {
  const icon = modelIcon(model);

  return (
    <span className="model-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <IconBody icon={icon} />
    </span>
  );
}
