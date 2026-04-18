import { useEffect, useRef } from "react";

export interface ToastState {
  message: string;
  type: "ok" | "err";
  id: number;
}

interface FloatingToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function FloatingToast({ toast, onDismiss }: FloatingToastProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onDismiss, 2500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast?.id, onDismiss]);

  if (!toast) return null;

  return (
    <div className={`floating-toast floating-toast-${toast.type}`} onClick={onDismiss}>
      {toast.message}
    </div>
  );
}
