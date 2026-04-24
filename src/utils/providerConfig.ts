import type { AgentKind, Provider } from "../types";

export const emptyProvider: Provider = {
  id: "",
  name: "",
  agent: "codex",
  baseUrl: "",
  apiKey: "",
  websiteUrl: "",
  model: "",
  reasoningEffort: "high",
  extraToml: "",
  configText: "",
  isCurrent: false,
  createdAt: "",
  updatedAt: "",
};

export const agentTabs: AgentKind[] = ["codex", "claude", "gemini"];

export function defaultModelForAgent(agent: AgentKind): string {
  if (agent === "claude") return "claude-opus-4-5";
  if (agent === "gemini") return "gemini-2.5-pro";
  return "gpt-5.4";
}

export function providerEndpointLabel(provider: Pick<Provider, "websiteUrl" | "baseUrl">): string {
  return provider.websiteUrl.trim() || provider.baseUrl.trim() || "official/default endpoint";
}

function renderCodexPreview(provider: Provider): string {
  const model = provider.model.trim() || "gpt-5.4";
  const baseUrl = provider.baseUrl.trim();
  const hasCustom = Boolean(baseUrl);
  const lines: string[] = ["# ── ~/.codex/config.toml ──"];
  if (hasCustom) lines.push('model_provider = "custom"');
  lines.push(`model = "${model}"`);
  lines.push("disable_response_storage = true");
  if (hasCustom) {
    lines.push("model_context_window = 1000000");
    lines.push("model_auto_compact_token_limit = 900000");
    lines.push("[model_providers]");
    lines.push("[model_providers.custom]");
    lines.push(`name = "${(provider.name || "custom").trim()}"`);
    lines.push('wire_api = "responses"');
    lines.push("requires_openai_auth = true");
    lines.push(`base_url = "${baseUrl}"`);
  }
  if (provider.extraToml.trim()) {
    lines.push("");
    lines.push(provider.extraToml.trim());
  }
  lines.push("");
  lines.push("# ── ~/.codex/auth.json ──");
  lines.push(JSON.stringify({ OPENAI_API_KEY: provider.apiKey }, null, 2));
  return `${lines.join("\n")}\n`;
}

function renderClaudePreview(provider: Provider): string {
  const body = {
    env: {
      ANTHROPIC_AUTH_TOKEN: provider.apiKey,
      ANTHROPIC_BASE_URL: provider.baseUrl.trim(),
      ANTHROPIC_MODEL: provider.model.trim(),
    },
  };
  return `// ── ~/.claude/settings.json ──\n${JSON.stringify(body, null, 2)}\n`;
}

function renderGeminiPreview(provider: Provider): string {
  const model = provider.model.trim() || "gemini-2.5-pro";
  const config = { selectedAuthType: "gemini-api-key", model };
  const envLines = [`GEMINI_API_KEY=${provider.apiKey}`];
  if (provider.baseUrl.trim()) {
    envLines.push(`GOOGLE_GEMINI_BASE_URL=${provider.baseUrl.trim()}`);
  }
  return (
    `// ── ~/.gemini/config.json ──\n${JSON.stringify(config, null, 2)}\n\n` +
    `# ── ~/.gemini/.env ──\n${envLines.join("\n")}\n`
  );
}

export function renderProviderPreview(provider: Provider): string {
  if (provider.agent === "claude") return renderClaudePreview(provider);
  if (provider.agent === "gemini") return renderGeminiPreview(provider);
  return renderCodexPreview(provider);
}

function matchQuotedValue(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedKey}\\s*=\\s*"([^"]*)"`, "i"));
  return match?.[1] ?? "";
}

function matchEnvValue(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escapedKey}=(.*)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseCodexPreview(preview: string, current: Provider): Partial<Provider> {
  const lines = preview.split(/\r?\n/);
  const authStart = lines.findIndex((line) => line.includes("auth.json"));
  const configSection = authStart === -1 ? lines : lines.slice(0, authStart);
  const authSection = authStart === -1 ? [] : lines.slice(authStart + 1);
  const extraStart = configSection.findIndex((line) => line.trim().startsWith("[experimental]"));
  const extraToml =
    extraStart === -1 ? current.extraToml : configSection.slice(extraStart).join("\n").trim();
  const authJson = parseJsonBlock(authSection.join("\n"));
  const apiKeyValue = authJson?.OPENAI_API_KEY;

  return {
    model: matchQuotedValue(preview, "model"),
    baseUrl: matchQuotedValue(preview, "base_url"),
    apiKey: typeof apiKeyValue === "string" ? apiKeyValue : "",
    extraToml,
  };
}

function parseClaudePreview(preview: string): Partial<Provider> {
  const body = parseJsonBlock(preview);
  const env =
    body && typeof body.env === "object" && body.env !== null
      ? (body.env as Record<string, unknown>)
      : {};

  return {
    apiKey: typeof env.ANTHROPIC_AUTH_TOKEN === "string" ? env.ANTHROPIC_AUTH_TOKEN : "",
    baseUrl: typeof env.ANTHROPIC_BASE_URL === "string" ? env.ANTHROPIC_BASE_URL : "",
    model: typeof env.ANTHROPIC_MODEL === "string" ? env.ANTHROPIC_MODEL : "",
  };
}

function parseGeminiPreview(preview: string): Partial<Provider> {
  const config = parseJsonBlock(preview);

  return {
    model: typeof config?.model === "string" ? config.model : "",
    apiKey: matchEnvValue(preview, "GEMINI_API_KEY"),
    baseUrl: matchEnvValue(preview, "GOOGLE_GEMINI_BASE_URL"),
  };
}

export function parseProviderPreview(preview: string, current: Provider): Partial<Provider> {
  if (current.agent === "claude") return parseClaudePreview(preview);
  if (current.agent === "gemini") return parseGeminiPreview(preview);
  return parseCodexPreview(preview, current);
}

export function renderInstructionTemplate(agent: AgentKind): string {
  if (agent === "claude") {
    return `Claude Code template (example only)

1. Fill in:
- Name
- Base URL
- API key
- Model

2. Save the provider

3. Expected Claude env shape:
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-token",
    "ANTHROPIC_BASE_URL": "https://api.example.com",
    "ANTHROPIC_MODEL": "claude-opus-4-5"
  }
}`;
  }

  if (agent === "gemini") {
    return `Gemini template (example only)

1. Fill in:
- Name
- Base URL (optional)
- API key
- Model

2. Save the provider

3. Expected Gemini shape:
config.json
{
  "selectedAuthType": "gemini-api-key",
  "model": "gemini-2.5-pro"
}

.env
GEMINI_API_KEY=your-key
GOOGLE_GEMINI_BASE_URL=https://api.example.com`;
  }

  return `Codex template (example only)

1. Fill in:
- Name
- Base URL
- API key
- Model

2. Save the provider

3. Expected Codex shape:
config.toml
model_provider = "custom"
model = "gpt-5.4"

[model_providers.custom]
name = "Example"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://api.example.com/v1"

auth.json
{
  "OPENAI_API_KEY": "your-key"
}`;
}
