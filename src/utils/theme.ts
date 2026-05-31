import type { AppTheme, BackgroundColorMode, BackgroundScene } from "../types";

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

export function normalizeBackgroundScene(scene: BackgroundScene | string | undefined): BackgroundScene {
  switch (scene) {
    case "anime":
    case "animeSakura":
    case "animeNight":
    case "none":
      return scene;
    case "tech":
    case "city":
      return "anime";
    default:
      return "none";
  }
}

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
  document.documentElement.dataset.theme = normalizeAppTheme(theme);
}

type BackgroundWallpaper = {
  wallpaper?: string;
  wallpaperFallback?: string;
  wallpaperVeil?: string;
};

const backgroundScenes: Record<BackgroundScene, BackgroundWallpaper> = {
  none: {
    wallpaper: "none",
    wallpaperFallback: "none",
    wallpaperVeil: "none",
  },
  anime: {
    wallpaper: 'url("https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg")',
    wallpaperFallback:
      "radial-gradient(circle at 76% 18%, rgba(255, 117, 181, 0.24) 0 13%, transparent 30%), radial-gradient(circle at 20% 80%, rgba(80, 131, 255, 0.2) 0 14%, transparent 32%), linear-gradient(135deg, #080a15 0%, #10132a 42%, #1a1630 72%, #080a15 100%)",
    wallpaperVeil:
      "linear-gradient(90deg, rgba(3, 6, 12, 0.54) 0%, rgba(5, 9, 18, 0.24) 42%, rgba(5, 9, 18, 0.12) 100%), linear-gradient(180deg, rgba(3, 7, 14, 0.14) 0%, rgba(3, 7, 14, 0.34) 100%)",
  },
  animeSakura: {
    wallpaper: 'url("https://w.wallhaven.cc/full/y8/wallhaven-y8622k.jpg")',
    wallpaperFallback:
      "radial-gradient(circle at 76% 18%, rgba(255, 149, 198, 0.28) 0 13%, transparent 30%), radial-gradient(circle at 20% 78%, rgba(255, 214, 230, 0.28) 0 14%, transparent 34%), linear-gradient(135deg, #120a14 0%, #241124 44%, #3a1730 78%, #120a14 100%)",
    wallpaperVeil:
      "linear-gradient(90deg, rgba(19, 8, 16, 0.44) 0%, rgba(19, 8, 16, 0.22) 40%, rgba(19, 8, 16, 0.1) 100%), linear-gradient(180deg, rgba(19, 8, 16, 0.12) 0%, rgba(19, 8, 16, 0.34) 100%)",
  },
  animeNight: {
    wallpaper: 'url("https://w.wallhaven.cc/full/pk/wallhaven-pkgkkp.png")',
    wallpaperFallback:
      "radial-gradient(circle at 75% 20%, rgba(110, 126, 255, 0.28) 0 14%, transparent 30%), radial-gradient(circle at 18% 76%, rgba(214, 104, 255, 0.18) 0 14%, transparent 30%), linear-gradient(135deg, #070816 0%, #0d1330 48%, #170f2c 100%)",
    wallpaperVeil:
      "linear-gradient(90deg, rgba(3, 7, 15, 0.58) 0%, rgba(3, 7, 15, 0.26) 40%, rgba(3, 7, 15, 0.14) 100%), linear-gradient(180deg, rgba(3, 7, 15, 0.18) 0%, rgba(3, 7, 15, 0.38) 100%)",
  },
};

export function applyBackgroundScene(scene: BackgroundScene): void {
  const root = document.documentElement;
  const resolved = normalizeBackgroundScene(scene);
  root.dataset.backgroundScene = resolved;
  const wallpaper = backgroundScenes[resolved];
  root.style.setProperty("--wallpaper", wallpaper.wallpaper ?? "none");
  root.style.setProperty("--wallpaper-fallback", wallpaper.wallpaperFallback ?? "none");
  root.style.setProperty("--wallpaper-veil", wallpaper.wallpaperVeil ?? "none");
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
