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
    case "mikuStage":
    case "raidenShogun":
    case "lumineGold":
    case "hutaoLantern":
    case "ayakaSnow":
    case "yaeSakura":
    case "nahidaDream":
    case "furinaStage":
    case "keqingViolet":
    case "animeCyberGirl":
    case "animeIdolPink":
    case "animeMaidCafe":
    case "animeWitchNight":
    case "animeSchoolRooftop":
    case "animeKimonoFestival":
    case "animeMechaPilot":
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
  mikuStage: animeScene(
    "https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg",
    "rgba(0, 229, 255, 0.3)",
    "rgba(31, 236, 197, 0.22)",
    "#06121d",
    "#0b2a35",
    "#17142c",
  ),
  raidenShogun: animeScene(
    "https://w.wallhaven.cc/full/pk/wallhaven-pkgkkp.png",
    "rgba(167, 139, 250, 0.34)",
    "rgba(244, 114, 182, 0.2)",
    "#0b0714",
    "#211138",
    "#321b45",
  ),
  lumineGold: animeScene(
    "https://w.wallhaven.cc/full/y8/wallhaven-y8622k.jpg",
    "rgba(250, 204, 21, 0.28)",
    "rgba(125, 211, 252, 0.18)",
    "#10100a",
    "#2d2411",
    "#352719",
  ),
  hutaoLantern: animeScene(
    "https://w.wallhaven.cc/full/od/wallhaven-od87p9.jpg",
    "rgba(248, 113, 113, 0.32)",
    "rgba(251, 146, 60, 0.22)",
    "#160707",
    "#301417",
    "#3b1c14",
  ),
  ayakaSnow: animeScene(
    "https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg",
    "rgba(147, 197, 253, 0.3)",
    "rgba(224, 242, 254, 0.18)",
    "#07111d",
    "#13283a",
    "#1b2440",
  ),
  yaeSakura: animeScene(
    "https://w.wallhaven.cc/full/y8/wallhaven-y8622k.jpg",
    "rgba(244, 114, 182, 0.34)",
    "rgba(216, 180, 254, 0.2)",
    "#150812",
    "#35162b",
    "#411d37",
  ),
  nahidaDream: animeScene(
    "https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg",
    "rgba(134, 239, 172, 0.28)",
    "rgba(250, 204, 21, 0.16)",
    "#07140d",
    "#18301d",
    "#23351a",
  ),
  furinaStage: animeScene(
    "https://w.wallhaven.cc/full/pk/wallhaven-pkgkkp.png",
    "rgba(56, 189, 248, 0.32)",
    "rgba(99, 102, 241, 0.22)",
    "#06101c",
    "#142747",
    "#111c36",
  ),
  keqingViolet: animeScene(
    "https://w.wallhaven.cc/full/od/wallhaven-od87p9.jpg",
    "rgba(196, 181, 253, 0.34)",
    "rgba(129, 140, 248, 0.2)",
    "#0d0818",
    "#23143b",
    "#2d1948",
  ),
  animeCyberGirl: animeScene(
    "https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg",
    "rgba(34, 211, 238, 0.3)",
    "rgba(217, 70, 239, 0.2)",
    "#050b15",
    "#0d2534",
    "#231135",
  ),
  animeIdolPink: animeScene(
    "https://w.wallhaven.cc/full/y8/wallhaven-y8622k.jpg",
    "rgba(251, 113, 133, 0.34)",
    "rgba(244, 114, 182, 0.24)",
    "#170912",
    "#331528",
    "#42162d",
  ),
  animeMaidCafe: animeScene(
    "https://w.wallhaven.cc/full/od/wallhaven-od87p9.jpg",
    "rgba(192, 132, 252, 0.3)",
    "rgba(251, 191, 36, 0.16)",
    "#100b17",
    "#271d33",
    "#34213d",
  ),
  animeWitchNight: animeScene(
    "https://w.wallhaven.cc/full/pk/wallhaven-pkgkkp.png",
    "rgba(168, 85, 247, 0.32)",
    "rgba(45, 212, 191, 0.16)",
    "#070815",
    "#17123a",
    "#281247",
  ),
  animeSchoolRooftop: animeScene(
    "https://w.wallhaven.cc/full/4v/wallhaven-4v9ml0.jpg",
    "rgba(96, 165, 250, 0.28)",
    "rgba(251, 146, 60, 0.18)",
    "#07111c",
    "#1b2a3d",
    "#32241b",
  ),
  animeKimonoFestival: animeScene(
    "https://w.wallhaven.cc/full/y8/wallhaven-y8622k.jpg",
    "rgba(248, 113, 113, 0.3)",
    "rgba(250, 204, 21, 0.18)",
    "#170909",
    "#32161c",
    "#3d2413",
  ),
  animeMechaPilot: animeScene(
    "https://w.wallhaven.cc/full/od/wallhaven-od87p9.jpg",
    "rgba(34, 211, 238, 0.28)",
    "rgba(248, 113, 113, 0.18)",
    "#060b12",
    "#132434",
    "#2d1822",
  ),
};

function animeScene(
  imageUrl: string,
  glowA: string,
  glowB: string,
  start: string,
  mid: string,
  end: string,
): BackgroundWallpaper {
  return {
    wallpaper: `url("${imageUrl}")`,
    wallpaperFallback:
      `radial-gradient(circle at 76% 18%, ${glowA} 0 13%, transparent 30%), ` +
      `radial-gradient(circle at 20% 80%, ${glowB} 0 14%, transparent 32%), ` +
      `linear-gradient(135deg, ${start} 0%, ${mid} 48%, ${end} 100%)`,
    wallpaperVeil:
      "linear-gradient(90deg, rgba(3, 6, 12, 0.58) 0%, rgba(5, 9, 18, 0.28) 42%, rgba(5, 9, 18, 0.14) 100%), linear-gradient(180deg, rgba(3, 7, 14, 0.16) 0%, rgba(3, 7, 14, 0.38) 100%)",
  };
}

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
