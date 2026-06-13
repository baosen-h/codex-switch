interface SettingsActionsSectionProps {
  appVersion: string;
  labels: {
    appVersion: string;
    openReleases: string;
    saveSettings: string;
  };
  canSave: boolean;
  onOpenReleases: () => void;
  onSave: () => void;
}

export function SettingsActionsSection({
  appVersion,
  labels,
  canSave,
  onOpenReleases,
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
