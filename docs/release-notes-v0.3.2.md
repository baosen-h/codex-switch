# Codex Switch v0.3.2 - First Stable Release

Codex Switch v0.3.2 is the first stable Windows release, focused on provider management, agent config switching, local sessions, image generation, and cross-agent capabilities.

## Highlights

- Manage API providers for OpenAI-compatible, Anthropic-compatible, Gemini, Ollama, OpenRouter, Hugging Face, DeepSeek, MiMo, GLM, and other endpoints.
- Generate and switch Codex, Claude Code, and Gemini runtime configs from saved provider records.
- Use the local compatibility proxy to route Codex, Claude Code, and Gemini requests through the selected provider.
- Translate Codex `/v1/responses` requests to `/chat/completions` for chat-only providers when needed.
- Use vision fallback so configured text-only models can work with image input through a separate vision model.
- Configure automatic web search and URL fetching with local `web__search` and `web__fetch` tools.
- Discover, test, install, and sync MCP servers and Skills across Codex, Claude Code, and Gemini.
- Browse local sessions, preview transcripts, copy resume commands, and generate handoff text.

## Documentation

- Refreshed README screenshots for the current UI.
- Added an architecture overview for providers, agents, chat, drawing, vision fallback, web search, MCP, and Skills.
- Removed stale release-facing media and notice references.
