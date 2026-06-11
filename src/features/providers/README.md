# Providers Feature

Providers owns reusable API provider configuration: provider type, model discovery, OAuth setup, website links, and balance display.

- `ProvidersPage.tsx` owns orchestration: form/list mode, model discovery calls, OAuth event handling, and save/delete delegation.
- `components/ProviderForm.tsx` contains the provider edit UI.
- `components/ProviderList.tsx` contains the connected provider list.
- `components/OpenAiOAuthPanel.tsx` contains OAuth controls and callback input.
- `components/ProviderBalancePanel.tsx` contains balance and quota rendering.
- `hooks/useProviderBalances.ts` owns balance cache state and refresh calls.
- `providerConfig.ts` contains provider presets, provider type normalization, default draft state, and website label helpers.
- `balanceStorage.ts` contains localStorage serialization for provider balances.
- `types.ts` contains the public feature props exported by `index.ts`.

Keep design-only changes out of this orchestration layer. Imported provider form or card designs should land in `components/` first, with the API boundary preserved.
