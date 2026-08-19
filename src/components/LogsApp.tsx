// Полноэкранное окно логов (открывается как отдельное Electron-окно)
import { useEffect, useRef, useState } from "react";
import { DownloadIcon } from "./icons";

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

const LEVEL_BG: Record<LogEntry["level"], string> = {
  info: "bg-white/[0.04]",
  warn: "bg-yellow-500/10",
  error: "bg-red-500/10",
  success: "bg-emerald-500/10",
};

function formatTime(t: number) {
  const d = new Date(t);
  return d.toLocaleTimeString("ru-RU", { hour12: false });
}

export default function LogsApp() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error" | "success">("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Загружаем существующие логи
    window.electronAPI.getLogs().then((res) => {
      if (res.success) setLogs(res.logs);
    });

    // Подписываемся на новые
    const unsub = window.electronAPI.onLogEntry((entry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 2000) return next.slice(-2000);
        return next;
      });
    });

    return unsub;
  }, []);

  // Автоскролл
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [logs, autoScroll]);

  // Определяем статус из последнего лога
  useEffect(() => {
    if (logs.length === 0) return;
    const last = logs[logs.length - 1];
    if (last.level === "error") setStatus("error");
    else if (last.level === "success") setStatus("success");
    else setStatus("running");
  }, [logs.length]);

  const filteredLogs = logs.filter((l) => {
    if (filter !== "all" && l.level !== filter) return false;
    if (search && !l.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function clearLogs() {
    if (confirm("Очистить все логи?")) {
      window.electronAPI?.clearLogs();
      setLogs([]);
    }
  }

  function copyAll() {
    const text = filteredLogs
      .map((l) => `[${formatTime(l.time)}] [${l.level.toUpperCase()}] ${l.text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  }

  function saveLog() {
    const text = filteredLogs
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

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0f] font-mono">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#080b14] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white">AnLaunch — Логи запуска</div>
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <span
                className={`inline-flex h-1.5 w-1.5 rounded-full ${
                  status === "running"
                    ? "animate-pulse bg-yellow-400"
                    : status === "success"
                    ? "bg-emerald-400"
                    : status === "error"
                    ? "bg-red-400"
                    : "bg-white/30"
                }`}
              />
              <span>
                {status === "running" ? "Запуск…" : status === "success" ? "Готово" : status === "error" ? "Ошибка" : "Ожидание"}
              </span>
              <span className="text-white/20">·</span>
              <span>{logs.length} записей</span>
              {errorCount > 0 && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-red-300">{errorCount} ошибок</span>
                </>
              )}
              {warnCount > 0 && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-yellow-300">{warnCount} предупр.</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="w-40 rounded-md border border-white/[0.08] bg-black/40 py-1.5 pl-3 pr-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-400/50"
            />
          </div>
          <div className="flex rounded-md border border-white/[0.06] bg-black/30 p-0.5">
            {(["all", "info", "warn", "error", "success"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded px-2 py-1 text-[10px] font-semibold uppercase transition ${
                  filter === f ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {f === "all" ? "Все" : f === "info" ? "Info" : f === "warn" ? "Warn" : f === "error" ? "Error" : "OK"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`rounded-md p-1.5 text-xs transition ${
              autoScroll ? "bg-cyan-500/20 text-cyan-300" : "bg-white/[0.05] text-white/40"
            }`}
            title="Автоскролл"
          >
            ↓
          </button>
          <button
            onClick={copyAll}
            className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.1]"
            title="Копировать"
          >
            📋
          </button>
          <button
            onClick={saveLog}
            className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.1]"
            title="Сохранить"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={clearLogs}
            className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20"
            title="Очистить"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto bg-black/40 p-3 text-xs">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-white/30">
            <div className="text-base">📜</div>
            <div className="mt-2 text-sm">
              {logs.length === 0 ? "Логи появятся здесь при запуске игры" : "Нет логов по фильтру"}
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log, i) => (
              <div
                key={i}
                className={`flex gap-3 rounded px-2 py-1 transition hover:bg-white/[0.02] ${LEVEL_BG[log.level]}`}
              >
                <span className="shrink-0 text-[10px] text-white/30">{formatTime(log.time)}</span>
                <span className={`shrink-0 text-[10px] font-bold uppercase ${LEVEL_COLORS[log.level]}`}>
                  [{log.level}]
                </span>
                <span className="break-words text-[12px] text-white/85">{log.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.06] bg-[#080b14] px-4 py-2 text-[10px] text-white/40">
        <span>
          AnLaunch v1.0.2 · {window.electronAPI ? "Electron" : "Browser"}
        </span>
        <span>
          <Kbd>Ctrl+L</Kbd> фокус · <Kbd>Ctrl+K</Kbd> очистить · <Kbd>Ctrl+S</Kbd> сохранить
        </span>
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
