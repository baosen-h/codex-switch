<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Codex Switch 图标" width="140" />
</p>

<h1 align="center">Codex Switch</h1>

<p align="center">
  <a href="README.md">English</a> · 简体中文
</p>

<p align="center">
  <a href="https://github.com/baosen-h/codex-switch/releases"><img src="https://img.shields.io/github/v/release/baosen-h/codex-switch?style=flat" alt="GitHub release" /></a>
  <a href="https://github.com/baosen-h/codex-switch/releases"><img src="https://img.shields.io/github/downloads/baosen-h/codex-switch/total?style=flat&color=blue" alt="GitHub downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/baosen-h/codex-switch?style=flat" alt="License" /></a>
</p>

Codex Switch 是一个 Windows 桌面应用，用于管理 API Provider、Agent 配置、对话、图片生成和本地会话恢复。

## 功能

- API Providers：管理 OpenAI、OpenAI Compatible / New API、Anthropic、Gemini、Ollama、OpenRouter、Hugging Face 记录。
- Agents：根据 Provider 记录生成 Codex、Claude Code、Gemini 配置。
- Talking：在模型支持时，进行文本、文件和图片对话。
- Drawing：使用支持的模型生成和编辑图片。
- Sessions：查看本地会话、预览 transcript、复制 resume 命令、生成 handoff 文本。
- Settings：切换主题、背景、目录、终端和发布页入口。

## 截图

| Providers | Agents |
| --- | --- |
| <img src="docs/images/api-provider.png" alt="API Providers" width="100%" /> | <img src="docs/images/agents.png" alt="Agents" width="100%" /> |
| Talking | Drawing |
| <img src="docs/images/talking.png" alt="Talking" width="100%" /> | <img src="docs/images/drawing.png" alt="Drawing" width="100%" /> |

<p align="center">
  <img src="docs/images/light-mode.png" alt="浅色模式" width="760" />
</p>

## 安装

下载最新 Windows 版本：

https://github.com/baosen-h/codex-switch/releases/latest

## 构建

```bash
npm install
npm run build
npm run tauri -- build
```

## 说明

- 主要面向 Windows。
- API Key 保存在本地 SQLite。
- Drawing 主要面向 OpenAI-compatible 图片接口。
- Talking 的图片输入取决于模型支持。

## 许可证

MIT。见 [LICENSE](LICENSE)。
