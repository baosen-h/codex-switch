import type { AppTheme, BackgroundColorMode, BackgroundScene } from "../types";
import ayakaSnowWallpaper from "../assets/backgrounds/ayaka-snow.jpg";
import furinaStageWallpaper from "../assets/backgrounds/furina-stage.jpg";
import hutaoLanternWallpaper from "../assets/backgrounds/hutao-lantern.jpg";
import keqingVioletWallpaper from "../assets/backgrounds/keqing-violet.jpg";
import lumineGoldWallpaper from "../assets/backgrounds/lumine-gold.jpg";
import nahidaDreamWallpaper from "../assets/backgrounds/nahida-dream.jpg";
import raidenShogunWallpaper from "../assets/backgrounds/raiden-shogun.jpg";
import yaeSakuraWallpaper from "../assets/backgrounds/yae-sakura.jpg";

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
  wallpaperPosition?: string;
};

const backgroundScenes: Record<BackgroundScene, BackgroundWallpaper> = {
  none: {
    wallpaper: "none",
    wallpaperFallback: "none",
    wallpaperVeil: "none",
  },
  anime: animeScene("#7dd3fc", "#f0abfc", "#07111d", "#122342", "#2a1737", 0),
  animeSakura: imageScene(
    yaeSakuraWallpaper,
    animeScene("#f9a8d4", "#fda4af", "#160817", "#35152c", "#4a1830", 1),
  ),
  animeNight: animeScene("#a78bfa", "#60a5fa", "#060816", "#111a3c", "#23133d", 2),
  mikuStage: animeScene("#22d3ee", "#2dd4bf", "#04131c", "#093343", "#102a38", 3),
  raidenShogun: imageScene(
    raidenShogunWallpaper,
    animeScene("#c084fc", "#f472b6", "#090713", "#21113a", "#3a1745", 4),
  ),
  lumineGold: imageScene(
    lumineGoldWallpaper,
    animeScene("#fde68a", "#93c5fd", "#111008", "#32240d", "#403214", 5),
  ),
  hutaoLantern: imageScene(
    hutaoLanternWallpaper,
    animeScene("#fb7185", "#fb923c", "#170708", "#351214", "#432113", 6),
  ),
  ayakaSnow: imageScene(
    ayakaSnowWallpaper,
    animeScene("#bfdbfe", "#93c5fd", "#07121e", "#17304a", "#1b2542", 7),
  ),
  yaeSakura: imageScene(
    yaeSakuraWallpaper,
    animeScene("#f0abfc", "#f9a8d4", "#130812", "#34162c", "#451c39", 8),
  ),
  nahidaDream: imageScene(
    nahidaDreamWallpaper,
    animeScene("#86efac", "#fde68a", "#07140d", "#1b331d", "#26391a", 9),
  ),
  furinaStage: imageScene(
    furinaStageWallpaper,
    animeScene("#38bdf8", "#818cf8", "#06111d", "#133052", "#142342", 10),
  ),
  keqingViolet: imageScene(
    keqingVioletWallpaper,
    animeScene("#c4b5fd", "#818cf8", "#0d0818", "#23143b", "#351b52", 11),
  ),
  animeCyberGirl: animeScene("#22d3ee", "#d946ef", "#050b15", "#0d2534", "#251238", 12),
  animeIdolPink: animeScene("#fb7185", "#f0abfc", "#170912", "#35152d", "#481934", 13),
  animeMaidCafe: animeScene("#d8b4fe", "#fbbf24", "#100b17", "#271d33", "#3a2544", 14),
  animeWitchNight: animeScene("#a855f7", "#2dd4bf", "#070815", "#17123a", "#30154f", 15),
  animeSchoolRooftop: animeScene("#60a5fa", "#fb923c", "#07111c", "#1b2a3d", "#3b2616", 16),
  animeKimonoFestival: animeScene("#f87171", "#facc15", "#170909", "#35151a", "#42270f", 17),
  animeMechaPilot: animeScene("#22d3ee", "#f87171", "#060b12", "#132434", "#2d1822", 18),
};

function imageScene(
  imageUrl: string,
  fallback: BackgroundWallpaper,
  wallpaperPosition = "center center",
): BackgroundWallpaper {
  return {
    ...fallback,
    wallpaper: `url("${imageUrl}")`,
    wallpaperPosition,
  };
}

function animeScene(
  accent: string,
  secondary: string,
  start: string,
  mid: string,
  end: string,
  variant: number,
): BackgroundWallpaper {
  const svg = animeGirlSvg(accent, secondary, start, mid, end, variant);
  return {
    wallpaper: `url("${svgDataUrl(svg)}")`,
    wallpaperFallback:
      `radial-gradient(circle at 76% 18%, ${hexToRgba(accent, 0.3)} 0 13%, transparent 30%), ` +
      `radial-gradient(circle at 20% 80%, ${hexToRgba(secondary, 0.22)} 0 14%, transparent 32%), ` +
      `linear-gradient(135deg, ${start} 0%, ${mid} 48%, ${end} 100%)`,
    wallpaperVeil:
      "linear-gradient(90deg, rgba(3, 6, 12, 0.58) 0%, rgba(5, 9, 18, 0.28) 42%, rgba(5, 9, 18, 0.14) 100%), linear-gradient(180deg, rgba(3, 7, 14, 0.16) 0%, rgba(3, 7, 14, 0.38) 100%)",
  };
}

function animeGirlSvg(
  accent: string,
  secondary: string,
  start: string,
  mid: string,
  end: string,
  variant: number,
): string {
  const flip = variant % 2 === 0 ? 1 : -1;
  const cx = flip === 1 ? 980 : 620;
  const hairOffset = (variant % 5) * 18;
  const starOffset = (variant % 7) * 43;
  const accessory =
    variant % 3 === 0
      ? `<path d="M${cx - 132} 156l52-74 52 74z" fill="${accent}" opacity=".72"/><path d="M${cx + 78} 156l52-74 52 74z" fill="${secondary}" opacity=".62"/>`
      : variant % 3 === 1
        ? `<circle cx="${cx - 126}" cy="156" r="30" fill="${accent}" opacity=".76"/><circle cx="${cx + 126}" cy="156" r="30" fill="${secondary}" opacity=".66"/>`
        : `<path d="M${cx - 148} 148c54-52 108-52 160 0" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" opacity=".72"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${start}"/><stop offset=".52" stop-color="${mid}"/><stop offset="1" stop-color="${end}"/></linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${secondary}"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <circle cx="${360 + starOffset}" cy="170" r="180" fill="${accent}" opacity=".18" filter="url(#soft)"/>
  <circle cx="${1230 - starOffset}" cy="650" r="230" fill="${secondary}" opacity=".16" filter="url(#soft)"/>
  <g opacity=".28" stroke="${accent}" stroke-width="2">
    <path d="M0 ${160 + hairOffset}h1600M0 ${360 + hairOffset}h1600M0 ${560 + hairOffset}h1600"/>
    <path d="M${140 + starOffset} 0v900M${520 + starOffset} 0v900M${1180 - starOffset} 0v900"/>
  </g>
  <g transform="translate(${cx} 474) scale(${flip} 1) translate(${-cx} -474)">
    <path d="M${cx - 230} 198c-172 154-172 428-78 612 78-124 112-246 88-388 58 112 96 248 82 390h362c-24-152 16-282 82-396-34 138 2 272 94 394 108-238 64-510-118-636-128-88-344-78-482 24z" fill="url(#hair)" opacity=".78"/>
    <path d="M${cx - 278} 240c-132 84-240 264-248 512 140-78 232-204 268-358z" fill="${accent}" opacity=".52"/>
    <path d="M${cx + 278} 240c132 84 240 264 248 512-140-78-232-204-268-358z" fill="${secondary}" opacity=".46"/>
    ${accessory}
    <ellipse cx="${cx}" cy="280" rx="112" ry="134" fill="#ffd8d0" opacity=".92"/>
    <path d="M${cx - 118} 238c74-104 188-112 256-20-42-16-96-10-142 18-36 22-74 24-114 2z" fill="url(#hair)" opacity=".94"/>
    <ellipse cx="${cx - 42}" cy="292" rx="15" ry="25" fill="${start}" opacity=".9"/>
    <ellipse cx="${cx + 42}" cy="292" rx="15" ry="25" fill="${start}" opacity=".9"/>
    <circle cx="${cx - 36}" cy="284" r="5" fill="#fff" opacity=".9"/>
    <circle cx="${cx + 48}" cy="284" r="5" fill="#fff" opacity=".9"/>
    <path d="M${cx - 26} 342c20 18 54 18 74 0" fill="none" stroke="${end}" stroke-width="6" stroke-linecap="round" opacity=".58"/>
    <path d="M${cx - 132} 454c-58 56-86 168-112 328h488c-28-160-56-272-112-328-52 46-180 46-264 0z" fill="${mid}" opacity=".9"/>
    <path d="M${cx - 108} 484c64 44 156 44 216 0l46 298h-308z" fill="${accent}" opacity=".38"/>
  </g>
  <g fill="#fff" opacity=".55">
    <circle cx="${220 + starOffset}" cy="150" r="3"/><circle cx="${440 + starOffset}" cy="250" r="2"/><circle cx="${1320 - starOffset}" cy="230" r="3"/>
    <circle cx="${1120 - starOffset}" cy="760" r="2"/><circle cx="${680 + starOffset}" cy="110" r="2"/><circle cx="${1480 - starOffset}" cy="520" r="3"/>
  </g>
</svg>`;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function applyBackgroundScene(scene: BackgroundScene): void {
  const root = document.documentElement;
  const resolved = normalizeBackgroundScene(scene);
  root.dataset.backgroundScene = resolved;
  const wallpaper = backgroundScenes[resolved];
  root.style.setProperty("--wallpaper", wallpaper.wallpaper ?? "none");
  root.style.setProperty("--wallpaper-fallback", wallpaper.wallpaperFallback ?? "none");
  root.style.setProperty("--wallpaper-veil", wallpaper.wallpaperVeil ?? "none");
  root.style.setProperty("--wallpaper-position", wallpaper.wallpaperPosition ?? "center center");
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
