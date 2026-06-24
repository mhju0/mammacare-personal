import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export function TimeDropdown({
  value, onChange, length, suffix, step = 1, className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  length: number;
  suffix: string;
  step?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open]);

  const triggerHeight = triggerRef.current?.offsetHeight ?? 0;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`px-3 py-2 rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 
        focus:outline-none focus:ring-2 focus:ring-[#EBF7FF] text-base font-semibold flex items-center gap-1.5 ${className}`}
      >
        {value}{suffix}
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && pos && createPortal(
        <div
          style={{
            position: "fixed",
            top: pos.top + triggerHeight + 4,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="max-h-60 overflow-auto scrollbar-hide bg-[#EBF7FF] border border-[#C5E5FA] rounded-3xl shadow-lg"
        >
          {Array.from({ length }, (_, i) => {
            const val = i * step;
            return (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); onChange(val); setOpen(false); }}
                className={`w-full px-3 py-2.5 text-base text-left hover:bg-[#FAFAFA]/70 font-medium ${
                  val === value ? "bg-[#FAFAFA]/70" : ""
                }`}
              >
                {val}{suffix}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}