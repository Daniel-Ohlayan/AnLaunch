import { useEffect, useRef } from "react";
import { CloseIcon, DownloadIcon } from "./icons";

export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error" | "success";
  text: string;
}

export default function LogsModal({
  open,
  onClose,
  logs,
  status,
}: {
  open: boolean;
  onClose: () => void;
  logs: LogEntry[];
  status: "idle" | "running" | "success" | "error";
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!open) return null;

  const levelColors: Record<LogEntry["level"], string> = {
    info: "text-white/60",
    warn: "text-yellow-300",
    error: "text-red-300",
    success: "text-emerald-300",
  };

  function formatTime(t: number) {
    const d = new Date(t);
    return d.toLocaleTimeString("ru-RU", { hour12: false });
  }

  function copyAll() {
    const text = logs
      .map((l) => `[${formatTime(l.time)}] [${l.level.toUpperCase()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  }

  function saveLog() {
    const text = logs
      .map((l) => `[${formatTime(l.time)}] [${l.level.toUpperCase()}] ${l.text}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anlaunch-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusText = {
    idle: "Готов к запуску",
    running: "Идёт запуск…",
    success: "✓ Игра запущена",
    error: "✗ Ошибка запуска",
  }[status];

  const statusColor = {
    idle: "text-white/50",
    running: "text-yellow-300 animate-pulse",
    success: "text-emerald-300",
    error: "text-red-300",
  }[status];

  return (
    <div className="fixed inset-0 z-[90] flex items-stretch justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={status === "running" ? undefined : onClose}
      />
      <div className="relative flex w-full max-w-3xl flex-col border-l border-white/[0.08] bg-[#0a0b0f] shadow-2xl animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/30 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-white">Логи запуска</div>
            <div className={`mt-0.5 text-sm ${statusColor}`}>{statusText}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAll}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
            >
              📋 Копировать
            </button>
            <button
              onClick={saveLog}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
            >
              <DownloadIcon className="mr-1 inline h-3.5 w-3.5" />
              Сохранить
            </button>
            <button
              onClick={status === "running" ? undefined : onClose}
              disabled={status === "running"}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 transition hover:bg-white/[0.1] disabled:opacity-30"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto bg-black/30 p-5 font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-white/30">
              Логи появятся здесь при запуске игры
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 text-white/30">{formatTime(log.time)}</span>
                  <span className={`shrink-0 ${levelColors[log.level]}`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="break-words text-white/85">{log.text}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/30 px-5 py-3 text-xs text-white/40">
          <span>{logs.length} записей</span>
          <span>
            Нажмите <Kbd>Ctrl+C</Kbd> чтобы скопировать, <Kbd>Ctrl+S</Kbd> чтобы сохранить
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
      {children}
    </kbd>
  );
}
