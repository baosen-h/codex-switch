# Frontend Architecture

This project uses feature folders for screen-level code. The goal is to make UI contributions safe even when a contributor imports a new design component or styling approach.

## Directory Roles

- `src/features/*`: route-level product features. Put screen orchestration, feature-local components, hooks, storage helpers, and feature docs here.
- `src/components/app`: reusable app shell pieces such as title bar, sidebar, onboarding, updates, and toast.
- `src/components/domain`: reusable product/domain components such as provider avatars, message rendering, brand icons, and capability badges.
- `src/components/ui`: stable generic primitives and icons. Do not put experimental feature designs here first.
- `src/utils`: product-independent helpers and shared business logic.
- `src/pages`: retired. Do not add new files here.

## Feature Boundary

Each feature should expose a small public surface:

```txt
features/example/
  index.ts
  ExamplePage.tsx
  README.md
  types.ts
  components/
  hooks/
```

`App.tsx` should import feature pages from `features/<name>`, not from internal component files. Inside a feature, the page file should compose sections and own orchestration. Components should receive explicit props and avoid calling unrelated APIs directly.

## Imported UI Designs

When importing a new UI design:

1. Put it in the target feature first, usually `features/<feature>/components`.
2. Keep the wrapper API close to the existing feature data flow.
3. Preserve current behavior before polishing visuals.
4. Keep package-specific details inside the feature wrapper.
5. Promote to `components/ui` only after the same component is needed by multiple features.

This protects the app from conflicts between Semi UI, Theme UI, additional UI libraries, and local CSS.

## Good First Targets

- Prompt/chat UI: start in `features/talking/components`.
- Image prompt controls: start in `features/drawing/components`.
- Provider/model forms: start in `features/providers/components` or `features/agents/components`.
- Transcript/list layouts: start in `features/sessions/components`.

## Review Checklist

- `npm run build` passes.
- The feature README still matches the code.
- App routing imports from `features/<name>`.
- No new cross-feature imports were added without a clear reason.
- New shared UI is not promoted to `components/ui` until it has a stable, feature-neutral API.
- Visual changes preserve text fit on narrow and wide viewports.
