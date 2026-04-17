interface StatusBarProps {
  message: string;
  error: string;
}

export function StatusBar({ message, error }: StatusBarProps) {
  if (!message && !error) {
    return null;
  }

  return (
    <div className={`status-bar ${error ? "error" : "ok"}`}>
      {error || message}
    </div>
  );
}
