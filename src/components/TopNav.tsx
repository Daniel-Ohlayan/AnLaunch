import type { Account } from "../lib/accounts";
import { PlayIcon, ModsIcon, SettingsIcon } from "./icons";

export type Tab = "play" | "mods" | "settings";

const items: { id: Tab; label: string; Icon: typeof PlayIcon }[] = [
  { id: "play", label: "Играть", Icon: PlayIcon },
  { id: "mods", label: "Моды", Icon: ModsIcon },
  { id: "settings", label: "Настройки", Icon: SettingsIcon },
];

export default function TopNav({
  active,
  onSelect,
  activeAccount,
  onOpenAccounts,
  onDiagnostics,
  onHomeSettings,
  onShowLogs,
  hasRunningLaunch,
  accent,
  activeProfileAvatar,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  activeAccount: Account | null;
  onOpenAccounts: () => void;
  onDiagnostics: () => void;
  onHomeSettings: () => void;
  onShowLogs: () => void;
  hasRunningLaunch?: boolean;
  accent: { gradient: string; text: string; bg: string; border: string; shadow: string; bgSolid: string };
  activeProfileAvatar?: string | null;
}) {
  return (
    <header className="no-select relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-6 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${accent.gradient} ${accent.shadow} shadow-lg`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#06070a]" fill="currentColor">
            <path d="M12 2l9 5v10l-9 5-9-5V7z" opacity="0.9" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-white">AnLaunch</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">
            Minecraft
          </div>
        </div>
      </div>

      {/* Center pill nav */}
      <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.06] bg-black/30 p-1">
        {items.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive ? "text-[#06070a]" : "text-white/50 hover:text-white/80"
              }`}
            >
              {isActive && (
                <span
                  className={`absolute inset-0 rounded-full bg-gradient-to-r ${accent.gradient}`}
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account + Help */}
      <div className="flex items-center gap-2">
        {hasRunningLaunch && (
          <button
            onClick={onShowLogs}
            className="flex h-9 w-9 animate-pulse items-center justify-center rounded-full border border-yellow-400/40 bg-yellow-500/15 text-yellow-300 transition hover:bg-yellow-500/25"
            title="Показать логи запуска"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
        )}

        <button
          onClick={onHomeSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-black/30 text-white/50 transition hover:border-emerald-400/30 hover:text-white"
          title="Настроить главный экран"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </button>

        <button
          onClick={onDiagnostics}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-black/30 text-white/50 transition hover:border-emerald-400/30 hover:text-white"
          title="Скопировать диагностику"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <button
          onClick={onOpenAccounts}
          className="flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-black/30 py-1.5 pl-1.5 pr-4 transition hover:border-emerald-400/30 hover:bg-black/50"
        >
          {activeProfileAvatar ? (
            <div
              className="h-7 w-7 rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${activeProfileAvatar})` }}
            />
          ) : (
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${accent.gradient} text-xs font-bold text-[#06070a]`}
            >
              {activeAccount?.username?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <span className="max-w-[120px] truncate text-sm font-medium text-white/90">
            {activeAccount?.username || "Войти"}
          </span>
        </button>
      </div>
    </header>
  );
}
