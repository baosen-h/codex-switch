# Drawing Feature

Drawing follows the feature-folder pattern introduced by Talking.

- `DrawingPage.tsx` owns orchestration: provider/model selection, image generation calls, notifications, and page composition.
- `components/` contains drawing-specific UI blocks. Keep these local unless another feature proves the same API is reusable.
- `hooks/` contains local record state and zoom interaction state.
- `drawingUtils.ts` and `storage.ts` contain non-React helpers.

Keep behavior-preserving refactors separate from design refreshes. Imported image or prompt designs should land here first before being promoted to shared UI primitives.
