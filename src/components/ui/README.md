# UI Layer

This folder is the boundary for reusable, design-system-style components.

Use it for:

- local primitives such as buttons, inputs, prompt inputs, menus, tooltips, and icon wrappers
- imported design snippets that have been adapted to Codex Switch tokens
- small helpers shared by UI primitives, such as `cn`

Avoid:

- page-specific business logic
- direct persistence/API calls
- global theme providers unless they are scoped inside one exported component
- global resets from copied UI kits
- hardcoded palette values when an existing token can express the same intent

Imported components should consume `--cs-ui-*` tokens from `tokens.css` rather than their original theme names. Keep third-party imports contained here so pages can depend on `@/components/ui/...` instead of the original library.
