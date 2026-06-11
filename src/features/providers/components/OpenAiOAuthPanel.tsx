interface OpenAiOAuthPanelProps {
  isBusy: boolean;
  status: string;
  authUrl: string;
  manualMode: boolean;
  callbackInput: string;
  onCallbackInputChange: (value: string) => void;
  onStartLogin: () => void;
  onGenerateUrl: () => void;
  onSubmitCallback: () => void;
}

export function OpenAiOAuthPanel({
  isBusy,
  status,
  authUrl,
  manualMode,
  callbackInput,
  onCallbackInputChange,
  onStartLogin,
  onGenerateUrl,
  onSubmitCallback,
}: OpenAiOAuthPanelProps) {
  return (
    <div className="field field-full oauth-panel">
      <span>Official OpenAI OAuth</span>
      <div className="oauth-actions">
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onStartLogin}
          type="button"
        >
          Login with OpenAI
        </button>
        <button
          className="secondary-button"
          disabled={isBusy}
          onClick={onGenerateUrl}
          type="button"
        >
          Generate URL
        </button>
      </div>
      {status ? <p className="model-picker-status">{status}</p> : null}
      {authUrl ? (
        <textarea
          className="config-preview oauth-url-preview"
          readOnly
          rows={3}
          value={authUrl}
          spellCheck={false}
        />
      ) : null}
      {manualMode ? (
        <div className="oauth-manual-callback">
          <textarea
            className="config-preview oauth-url-preview"
            rows={4}
            value={callbackInput}
            onChange={(event) => onCallbackInputChange(event.target.value)}
            placeholder="http://localhost:1455/auth/callback?code=...&state=..."
            spellCheck={false}
          />
          <button
            className="secondary-button"
            disabled={isBusy || !callbackInput.trim()}
            onClick={onSubmitCallback}
            type="button"
          >
            Finish OAuth
          </button>
        </div>
      ) : null}
    </div>
  );
}
