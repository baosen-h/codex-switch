import type { AppSettings, BackgroundColorMode } from "../../../types";
import type { TranslationKey } from "../../../i18n/translations";
import { normalizeAppTheme } from "../../../utils/theme";
import { backgroundSceneOptions, themeOptions } from "../settingsConfig";

interface AppearanceSectionProps {
  draft: AppSettings;
  selectedScene: string;
  labels: {
    language: string;
    backgroundColor: string;
    backgroundAuto: string;
    backgroundDark: string;
    backgroundLight: string;
    backgroundScene: string;
    theme: string;
  };
  t: (key: TranslationKey) => string;
  onUpdateAndSave: (field: keyof AppSettings, value: string | boolean) => void;
  onBackgroundColorChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onThemeChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

export function AppearanceSection({
  draft,
  selectedScene,
  labels,
  t,
  onUpdateAndSave,
  onBackgroundColorChange,
  onThemeChange,
}: AppearanceSectionProps) {
  return (
    <>
      <label className="field">
        <span>{labels.language}</span>
        <select
          value={draft.language}
          onChange={(event) => onUpdateAndSave("language", event.target.value)}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <label className="field">
        <span>{labels.backgroundColor}</span>
        <select value={draft.backgroundColor as BackgroundColorMode} onChange={onBackgroundColorChange}>
          <option value="system">{labels.backgroundAuto}</option>
          <option value="dark">{labels.backgroundDark}</option>
          <option value="light">{labels.backgroundLight}</option>
        </select>
      </label>
      <label className="field">
        <span>{labels.backgroundScene}</span>
        <select
          value={selectedScene}
          onChange={(event) => onUpdateAndSave("backgroundScene", event.target.value)}
        >
          {backgroundSceneOptions.map((option) => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{labels.theme}</span>
        <select value={normalizeAppTheme(draft.theme)} onChange={onThemeChange}>
          {themeOptions.map((option) => (
            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
          ))}
        </select>
      </label>
    </>
  );
}
