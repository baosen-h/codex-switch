# Talking Feature

Talking is the reference structure for migrating large legacy pages into feature modules.

- `TalkingPage.tsx` owns feature orchestration: provider/model selection, API calls, and composition.
- `components/PromptComposer.tsx` owns the chat composer behavior and integrates the vendored Prompt Kit prompt/file-upload primitives.
- `components/ChatMessageList.tsx` owns the message rendering and integrates the vendored Prompt Kit chat container.
- `components/` contains page-specific UI pieces. These are not generic design-system primitives.
- `hooks/` contains feature state management.
- `storage.ts`, `attachments.ts`, and `topicUtils.ts` contain pure helpers so component files stay focused.

Keep imported prompt or chat UI designs behind feature-owned integration components first. Promote only stable primitives to `components/ui` after their API is proven reusable outside Talking.
