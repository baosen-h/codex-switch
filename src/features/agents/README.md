# Agents Feature

Agents owns the UI for Codex, Claude, and Gemini runtime provider profiles.

- `AgentsPage.tsx` owns orchestration: list/form mode, draft mutation, API provider application, model discovery calls, and save/delete/launch delegation.
- `components/AgentProviderList.tsx` contains the agent tabs and provider rows.
- `components/AgentProviderForm.tsx` contains the edit form and config preview layout.
- `components/AgentModelPicker.tsx` contains the model input, fetch button, menu, and model capability display.
- `agentUtils.ts` contains provider sorting, tab counts, model filtering, and avatar source helpers.
- `components/` contains page-specific UI pieces and icons.
- `types.ts` contains the public feature props exported by `index.ts`.

Keep imported form or model-picker designs feature-local first. Promote shared provider/model controls only after both Agents and Providers need the same stable API.
