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
  const effort = provider.reasoningEffort.trim() || "high";
  const baseUrl = provider.baseUrl.trim();
  const hasCustom = Boolean(baseUrl);
  const lines: string[] = ["# ── ~/.codex/config.toml ──"];
  if (hasCustom) lines.push('model_provider = "custom"');
  lines.push(`model = "${model}"`);
  lines.push(`model_reasoning_effort = "${effort}"`);
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
