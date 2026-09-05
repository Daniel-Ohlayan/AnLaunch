import { useEffect, useRef, useState } from "react";

interface LogEntry {
  time: number;
  level: "info" | "warn" | "error" | "success";
  text: string;
}

const LEVEL_COLORS: Record<LogEntry["level"], string> = {
  info: "text-white/70",
  warn: "text-yellow-300",
  error: "text-red-300",
  success: "text-emerald-300",
};

function formatTime(t: number) {
  return new Date(t).toLocaleTimeString("ru-RU", { hour12: false });
}

export default function LogsDrawer({
  open,
  onClose,
  logs,
}: {
  open: boolean;
  onClose: () => void;
  logs: LogEntry[];
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (open && autoScroll) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs, open, autoScroll]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex h-[min(78vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0d12] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-white">Логи запуска</div>
            <div className="text-[11px] text-white/40">{logs.length} записей</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={`rounded-lg px-2.5 py-1.5 text-xs ${
                autoScroll ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.06] text-white/50"
              }`}
            >
              автоскролл
            </button>
            <button
              onClick={() => window.electronAPI?.openLogsWindow()}
              className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.1]"
            >
              отдельное окно
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm text-white/80 hover:bg-white/[0.1]"
            >
              Закрыть
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-black/40 p-3 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-white/30">
              Логи появятся при запуске игры
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 rounded px-2 py-1">
                  <span className="shrink-0 text-[10px] text-white/30">{formatTime(log.time)}</span>
                  <span className={`shrink-0 text-[10px] font-bold uppercase ${LEVEL_COLORS[log.level]}`}>
                    [{log.level}]
                  </span>
                  <span className="whitespace-pre-wrap break-words text-[12px] text-white/85">{log.text}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
