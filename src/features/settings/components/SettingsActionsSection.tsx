interface SettingsActionsSectionProps {
  appVersion: string;
  labels: {
    appVersion: string;
    openReleases: string;
    guideSettingsTitle: string;
    guideSettingsButton: string;
    saveSettings: string;
  };
  canSave: boolean;
  onOpenReleases: () => void;
  onOpenGuide: () => void;
  onSave: () => void;
}

export function SettingsActionsSection({
  appVersion,
  labels,
  canSave,
  onOpenReleases,
  onOpenGuide,
  onSave,
}: SettingsActionsSectionProps) {
  return (
    <>
      <label className="field field-full">
        <span>{labels.appVersion}</span>
        <div className="update-row">
          <button className="secondary-button" onClick={onOpenReleases} type="button">
            v{appVersion}
          </button>
        </div>
      </label>
      <div className="field">
        <span>{labels.guideSettingsTitle}</span>
        <button className="secondary-button" onClick={onOpenGuide} type="button">
          {labels.guideSettingsButton}
        </button>
      </div>
      <div className="actions">
        <button
          className="primary-button"
          disabled={!canSave}
          onClick={onSave}
          type="button"
        >
          {labels.saveSettings}
        </button>
      </div>
    </>
  );
}
