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

Codex Switch 是一个用于管理 Codex、Claude Code 和 Gemini 服务商配置的 Windows 桌面应用，同时支持聊天、图像生成和本地会话。内置 chat/completion 转换，让 Codex 兼容 DeepSeek、MiMo 和 GLM。

## 重点功能

- API Providers：管理 OpenAI、OpenAI Compatible / New API、Anthropic Compatible、Gemini、Ollama、OpenRouter、Hugging Face 记录。
- Codex 兼容：将 DeepSeek、MiMo 和 GLM 这类 chat/completion Provider 转换后接入 Codex。
- Agents：根据 Provider 记录生成 Codex、Claude Code、Gemini 配置。
- Talking：在模型支持时，进行文本、文件和图片对话。
- 视觉模型支持：通过可配置的视觉模型，让 DeepSeek、GLM 等纯文本模型也能理解图片，支持 Talking、Codex CLI、Claude Code 和 Gemini CLI。
- Drawing：使用支持的模型生成和编辑图片。
- Sessions：查看本地会话、预览 transcript、复制 resume 命令、生成 handoff 文本。
- Settings：切换主题、背景、目录、终端和发布页入口。

## 截图

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
    <td align="center"><sub>管理 OpenAI、OpenAI-compatible、Anthropic-compatible、Gemini 等服务商记录。</sub></td>
    <td align="center"><sub>根据已保存服务商生成并切换 Codex、Claude Code 和 Gemini 配置。</sub></td>
  </tr>
  <tr>
    <th align="center">Talking</th>
    <th align="center">Drawing</th>
  </tr>
  <tr>
    <td><img src="docs/images/talking.png" alt="Talking" width="100%" /></td>
    <td><img src="docs/images/drawing.png" alt="Drawing" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><sub>使用支持文本、文件和图片输入的模型聊天。</sub></td>
    <td align="center"><sub>使用支持的图像模型生成和编辑图片。</sub></td>
  </tr>
</table>

<table>
  <tr>
    <th align="center">Settings</th>
  </tr>
  <tr>
    <td><img src="docs/images/light-mode.png" alt="浅色模式" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><sub>配置目录、语言、主题、背景、更新入口和会话记录。</sub></td>
  </tr>
</table>

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
- 视觉模型支持只会列出已确认支持图片输入和文本输出的模型。

## 许可证

MIT。见 [LICENSE](LICENSE)。
