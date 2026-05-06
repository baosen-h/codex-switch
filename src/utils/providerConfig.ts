import type { AgentKind, Provider } from "../types";

export const emptyProvider: Provider = {
  id: "",
  name: "",
  agent: "codex",
  apiProviderId: "",
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

type PreviewField = "name" | "model" | "baseUrl" | "apiKey" | "extraToml";

export function patchProviderPreviewField(
  provider: Provider,
  field: keyof Provider,
  value: string,
): string {
  if (!isPreviewField(field)) {
    return provider.configText || renderProviderPreview(provider);
  }

  const base = provider.configText || renderProviderPreview(provider);
  if (provider.agent === "claude") return patchClaudePreview(base, field, value);
  if (provider.agent === "gemini") return patchGeminiPreview(base, field, value);
  return patchCodexPreview(base, field, value);
}

export function patchProviderPreviewFromFields(provider: Provider): string {
  let next = provider.configText || renderProviderPreview(provider);
  for (const field of ["name", "model", "baseUrl", "apiKey", "extraToml"] as const) {
    next = patchProviderPreviewField({ ...provider, configText: next }, field, provider[field]);
  }
  return next;
}

function isPreviewField(field: keyof Provider): field is PreviewField {
  return ["name", "model", "baseUrl", "apiKey", "extraToml"].includes(field);
}

function patchCodexPreview(preview: string, field: PreviewField, value: string): string {
  if (field === "name") return replaceCodexProviderName(preview, value);
  if (field === "model") return replaceTomlString(preview, "model", value || "gpt-5.4", true);
  if (field === "baseUrl") return replaceCodexBaseUrl(preview, value);
  if (field === "apiKey") return replaceCodexAuth(preview, value);
  if (field === "extraToml") return replaceExperimentalBlock(preview, value);
  return preview;
}

function patchClaudePreview(preview: string, field: PreviewField, value: string): string {
  const keyMap: Partial<Record<PreviewField, string>> = {
    apiKey: "ANTHROPIC_AUTH_TOKEN",
    baseUrl: "ANTHROPIC_BASE_URL",
    model: "ANTHROPIC_MODEL",
  };
  const envKey = keyMap[field];
  if (!envKey) return preview;

  return replaceJsonBody(preview, (body) => {
    const env =
      body.env && typeof body.env === "object" && !Array.isArray(body.env)
        ? { ...(body.env as Record<string, unknown>) }
        : {};
    env[envKey] = value;
    return { ...body, env };
  });
}

function patchGeminiPreview(preview: string, field: PreviewField, value: string): string {
  if (field === "model") {
    return replaceJsonBody(preview, (body) => ({ ...body, model: value || "gemini-2.5-pro" }));
  }
  if (field === "apiKey") return replaceEnvLine(preview, "GEMINI_API_KEY", value);
  if (field === "baseUrl") return replaceEnvLine(preview, "GOOGLE_GEMINI_BASE_URL", value);
  return preview;
}

function replaceTomlString(
  text: string,
  key: string,
  value: string,
  appendIfMissing: boolean,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)\"[^\"]*\"(\\s*(?:#.*)?)$`, "im");
  const replacement = `$1${JSON.stringify(value)}$2`;
  if (regex.test(text)) return text.replace(regex, replacement);
  if (!appendIfMissing) return text;

  const line = `${key} = ${JSON.stringify(value)}`;
  return insertCodexTopLevelLine(text, line);
}

function replaceCodexProviderName(preview: string, name: string): string {
  const sectionPatch = replaceTomlStringInSection(
    preview,
    "model_providers.custom",
    "name",
    name || "custom",
  );
  if (sectionPatch) return sectionPatch;
  if (!hasTomlSection(preview, "model_providers.custom")) return preview;
  return insertIntoCodexCustomProvider(preview, `name = ${JSON.stringify(name || "custom")}`);
}

function replaceCodexBaseUrl(preview: string, baseUrl: string): string {
  const value = baseUrl.trim();
  const sectionPatch = replaceTomlStringInSection(
    preview,
    "model_providers.custom",
    "base_url",
    value,
  );
  if (sectionPatch) return sectionPatch;
  if (!value) return preview;

  let next = preview;
  if (!hasTomlKey(next, "model_provider")) {
    next = insertCodexTopLevelLine(next, 'model_provider = "custom"');
  }
  if (!hasTomlSection(next, "model_providers.custom")) {
    const hasParentSection = hasTomlSection(next, "model_providers");
    next = insertBeforeCodexAuth(
      next,
      [
        hasParentSection ? "" : "[model_providers]",
        "[model_providers.custom]",
        'name = "custom"',
        'wire_api = "responses"',
        "requires_openai_auth = true",
      ].filter(Boolean).join("\n"),
    );
  }
  return insertIntoCodexCustomProvider(next, `base_url = ${JSON.stringify(value)}`);
}

function replaceTomlStringInSection(
  text: string,
  section: string,
  key: string,
  value: string,
): string | null {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionMatch = new RegExp(`^\\s*\\[${escapedSection}\\]\\s*$`, "im").exec(text);
  if (!sectionMatch) return null;

  const lineEnd = text.indexOf("\n", sectionMatch.index);
  const bodyStart = lineEnd === -1 ? text.length : lineEnd + 1;
  const rest = text.slice(bodyStart);
  const nextSectionMatch = /^\s*\[[^\]]+\]\s*$/im.exec(rest);
  const bodyEnd = nextSectionMatch ? bodyStart + nextSectionMatch.index : text.length;
  const body = text.slice(bodyStart, bodyEnd);
  const keyRegex = new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)\"[^\"]*\"(\\s*(?:#.*)?)$`, "im");
  if (!keyRegex.test(body)) return null;

  const nextBody = body.replace(keyRegex, `$1${JSON.stringify(value)}$2`);
  return `${text.slice(0, bodyStart)}${nextBody}${text.slice(bodyEnd)}`;
}

function hasTomlKey(text: string, key: string): boolean {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedKey}\\s*=`, "im").test(text);
}

function hasTomlSection(text: string, section: string): boolean {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*\\[${escapedSection}\\]\\s*$`, "im").test(text);
}

function insertCodexTopLevelLine(preview: string, line: string): string {
  const authMarker = preview.search(/^#\s*── .*auth\.json.*──\s*$/im);
  const configEnd = authMarker === -1 ? preview.length : authMarker;
  const configText = preview.slice(0, configEnd);
  const firstSection = /^\s*\[[^\]]+\]\s*$/im.exec(configText);
  const insertAt = firstSection ? firstSection.index : configEnd;
  const before = preview.slice(0, insertAt).trimEnd();
  const after = preview.slice(insertAt).trimStart();
  return `${before}\n${line}\n\n${after}`;
}

function insertBeforeCodexAuth(preview: string, block: string): string {
  const authMarker = preview.search(/^#\s*── .*auth\.json.*──\s*$/im);
  if (authMarker === -1) return `${preview.trimEnd()}\n${block}\n`;
  return `${preview.slice(0, authMarker).trimEnd()}\n${block}\n\n${preview.slice(authMarker)}`;
}

function insertIntoCodexCustomProvider(preview: string, line: string): string {
  const section = preview.search(/^\s*\[model_providers\.custom\]\s*$/im);
  if (section === -1) return insertBeforeCodexAuth(preview, line);

  const lineEnd = preview.indexOf("\n", section);
  const insertAt = lineEnd === -1 ? preview.length : lineEnd + 1;
  return `${preview.slice(0, insertAt)}${line}\n${preview.slice(insertAt)}`;
}

function replaceCodexAuth(preview: string, apiKey: string): string {
  const marker = preview.search(/^#\s*── .*auth\.json.*──\s*$/im);
  if (marker === -1) {
    return `${preview.trimEnd()}\n\n# ── ~/.codex/auth.json ──\n${JSON.stringify({ OPENAI_API_KEY: apiKey }, null, 2)}\n`;
  }

  const before = preview.slice(0, marker);
  const auth = preview.slice(marker);
  const updated = replaceJsonBody(auth, (body) => ({ ...body, OPENAI_API_KEY: apiKey }));
  return `${before}${updated}`;
}

function replaceExperimentalBlock(preview: string, extraToml: string): string {
  const nextBlock = extraToml.trim();
  const experimental = preview.search(/^\[experimental\]\s*$/im);
  if (experimental === -1) {
    if (!nextBlock) return preview;
    const authMarker = preview.search(/^#\s*── .*auth\.json.*──\s*$/im);
    if (authMarker === -1) return `${preview.trimEnd()}\n\n${nextBlock}\n`;
    return `${preview.slice(0, authMarker).trimEnd()}\n\n${nextBlock}\n\n${preview.slice(authMarker)}`;
  }

  const after = preview.slice(experimental + 1);
  const nextSectionOffset = after.search(/^\s*(?:\[|#\s*── .*auth\.json)/im);
  const blockEnd = nextSectionOffset === -1 ? preview.length : experimental + 1 + nextSectionOffset;
  if (!nextBlock) return `${preview.slice(0, experimental).trimEnd()}\n\n${preview.slice(blockEnd).trimStart()}`;
  return `${preview.slice(0, experimental).trimEnd()}\n\n${nextBlock}\n\n${preview.slice(blockEnd).trimStart()}`;
}

function replaceJsonBody(
  text: string,
  update: (body: Record<string, unknown>) => Record<string, unknown>,
): string {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return text;
  }

  try {
    const body = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    const next = JSON.stringify(update(body), null, 2);
    return `${text.slice(0, firstBrace)}${next}${text.slice(lastBrace + 1)}`;
  } catch {
    return text;
  }
}

function replaceEnvLine(text: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedKey}=.*$`, "im");
  const line = `${key}=${value}`;
  if (regex.test(text)) return text.replace(regex, line);
  return `${text.trimEnd()}\n${line}\n`;
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
