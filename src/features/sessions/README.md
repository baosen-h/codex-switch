# Sessions Feature

Sessions owns recorded conversation browsing, transcript loading, deletion, resume commands, and handoff copying.

- `SessionsPage.tsx` owns orchestration: filters, selected session, lazy transcript loading, caches, deletion, expansion state, and handoff copy calls.
- `components/SessionFilters.tsx` contains search, agent filter, and refresh controls.
- `components/SessionListPanel.tsx` contains the session list, delete confirmation, resume/copy actions, and handoff control placement.
- `components/SessionHandoffControls.tsx` contains handoff progress/menu/trigger UI.
- `components/SessionDetailPanel.tsx` contains transcript rendering, message expansion, timestamps, copy buttons, and the conversation directory.
- `sessionUtils.ts` contains transcript filtering, session filtering, handoff cache keys, timestamp grouping, and list constants.
- `components/` contains sessions-specific UI pieces.
- `types.ts` contains the public feature props exported by `index.ts`.

Keep transcript loading and cache mutation in `SessionsPage.tsx`. Imported transcript or list designs should replace the section components without changing the orchestration contract.
