<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Codex Switch Icon" width="140" />
</p>

<h1 align="center">Codex Switch</h1>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/baosen-h/codex-switch/releases"><img src="https://img.shields.io/github/v/release/baosen-h/codex-switch?style=flat" alt="GitHub release" /></a>
  <a href="https://github.com/baosen-h/codex-switch/releases"><img src="https://img.shields.io/github/downloads/baosen-h/codex-switch/total?style=flat&color=blue" alt="GitHub downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/baosen-h/codex-switch?style=flat" alt="License" /></a>
</p>

Codex Switch is a Windows desktop tool for connecting API providers with three local workflows: coding agents, direct chat, and image generation.

It is built with **Tauri**, **React**, **TypeScript**, **Rust**, **SQLite**, and **Vite**.

> This is a local helper app. It manages provider records, writes local agent configs, and keeps lightweight local history. It is not a replacement for Codex, Claude Code, or Gemini.

## Workflow

Configure a provider once, then reuse it in Agents, Talking, or Drawing. Sessions are used for local agent history.

<p align="center">
  <img src="docs/images/workflow.png" alt="Codex Switch workflow" width="760" />
</p>

## Screenshots

### API Providers

Save provider type, base URL, API key, website, and model list. These provider records are reused by the other pages.

<img src="docs/images/api-provider.png" alt="API Providers" width="680" />

### Agents

Create Codex, Claude Code, or Gemini profiles from a provider. Activating a profile writes the selected config to the local agent config directory.

<img src="docs/images/agents.png" alt="Agents" width="680" />

### Talking

Choose a provider and model, then chat with text, files, or images when the selected model supports them.

<img src="docs/images/talking.png" alt="Talking" width="680" />

### Drawing

Choose a provider and image model to generate or edit images. Results can be opened larger, copied, and downloaded.

<img src="docs/images/drawing.png" alt="Drawing" width="680" />

### Light Mode

The app supports both dark and light background modes.

<img src="docs/images/light-mode.png" alt="Light mode" width="680" />

## Features

- API provider management for OpenAI-compatible, OpenAI, Anthropic, Gemini, Ollama, New API, OpenRouter, and Hugging Face style records.
- Agent profiles for Codex, Claude Code, and Gemini.
- One-click activation that writes local agent config.
- Local session browser with transcript preview, resume command copy, and handoff text generation.
- Talking page for direct chat through configured providers.
- File and image attachments in Talking.
- Drawing page for OpenAI-compatible image generation and image editing endpoints.
- Windows `.msi`, setup `.exe`, and standalone `.exe` builds.

## Install

Download the latest Windows release:

https://github.com/baosen-h/codex-switch/releases/latest

Release assets usually include:

- `Codex.Switch_VERSION_x64-setup.exe`
- `Codex.Switch_VERSION_x64_en-US.msi`
- `codex-switch.exe`

## Local Data

- SQLite stores providers, agent profiles, session metadata, and settings at `~/.codex-switch/codex-switch.db`.
- Talking and Drawing history are stored in browser `localStorage`.
- Generated drawing images are stored as returned URLs or base64 data until downloaded.

## Limitations

- Windows-first.
- API keys are stored locally in SQLite without an extra encryption layer.
- Drawing focuses on OpenAI-compatible image endpoints.
- Talking image input depends on provider and model support.

## Author Statement

This is not a mature software project. It is a tool I built while using Codex, Claude Code, and Gemini, because I wanted provider configuration, chatting, drawing, and session management to be easier in my own workflow.

The code was generated and modified entirely with help from Codex, based on my ideas, requirements, screenshots, feedback, and testing. My role was mainly to describe what I wanted, judge the result, test the features, and decide what needed to be changed next.

Because the project has not been developed for a long time, and because it was built through this kind of step-by-step iteration, there are probably bugs, unclear logic, poorly organized files, or implementations that are not very elegant yet.

I will keep improving it through my own use. If you also use this project and find problems or have better suggestions, issues are welcome. Real feedback would be very helpful.

## Development

Requirements:

- Node.js 20+
- Rust stable toolchain
- Windows WebView2 runtime

```bash
npm install
npm run tauri dev
```

Build:

```bash
npm run build
npm run tauri build
```

Installer output:

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## License

MIT. See [LICENSE](LICENSE).
