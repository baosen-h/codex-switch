import type { AppTheme, BackgroundColorMode } from "../types";

export function applyBackgroundColor(mode: BackgroundColorMode): void {
  const root = document.documentElement;
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  root.dataset.backgroundColor = resolved;
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
}

type StartViewTransition = (callback: () => void) => { finished: Promise<void> };

export function switchBackgroundColorWithReveal(
  mode: BackgroundColorMode,
  originX: number,
  originY: number,
): void {
  const root = document.documentElement;
  root.style.setProperty("--reveal-x", `${originX}px`);
  root.style.setProperty("--reveal-y", `${originY}px`);

  const startViewTransition = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (typeof startViewTransition !== "function") {
    applyBackgroundColor(mode);
    return;
  }
  startViewTransition.call(document, () => applyBackgroundColor(mode));
}
