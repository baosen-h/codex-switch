# Settings Feature

Settings owns app-level preferences: config directories, shell, language, background, theme, vision fallback, and web search settings.

- `SettingsPage.tsx` owns orchestration: draft state, immediate-save interactions, directory picking, and validation.
- `components/SettingsPathSection.tsx` contains config directory, workspace, shell, and session recording fields.
- `components/AppearanceSection.tsx` contains language, background, scene, and theme fields.
- `components/VisionFallbackSection.tsx` contains vision provider/model selection.
- `components/WebSearchSection.tsx` contains automatic web search configuration.
- `components/SettingsActionsSection.tsx` contains release, guide, and save actions.
- `settingsConfig.ts` contains option lists, default web search settings, list parsing, and web search validation.
- `components/` contains settings-specific UI pieces and icons.
- `types.ts` contains the public feature props exported by `index.ts`.

Keep behavior changes in `SettingsPage.tsx` or feature helpers. Keep imported form designs inside section components until a shared settings-field API is proven reusable.
