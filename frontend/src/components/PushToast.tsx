import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { PUSH_TOAST_EVENT, getNotificationIcon, type PushToastPayload } from "../api/notifications";

interface ToastItem extends PushToastPayload {
  id: number;
}

let nextId = 0;
const TOAST_DURATION_MS = 10000;

export default function PushToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const navigate = useNavigate();

  const dismiss = (id: number) => {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent<PushToastPayload>).detail;
      const id = ++nextId;
      setToasts((prev) => [...prev, { ...payload, id }]);
      const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    };

    window.addEventListener(PUSH_TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(PUSH_TOAST_EVENT, handler);
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[99999] flex flex-col gap-2 pointer-events-none w-[min(400px,calc(100vw-32px))]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border border-border 
          bg-card shadow-lg animate-in slide-in-from-right-4 fade-in duration-200"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 bg-primary/20">
            {getNotificationIcon(toast.type ?? "")}
          </div>

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => {
              if (toast.targetRoute?.startsWith("/")) navigate(toast.targetRoute);
              dismiss(toast.id);
            }}
          >
            <p className="font-semibold text-sm text-foreground leading-snug line-clamp-2">{toast.title}</p>
            {toast.body && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">{toast.body}</p>
            )}
          </div>

          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 -mt-0.5 p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="닫기"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
