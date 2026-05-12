<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Codex Switch 图标" width="140" />
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

Codex Switch 是一个 Windows 桌面工具，用来把 API Provider 连接到三类本地工作流：代码 Agent、直接对话、图片生成。

项目使用 **Tauri**、**React**、**TypeScript**、**Rust**、**SQLite** 和 **Vite** 构建。

> 这是一个本地辅助工具。它管理 Provider 记录、写入本地 Agent 配置，并保存轻量级本地历史。它不是 Codex、Claude Code 或 Gemini 的替代品。

## 工作流

先配置一个 Provider，然后在 Agents、Talking 或 Drawing 中复用它。Sessions 用来查看本地 Agent 会话历史。

<p align="center">
  <img src="docs/images/workflow.png" alt="Codex Switch 工作流" width="760" />
</p>

## 截图

### API Providers

保存 Provider 类型、Base URL、API Key、官网地址和模型列表。其他页面会复用这些 Provider 记录。

<img src="docs/images/api-provider.png" alt="API Providers" width="680" />

### Agents

从 Provider 创建 Codex、Claude Code 或 Gemini 的配置档案。启用档案后，应用会把对应配置写入本地 Agent 配置目录。

<img src="docs/images/agents.png" alt="Agents" width="680" />

### Talking

选择 Provider 和模型后进行对话。模型支持时，可以附加文本文件、代码文件或图片。

<img src="docs/images/talking.png" alt="Talking" width="680" />

### Drawing

选择 Provider 和图片模型后生成或编辑图片。生成结果可以放大查看、复制和下载。

<img src="docs/images/drawing.png" alt="Drawing" width="680" />

### Light Mode

应用支持深色和浅色背景模式。

<img src="docs/images/light-mode.png" alt="浅色模式" width="680" />

## 功能

- 管理 OpenAI-compatible、OpenAI、Anthropic、Gemini、Ollama、New API、OpenRouter、Hugging Face 类型的 API Provider 记录。
- 为 Codex、Claude Code、Gemini 创建 Agent 配置档案。
- 一键启用 Agent 配置，并写入本地配置文件。
- 浏览本地会话，预览消息，复制 resume 命令，生成 handoff 文本。
- Talking 页面可通过已配置的 Provider 直接聊天。
- Talking 支持文件和图片附件。
- Drawing 页面支持 OpenAI-compatible 图片生成和图片编辑接口。
- 可构建 Windows `.msi`、安装版 `.exe` 和独立 `.exe`。

## 安装

从 GitHub Releases 下载最新 Windows 版本：

https://github.com/baosen-h/codex-switch/releases/latest

Release 通常包含：

- `Codex.Switch_VERSION_x64-setup.exe`
- `Codex.Switch_VERSION_x64_en-US.msi`
- `codex-switch.exe`

## 本地数据

- SQLite 保存 Provider、Agent 配置档案、会话元数据和设置，路径为 `~/.codex-switch/codex-switch.db`。
- Talking 和 Drawing 历史保存在浏览器 `localStorage`。
- Drawing 生成结果会以返回的 URL 或 base64 数据保存，直到用户手动下载成图片文件。

## 当前限制

- 主要面向 Windows。
- API Key 保存在本地 SQLite 中，项目本身没有额外加密层。
- Drawing 主要面向 OpenAI-compatible 图片接口。
- Talking 的图片输入取决于所选 Provider 和模型是否支持。

## 开发

环境要求：

- Node.js 20+
- Rust stable toolchain
- Windows WebView2 runtime

```bash
npm install
npm run tauri dev
```

构建：

```bash
npm run build
npm run tauri build
```

安装包输出目录：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

## 许可证

MIT。见 [LICENSE](LICENSE)。
