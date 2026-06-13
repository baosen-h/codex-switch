import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Code2,
  Download,
  ExternalLink,
  FileInput,
  FolderSearch,
  FlaskConical,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { appApi } from "../../api/tauri";
import { iconForAgent } from "../../components/domain";
import { useI18n } from "../../i18n/context";
import type {
  AgentKind,
  CapabilitiesState,
  CapabilitySyncResult,
  CapabilityTargets,
  ConfigValue,
  MarketplaceCapability,
  MarketplaceResult,
  MarketplaceSource,
  MarketplaceSourceStatus,
  McpPreset,
  McpServer,
  SkillMarketPreview,
  Skill,
} from "../../types";
import type { TranslationKey } from "../../i18n/translations";

const agentLabels: Record<AgentKind, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

const formatText = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    template,
  );

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

const emptySource = (capabilityType: MarketplaceCapability): MarketplaceSource => ({
  id: "",
  capabilityType,
  name: "",
  sourceType: capabilityType === "mcp" ? "mcp_registry" : "skill_feed",
  baseUrl: "",
  enabled: true,
  sortOrder: 100,
  builtIn: false,
  credentialId: "",
  hasCredential: false,
});

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function syncText(result: CapabilitySyncResult, savedText: string) {
  const failed = result.results.filter((item) => item.status !== "ok");
  return failed.length
    ? failed.map((item) => `${item.agent}: ${item.error}`).join(" | ")
    : savedText;
}

function sourceLabels(targets: CapabilityTargets, localLabel: string, sourcePath = "") {
  const labels: string[] = [];
  if (targets.codex) labels.push("Codex");
  if (targets.claude) labels.push("Claude");
  if (targets.gemini) labels.push("Gemini");
  const normalizedPath = sourcePath.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath.includes("/.agents/skills/") || normalizedPath.endsWith("/.agents/skills")) {
    labels.push(".agents");
  }
  return labels.length ? labels : [localLabel];
}

function SourceBadges({ labels }: { labels: string[] }) {
  return (
    <span className="capability-source-badges">
      {labels.map((label) => {
        const agent = label.toLowerCase() as AgentKind;
        const hasAgentIcon = agent === "codex" || agent === "claude" || agent === "gemini";
        return (
          <em key={label}>
            {hasAgentIcon ? iconForAgent(agent) : null}
            {label}
          </em>
        );
      })}
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
          <span className="capability-target-label">
            {iconForAgent(agent)}
            {agentLabels[agent]}
          </span>
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

function CapabilityProgress({ label }: { label: string }) {
  return (
    <div className="capability-progress" role="status">
      <span className="capability-progress-label">{label}</span>
      <span className="capability-progress-bar" />
    </div>
  );
}

function ConfigRows({
  label,
  value,
  onChange,
  t,
  secureByDefault = false,
}: {
  label: string;
  value: Record<string, ConfigValue>;
  onChange: (value: Record<string, ConfigValue>) => void;
  t: (key: TranslationKey) => string;
  secureByDefault?: boolean;
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
          className="add-button add-button-compact"
          onClick={() => onChange({ ...value, [`KEY_${rows.length + 1}`]: { value: "", secret: secureByDefault, credentialId: "", template: "" } })}
          title={t("addEntry")}
          type="button"
        >
          <Plus size={15} />
        </button>
      </div>
      {rows.length ? rows.map(([key, item]) => (
        <div className="capability-kv-row" key={key}>
          <input value={key} onChange={(event) => update(key, event.target.value, item)} />
          <input
            placeholder={item.secret && item.credentialId ? t("storedSecurelyPlaceholder") : t("value")}
            type={item.secret ? "password" : "text"}
            value={item.value}
            onChange={(event) => update(key, key, { ...item, value: event.target.value })}
          />
          <button className="danger-button icon-action-button" onClick={() => update(key, "", item)} title={t("remove")} type="button">
            <X size={14} />
          </button>
        </div>
      )) : <p className="capability-empty-inline">{t("noEntries")}</p>}
    </section>
  );
}

function MarketplaceResults({
  results,
  statuses,
  busy,
  onSelect,
}: {
  results: MarketplaceResult[];
  statuses: MarketplaceSourceStatus[];
  busy: boolean;
  onSelect: (result: MarketplaceResult) => void;
}) {
  const { t } = useI18n();
  const [sourceFilter, setSourceFilter] = useState("all");
  const visibleResults = sourceFilter === "all"
    ? results
    : results.filter((result) => result.sourceIds.includes(sourceFilter));

  return (
    <div className="capability-search-results marketplace-results">
      {statuses.length > 1 ? (
        <select aria-label={t("filterBySource")} value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">{t("allSources")}</option>
          {statuses.map((source) => <option key={source.sourceId} value={source.sourceId}>{source.sourceName}</option>)}
        </select>
      ) : null}
      {busy ? <p>{t("searchingSources")}</p> : null}
      {statuses.some((source) => source.status !== "ok") ? (
        <p className="marketplace-partial-warning">
          <AlertTriangle size={12} />
          {t("partialSourceFailure")}
        </p>
      ) : null}
      {visibleResults.map((result) => (
        <button key={result.id} onClick={() => onSelect(result)} type="button">
          <span>{result.name}</span>
        </button>
      ))}
      {!busy && statuses.length > 0 && visibleResults.length === 0 ? <p>{t("noMarketplaceResults")}</p> : null}
    </div>
  );
}

function SourceManager({
  capabilityType,
}: {
  capabilityType: MarketplaceCapability;
}) {
  const { t } = useI18n();
  const [sources, setSources] = useState<MarketplaceSource[]>([]);
  const [draft, setDraft] = useState<MarketplaceSource>(() => emptySource(capabilityType));
  const [credential, setCredential] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const nextSources = await appApi.getMarketplaceSources(capabilityType);
    setSources(nextSources);
    setDraft((current) => {
      if (current.id) {
        return nextSources.find((source) => source.id === current.id) ?? current;
      }
      return nextSources[0] ? { ...nextSources[0] } : emptySource(capabilityType);
    });
  };
  useEffect(() => {
    setDraft(emptySource(capabilityType));
    setCredential("");
    setMessage("");
    void load().catch((error) => setMessage(errorText(error)));
  }, [capabilityType]);

  const sourceTypes = capabilityType === "mcp"
    ? [{ value: "mcp_registry", label: "MCP Registry API" }]
    : [
      { value: "skill_feed", label: "Codex Switch JSON feed" },
      { value: "github_repo", label: "GitHub repository" },
      { value: "skills_sh", label: "skills.sh compatible" },
      { value: "claude_plugins", label: "claude-plugins compatible" },
      { value: "clawhub", label: "ClawHub compatible" },
      { value: "hermes_index", label: "Hermes Skills Index" },
    ];
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

  return (
    <section className="capability-inline-editor">
      <div className="source-manager-layout">
        <div className="source-manager-list">
          {sources.map((source) => (
            <button
              className={source.id === draft.id ? "active" : ""}
              key={source.id}
              onClick={() => { setDraft({ ...source }); setCredential(""); setMessage(""); }}
              type="button"
            >
              <span>{source.name}</span>
              <small>{source.sourceType}{source.enabled ? "" : ` · ${t("disabled")}`}</small>
            </button>
          ))}
          <button onClick={() => setDraft(emptySource(capabilityType))} type="button"><Plus size={13} /> {t("addSource")}</button>
        </div>
        <div className="source-manager-form">
          <label className="field field-full"><span>{t("name")}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field field-full"><span>{t("type")}</span><select disabled={draft.builtIn} value={draft.sourceType} onChange={(event) => setDraft({ ...draft, sourceType: event.target.value })}>{sourceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field field-full"><span>{t("baseUrl")}</span><input disabled={draft.builtIn} placeholder="https://..." value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /></label>
          <label className="field field-full"><span>{t("optionalApiToken")}</span><input type="password" placeholder={draft.hasCredential ? t("storedSecurelyPlaceholder") : ""} value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
          {message ? <p className="capability-message">{message}</p> : null}
          <footer className="capability-editor-actions">
            {draft.id && !draft.builtIn ? <button className="danger-button" disabled={busy} onClick={() => {
              if (!window.confirm(t("confirmDeleteSource"))) return;
              void act(async () => { await appApi.deleteMarketplaceSource(draft.id); setDraft(emptySource(capabilityType)); await load(); });
            }} type="button"><Trash2 size={14} /> {t("remove")}</button> : <span />}
            <div>
              <button className="secondary-button" disabled={busy} onClick={() => void act(async () => { await appApi.testMarketplaceSource(draft, credential); setMessage(t("sourceTestSucceeded")); })} type="button"><FlaskConical size={14} /> {t("test")}</button>
              <button className="primary-button" disabled={busy} onClick={() => void act(async () => { const saved = await appApi.saveMarketplaceSource(draft, credential); setDraft(saved); setCredential(""); await load(); setMessage(t("sourceSaved")); })} type="button"><Save size={14} /> {t("save")}</button>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}

function SkillInstallReview({
  result,
  available,
  initialTargets,
  onClose,
  onInstalled,
}: {
  result: MarketplaceResult | null;
  available: CapabilityTargets;
  initialTargets: CapabilityTargets;
  onClose: () => void;
  onInstalled: (targets: CapabilityTargets) => Promise<void>;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<SkillMarketPreview | null>(null);
  const [targets, setTargets] = useState(initialTargets);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!result) return;
    setPreview(null);
    setTargets(initialTargets);
    setMessage("");
    setBusy(false);
  }, [result]);
  if (!result) return null;

  return (
    <section className="capability-inline-editor install-review-modal">
        <header className="capability-inline-header">
          <div><strong>{result.name}</strong><small>{result.sourceName} · {result.version || t("pinnedArtifact")}</small></div>
        </header>
        <div className="install-review-body capability-inline-body">
          {result.description ? <p className="install-review-description">{result.description}</p> : null}
          {result.sourceUrl ? <button className="link-button" onClick={() => void appApi.openExternalUrl(result.sourceUrl)} type="button"><ExternalLink size={13} /> {t("viewSource")}</button> : null}
          {result.warnings.map((warning) => <p className="marketplace-warning" key={warning}><AlertTriangle size={13} /> {warning}</p>)}
          <section><strong>{t("targetAgents")}</strong><TargetToggles value={targets} available={available} onChange={setTargets} /></section>
          {busy ? <CapabilityProgress label={t("downloadingArtifact")} /> : null}
          {preview ? (
            <div className="skill-preview-grid">
              <pre>{preview.instructions}</pre>
              <div><strong>{formatText(t("filesCount"), { count: preview.files.length })}</strong>{preview.files.map((file) => <small key={file}>{file}</small>)}</div>
            </div>
          ) : null}
          {message ? <p className="capability-message">{message}</p> : null}
        </div>
        <footer className="capability-editor-actions">
          <button className="secondary-button" onClick={onClose} type="button">{t("cancel")}</button>
          <div>
            {!preview ? <button aria-label={t("downloadAndPreview")} className="secondary-button" disabled={busy} onClick={() => void (async () => {
              setBusy(true);
              setMessage("");
              try {
                setPreview(await appApi.previewMarketplaceSkill(result));
              } catch (error) {
                setMessage(errorText(error));
              } finally {
                setBusy(false);
              }
            })()} title={t("downloadAndPreview")} type="button"><Download size={14} /> {t("download")}</button> : null}
            <button aria-label={t("installPinnedVersion")} className="primary-button" disabled={busy || !preview || !Object.values(targets).some(Boolean)} onClick={() => void (async () => {
              setBusy(true);
              setMessage("");
              try {
                const [, sync] = await appApi.installMarketplaceSkill({ result, targets, env: {}, headers: {} });
                localStorage.setItem("capability-last-targets", JSON.stringify(targets));
                await onInstalled(targets);
                if (sync.results.some((item) => item.status !== "ok")) setMessage(syncText(sync, t("installed")));
              } catch (error) {
                setMessage(errorText(error));
              } finally {
                setBusy(false);
              }
            })()} title={t("installPinnedVersion")} type="button"><Download size={14} /> {t("install")}</button>
          </div>
        </footer>
    </section>
  );
}

function rememberedTargets(available: CapabilityTargets): CapabilityTargets {
  try {
    const saved = JSON.parse(localStorage.getItem("capability-last-targets") || "{}") as Partial<CapabilityTargets>;
    return {
      codex: Boolean(saved.codex && available.codex),
      claude: Boolean(saved.claude && available.claude),
      gemini: Boolean(saved.gemini && available.gemini),
    };
  } catch {
    return { codex: available.codex, claude: false, gemini: false };
  }
}

function McpJsonImport({
  value,
  servers,
  message,
  busy,
  onChange,
  onParse,
  onSelect,
}: {
  value: string;
  servers: McpServer[];
  message: string;
  busy: boolean;
  onChange: (value: string) => void;
  onParse: () => void;
  onSelect: (server: McpServer) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="capability-inline-editor">
      <div className="capability-inline-body json-import-panel">
        <label className="field field-full">
          <span>{t("stepPasteJson")}</span>
          <textarea
            rows={13}
            placeholder={'{"mcpServers":{"example":{"command":"npx","args":["-y","package"]}}}'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <div className="json-import-parse-row">
          <small>{t("jsonImportNoSave")}</small>
          <button className="primary-button" disabled={busy || !value.trim()} onClick={onParse} type="button">{t("parseAndReview")}</button>
        </div>
        {message ? <p className="capability-message">{message}</p> : null}
        {servers.length ? (
          <section className="json-import-results">
            <strong>{t("stepSelectServer")}</strong>
            <small>{t("selectServerHint")}</small>
            {servers.map((server) => (
              <button key={server.name} onClick={() => onSelect(server)} type="button">
                <span><b>{server.name}</b><small>{server.command || server.url}</small></span>
                <span>{server.transport}<ChevronRight size={14} /></span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
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
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [searchScope, setSearchScope] = useState<"market" | "local">("local");
  const [marketResults, setMarketResults] = useState<MarketplaceResult[]>([]);
  const [marketStatuses, setMarketStatuses] = useState<MarketplaceSourceStatus[]>([]);
  const [marketSelection, setMarketSelection] = useState<MarketplaceResult | null>(null);
  const [editorMode, setEditorMode] = useState<"server" | "sources" | "json">("server");
  const [jsonInput, setJsonInput] = useState("");
  const [jsonImportServers, setJsonImportServers] = useState<McpServer[]>([]);
  const [draft, setDraft] = useState<McpServer>(state.mcpServers[0] ?? emptyServer());
  const [message, setMessage] = useState("");
  const [discoverMessage, setDiscoverMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const filtered = useMemo(
    () => state.mcpServers.filter((server) => searchScope !== "local" || server.name.toLowerCase().includes(search.toLowerCase())),
    [search, searchScope, state.mcpServers],
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
    setDiscoverMessage(t("localAgentsScanned"));
  });

  const searchMarket = () => void act(async () => {
    const response = await appApi.searchMarketplace("mcp", search.trim());
    setMarketResults(response.results);
    setMarketStatuses(response.sources);
  });

  const selectMarketResult = (result: MarketplaceResult) => {
    const spec = result.installSpec;
    const env = Object.fromEntries(spec.envKeys.map((key) => [key, { value: "", secret: true, credentialId: "", template: "" }]));
    const headers = Object.fromEntries(spec.headerKeys.map((key) => [key, {
      value: "",
      secret: true,
      credentialId: "",
      template: spec.headerTemplates?.[key] ?? "",
    }]));
    setMarketSelection(result);
    setEditorMode("server");
    setDraft({
      ...emptyServer(),
      name: result.name,
      description: result.description,
      transport: (spec.transport || "stdio") as McpServer["transport"],
      command: spec.command,
      args: [...spec.args],
      url: spec.url,
      env,
      headers,
      targets: rememberedTargets(state.availableTargets),
    });
  };

  const applyPreset = (preset: McpPreset) => {
    setEditorMode("server");
    setMarketSelection(null);
    setDraft({
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
  };
  const testReady = Boolean(
    draft.name.trim()
    && (draft.transport === "stdio" ? draft.command.trim() : draft.url.trim()),
  );
  const requiredMarketplaceConfigReady = !marketSelection
    || (marketSelection.installSpec.requiredHeaderKeys ?? []).every((key) => {
      const item = draft.headers[key];
      return Boolean(item && (item.value.trim() || item.credentialId.trim()));
    });

  return (
    <div className="capability-manager">
      <div className="capability-manager-body">
        <aside className="capability-manager-list">
          <div className="capability-list-actions capability-list-actions-search-only">
            <label className={`capability-search capability-search-with-select ${busy && searchScope === "market" ? "loading" : ""}`}>
              <Search size={15} />
              <select value={searchScope} onChange={(event) => { const scope = event.target.value as "market" | "local"; setSearchScope(scope); setMarketResults([]); setMarketStatuses([]); }}>
                <option value="market">{t("searchScopeMarket")}</option>
                <option value="local">{t("searchScopeLocal")}</option>
              </select>
              <input placeholder={t("searchServers")} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchScope === "market") searchMarket(); }} />
            </label>
          </div>
          {searchScope === "market" ? <MarketplaceResults results={marketResults} statuses={marketStatuses} busy={busy} onSelect={selectMarketResult} /> : null}
          {searchScope === "local" && filtered.map((server) => (
            <button className={`capability-list-item ${server.id === draft.id && editorMode === "server" ? "active" : ""}`} key={server.id} onClick={() => { setEditorMode("server"); setMarketSelection(null); setDraft(structuredClone(server)); }} type="button">
              <span>
                <strong>{server.name}</strong>
                <small>{server.transport}</small>
                <SourceBadges labels={sourceLabels(server.targets, t("local"))} />
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          <div className="capability-discovery-list">
            <strong>{t("discover")}</strong>
            <button disabled={busy} onClick={discoverLocal} type="button">
              <span><FolderSearch size={14} /> {t("scanLocalAgents")}</span>
            </button>
            {discoverMessage ? <p>{discoverMessage}</p> : null}
            <button onClick={() => { setEditorMode("server"); setMarketSelection(null); setDraft(emptyServer()); }} type="button"><span><Plus size={14} /> {t("newServer")}</span></button>
            <button onClick={() => { setEditorMode("json"); setJsonImportServers([]); setMessage(""); }} type="button"><span><FileInput size={14} /> {t("importMcpJson")}</span></button>
            <button onClick={() => setEditorMode("sources")} type="button"><span><PackageOpen size={14} /> {t("manageMcpMarkets")}</span></button>
          </div>
          <div className="capability-preset-list">
            <strong>{t("startFromPreset")}</strong>
            {state.mcpPresets.map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)} type="button">
                <span>{preset.name}</span><small>{preset.builtIn ? t("builtIn") : t("custom")}</small>
              </button>
            ))}
          </div>
        </aside>
        <main className="capability-editor">
          {editorMode === "sources" ? <SourceManager capabilityType="mcp" /> : null}
          {editorMode === "json" ? (
            <McpJsonImport
              value={jsonInput}
              servers={jsonImportServers}
              message={message}
              busy={busy}
              onChange={setJsonInput}
              onParse={() => void act(async () => {
                const preview = await appApi.previewMcpJson(jsonInput);
                setJsonImportServers(preview.servers);
                setMessage(preview.errors.length ? preview.errors.join(" | ") : formatText(t("serversParsed"), { count: preview.servers.length }));
              })}
              onSelect={(server) => {
                setDraft({ ...server, targets: rememberedTargets(state.availableTargets) });
                setMarketSelection(null);
                setEditorMode("server");
                setMessage(t("reviewImportedServer"));
              }}
            />
          ) : null}
          {editorMode === "server" ? <>
          {marketSelection ? (
            <div className="marketplace-review-banner">
              <span>
                <PackageOpen size={15} />
                <b>{t("marketplaceDraft")}</b> {t("reviewBeforeInstall")}
                {marketSelection.warnings.map((warning) => <small key={warning}>{warning}</small>)}
              </span>
              {marketSelection.sourceUrl ? <button className="link-button" onClick={() => void appApi.openExternalUrl(marketSelection.sourceUrl)} type="button"><ExternalLink size={13} /> {t("source")}</button> : null}
            </div>
          ) : null}
          <div className="capability-form-grid capability-editor-fields">
            <label className="field"><span>{t("name")}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>{t("transport")}</span><select value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as McpServer["transport"] })}><option value="stdio">stdio</option><option value="http">Streamable HTTP</option><option value="sse">Legacy SSE</option></select></label>
            <label className="field field-full"><span>{t("description")}</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            {draft.transport === "stdio" ? <>
              <label className="field"><span>{t("command")}</span><input value={draft.command} onChange={(event) => setDraft({ ...draft, command: event.target.value })} /></label>
              <label className="field"><span>{t("workingDirectory")}</span><input placeholder="${WORKSPACE}" value={draft.workingDirectory} onChange={(event) => setDraft({ ...draft, workingDirectory: event.target.value })} /></label>
              <label className="field field-full"><span>{t("argumentsOnePerLine")}</span><textarea rows={4} value={draft.args.join("\n")} onChange={(event) => setDraft({ ...draft, args: event.target.value.split("\n").filter(Boolean) })} /></label>
            </> : <label className="field field-full"><span>{t("url")}</span><input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>}
          </div>
          {draft.transport === "stdio"
            ? <ConfigRows label={t("environment")} value={draft.env} onChange={(env) => setDraft({ ...draft, env })} t={t} />
            : <ConfigRows label={t("headers")} value={draft.headers} onChange={(headers) => setDraft({ ...draft, headers })} secureByDefault t={t} />}
          <section className="capability-editor-section"><strong>{t("enabledAgents")}</strong><TargetToggles value={draft.targets} available={state.availableTargets} onChange={(targets) => setDraft({ ...draft, targets })} /></section>
          {draft.cachedTools.length ? <section className="capability-tool-list"><strong>{t("tools")}</strong>{draft.cachedTools.map((tool) => <div key={tool.name}><Code2 size={14} /><span><b>{tool.name}</b><small>{tool.description}</small></span></div>)}</section> : null}
          {testing ? (
            <div className="mcp-test-progress" aria-label={t("testingServer")}>
              <span className="mcp-test-progress-bar" />
              <span>{t("testingServer")}</span>
            </div>
          ) : null}
          {message ? <p className={`capability-message ${message.includes("synced") ? "ok" : ""}`}>{message}</p> : null}
          <footer className="capability-editor-actions">
            {draft.id ? <button className="danger-button" disabled={busy} onClick={() => {
              if (!window.confirm(t("confirmDeleteMcp"))) return;
              void act(async () => { await appApi.deleteMcpServer(draft.id); setDraft(emptyServer()); await onReload(); });
            }} type="button"><Trash2 size={15} /> {t("delete")}</button> : <span />}
            <div>
              <button className="secondary-button" disabled={busy || testing || !testReady || !requiredMarketplaceConfigReady} title={testReady && requiredMarketplaceConfigReady ? t("testServerHint") : t("testServerMissingHint")} onClick={() => void (async () => {
                setTesting(true);
                setMessage("");
                try {
                  const result = await appApi.testMcpServer(draft);
                  setMessage(result.status === "ok" ? formatText(t("serverStarted"), { count: result.tools.length }) : result.error);
                  setDraft((current) => ({ ...current, cachedTools: result.tools, lastTestStatus: result.status, lastTestError: result.error, lastTestAt: result.testedAt }));
                } catch (error) {
                  setMessage(errorText(error));
                } finally {
                  setTesting(false);
                }
              })()} type="button"><FlaskConical size={15} /> {testing ? t("testing") : t("testServer")}</button>
              {marketSelection ? (
                <button className="primary-button" disabled={busy || !requiredMarketplaceConfigReady || !Object.values(draft.targets).some(Boolean)} onClick={() => void act(async () => {
                  const [saved, sync] = await appApi.installMarketplaceMcp({ result: marketSelection, targets: draft.targets, env: draft.env, headers: draft.headers });
                  localStorage.setItem("capability-last-targets", JSON.stringify(draft.targets));
                  setDraft(saved);
                  setMarketSelection(null);
                  setMessage(syncText(sync, t("savedAndSynced")));
                  await onReload();
                })} type="button"><Download size={15} /> {t("install")}</button>
              ) : (
                <button className="primary-button" disabled={busy} onClick={() => void act(async () => { const [saved, sync] = await appApi.saveMcpServer(draft); setDraft(saved); setMessage(syncText(sync, t("savedAndSynced"))); await onReload(); })} type="button"><Save size={15} /> {t("save")}</button>
              )}
            </div>
          </footer>
          </> : null}
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
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [searchScope, setSearchScope] = useState<"market" | "local">("market");
  const [marketResults, setMarketResults] = useState<MarketplaceResult[]>([]);
  const [marketStatuses, setMarketStatuses] = useState<MarketplaceSourceStatus[]>([]);
  const [reviewResult, setReviewResult] = useState<MarketplaceResult | null>(null);
  const [editorMode, setEditorMode] = useState<"skill" | "sources" | "review">("skill");
  const [draft, setDraft] = useState<Skill>(state.skills[0] ?? emptySkill());
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  const [marketMessage, setMarketMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const previewReady = Boolean(draft.name.trim() && draft.instructions.trim());
  const filteredSkills = useMemo(
    () => state.skills.filter((skill) => {
      if (searchScope !== "local") return true;
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [skill.name, skill.description, skill.instructions, skill.sourcePath]
        .some((value) => value.toLowerCase().includes(query));
    }),
    [search, searchScope, state.skills],
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

  const searchMarket = () => void act(async () => {
    const query = search.trim();
    setMarketMessage("");
    if (!query) {
      setMarketResults([]);
      setMarketMessage(t("enterMarketSearchTerm"));
      return;
    }

    const response = await appApi.searchMarketplace("skills", query);
    setMarketResults(response.results);
    setMarketStatuses(response.sources);
    setMarketMessage(response.results.length
      ? formatText(t("marketSkillsFound"), { count: response.results.length })
      : t("noMarketSkillsFound"));
  });

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searchScope === "market") searchMarket();
  };

  return (
    <div className="capability-manager">
      <div className="capability-manager-body">
        <aside className="capability-manager-list">
          <div className="capability-list-actions capability-list-actions-search-only">
            <label className={`capability-search capability-search-with-select ${busy && searchScope === "market" ? "loading" : ""}`}>
              <Search size={15} />
              <select
                aria-label={t("search")}
                value={searchScope}
                onChange={(event) => {
                  const nextScope = event.target.value as "market" | "local";
                  setSearchScope(nextScope);
                  setMarketMessage("");
                  if (nextScope === "local") { setMarketResults([]); setMarketStatuses([]); }
                }}
              >
                <option value="market">{t("searchScopeMarket")}</option>
                <option value="local">{t("searchScopeLocal")}</option>
              </select>
              <input
                placeholder={t("searchSkills")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </label>
          </div>
          {searchScope === "market" && (marketResults.length || marketMessage || marketStatuses.length) ? <MarketplaceResults results={marketResults} statuses={marketStatuses} busy={busy} onSelect={(result) => { setReviewResult(result); setEditorMode("review"); }} /> : null}
          {filteredSkills.map((skill) => (
            <button className={`capability-list-item ${skill.id === draft.id && editorMode === "skill" ? "active" : ""}`} key={skill.id} onClick={() => { setEditorMode("skill"); setReviewResult(null); setDraft(structuredClone(skill)); setPreview(""); }} type="button">
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.sourceKind === "external" ? t("reference") : t("managed")}</small>
                <SourceBadges labels={sourceLabels(skill.targets, t("local"), skill.sourcePath)} />
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          <div className="capability-discovery-list">
            <strong>{t("discover")}</strong>
            <button onClick={() => { setEditorMode("skill"); setReviewResult(null); setDraft(emptySkill()); }} type="button"><span><Plus size={14} /> {t("newSkill")}</span></button>
            <button disabled={busy} onClick={() => void act(async () => { const path = await appApi.pickDirectory(); if (!path) return; const [skill, sync] = await appApi.importSkill(path); setEditorMode("skill"); setReviewResult(null); setDraft(skill); setMessage(syncText(sync, t("savedAndSynced"))); await onReload(); })} type="button">
              <span><FileInput size={14} /> {t("importFolder")}</span>
            </button>
            <button onClick={() => setEditorMode("sources")} type="button"><span><PackageOpen size={14} /> {t("manageSkillMarkets")}</span></button>
          </div>
        </aside>
        <main className="capability-editor">
          {editorMode === "sources" ? <SourceManager capabilityType="skills" /> : null}
          {editorMode === "review" ? (
            <SkillInstallReview
              result={reviewResult}
              available={state.availableTargets}
              initialTargets={rememberedTargets(state.availableTargets)}
              onClose={() => { setReviewResult(null); setEditorMode("skill"); }}
              onInstalled={async () => {
                setReviewResult(null);
                setEditorMode("skill");
                await onReload();
              }}
            />
          ) : null}
          {editorMode === "skill" ? <>
          <div className="capability-form-grid capability-editor-fields">
            <label className="field"><span>{t("name")}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field"><span>{t("source")}</span><input disabled value={draft.sourceKind === "external" ? t("externalReference") : t("managedByApp")} /></label>
            <label className="field field-full"><span>{t("description")}</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="field field-full"><span>{t("instructions")}</span><textarea className="capability-skill-editor" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></label>
          </div>
          {draft.sourcePath ? <p className="capability-source-path">{draft.sourcePath}</p> : null}
          <section className="capability-editor-section"><strong>{t("enabledAgents")}</strong><TargetToggles value={draft.targets} available={state.availableTargets} onChange={(targets) => setDraft({ ...draft, targets })} /></section>
          {preview ? <pre className="capability-preview capability-skill-preview">{preview}</pre> : null}
          {message ? <p className={`capability-message ${message.includes("synced") ? "ok" : ""}`}>{message}</p> : null}
          <footer className="capability-editor-actions">
            {draft.id ? <button className="danger-button" disabled={busy} onClick={() => {
              if (!window.confirm(t("confirmDeleteSkill"))) return;
              void act(async () => { await appApi.deleteSkill(draft.id); setDraft(emptySkill()); await onReload(); });
            }} type="button"><Trash2 size={15} /> {t("delete")}</button> : <span />}
            <div>
              <button className="secondary-button" disabled={busy || !previewReady} title={previewReady ? t("viewMarkdownHint") : t("viewMarkdownMissingHint")} onClick={() => void act(async () => setPreview(await appApi.previewSkill(draft)))} type="button"><Code2 size={15} /> {t("viewMarkdown")}</button>
              <button className="secondary-button" disabled={busy} onClick={() => void act(async () => { const sync = await appApi.syncSkillCapabilities(); setMessage(syncText(sync, t("savedAndSynced"))); await onReload(); })} type="button"><RefreshCw size={15} /> {t("syncAll")}</button>
              <button className="primary-button" disabled={busy} onClick={() => void act(async () => { const [saved, sync] = await appApi.saveSkill(draft); setDraft(saved); setMessage(syncText(sync, t("savedAndSynced"))); await onReload(); })} type="button"><CheckCircle2 size={15} /> {t("save")}</button>
            </div>
          </footer>
          </> : null}
        </main>
      </div>
    </div>
  );
}
