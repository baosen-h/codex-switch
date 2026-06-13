import { expect, test, type Page } from "@playwright/test";

async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("codex-switch-guide-seen", "true");
    const mockSettingsOverride = window.localStorage.getItem("codex-switch-ui-test-settings");
    const apiProviders = [
      {
        id: "api-openai",
        name: "codex official",
        providerType: "openai",
        wireApi: "responses",
        baseUrl: "",
        apiKey: "",
        websiteUrl: "https://chatgpt.com",
        openAiAuthJson: JSON.stringify({ access_token: "mock" }),
        models: [
          { id: "gpt-5.1-codex", inputModalities: ["text", "file", "image"], outputModalities: ["text"] },
          { id: "gpt-5.1", inputModalities: ["text", "file", "image"], outputModalities: ["text"] },
          { id: "o4-mini", inputModalities: ["text"], outputModalities: ["text"] },
          { id: "gpt-image-1", capabilities: ["image_generation"], inputModalities: ["text", "image"], outputModalities: ["image"] },
        ],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "api-deepseek",
        name: "DeepSeek",
        providerType: "openai-compatible",
        wireApi: "chat",
        baseUrl: "https://api.deepseek.com",
        apiKey: "",
        websiteUrl: "https://api.deepseek.com",
        models: [
          { id: "deepseek-chat", inputModalities: ["text"], outputModalities: ["text"] },
          { id: "deepseek-reasoner", inputModalities: ["text"], outputModalities: ["text"] },
        ],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "api-mimo",
        name: "MiMo",
        providerType: "anthropic-compatible",
        wireApi: "chat",
        baseUrl: "https://api.xiaomimimo.com/anthropic",
        apiKey: "",
        websiteUrl: "https://platform.xiaomimimo.com",
        models: [
          { id: "mimo-v2.5", inputModalities: ["text", "audio", "image", "video"], outputModalities: ["text"] },
          { id: "mimo-v2.5-pro", inputModalities: ["text"], outputModalities: ["text"] },
        ],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "api-glm",
        name: "Zhipu GLM",
        providerType: "anthropic-compatible",
        wireApi: "messages",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        apiKey: "",
        websiteUrl: "https://bigmodel.cn",
        models: [
          { id: "glm-5.1", inputModalities: ["text", "image"], outputModalities: ["text"] },
          { id: "glm-4.5v", inputModalities: ["text", "image"], outputModalities: ["text"] },
        ],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "api-gemini",
        name: "Gemini",
        providerType: "gemini",
        wireApi: "responses",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "",
        websiteUrl: "https://ai.google.dev",
        models: [{ id: "gemini-2.5-pro", inputModalities: ["text", "file", "image"], outputModalities: ["text"] }],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const providers = [
      {
        id: "codex-openai",
        name: "Codex Official",
        agent: "codex",
        apiProviderId: "api-openai",
        baseUrl: "",
        apiKey: "",
        websiteUrl: "https://chatgpt.com",
        model: "gpt-5.1-codex",
        wireApi: "responses",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "codex-deepseek",
        name: "DeepSeek",
        agent: "codex",
        apiProviderId: "api-deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "",
        websiteUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        wireApi: "chat",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: false,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "claude-glm",
        name: "Zhipu GLM",
        agent: "claude",
        apiProviderId: "api-glm",
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        apiKey: "",
        websiteUrl: "https://bigmodel.cn",
        model: "glm-5.1",
        wireApi: "messages",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "claude-mimo",
        name: "MiMo Claude",
        agent: "claude",
        apiProviderId: "api-mimo",
        baseUrl: "https://api.xiaomimimo.com/anthropic",
        apiKey: "",
        websiteUrl: "https://platform.xiaomimimo.com",
        model: "mimo-v2.5",
        wireApi: "messages",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: false,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "gemini-main",
        name: "Gemini",
        agent: "gemini",
        apiProviderId: "api-gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: "",
        websiteUrl: "https://ai.google.dev",
        model: "gemini-2.5-pro",
        wireApi: "responses",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: true,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const dashboard = {
      apiProviders,
      providers,
      sessions: [
        {
          id: "session-1",
          providerId: "codex-openai",
          providerName: "Codex",
          agent: "codex",
          sessionId: "visual-check-001",
          workspacePath: "F:\\Desktop\\Draft",
          title: "UI Visual-Check Workflow",
          summary: "Evaluate layouts, screenshots, and sidebar behavior.",
          sourcePath: "F:\\Desktop\\Draft\\.codex\\sessions\\visual-check.jsonl",
          resumeCommand: "codex resume visual-check-001",
          status: "active",
          notes: "",
          messageCount: 14,
          startedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
          lastActiveAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
        },
        {
          id: "session-2",
          providerId: "claude-main",
          providerName: "Claude Code",
          agent: "claude",
          sessionId: "theme-pass-002",
          workspacePath: "F:\\Desktop\\Draft\\codex-switch",
          title: "Theme and Sidebar Refinement",
          summary: "Refine theme tokens and split-pane layout.",
          sourcePath: "F:\\Desktop\\Draft\\.codex\\sessions\\theme-pass.jsonl",
          resumeCommand: "claude --resume theme-pass-002",
          status: "active",
          notes: "",
          messageCount: 8,
          startedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
          lastActiveAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        },
      ],
      settings: {
        codexConfigDir: "C:\\Users\\you\\.codex",
        claudeConfigDir: "C:\\Users\\you\\.claude",
        geminiConfigDir: "C:\\Users\\you\\.gemini",
        defaultWorkspace: "F:\\Desktop\\Draft",
        terminalProgram: "pwsh",
        autoRecordSessions: true,
        language: "en",
        backgroundColor: "dark",
        theme: "professional",
        ...(mockSettingsOverride ? JSON.parse(mockSettingsOverride) : {}),
      },
    };

    let callbackId = 1;
    const callbacks: Record<number, unknown> = {};

    window.__TAURI_INTERNALS__ = {
      callbacks,
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback(callback: unknown) {
        const id = callbackId++;
        callbacks[id] = callback;
        return id;
      },
      unregisterCallback(id: number) {
        delete callbacks[id];
      },
      invoke(cmd: string, args: Record<string, unknown> = {}) {
        if (cmd === "get_dashboard") return Promise.resolve(dashboard);
        if (cmd === "get_capabilities_state") {
          return Promise.resolve({
            mcpServers: [],
            mcpPresets: [
              {
                id: "builtin-filesystem",
                name: "Filesystem",
                description: "Access selected local files.",
                builtIn: true,
                transport: "stdio",
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE}"],
                workingDirectory: "",
                url: "",
                env: {},
                headers: {},
              },
              {
                id: "builtin-memory",
                name: "Memory",
                description: "Local knowledge graph memory server.",
                builtIn: true,
                transport: "stdio",
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-memory"],
                workingDirectory: "",
                url: "",
                env: {},
                headers: {},
              },
              {
                id: "builtin-fetch",
                name: "Fetch",
                description: "Retrieve and transform web content.",
                builtIn: true,
                transport: "stdio",
                command: "uvx",
                args: ["mcp-server-fetch"],
                workingDirectory: "",
                url: "",
                env: {},
                headers: {},
              },
            ],
            skills: [],
            mcpCounts: { codex: 0, claude: 0, gemini: 0, status: "ok" },
            skillCounts: { codex: 0, claude: 0, gemini: 0, status: "ok" },
            availableTargets: { codex: true, claude: true, gemini: true },
          });
        }
        if (cmd === "save_provider") return Promise.resolve(args.provider);
        if (cmd === "save_api_provider") return Promise.resolve(args.provider);
        if (cmd === "activate_provider") {
          return Promise.resolve(providers.find((provider) => provider.id === args.id) ?? providers[0]);
        }
        if (cmd === "list_provider_models") {
          const request = args.request as { baseUrl?: string };
          return Promise.resolve(apiProviders.find((provider) => provider.baseUrl === request.baseUrl)?.models ?? apiProviders[0].models);
        }
        if (cmd === "send_chat_message") return Promise.resolve({ content: "Mock response for visual testing." });
        if (cmd === "generate_image") return Promise.resolve({ images: [] });
        if (cmd === "check_app_update") {
          if (window.localStorage.getItem("codex-switch-ui-test-update") === "true") {
            return Promise.resolve({
              latestVersion: "9.9.9",
              releaseUrl: "https://github.com/baosen-h/codex-switch/releases/tag/v9.9.9",
              installerUrl: "https://github.com/baosen-h/codex-switch/releases/download/v9.9.9/Codex.Switch_9.9.9_x64-setup.exe",
              installerName: "Codex.Switch_9.9.9_x64-setup.exe",
              installerDigest: "sha256:mock",
              releaseName: "v9.9.9",
              publishedAt: new Date().toISOString(),
            });
          }
          return Promise.resolve(null);
        }
        if (cmd === "download_and_install_update") return Promise.resolve(true);
        if (cmd === "launch_session") return Promise.resolve(true);
        if (cmd === "get_session_messages") {
          return Promise.resolve([
            {
              role: "user",
              content:
                "> Please analyze the project located at the following path: F:\\Desktop\\Draft\\codex-switch. Provide the following in a structured format: 1. Functions, classes, or files and what each does. 2. Workflow from start to finish. 3. Data storage details and formats. 4. Programming language, frameworks, libraries, and tools used.",
            },
            { role: "assistant", content: "Captured screenshots and checked the sidebar behavior.\n\n```ts\nconst compact = true;\n```" },
          ]);
        }
        if (cmd === "build_session_handoff") {
          return Promise.resolve({ mode: args.mode, title: "Mock handoff", sessionId: args.sourcePath, sourceAgent: "codex", content: "Mock handoff content." });
        }
        if (cmd === "complete_openai_oauth") return Promise.resolve({ email: "mock@example.com", configText: "model = \"gpt-5.1\"" });
        if (cmd === "start_openai_oauth") return Promise.resolve({ authUrl: "https://auth.openai.com/mock", manualCallbackRequired: false });
        if (cmd === "pick_directory") return Promise.resolve("F:\\Desktop\\Draft");
        if (cmd === "test_mcp_server") {
          window.localStorage.setItem("codex-switch-ui-test-last-mcp", JSON.stringify(args.server));
          return new Promise((resolve) => window.setTimeout(() => resolve({
            status: "ok",
            error: "",
            output: "",
            tools: [{ name: "mock_tool", description: "Mock MCP tool", inputSchema: {} }],
            testedAt: new Date().toISOString(),
          }), 250));
        }
        if (cmd === "search_marketplace") {
          const installSpec = (
            transport: string,
            overrides: Partial<{
              command: string;
              args: string[];
              url: string;
              packageType: string;
              packageName: string;
              headerKeys: string[];
              headerTemplates: Record<string, string>;
              requiredHeaderKeys: string[];
            }> = {},
          ) => ({
            transport,
            command: "",
            args: [],
            url: "",
            packageType: "",
            packageName: "",
            envKeys: [],
            headerKeys: [],
            headerTemplates: {},
            requiredHeaderKeys: [],
            ...overrides,
          });
          const result = (
            id: string,
            name: string,
            description: string,
            spec: ReturnType<typeof installSpec>,
          ) => ({
            id,
            capabilityType: "mcp",
            canonicalId: id,
            name,
            description,
            author: "",
            version: "1.0.0",
            sourceId: "official-mcp-registry",
            sourceName: "Official MCP Registry",
            sourceIds: ["official-mcp-registry"],
            sourceUrl: "",
            artifactUrl: "",
            artifactSha256: "",
            installReference: id,
            downloads: 0,
            warnings: [],
            installSpec: spec,
            installedId: "",
            updateAvailable: false,
          });
          return Promise.resolve({
            results: [
              result(
                "ai.smithery/kwp-lab-rss-reader-mcp",
                "Smithery RSS Reader",
                "Authenticated Streamable HTTP reader.",
                installSpec("http", {
                  url: "https://server.smithery.ai/@kwp-lab/rss-reader-mcp/mcp",
                  headerKeys: ["Authorization"],
                  headerTemplates: { Authorization: "Bearer {value}" },
                  requiredHeaderKeys: ["Authorization"],
                }),
              ),
              result(
                "app.readwithleaf/leaf",
                "Leaf Reader",
                "Public Streamable HTTP reader.",
                installSpec("http", { url: "https://mcp.readwithleaf.app/mcp" }),
              ),
              result(
                "io.github.CSOAI-ORG/readme-generator-ai-mcp",
                "README Generator",
                "Local PyPI reader package.",
                installSpec("stdio", {
                  command: "uvx",
                  args: ["readme-generator-ai-mcp==1.0.4"],
                  packageType: "pypi",
                  packageName: "readme-generator-ai-mcp",
                }),
              ),
            ],
            sources: [{
              sourceId: "official-mcp-registry",
              sourceName: "Official MCP Registry",
              status: "ok",
              error: "",
              resultCount: 3,
            }],
          });
        }
        if (cmd === "get_marketplace_sources") {
          return Promise.resolve([{
            id: "official-mcp-registry",
            capabilityType: args.capabilityType,
            name: "Official MCP Registry",
            sourceType: "mcp_registry",
            baseUrl: "https://registry.modelcontextprotocol.io",
            enabled: true,
            sortOrder: 0,
            builtIn: true,
            hasCredential: false,
          }]);
        }
        if (cmd === "test_marketplace_source") return Promise.resolve(true);
        if (cmd === "save_marketplace_source") return Promise.resolve(args.source);
        if (cmd === "save_settings") return Promise.resolve(args.settings);
        return Promise.resolve(true);
      },
      convertFileSrc(filePath: string) {
        return filePath;
      },
    };
  });
}

async function waitForApp(page: Page) {
  await installTauriMock(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".loading-screen")).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `test-results/ui/${name}.png`,
    fullPage: false,
  });
}

test("sidebar expands from hoverable brand control", async ({ page }) => {
  await waitForApp(page);

  await expect(page.locator(".app-shell")).toHaveClass(/app-shell-sidebar-collapsed/);
  await expect(page.locator(".brand-action-collapsed")).toBeVisible();
  await capture(page, "00-providers-collapsed");

  await page.locator(".brand-action-collapsed").hover();
  await page.waitForTimeout(120);
  await capture(page, "01-sidebar-hover-open-icon");

  await page.locator(".brand-action-collapsed").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell-sidebar-collapsed/);
  await expect(page.locator(".brand-expanded")).toBeVisible();
  await capture(page, "02-sidebar-expanded");
});

test("main pages render usable layouts", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({
        webSearch: {
          searchProviderId: "tavily",
          searchApiUrl: "https://api.tavily.com/search",
          searchApiKeys: ["tvly-test-key"],
          fetchProviderId: "direct",
          fetchApiUrl: "",
          fetchApiKeys: [],
          maxResults: 5,
          excludeDomains: [],
          cutoffTokens: 4000,
        },
      }),
    );
  });
  await waitForApp(page);

  await expect(page.getByText("chat_completions")).toHaveCount(0);
  await expect(page.getByText("responses")).toHaveCount(0);
  const openAiRow = page.locator(".api-provider-row").filter({ hasText: "codex official" }).first();
  await openAiRow.click();
  await expect(page.locator(".provider-detail-panel")).toBeVisible();
  await expect(openAiRow).toHaveClass(/provider-row-selected/);
  await capture(page, "10-providers");

  await page.getByTitle("Agents").click();
  await expect(page.locator(".provider-toolbar")).toBeVisible();
  await expect(page.locator(".agent-provider-row .provider-avatar").first()).toHaveCSS("width", "28px");
  await expect(page.locator(".agent-provider-row .provider-avatar").first()).toHaveCSS("height", "28px");
  await capture(page, "11-agents");

  await page.getByTitle("Talking").click();
  await expect(page.locator(".chat-shell")).toBeVisible();
  await expect(page.locator(".rail-header h2")).toHaveCount(0);
  await expect(page.locator(".conversation-topic strong").first()).toHaveCSS("font-size", "12px");
  await capture(page, "12-talking");

  await page.getByTitle("Drawing").click();
  await expect(page.locator(".drawing-workspace")).toBeVisible();
  await expect(page.locator(".drawing-prompt-bar textarea")).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".drawing-empty-artboard svg")).toHaveCount(0);
  await expect(page.locator(".drawing-empty-artboard")).toHaveCSS("justify-content", "center");
  await capture(page, "13-drawing");

  await page.getByTitle("Sessions").click();
  await expect(page.locator(".sessions-layout")).toBeVisible();
  await capture(page, "14-sessions");
  await page.locator(".session-list-item").first().click();
  await expect(page.locator(".session-chat-header")).toBeVisible();
  await expect(page.locator(".session-ai-message-list .ai-message")).toHaveCount(2);
  await capture(page, "14b-session-selected");

  await page.getByTitle("Capabilities").click();
  await expect(page.locator(".capabilities-page")).toBeVisible();
  await capture(page, "15-capabilities");
  await page.getByRole("button", { name: /Web search/ }).click();
  await expect(page.getByText("Search provider", { exact: true })).toBeVisible();
  await expect(page.locator(".web-search-provider-icon img")).toHaveCount(1);
  await expect(page.locator(".capability-form-stack .field")).toHaveCount(2);
  await expect(page.locator(".capability-form-stack input[type='password']")).toHaveCount(1);
  await expect(page.locator(".capability-form-stack textarea")).toHaveCount(0);
  await capture(page, "15b-capabilities-search");
  await page.getByRole("button", { name: /^MCP/ }).click();
  await expect(page.locator(".capability-manager")).toBeVisible();
  await page.getByRole("button", { name: /Filesystem/ }).click();
  await expect(page.getByRole("button", { name: "Test server" })).toBeVisible();
  await expect(page.getByText("MCP servers", { exact: true })).toHaveCount(0);
  await capture(page, "15c-capabilities-mcp");

  await page.getByTitle("Settings").click();
  await expect(page.locator(".settings-page")).toBeVisible();
  await capture(page, "15-settings");
});

test("long talking topic titles stay compact", async ({ page }) => {
  await page.addInitScript(() => {
    const longQuestion =
      "can you tell me stack is from top to bottom or bottom to top when the address increase, what is mostly people think of";
    window.localStorage.setItem(
      "codex-switch-talking-topics-v1",
      JSON.stringify([
        {
          id: "topic-long-question",
          title: "",
          providerId: "api-deepseek",
          model: "deepseek-chat",
          draft: "",
          draftAttachments: [],
          messages: [
            { role: "user", content: longQuestion },
            { role: "assistant", content: "Mock answer." },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Talking").click();

  const topic = page.locator(".conversation-topic").first();
  const box = await topic.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(310);
  expect(box?.height ?? 0).toBeLessThanOrEqual(76);
  await expect(topic.locator("strong")).toHaveCSS("text-overflow", "ellipsis");
  await capture(page, "19-long-talking-topic");
});

test("talking messages render markdown, roles, and copy actions", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-talking-topics-v1",
      JSON.stringify([{
        id: "topic-rich-message",
        title: "Rich message",
        providerId: "api-openai",
        model: "gpt-5.1-codex",
        draft: "",
        draftAttachments: [],
        messages: [
          { role: "user", content: "Explain this style." },
          { role: "assistant", content: "**Wiggle style** is a vintage fashion trend.\n\n- Compact\n- Readable\n\n```ts\nconst compact = true;\n```\n\nUse `copy` when needed." },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Talking").click();

  await expect(page.locator(".ai-message-avatar")).toHaveCount(1);
  await expect(page.locator(".ai-message-assistant-content strong")).toHaveText("Wiggle style");
  await expect(page.locator(".ai-message-assistant-content li")).toHaveCount(2);
  await expect(page.locator(".ai-message-assistant-content .prompt-kit-code-block")).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".ai-message-assistant-content .prompt-kit-code-block pre").first()).toHaveCSS("font-family", await page.locator(".ai-message-assistant-content").evaluate((element) => getComputedStyle(element).fontFamily));
  await expect(page.locator(".ai-message-assistant .ai-message-action")).toHaveCount(1);
  await expect(page.locator(".ai-message-assistant-content")).not.toContainText("**");
  await page.locator(".ai-message-assistant .ai-message-action").first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("**Wiggle style**");
  await capture(page, "19b-talking-rich-messages");
});

test("capability MCP controls stay aligned and use inline source management", async ({ page }) => {
  await waitForApp(page);
  await page.getByTitle("Capabilities").click();
  await page.getByRole("button", { name: /^MCP/ }).click();

  const list = page.locator(".capability-manager-list");
  const search = page.locator(".capability-search").first();
  const [listBox, searchBox] = await Promise.all([list.boundingBox(), search.boundingBox()]);
  expect(listBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(Math.abs(searchBox!.x - (listBox!.x + 9))).toBeLessThanOrEqual(1);
  expect(Math.abs((searchBox!.x + searchBox!.width) - (listBox!.x + listBox!.width - 9))).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: /Filesystem/ }).click();
  const environmentAdd = page.locator(".capability-kv .add-button.add-button-compact");
  await expect(environmentAdd).toBeVisible();
  await expect(environmentAdd).toHaveCSS("width", "30px");
  await page.getByRole("button", { name: "Test server" }).click();
  await expect(page.getByRole("button", { name: "Testing..." })).toBeDisabled();
  await expect(page.locator(".mcp-test-progress")).toBeVisible();
  await expect(page.getByText("Server started. 1 tools found.")).toBeVisible();

  await page.getByRole("button", { name: /Manage MCP markets/ }).click();
  const sourceEditor = page.locator(".capability-inline-editor");
  await expect(sourceEditor).toBeVisible();
  await expect(sourceEditor.locator(".capability-inline-header")).toHaveCount(0);
  await expect(sourceEditor.getByRole("button", { name: "Back to editor" })).toHaveCount(0);
  await expect(sourceEditor.getByText("Enabled", { exact: true })).toHaveCount(0);
  await expect(sourceEditor.locator("input[type='checkbox']")).toHaveCount(0);
  await expect(sourceEditor.getByLabel("Name")).toHaveValue("Official MCP Registry");
  const nameField = sourceEditor.getByLabel("Name");
  const typeField = sourceEditor.getByLabel("Type");
  const baseUrlField = sourceEditor.getByLabel("Base URL");
  const [formBox, nameBox, typeBox, baseUrlBox] = await Promise.all([
    sourceEditor.locator(".source-manager-form").boundingBox(),
    nameField.boundingBox(),
    typeField.boundingBox(),
    baseUrlField.boundingBox(),
  ]);
  expect(formBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  expect(typeBox).not.toBeNull();
  expect(baseUrlBox).not.toBeNull();
  expect(typeBox!.y).toBeGreaterThan(nameBox!.y + nameBox!.height);
  for (const box of [nameBox!, typeBox!, baseUrlBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(formBox!.x);
    expect(box.x + box.width).toBeLessThanOrEqual(formBox!.x + formBox!.width + 1);
  }
  const activeSource = sourceEditor.locator(".source-manager-list button.active");
  await expect(activeSource).toHaveCSS("font-size", "10px");
  await expect(activeSource).toHaveCSS("min-height", "36px");
  const overflow = await sourceEditor.locator(".source-manager-layout").evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await capture(page, "16a-capabilities-mcp-market");

  await sourceEditor.getByRole("button", { name: /Add source/ }).click();
  await expect(sourceEditor.getByLabel("Name")).toHaveValue("");
  const [sourceListAfterAdd, sourceFormAfterAdd] = await Promise.all([
    sourceEditor.locator(".source-manager-list").boundingBox(),
    sourceEditor.locator(".source-manager-form").boundingBox(),
  ]);
  expect(sourceListAfterAdd).not.toBeNull();
  expect(sourceFormAfterAdd).not.toBeNull();
  expect(sourceListAfterAdd!.width).toBeGreaterThanOrEqual(170);
  expect(sourceFormAfterAdd!.x).toBeGreaterThanOrEqual(sourceListAfterAdd!.x + sourceListAfterAdd!.width - 1);
  const overflowAfterAdd = await sourceEditor.locator(".source-manager-layout").evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(overflowAfterAdd).toBeLessThanOrEqual(1);
  await capture(page, "16b-capabilities-mcp-add-source");

  await page.getByRole("button", { name: /Import MCP JSON/ }).click();
  await expect(page.locator(".json-import-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to editor" })).toHaveCount(0);

  await page.getByRole("button", { name: /New server/ }).click();
  await page.getByLabel("Transport").selectOption("http");
  const headerAdd = page.locator(".capability-kv .add-button.add-button-compact");
  await headerAdd.click();
  await expect(page.locator(".capability-kv-row input[type='checkbox']")).toHaveCount(0);
  await expect(page.locator(".capability-kv-row input[type='password']")).toHaveCount(1);

  await search.locator("select").selectOption("market");
  await search.locator("input").fill("read");
  await search.locator("input").press("Enter");
  await expect(page.getByRole("button", { name: /Smithery RSS Reader/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Leaf Reader/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /README Generator/ })).toBeVisible();

  await page.getByRole("button", { name: /Smithery RSS Reader/ }).click();
  const authorizationValue = page.locator(".capability-kv-row input[type='password']");
  await expect(authorizationValue).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Test server" })).toBeDisabled();
  await authorizationValue.fill("Bearer smithery-test-key");
  await page.getByRole("button", { name: "Test server" }).click();
  await expect(page.getByText("Server started. 1 tools found.")).toBeVisible();
  const testedSmithery = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("codex-switch-ui-test-last-mcp") || "{}",
  ));
  expect(testedSmithery.headers.Authorization).toEqual({
    value: "Bearer smithery-test-key",
    secret: true,
    credentialId: "",
    template: "Bearer {value}",
  });

  await page.getByRole("button", { name: /Leaf Reader/ }).click();
  await expect(page.getByLabel("Transport")).toHaveValue("http");
  await expect(page.getByLabel("URL")).toHaveValue("https://mcp.readwithleaf.app/mcp");
  await expect(page.locator(".capability-kv-row")).toHaveCount(0);

  await page.getByRole("button", { name: /README Generator/ }).click();
  await expect(page.getByLabel("Transport")).toHaveValue("stdio");
  await expect(page.getByLabel("Command")).toHaveValue("uvx");
  await expect(page.getByLabel("Arguments, one per line")).toHaveValue("readme-generator-ai-mcp==1.0.4");

  await page.getByRole("button", { name: /Skills/ }).click();
  const skillList = page.locator(".capability-manager-list");
  const skillSearch = page.locator(".capability-search").first();
  const [skillListBox, skillSearchBox] = await Promise.all([skillList.boundingBox(), skillSearch.boundingBox()]);
  expect(skillListBox).not.toBeNull();
  expect(skillSearchBox).not.toBeNull();
  expect(Math.abs(skillSearchBox!.x - (skillListBox!.x + 9))).toBeLessThanOrEqual(1);
  expect(Math.abs((skillSearchBox!.x + skillSearchBox!.width) - (skillListBox!.x + skillListBox!.width - 9))).toBeLessThanOrEqual(1);

  await capture(page, "16-capabilities-inline-market");
});

test("talking prompt kit stays readable in light mode", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "light", theme: "professional" }),
    );
    window.localStorage.setItem(
      "codex-switch-talking-topics-v1",
      JSON.stringify([{
        id: "topic-light-prompt-kit",
        title: "Light mode prompt kit",
        providerId: "api-openai",
        model: "gpt-5.1-codex",
        draft: "Ask a concise follow up",
        draftAttachments: [],
        messages: [
          { role: "user", content: "Can you summarize the UI change?" },
          { role: "assistant", content: "The prompt input is compact, markdown renders cleanly, and only copy actions remain." },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }]),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Talking").click();

  await expect(page.locator("html")).toHaveAttribute("data-background-color", "light");
  await expect(page.locator(".talking-prompt-input")).toBeVisible();
  await expect(page.locator(".ai-message-assistant .ai-message-action")).toHaveCount(1);
  await expect(page.locator(".ai-message-assistant-content")).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".talking-prompt-input textarea")).toHaveCSS("font-size", "13.44px");
  await page.locator(".prompt-kit-upload-label input[type='file']").setInputFiles({
    name: "2026-06-11 screenshot.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' rx='10' fill='#7c3aed'/><circle cx='16' cy='24' r='4' fill='#fff'/><circle cx='24' cy='24' r='4' fill='#fff'/><circle cx='32' cy='24' r='4' fill='#fff'/></svg>"),
  });
  await expect(page.locator(".draft-attachment-chip")).toContainText("2026-06-11 screenshot.svg");
  await expect(page.locator(".draft-attachment-preview")).toBeVisible();
  await expect(page.locator(".draft-attachment-preview")).toHaveCSS("width", "24px");
  await expect(page.locator(".draft-attachment-preview")).toHaveCSS("height", "24px");
  await page.locator(".draft-attachment-preview-button").click();
  await expect(page.locator(".image-zoom-modal")).toBeVisible();
  await page.locator(".image-zoom-close").click();
  await expect(page.locator(".image-zoom-modal")).toHaveCount(0);
  const attachmentBox = await page.locator(".draft-attachment-list").boundingBox();
  const textareaBox = await page.locator(".talking-prompt-input textarea").boundingBox();
  const uploadBox = await page.locator(".prompt-kit-upload-label").boundingBox();
  const sendBox = await page.locator(".chat-send-button").boundingBox();
  expect((attachmentBox?.y ?? 0) + (attachmentBox?.height ?? 0)).toBeLessThanOrEqual((textareaBox?.y ?? 0) + 1);
  const textareaCenter = (textareaBox?.y ?? 0) + (textareaBox?.height ?? 0) / 2;
  expect(Math.abs(((uploadBox?.y ?? 0) + (uploadBox?.height ?? 0) / 2) - textareaCenter)).toBeLessThanOrEqual(2);
  expect(Math.abs(((sendBox?.y ?? 0) + (sendBox?.height ?? 0) / 2) - textareaCenter)).toBeLessThanOrEqual(2);
  const promptBox = await page.locator(".talking-prompt-input").boundingBox();
  expect(promptBox?.height ?? 0).toBeLessThanOrEqual(76);
  await capture(page, "19d-talking-light-prompt-kit");
});

test("drawing prompt keeps compact typography", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 780 });
  await waitForApp(page);
  await page.getByTitle("Drawing").click();

  await expect(page.locator(".drawing-workspace")).toBeVisible();
  await expect(page.locator(".drawing-prompt-bar textarea")).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".drawing-mode-switch")).toHaveCount(0);
  await page.locator(".drawing-prompt-bar .prompt-kit-upload-label input[type='file']").setInputFiles({
    name: "input-reference.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><rect width='48' height='48' fill='#0ea5e9'/></svg>"),
  });
  await expect(page.locator(".drawing-input-attachment-list .draft-attachment-preview")).toBeVisible();
  await expect(page.locator(".drawing-input-attachment-list .draft-attachment-preview")).toHaveCSS("width", "24px");
  await expect(page.locator(".drawing-input-attachment-list .draft-attachment-preview")).toHaveCSS("height", "24px");
  const drawingPromptBox = await page.locator(".drawing-prompt-input").boundingBox();
  expect(drawingPromptBox?.height ?? 0).toBeLessThanOrEqual(76);
  const drawingBarBox = await page.locator(".drawing-prompt-bar").boundingBox();
  expect(drawingBarBox?.height ?? 0).toBeLessThanOrEqual(104);
  await capture(page, "19e-drawing-compact-prompt");
  await page.locator(".drawing-input-attachment-list .draft-attachment-preview-button").click();
  await expect(page.locator(".image-zoom-modal")).toBeVisible();
});

test("session transcript keeps compact role identity and copy controls", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "light", theme: "professional" }),
    );
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await waitForApp(page);
  await page.getByTitle("Sessions").click();
  await page.locator(".session-list-item").first().click();

  await expect(page.locator(".session-ai-message-list .ai-message")).toHaveCount(2);
  await expect(page.locator(".session-ai-message-list .ai-message-avatar")).toHaveCount(1);
  await expect(page.locator(".session-ai-message-list .ai-message-user-content")).toHaveCount(1);
  await expect(page.locator(".session-ai-message-list .ai-message-assistant-content")).toHaveCount(1);
  await expect(page.locator(".session-ai-message-list .ai-message-assistant .ai-message-action")).toHaveCount(1);
  await expect(page.locator(".session-ai-message-list .ai-message-user-content")).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".session-ai-message-list .prompt-kit-code-block").first()).toHaveCSS("font-size", "13.44px");
  await expect(page.locator(".session-ai-message-list .prompt-kit-code-block pre").first()).toHaveCSS("font-family", await page.locator(".session-ai-message-list .ai-message-assistant-content").first().evaluate((element) => getComputedStyle(element).fontFamily));
  await expect(page.locator(".session-chat-layout")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".session-message-pane")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const paneBox = await page.locator(".session-message-pane").boundingBox();
  const userBox = await page.locator(".session-ai-message-list .ai-message-user-content").boundingBox();
  expect((userBox?.x ?? 0) + (userBox?.width ?? 0)).toBeLessThanOrEqual((paneBox?.x ?? 0) + (paneBox?.width ?? 0) + 1);
  await capture(page, "19c-session-compact-messages");
});

test("provider master rows stay compact inside the list", async ({ page }) => {
  await waitForApp(page);
  await page.locator(".brand-action-collapsed").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell-sidebar-collapsed/);

  const openAiRow = page.locator(".api-provider-row").filter({ hasText: "codex official" }).first();
  const rowBox = await openAiRow.boundingBox();
  const listBox = await page.locator(".provider-master-panel").boundingBox();
  expect(rowBox?.height ?? 0).toBeLessThanOrEqual(74);
  expect(rowBox?.width ?? 0).toBeLessThanOrEqual(listBox?.width ?? 0);
  await expect(openAiRow.locator(".provider-title-text strong")).toHaveCSS("font-size", "12px");
  await expect(openAiRow.locator(".provider-avatar")).toHaveCSS("width", "24px");
  await expect(openAiRow.locator(".provider-avatar")).toHaveCSS("height", "24px");
  await openAiRow.click();
  await expect(page.locator(".provider-detail-panel")).toBeVisible();
  await capture(page, "20-compact-provider-master");
});

test("light appearance uses opaque readable surfaces", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "light", theme: "professional" }),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Settings").click();
  await expect(page.locator(".settings-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-background-color", "light");
  await expect(page.getByText("Background scene")).toHaveCount(0);
  await expect(page.locator("label").first()).toHaveCSS("color", "rgb(32, 33, 36)");
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  expect(bodyBackground).toBe("none");
  await capture(page, "16-light-settings");
});

test("update notice appears when a newer release exists", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("codex-switch-ui-test-update", "true");
    window.localStorage.removeItem("codex-switch-dismissed-update");
  });
  await waitForApp(page);

  const notice = page.locator(".update-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("v9.9.9");
  await expect(notice.getByRole("button", { name: "Update" })).toBeVisible();
  await capture(page, "17-update-notice");

  await page.getByTitle("Dismiss this version").click();
  await expect(notice).toHaveCount(0);
});

test("update notice refreshes after the app regains focus", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("codex-switch-ui-test-update");
    window.localStorage.removeItem("codex-switch-dismissed-update");
  });
  await waitForApp(page);

  const notice = page.locator(".update-notice");
  await expect(notice).toHaveCount(0);

  await page.evaluate(() => {
    window.localStorage.setItem("codex-switch-ui-test-update", "true");
    window.dispatchEvent(new Event("focus"));
  });

  await expect(notice).toBeVisible();
  await expect(notice).toContainText("v9.9.9");
});

test("expanded sidebar pages do not clip primary panels", async ({ page }) => {
  await waitForApp(page);
  await page.locator(".brand-action-collapsed").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell-sidebar-collapsed/);
  await capture(page, "20-expanded-providers");

  await page.getByRole("button", { name: "Agents" }).click();
  await expect(page.locator(".provider-toolbar")).toBeVisible();
  await capture(page, "21-expanded-agents");

  await page.getByRole("button", { name: "Talking" }).click();
  await expect(page.locator(".chat-shell")).toBeVisible();
  await capture(page, "22-expanded-talking");

  await page.getByRole("button", { name: "Drawing" }).click();
  await expect(page.locator(".drawing-workspace")).toBeVisible();
  await capture(page, "23-expanded-drawing");

  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.locator(".sessions-layout")).toBeVisible();
  await capture(page, "24-expanded-sessions");
});
