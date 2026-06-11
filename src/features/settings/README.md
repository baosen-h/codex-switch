# Settings Feature

Settings owns app-level preferences: config directories, shell, language, background, and theme.

- `SettingsPage.tsx` owns orchestration: draft state, immediate-save interactions, and directory picking.
- `components/SettingsPathSection.tsx` contains config directory, workspace, shell, and session recording fields.
- `components/AppearanceSection.tsx` contains language, background, and theme fields.
- `components/SettingsActionsSection.tsx` contains release, guide, and save actions.
- `settingsConfig.ts` contains shared option lists and capability configuration helpers.
- `components/` contains settings-specific UI pieces and icons.
- `types.ts` contains the public feature props exported by `index.ts`.

Keep behavior changes in `SettingsPage.tsx` or feature helpers. Keep imported form designs inside section components until a shared settings-field API is proven reusable.

Vision fallback and web search are owned by `features/capabilities`.
