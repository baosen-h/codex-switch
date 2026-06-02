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

Codex Switch is a Windows desktop app for managing Codex, Claude Code, and Gemini provider configs, plus chat, image generation, and local sessions. Built-in chat/completion translation helps Codex work with compatible models like DeepSeek, MiMo, and GLM.

## Highlights

- API Providers: manage OpenAI, OpenAI Compatible / New API, Anthropic Compatible, Gemini, Ollama, OpenRouter, and Hugging Face records.
- Codex compatibility: translate chat/completion providers such as DeepSeek, MiMo, and GLM for Codex.
- Agents: generate Codex, Claude Code, and Gemini configs from provider records.
- Talking: chat with text, files, and images when the selected model supports them.
- Drawing: generate and edit images with supported models.
- Sessions: inspect local sessions, preview transcripts, copy resume commands, and generate handoff text.
- Settings: switch theme, background, directories, terminal, and release page access.

## Screenshots

<table>
  <tr>
    <th align="center">Providers</th>
    <th align="center">Agents</th>
  </tr>
  <tr>
    <td><img src="docs/images/api-provider.png" alt="API Providers" width="100%" /></td>
    <td><img src="docs/images/agents.png" alt="Agents" width="100%" /></td>
  </tr>
  <tr>
    <th align="center">Talking</th>
    <th align="center">Drawing</th>
  </tr>
  <tr>
    <td><img src="docs/images/talking.png" alt="Talking" width="100%" /></td>
    <td><img src="docs/images/drawing.png" alt="Drawing" width="100%" /></td>
  </tr>
</table>

<table>
  <tr>
    <th align="center">Settings</th>
  </tr>
  <tr>
    <td><img src="docs/images/light-mode.png" alt="Settings in light mode" width="100%" /></td>
  </tr>
</table>

## Install

Download the latest Windows release:

https://github.com/baosen-h/codex-switch/releases/latest

## Build

```bash
npm install
npm run build
npm run tauri -- build
```

## Notes

- Windows-first.
- API keys are stored locally in SQLite.
- Drawing is focused on OpenAI-compatible image endpoints.
- Talking image input depends on model support.

## License

MIT. See [LICENSE](LICENSE).
