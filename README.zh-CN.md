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

Codex Switch 是一个用于管理 Codex、Claude Code 和 Gemini 服务商配置的 Windows 桌面应用，同时支持聊天、图像生成和本地会话。内置 chat/completion 转换，让 Codex 兼容 DeepSeek、MiMo 和 GLM；可配置的视觉模型支持还能让纯文本模型理解图片。

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

### 为纯文本模型提供视觉支持

在 Codex Switch 中配置视觉模型后，纯文本模型可以在 **Talking**、**Codex CLI**、**Claude Code** 和 **Gemini CLI** 中理解图片。下面以 DeepSeek 为例，展示它在 Talking 和 Codex CLI 中分析同一张浏览器截图的效果。

<table>
  <tr>
    <th align="center">Talking</th>
    <th align="center">Codex CLI</th>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/vision-talking-result.png" alt="DeepSeek 在 Talking 页面中分析图片" width="100%" /></td>
    <td width="50%"><img src="docs/images/vision-codex-cli-result.png" alt="DeepSeek 在 Codex CLI 中分析图片" width="100%" /></td>
  </tr>
  <tr>
    <td align="center"><sub>在 Talking 中发送图片时，纯文本 DeepSeek 模型可以获得视觉支持。</sub></td>
    <td align="center"><sub>通过 Codex CLI 使用同一个 DeepSeek 示例时，也可以获得视觉支持。</sub></td>
  </tr>
</table>

图片理解能力由**设置 → 视觉模型**中选择的视觉 Provider 和模型提供，最终回答仍由原来的纯文本模型生成。该功能并不限于 DeepSeek；其他纯文本模型的请求经过 Codex Switch 时，也可以使用同样的视觉支持。

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

## 参考项目

Codex Switch 的设计受到以下优秀开源项目的启发：

- [CC Switch](https://github.com/farion1231/cc-switch) - 面向 Claude Code、Codex、Gemini CLI 等 AI 编程工具的跨平台管理器。
- [Cherry Studio](https://github.com/CherryHQ/cherry-studio) - 统一接入多个大模型服务商的跨平台桌面客户端。
- [Codex Switcher](https://github.com/xtftbwvfp/codex-switcher) - Codex CLI 和 Codex App 的账号、配额、中转与本地代理管理工具。
- [mimo2codex](https://github.com/7as0nch/mimo2codex) - 将 Codex 客户端连接到 OpenAI-compatible 和 Responses API 服务商的本地代理。
- [deepseek-vision](https://github.com/ErlichLiu/deepseek-vision) - 为 DeepSeek 模型提供视觉理解、联网搜索和兼容接口的代理服务。

感谢这些项目及其贡献者的开源精神。

## 反馈与支持

- 遇到问题？请[提交 Issue](https://github.com/baosen-h/codex-switch/issues/new)。
- 欢迎参与改进，可以[提交 Pull Request](https://github.com/baosen-h/codex-switch/pulls)。

## 许可证

MIT。见 [LICENSE](LICENSE)。
