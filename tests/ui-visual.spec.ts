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
        if (cmd === "get_provider_balance") {
          const provider = args.provider as { id?: string };
          if (provider.id === "api-openai") {
            return Promise.resolve({
              strategy: "openai_oauth",
              remaining: 0,
              unit: "USD",
              isActive: true,
              label: "Balance",
              creditsBalance: 0,
              fiveHourLabel: "5H quota",
              fiveHourLeft: 99,
              fiveHourReset: "3h 22m",
              weeklyLabel: "Weekly quota",
              weeklyLeft: 6,
              weeklyReset: "2h 33m",
            });
          }
          return Promise.resolve({ strategy: "openai_compat", remaining: 98, unit: "%", isActive: true, label: "Token quota" });
        }
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
            { role: "user", content: "Review the UI layout." },
            { role: "assistant", content: "Captured screenshots and checked the sidebar behavior." },
          ]);
        }
        if (cmd === "build_session_handoff") {
          return Promise.resolve({ mode: args.mode, title: "Mock handoff", sessionId: args.sourcePath, sourceAgent: "codex", content: "Mock handoff content." });
        }
        if (cmd === "complete_openai_oauth") return Promise.resolve({ email: "mock@example.com", configText: "model = \"gpt-5.1\"" });
        if (cmd === "start_openai_oauth") return Promise.resolve({ authUrl: "https://auth.openai.com/mock", manualCallbackRequired: false });
        if (cmd === "pick_directory") return Promise.resolve("F:\\Desktop\\Draft");
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
  await waitForApp(page);

  await expect(page.getByText("chat_completions")).toHaveCount(0);
  await expect(page.getByText("responses")).toHaveCount(0);
  const openAiRow = page.locator(".api-provider-row").filter({ hasText: "codex official" }).first();
  await openAiRow.locator(".balance-refresh-button").click();
  await expect(openAiRow.locator(".provider-balance-value")).toHaveCount(0);
  await expect(openAiRow.locator(".provider-quota-grid .quota-mini-card")).toHaveCount(2);
  await capture(page, "10-providers");

  await page.getByTitle("Agents").click();
  await expect(page.locator(".provider-toolbar")).toBeVisible();
  await expect(page.locator(".agent-balance-row")).toHaveCount(0);
  await capture(page, "11-agents");

  await page.getByTitle("Talking").click();
  await expect(page.locator(".chat-shell")).toBeVisible();
  await capture(page, "12-talking");

  await page.getByTitle("Drawing").click();
  await expect(page.locator(".drawing-workspace")).toBeVisible();
  await capture(page, "13-drawing");

  await page.getByTitle("Sessions").click();
  await expect(page.locator(".sessions-layout")).toBeVisible();
  await capture(page, "14-sessions");
  await page.locator(".session-list-item").first().click();
  await expect(page.locator(".session-chat-header")).toBeHidden();
  await expect(page.locator(".message-card")).toHaveCount(2);
  await capture(page, "14b-session-selected");

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

test("expanded provider quota stays inside the row", async ({ page }) => {
  await waitForApp(page);
  await page.locator(".brand-action-collapsed").click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell-sidebar-collapsed/);

  const openAiRow = page.locator(".api-provider-row").filter({ hasText: "codex official" }).first();
  await openAiRow.locator(".balance-refresh-button").click();
  await expect(openAiRow.locator(".provider-quota-grid .quota-mini-card")).toHaveCount(2);

  const layout = await openAiRow.evaluate((row) => {
    const rowRect = row.getBoundingClientRect();
    const panelRect = row.querySelector(".provider-balance-panel")!.getBoundingClientRect();
    const actionsRect = row.querySelector(".provider-actions")!.getBoundingClientRect();
    const cards = [...row.querySelectorAll(".quota-mini-card")].map((card) => {
      const element = card as HTMLElement;
      return {
        width: element.getBoundingClientRect().width,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    return {
      rowRight: rowRect.right,
      panelRight: panelRect.right,
      actionsLeft: actionsRect.left,
      cards,
    };
  });
  expect(layout.panelRight).toBeLessThan(layout.actionsLeft);
  expect(layout.panelRight).toBeLessThan(layout.rowRight);
  for (const card of layout.cards) {
    expect(card.width).toBeGreaterThan(90);
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 1);
  }
  await capture(page, "20-expanded-provider-quota");
});

test("real background in light mode keeps content readable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "light", backgroundScene: "raidenShogun", theme: "professional" }),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Settings").click();
  await expect(page.locator(".settings-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-background-scene", "raidenShogun");
  await expect(page.locator("label").first()).toHaveCSS("color", "rgb(15, 23, 42)");
  await capture(page, "16-real-background-light-settings");
});

test("settings only lists image-backed background scenes", async ({ page }) => {
  await waitForApp(page);
  await page.getByTitle("Settings").click();

  const backgroundSceneSelect = page.locator(".field").filter({ hasText: "Background scene" }).locator("select");
  const options = await backgroundSceneSelect.locator("option").evaluateAll((items) =>
    items.map((item) => ({ value: item.getAttribute("value"), text: item.textContent })),
  );

  expect(options.map((option) => option.value)).toEqual([
    "none",
    "raidenShogun",
    "lumineGold",
    "hutaoLantern",
    "ayakaSnow",
    "yaeSakura",
    "nahidaDream",
    "furinaStage",
    "keqingViolet",
  ]);
  expect(options.map((option) => option.text).join(" ")).not.toContain("Anime night");
});

test("character background scenes use bundled image assets", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "dark", backgroundScene: "raidenShogun", theme: "professional" }),
    );
  });
  await waitForApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-background-scene", "raidenShogun");

  const wallpaper = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--wallpaper"),
  );
  expect(wallpaper).toContain("raiden-shogun");
  expect(wallpaper).toContain(".jpg");
  expect(wallpaper).not.toContain("data:image/svg+xml");

  const renderedBackground = await page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage);
  expect(renderedBackground).toContain("raiden-shogun");
  await capture(page, "18-raiden-background");
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
