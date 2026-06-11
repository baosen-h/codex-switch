# Features

Feature folders are the home for screen-level product code. `src/pages` is retired; new route-level UI should be added under `src/features/<feature>`.

Use a feature folder when a screen owns meaningful state, storage, API orchestration, async workflows, or several page-specific components. Keep reusable app shell in `components/app`, product-wide UI in `components/domain`, and stable generic primitives in `components/ui`.

## Ownership

- `App.tsx` imports feature pages only from `features/<name>`.
- Each feature exports its public page from `index.ts`.
- `FeaturePage.tsx` should orchestrate data, async calls, feature state, and section composition.
- `components/` contains feature-local UI. It can be highly specific to the screen.
- `hooks/` contains feature-local stateful behavior when it is reused inside the feature or keeps the page readable.
- Helper files such as `storage.ts`, `constants.ts`, `types.ts`, and `*Utils.ts` contain non-React logic.
- Cross-feature imports should be avoided. If two features need the same behavior, promote the stable part to `components/domain`, `components/ui`, or `utils`.

## UI Import Policy

Imported designs should land inside the target feature first. For example, a new prompt composer design should start in `features/talking/components`, not `components/ui`.

Promote a component to `components/ui` only when:

- at least two features need it,
- its props are stable,
- it does not know feature-specific data shapes,
- it can be styled with shared tokens rather than page-specific assumptions.

Keep new package usage behind feature-local components at first. This limits blast radius if the imported design library conflicts with Semi UI, Theme UI, or existing CSS.

## Recommended Shape

```txt
features/example/
  index.ts
  ExamplePage.tsx
  README.md
  types.ts
  constants.ts
  storage.ts
  hooks/
  components/
```

## Current Features

- `talking`: reference chat feature and prompt composer boundary.
- `drawing`: image generation and image editing workflow.
- `providers`: reusable API provider configuration.
- `agents`: Codex, Claude, and Gemini runtime provider profiles.
- `settings`: app preferences, vision fallback, and web search setup.
- `sessions`: recorded conversation browsing and handoff copy.

## Refactor Rules

- Keep behavior-preserving structure changes separate from design polish.
- Preserve class names during refactors unless the task is explicitly visual.
- Run `npm run build` after moving feature boundaries.
- For visual changes, run the app and manually check the touched feature. Use `npm run ui:shot` when the change affects broad layout or visual regressions are likely.
