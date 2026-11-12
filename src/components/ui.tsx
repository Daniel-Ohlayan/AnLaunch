import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

// ---------------------------------------------------------------------------
// Кнопка
// ---------------------------------------------------------------------------
export function Button({
  children,
  onClick,
  disabled,
  variant = "solid",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost" | "danger" | "outline";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        variant === "solid" &&
          "bg-gradient-to-r from-accent to-accent-2 text-slate-950 hover:brightness-110 shadow-[0_0_18px_-6px_rgba(34,211,238,0.7)]",
        variant === "ghost" && "text-ink hover:bg-panel-3",
        variant === "outline" && "border border-line text-ink hover:bg-panel-3",
        variant === "danger" && "bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Поля форм
// ---------------------------------------------------------------------------
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted/70">{hint}</div>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/50 focus:border-accent/60";

// ---------------------------------------------------------------------------
// Модальное окно
// ---------------------------------------------------------------------------
export function Modal({
  title,
  onClose,
  children,
  width = 560,
  closable = true,
}: {
  title: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  width?: number;
  closable?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={closable ? onClose : undefined}>
      <div
        className="al-modal max-h-[92vh] w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="text-base font-semibold">{title}</div>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-muted hover:bg-panel-3 hover:text-ink"
              aria-label="Закрыть"
            >
              ✕
            </button>
          )}
        </div>
        <div className="max-h-[calc(92vh-56px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Прогресс
// ---------------------------------------------------------------------------
export function Progress({ value, label }: { value: number | null; label?: string }) {
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-muted">{label}</div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-panel-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-200"
          style={{ width: value === null ? "100%" : `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Бейдж
// ---------------------------------------------------------------------------
export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "danger" | "accent" }) {
  const tones: Record<string, string> = {
    muted: "bg-panel-3 text-muted",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    danger: "bg-danger/15 text-danger",
    accent: "bg-accent/15 text-accent",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Лог консоли
// ---------------------------------------------------------------------------
export function LogView({ lines, className }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);
  return (
    <div
      ref={ref}
      className={cn("overflow-y-auto rounded-lg border border-line bg-[#0a0f1c] p-3 font-mono text-[11.5px] leading-5", className)}
    >
      {lines.length === 0 && <div className="text-muted/60">Ждём вывод…</div>}
      {lines.map((l, i) => (
        <div key={i} className="whitespace-pre-wrap break-all text-ink/85">
          {l}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Аватар игрока (crafatar, с фолбэком)
// ---------------------------------------------------------------------------
export function Avatar({ name, size = 96 }: { name: string; size?: number }) {
  const n = (name || "").trim();
  const [err, setErr] = useState(false);
  if (!n || err) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-panel-3 font-bold text-muted"
        style={{ width: size, height: size, fontSize: size / 3 }}
      >
        {(n || "?").slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={`https://crafatar.com/avatars/${encodeURIComponent(n)}?size=${size}&overlay`}
      alt={n}
      width={size}
      height={size}
      className="rounded-xl"
      onError={() => setErr(true)}
    />
  );
}
