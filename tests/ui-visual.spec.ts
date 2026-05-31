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
        models: [{ id: "gpt-5.1-codex" }, { id: "gpt-5.1" }, { id: "o4-mini" }],
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
        models: [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }],
        enabled: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "api-mimo",
        name: "MiMo",
        providerType: "openai-compatible",
        wireApi: "chat",
        baseUrl: "https://api.mimo.example",
        apiKey: "",
        websiteUrl: "",
        models: [{ id: "mimo-v2-pro" }, { id: "mimo-v2-flash" }],
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
        model: "deepseek-v4-pro",
        wireApi: "chat",
        reasoningEffort: "high",
        extraToml: "",
        configText: "",
        isCurrent: false,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "claude-main",
        name: "Claude Code",
        agent: "claude",
        apiProviderId: "",
        baseUrl: "",
        apiKey: "",
        websiteUrl: "",
        model: "sonnet",
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

test("anime background in light mode keeps content readable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "codex-switch-ui-test-settings",
      JSON.stringify({ backgroundColor: "light", backgroundScene: "anime", theme: "professional" }),
    );
  });
  await waitForApp(page);
  await page.getByTitle("Settings").click();
  await expect(page.locator(".settings-page")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-background-scene", "anime");
  await expect(page.locator("label").first()).toHaveCSS("color", "rgb(15, 23, 42)");
  await capture(page, "16-anime-light-settings");
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
