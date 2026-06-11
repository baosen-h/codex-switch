import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  FileInput,
  FolderSearch,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { appApi } from "../../api/tauri";
import type {
  CapabilitiesState,
  CapabilitySyncResult,
  CapabilityTargets,
  ConfigValue,
  McpPreset,
  McpServer,
  Skill,
  SkillMarketResult,
} from "../../types";

const emptyTargets = (): CapabilityTargets => ({ codex: false, claude: false, gemini: false });
const emptyServer = (): McpServer => ({
  id: "",
  targetKey: "",
  name: "",
  description: "",
  transport: "stdio",
  command: "",
  args: [],
  workingDirectory: "",
  url: "",
  env: {},
  headers: {},
  targets: emptyTargets(),
  lastTestStatus: "",
  lastTestError: "",
  lastTestAt: "",
  cachedTools: [],
  createdAt: "",
  updatedAt: "",
});
const emptySkill = (): Skill => ({
  id: "",
  name: "",
  description: "",
  instructions: "",
  sourcePath: "",
  sourceKind: "app",
  syncMode: "copy",
  targets: emptyTargets(),
  createdAt: "",
  updatedAt: "",
});

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function syncText(result: CapabilitySyncResult) {
  const failed = result.results.filter((item) => item.status !== "ok");
  return failed.length
    ? failed.map((item) => `${item.agent}: ${item.error}`).join(" | ")
    : "Saved and synced.";
}

function sourceLabels(targets: CapabilityTargets, sourcePath = "") {
  const labels: string[] = [];
  if (targets.codex) labels.push("Codex");
  if (targets.claude) labels.push("Claude");
  if (targets.gemini) labels.push("Gemini");
  const normalizedPath = sourcePath.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath.includes("/.agents/skills/") || normalizedPath.endsWith("/.agents/skills")) {
    labels.push(".agents");
  }
  return labels.length ? labels : ["Local"];
}

function SourceBadges({ labels }: { labels: string[] }) {
  return (
    <span className="capability-source-badges">
      {labels.map((label) => <em key={label}>{label}</em>)}
    </span>
  );
}

function TargetToggles({
  value,
  available,
  onChange,
}: {
  value: CapabilityTargets;
  available: CapabilityTargets;
  onChange: (value: CapabilityTargets) => void;
}) {
  return (
    <div className="capability-targets">
      {(["codex", "claude", "gemini"] as const).map((agent) => (
        <label className={!available[agent] ? "unavailable" : ""} key={agent}>
          <span>{agent[0].toUpperCase() + agent.slice(1)}</span>
          <span className="switch-control">
            <input
              checked={value[agent]}
              disabled={!available[agent]}
              onChange={(event) => onChange({ ...value, [agent]: event.target.checked })}
              type="checkbox"
            />
            <span />
          </span>
        </label>
      ))}
    </div>
  );
}

function ConfigRows({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, ConfigValue>;
  onChange: (value: Record<string, ConfigValue>) => void;
}) {
  const rows = Object.entries(value);
  const update = (oldKey: string, key: string, item: ConfigValue) => {
    const next = { ...value };
    delete next[oldKey];
    if (key.trim()) next[key] = item;
    onChange(next);
  };
  return (
    <section className="capability-kv">
      <div className="capability-subhead">
        <strong>{label}</strong>
        <button
          className="secondary-button icon-action-button"
          onClick={() => onChange({ ...value, [`KEY_${rows.length + 1}`]: { value: "", secret: false, credentialId: "" } })}
          title={`Add ${label}`}
          type="button"
        >
          <Plus size={15} />
        </button>
      </div>
      {rows.length ? rows.map(([key, item]) => (
        <div className="capability-kv-row" key={key}>
          <input value={key} onChange={(event) => update(key, event.target.value, item)} />
          <input
            placeholder={item.secret && item.credentialId ? "Stored securely; enter to replace" : "Value"}
            type={item.secret ? "password" : "text"}
            value={item.value}
            onChange={(event) => update(key, key, { ...item, value: event.target.value })}
          />
          <label title="Store in operating system credential storage">
            <input
              checked={item.secret}
              onChange={(event) => update(key, key, { ...item, secret: event.target.checked })}
              type="checkbox"
            />
            Secret
          </label>
          <button className="danger-button icon-action-button" onClick={() => update(key, "", item)} title="Remove" type="button">
            <X size={14} />
          </button>
        </div>
      )) : <p className="capability-empty-inline">No entries.</p>}
    </section>
  );
}

export function CapabilityManager({
  kind,
  state,
  onReload,
}: {
  kind: "mcp" | "skills";
  state: CapabilitiesState;
  onReload: () => Promise<void>;
}) {
  return (
    kind === "mcp"
      ? <McpManager state={state} onReload={onReload} />
      : <SkillManager state={state} onReload={onReload} />
  );
}

function McpManager({
  state,
  onReload,
}: {
  state: CapabilitiesState;
  onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<McpServer>(state.mcpServers[0] ?? emptyServer());
  const [message, setMessage] = useState("");
  const [discoverMessage, setDiscoverMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = useMemo(
    () => state.mcpServers.filter((server) => server.name.toLowerCase().includes(search.toLowerCase())),
    [search, state.mcpServers],
  );

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const discoverLocal = () => void act(async () => {
    await onReload();
    setDiscoverMessage("Scanned Codex config.toml, Claude .claude.json, and Gemini settings.json. Local MCP servers appear in the list above.");
  });

  const applyPreset = (preset: McpPreset) => setDraft({
    ...emptyServer(),
    name: preset.name,
    description: preset.description,
    transport: preset.transport,
    command: preset.command,
    args: [...preset.args],
    workingDirectory: preset.workingDirectory,
    url: preset.url,
    env: structuredClone(preset.env),
    headers: structuredClone(preset.headers),
  });
  const testReady = Boolean(
    draft.name.trim()
    && (draft.transport === "stdio" ? draft.command.trim() : draft.url.trim()),
  );

  return (
    <div className="capability-manager">
      <div className="capability-manager-body">
        <aside className="capability-manager-list">
          <div className="capability-list-actions">
            <label className="capability-search"><Search size={15} /><input placeholder="Search servers" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <button className="primary-button icon-action-button" onClick={() => setDraft(emptyServer())} title="New server" type="button"><Plus size={16} /></button>
          </div>
          {filtered.map((server) => (
            <button className={`capability-list-item ${server.id === draft.id ? "active" : ""}`} key={server.id} onClick={() => setDraft(structuredClone(server))} type="button">
              <span>
                <strong>{server.name}</strong>
                <small>{server.transport}</small>
                <SourceBadges labels={sourceLabels(server.targets)} />
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          <div className="capability-discovery-list">
            <strong>Discover</strong>
            <button disabled={busy} onClick={discoverLocal} type="button">
              <span><FolderSearch size={14} /> Scan local agents</span>
              <small>Codex · Claude · Gemini</small>
            </button>
            {discoverMessage ? <p>{discoverMessage}</p> : null}
          </div>
          <div className="capability-preset-list">
            <strong>Start from preset</strong>
            {state.mcpPresets.map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)} type="button">
                <span>{preset.name}</span><small>{preset.builtIn ? "Built-in" : "Custom"}</small>
              </button>
            ))}
          </div>
        </aside>
        <main className="capability-editor">
          <div className="capability-form-grid capability-editor-fields">
            <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>Transport</span><select value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as McpServer["transport"] })}><option value="stdio">stdio</option><option value="http">Streamable HTTP</option><option value="sse">Legacy SSE</option></select></label>
            <label className="field field-full"><span>Description</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            {draft.transport === "stdio" ? <>
              <label className="field"><span>Command</span><input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} /></label>
              <label className="field"><span>Working directory</span><input placeholder="${WORKSPACE}" value={draft.workingDirectory} onChange={(event) => setDraft({ ...draft, workingDirectory: event.target.value })} /></label>
              <label className="field field-full"><span>Arguments, one per line</span><textarea rows={4} value={draft.args.join("\n")} onChange={(event) => setDraft({ ...draft, args: event.target.value.split("\n").filter(Boolean) })} /></label>
            </> : <label className="field field-full"><span>URL</span><input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>}
          </div>
          {draft.transport === "stdio"
            ? <ConfigRows label="Environment" value={draft.env} onChange={(env) => setDraft({ ...draft, env })} />
            : <ConfigRows label="Headers" value={draft.headers} onChange={(headers) => setDraft({ ...draft, headers })} />}
          <section className="capability-editor-section"><strong>Enabled agents</strong><TargetToggles value={draft.targets} available={state.availableTargets} onChange={(targets) => setDraft({ ...draft, targets })} /></section>
          {draft.cachedTools.length ? <section className="capability-tool-list"><strong>Tools</strong>{draft.cachedTools.map((tool) => <div key={tool.name}><Code2 size={14} /><span><b>{tool.name}</b><small>{tool.description}</small></span></div>)}</section> : null}
          {message ? <p className={`capability-message ${message.includes("synced") ? "ok" : ""}`}>{message}</p> : null}
          <footer className="capability-editor-actions">
            {draft.id ? <button className="danger-button" disabled={busy} onClick={() => void act(async () => { await appApi.deleteMcpServer(draft.id); setDraft(emptyServer()); await onReload(); })} type="button"><Trash2 size={15} /> Delete</button> : <span />}
            <div>
              <button className="secondary-button" disabled={busy || !testReady} title={testReady ? "Start the server and request its tool list" : "Enter a name and command or URL first"} onClick={() => void act(async () => { const result = await appApi.testMcpServer(draft); setMessage(result.status === "ok" ? `Server started. ${result.tools.length} tools found.` : result.error); setDraft({ ...draft, cachedTools: result.tools, lastTestStatus: result.status, lastTestError: result.error, lastTestAt: result.testedAt }); })} type="button"><FlaskConical size={15} /> Test server</button>
              <button className="primary-button" disabled={busy} onClick={() => void act(async () => { const [saved, sync] = await appApi.saveMcpServer(draft); setDraft(saved); setMessage(syncText(sync)); await onReload(); })} type="button"><Save size={15} /> Save</button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function SkillManager({
  state,
  onReload,
}: {
  state: CapabilitiesState;
  onReload: () => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [marketResults, setMarketResults] = useState<SkillMarketResult[]>([]);
  const [draft, setDraft] = useState<Skill>(state.skills[0] ?? emptySkill());
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [marketMessage, setMarketMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const previewReady = Boolean(draft.name.trim() && draft.instructions.trim());

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const searchMarket = () => void act(async () => {
    const query = search.trim();
    setMarketMessage("");
    if (!query) {
      setMarketResults([]);
      setMarketMessage("Enter a market search term.");
      return;
    }

    const results = await appApi.searchSkillMarket(query);
    setMarketResults(results);
    setMarketMessage(results.length ? `${results.length} market Skills found.` : "No market Skills found.");
  });

  return (
    <div className="capability-manager">
      <div className="capability-manager-body">
        <aside className="capability-manager-list">
          <div className="capability-list-actions">
            <label className="capability-search">
              <Search size={15} />
              <input
                placeholder="Search Skills market"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchMarket();
                }}
              />
            </label>
            <button className="primary-button icon-action-button" onClick={() => setDraft(emptySkill())} title="New skill" type="button"><Plus size={16} /></button>
          </div>
          {state.skills.map((skill) => (
            <button className={`capability-list-item ${skill.id === draft.id ? "active" : ""}`} key={skill.id} onClick={() => { setDraft(structuredClone(skill)); setPreview(""); }} type="button">
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.sourceKind === "external" ? "Reference" : "Managed"}</small>
                <SourceBadges labels={sourceLabels(skill.targets, skill.sourcePath)} />
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          <div className="capability-discovery-list">
            <strong>Market</strong>
            <button disabled={busy} onClick={searchMarket} type="button">
              <span><Search size={14} /> Search market</span>
              <small>skills.sh</small>
            </button>
            <button disabled={busy} onClick={() => void act(async () => { const path = await appApi.pickDirectory(); if (!path) return; const [skill, sync] = await appApi.importSkill(path); setDraft(skill); setMessage(syncText(sync)); await onReload(); })} type="button">
              <span><FileInput size={14} /> Import folder</span>
              <small>Use external folder</small>
            </button>
            {marketMessage ? <p>{marketMessage}</p> : null}
            {marketResults.map((skill) => (
              <button key={skill.id} onClick={() => void appApi.openExternalUrl(skill.url)} type="button">
                <span><ExternalLink size={14} /> {skill.name}</span>
                <small>{skill.source || "skills.sh"} · {skill.installs.toLocaleString()} installs</small>
              </button>
            ))}
          </div>
        </aside>
        <main className="capability-editor">
          <div className="capability-form-grid capability-editor-fields">
            <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>Source</span><input disabled value={draft.sourceKind === "external" ? "External reference" : "Managed by codex-switch"} /></label>
            <label className="field field-full"><span>Description</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="field field-full"><span>Instructions</span><textarea className="capability-skill-editor" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></label>
          </div>
          {draft.sourcePath ? <p className="capability-source-path">{draft.sourcePath}</p> : null}
          <section className="capability-editor-section"><strong>Enabled agents</strong><TargetToggles value={draft.targets} available={state.availableTargets} onChange={(targets) => setDraft({ ...draft, targets })} /></section>
          {preview ? <pre className="capability-preview capability-skill-preview">{preview}</pre> : null}
          {message ? <p className={`capability-message ${message.includes("synced") ? "ok" : ""}`}>{message}</p> : null}
          <footer className="capability-editor-actions">
            {draft.id ? <button className="danger-button" disabled={busy} onClick={() => void act(async () => { await appApi.deleteSkill(draft.id); setDraft(emptySkill()); await onReload(); })} type="button"><Trash2 size={15} /> Delete</button> : <span />}
            <div>
              <button className="secondary-button" disabled={busy || !previewReady} title={previewReady ? "Show the exact SKILL.md that will be written" : "Enter a name and instructions first"} onClick={() => void act(async () => setPreview(await appApi.previewSkill(draft)))} type="button"><Code2 size={15} /> View .md</button>
              <button className="secondary-button" disabled={busy} onClick={() => void act(async () => { const sync = await appApi.syncSkillCapabilities(); setMessage(syncText(sync)); await onReload(); })} type="button"><RefreshCw size={15} /> Sync all</button>
              <button className="primary-button" disabled={busy} onClick={() => void act(async () => { const [saved, sync] = await appApi.saveSkill(draft); setDraft(saved); setMessage(syncText(sync)); await onReload(); })} type="button"><CheckCircle2 size={15} /> Save</button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
