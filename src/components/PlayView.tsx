import { useEffect, useState } from "react";
import type { ModLoader } from "../lib/modrinth";
import type { Account } from "../lib/accounts";
import type { ProfileInfo } from "../types/electron";
import { PlayIcon } from "./icons";
import ProfilesBar from "./ProfilesBar";
import type { HomeSettings } from "./HomeSettingsModal";
import { getAccent } from "../lib/accent";

export default function PlayView({
  gameVersion,
  loader,
  ram,
  activeAccount,
  activeProfile,
  onLaunch,
  javaPath,
  installedCount,
  profiles,
  onProfileChange,
  onRenameProfile,
  onDeleteProfile,
  homeSettings,
  onOpenHomeSettings,
  onOpenCreateProfile,
}: {
  gameVersion: string;
  loader: ModLoader;
  ram: number;
  activeAccount: Account | null;
  activeProfile: string;
  onLaunch: () => void;
  javaPath?: string;
  installedCount?: number;
  profiles: ProfileInfo[];
  onProfileChange: (name: string) => void;
  onRenameProfile: (oldName: string, newName: string) => void;
  onDeleteProfile: (name: string) => void;
  homeSettings: HomeSettings;
  onOpenHomeSettings: () => void;
  onOpenCreateProfile: () => void;
}) {
  const [javaAvailable, setJavaAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const check = javaPath
      ? window.electronAPI.validateJavaPath(javaPath)
      : window.electronAPI.checkJava();
    check.then((java) => setJavaAvailable(java.exists));
  }, [javaPath]);

  const accent = getAccent(homeSettings.accentColor);
  const accentClass = accent.gradient;

  const heroBg =
    homeSettings.customBackgroundUrl ||
    (homeSettings.backgroundUrl === "" ? null : homeSettings.backgroundUrl) ||
    "./hero-bg.jpg";

  return (
    <div className="flex h-full flex-col gap-4 p-6 animate-fade-up">
      {/* Hero card */}
      <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/[0.06]">
        {heroBg && (
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
        )}
        {!heroBg && (
          <div className={`absolute inset-0 bg-gradient-to-br ${accentClass}`} style={{ opacity: 0.15 }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#06070a] via-[#06070a]/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06070a] via-transparent to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-8">
          <div className="flex items-center gap-2">
            <span className={`rounded-full border ${accent.border} ${accent.bg} px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${accent.text}`}>
              ● Готов к игре
            </span>
            <button
              onClick={onOpenHomeSettings}
              className="ml-auto rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-white/70 backdrop-blur transition hover:text-white"
            >
              ⚙️ Оформить
            </button>
          </div>

          <div>
            {homeSettings.showWelcome && (
              <div className={`text-sm font-medium ${accent.text} opacity-80`}>
                Привет, {activeAccount?.username || "гость"} 👋
              </div>
            )}
            <h1 className="mt-1 text-5xl font-black tracking-tight text-white drop-shadow-xl">
              Minecraft {gameVersion}
            </h1>

            {homeSettings.profileDescription && (
              <p className="mt-2 max-w-md text-xs italic text-white/50">
                «{homeSettings.profileDescription}»
              </p>
            )}

            {homeSettings.showStats && (
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-white/70 backdrop-blur">
                  {installedCount ?? 0} модов
                </span>
                <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-white/70 backdrop-blur">
                  {ram} ГБ RAM
                </span>
                <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-white/70 backdrop-blur">
                  {activeProfile}
                </span>
              </div>
            )}

            {homeSettings.avatarUrl && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2">
                <div
                  className="h-24 w-24 rounded-full border-4 border-white/20 bg-cover bg-center shadow-2xl"
                  style={{ backgroundImage: `url(${homeSettings.avatarUrl})` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profiles bar */}
      <ProfilesBar
        profiles={profiles}
        activeProfile={activeProfile}
        onSelect={onProfileChange}
        onRename={onRenameProfile}
        onDelete={onDeleteProfile}
        onOpenCreate={onOpenCreateProfile}
        accent={accent}
      />

      {/* Bottom info + launch */}
      <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
        {/* Version info (read-only from profile) */}
        <div className="flex flex-col justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Версия
          </span>
          <span className="text-lg font-bold text-white">{gameVersion}</span>
        </div>

        {/* Loader info (read-only from profile) */}
        <div className="flex flex-col justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Загрузчик
          </span>
          <span className="text-lg font-bold text-white">
            {loader === "vanilla" ? "Vanilla" : loader.charAt(0).toUpperCase() + loader.slice(1)}
          </span>
        </div>

        {/* Launch */}
        <button
          onClick={onLaunch}
          disabled={!activeAccount}
          className={`group flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r ${accentClass} text-lg font-bold text-[#06070a] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-white/30 animate-glow`}
        >
          <PlayIcon className="h-6 w-6" />
          {!activeAccount ? "Выберите аккаунт" : "ЗАПУСТИТЬ"}
        </button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 text-xs">
        {javaAvailable === false && (
          <span className="rounded-xl bg-amber-500/10 px-4 py-2 text-amber-300/80">
            ⚠ Java не найдена —{" "}
            <a href="https://adoptium.net/" target="_blank" rel="noreferrer" className="underline">
              установить
            </a>
          </span>
        )}
        {javaAvailable === true && (
          <span className={`rounded-xl ${accent.bg} px-4 py-2 ${accent.text}`}>
            ✓ Java готова
          </span>
        )}
        <span className="rounded-xl bg-white/[0.04] px-4 py-2 text-white/50">
          {ram} ГБ RAM · профиль {activeProfile}
        </span>
      </div>
    </div>
  );
}
