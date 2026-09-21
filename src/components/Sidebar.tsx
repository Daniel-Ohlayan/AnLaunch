import { cn } from "../lib/cn";
import type { AuthState, Profile } from "../lib/types";
import { Avatar } from "./ui";

export type Tab = "mods" | "profiles" | "settings";

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: "mods", label: "Моды", icon: "🧩" },
  { id: "profiles", label: "Профили", icon: "🎮" },
  { id: "settings", label: "Настройки", icon: "⚙️" },
];

export function Sidebar({
  tab,
  onTab,
  version,
  demo,
  activeProfile,
  auth,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  version: string;
  demo: boolean;
  activeProfile: Profile | null;
  auth: AuthState;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      {/* Логотип */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-4">
        <img src="icon.png" alt="" className="h-10 w-10 rounded-xl" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-wide">AnLaunch</div>
          <div className="text-[11px] text-muted">
            {demo ? "демо-режим · " : ""}
            <span className="text-accent">v{version}</span>
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onTab(n.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              tab === n.id
                ? "bg-gradient-to-r from-accent/20 to-accent-2/10 text-ink shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
                : "text-muted hover:bg-panel-3 hover:text-ink",
            )}
          >
            <span className="text-base leading-none">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {/* Активный профиль + игрок */}
      <div className="space-y-2 border-t border-line p-3">
        {activeProfile && (
          <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Активный профиль</div>
            <div className="truncate text-sm font-semibold">{activeProfile.name}</div>
            <div className="truncate text-[11px] text-muted">
              {activeProfile.gameVersion}
              {activeProfile.loader !== "vanilla" ? ` · ${activeProfile.loader} ${activeProfile.loaderVersion}` : ""}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
          <Avatar name={auth.username || ""} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{auth.loggedIn ? auth.username : "Не в сети"}</div>
            <div className="text-[11px] text-muted">{auth.loggedIn ? (auth.kind === "microsoft" ? "Microsoft" : "offline") : "offline"}</div>
          </div>
          <span className={cn("h-2 w-2 rounded-full", auth.loggedIn ? "bg-ok" : "bg-muted/40")} />
        </div>
      </div>
    </aside>
  );
}
