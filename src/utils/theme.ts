import type { ThemeMode } from "../types";

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  root.dataset.theme = resolved;
}

type StartViewTransition = (callback: () => void) => { finished: Promise<void> };

export function switchThemeWithReveal(mode: ThemeMode, originX: number, originY: number): void {
  const root = document.documentElement;
  root.style.setProperty("--reveal-x", `${originX}px`);
  root.style.setProperty("--reveal-y", `${originY}px`);

  const startViewTransition = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (typeof startViewTransition !== "function") {
    applyTheme(mode);
    return;
  }
  startViewTransition.call(document, () => applyTheme(mode));
}
