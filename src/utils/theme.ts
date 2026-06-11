import type { AppTheme, BackgroundColorMode } from "../types";

export function normalizeAppTheme(theme: AppTheme | string | undefined): AppTheme {
  switch (theme) {
    case "graphite":
    case "indigo":
    case "teal":
    case "amber":
    case "slate":
    case "rose":
    case "violet":
    case "professional":
      return theme;
    default:
      return "professional";
  }
}

export function applyBackgroundColor(mode: BackgroundColorMode): void {
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  document.documentElement.dataset.backgroundColor = resolved;
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = normalizeAppTheme(theme);
}

export function switchBackgroundColor(mode: BackgroundColorMode): void {
  applyBackgroundColor(mode);
}
