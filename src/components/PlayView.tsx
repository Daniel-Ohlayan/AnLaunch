import { useEffect, useState } from "react";
import type { ModLoader } from "../lib/modrinth";
import type { Account } from "../lib/accounts";
import type { MinecraftVersion } from "../lib/versions";
import type { ProfileInfo } from "../types/electron";
import { getAllVersions, POPULAR_VERSIONS } from "../lib/versions";
import { SearchIcon, PlayIcon } from "./icons";
import ProfilesBar from "./ProfilesBar";
import type { HomeSettings } from "./HomeSettingsModal";
import { getAccent } from "../lib/accent";

const LOADERS: { id: ModLoader; label: string }[] = [
  { id: "fabric", label: "Fabric" },
  { id: "forge", label: "Forge" },
  { id: "quilt", label: "Quilt" },
  { id: "neoforge", label: "NeoForge" },
  { id: "vanilla", label: "Vanilla" },
];

export default function PlayView({
  gameVersion,
  setGameVersion,
  loader,
  setLoader,
  ram,
  setRam,
  installedCount,
  activeAccount,
  activeProfile,
  onLaunch,
  profiles,
  onProfileChange,
  onRenameProfile,
  onDeleteProfile,
  homeSettings,
  onOpenHomeSettings,
  onOpenCreateProfile,
}: {
  gameVersion: string;
  setGameVersion: (v: string) => void;
  loader: ModLoader;
  setLoader: (l: ModLoader) => void;
  ram: number;
  setRam: (n: number) => void;
  installedCount: number;
  activeAccount: Account | null;
  activeProfile: string;
  onLaunch: () => void;
  profiles: ProfileInfo[];
  onProfileChange: (name: string) => void;
  onRenameProfile: (oldName: string, newName: string) => void;
  onDeleteProfile: (name: string) => void;
  homeSettings: HomeSettings;
  onOpenHomeSettings: () => void;
  onOpenCreateProfile: () => void;
}) {
  const [allVersions, setAllVersions] = useState<MinecraftVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [javaAvailable, setJavaAvailable] = useState<boolean | null>(null);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setAllVersions(await getAllVersions());
      } catch {
        /* fallback */
      } finally {
        setLoading(false);
      }
    })();

    if (window.electronAPI) {
      window.electronAPI.checkJava().then((java) => setJavaAvailable(java.exists));
    }
  }, []);

  const filteredVersions = search
    ? allVersions.filter((v) => v.id.toLowerCase().includes(search.toLowerCase()))
    : [];

  const popularVersionObjects = POPULAR_VERSIONS.map((id) => {
    const found = allVersions.find((v) => v.id === id);
    return found || { id, type: "release" as const, url: "", time: "", releaseTime: "" };
  });

  const displayVersions = search ? filteredVersions.slice(0, 40) : popularVersionObjects;

  const heroBg =
    homeSettings.customBackgroundUrl ||
    (homeSettings.backgroundUrl === "" ? null : homeSettings.backgroundUrl) ||
    "./hero-bg.jpg";

  const accent = getAccent(homeSettings.accentColor);
  const accentClass = accent.gradient;

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
            <span className={`rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300`}>
              ● Готов к игре
            </span>
            {installedCount > 0 && (
              <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur">
                🧩 {installedCount} модов
              </span>
            )}
            <button
              onClick={onOpenHomeSettings}
              className="ml-auto rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-white/70 backdrop-blur transition hover:border-emerald-400/40 hover:text-white"
              title="Настроить главный экран"
            >
              ⚙️ Оформить
            </button>
          </div>

          <div>
            {homeSettings.showWelcome && (
              <div className="text-sm font-medium text-emerald-300/80">
                Привет, {activeAccount?.username || "гость"} 👋
              </div>
            )}
            <h1 className="mt-1 text-5xl font-black tracking-tight text-white drop-shadow-xl">
              Minecraft {gameVersion}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              <span className="font-semibold text-white/85">
                {loader === "vanilla" ? "Vanilla" : loader.charAt(0).toUpperCase() + loader.slice(1)}
              </span>{" "}
              · {ram} ГБ RAM
            </p>

            {homeSettings.profileDescription && (
              <p className="mt-2 max-w-md text-xs italic text-white/50">
                «{homeSettings.profileDescription}»
              </p>
            )}

            {/* Avatar */}
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

      {/* Bottom dock */}
      <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-3">
        {/* Version selector */}
        <div className="relative">
          <button
            onClick={() => setVersionMenuOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-left transition hover:border-emerald-400/30"
          >
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Версия
              </span>
              <span className="text-lg font-bold text-white">{gameVersion}</span>
            </span>
            <span className="text-white/30">▾</span>
          </button>

          {versionMenuOpen && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-80 animate-scale-in rounded-2xl border border-white/[0.08] bg-[#101216] p-3 shadow-2xl">
              <div className="relative mb-2.5">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск версии"
                  autoFocus
                  className="w-full rounded-lg border border-white/[0.06] bg-black/30 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {loading && !search ? (
                  <div className="py-6 text-center text-xs text-white/30">Загрузка…</div>
                ) : displayVersions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-white/30">Не найдено</div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {displayVersions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setGameVersion(v.id);
                          setVersionMenuOpen(false);
                          setSearch("");
                        }}
                        className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                          gameVersion === v.id
                            ? "bg-emerald-400 text-[#06070a]"
                            : "bg-white/[0.03] text-white/55 hover:bg-white/[0.08]"
                        }`}
                      >
                        {v.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loader selector */}
        <div className="flex flex-col justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
            Загрузчик
          </span>
          <select
            value={loader}
            onChange={(e) => setLoader(e.target.value as ModLoader)}
            className="-ml-0.5 cursor-pointer appearance-none bg-transparent text-lg font-bold text-white outline-none"
          >
            {LOADERS.map((l) => (
              <option key={l.id} value={l.id} className="bg-[#101216]">
                {l.label}
              </option>
            ))}
          </select>
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

      {/* Status + RAM row */}
      <div className="flex items-center gap-3">
        {javaAvailable === false && (
          <span className="rounded-xl bg-amber-500/10 px-4 py-2 text-xs text-amber-300/80">
            ⚠ Java не найдена —{" "}
            <a href="https://adoptium.net/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              установить Java 17+
            </a>
          </span>
        )}
        {javaAvailable === true && (
          <span className="rounded-xl bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300/80">
            ✓ Java готова — реальный запуск активен
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2">
          <span className="text-xs font-medium text-white/40">RAM</span>
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={ram}
            onChange={(e) => setRam(Number(e.target.value))}
            className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-500"
          />
          <span className="w-12 text-right text-sm font-bold text-emerald-300">{ram} ГБ</span>
        </div>
      </div>

      {versionMenuOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setVersionMenuOpen(false);
            setSearch("");
          }}
        />
      )}
    </div>
  );
}
