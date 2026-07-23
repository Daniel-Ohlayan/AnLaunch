import { useEffect, useState } from "react";
import TopNav, { type Tab } from "./components/TopNav";
import PlayView from "./components/PlayView";
import ModsView from "./components/ModsView";
import SettingsView from "./components/SettingsView";
import AccountsModal from "./components/AccountsModal";
import HomeSettingsModal, { DEFAULT_HOME_SETTINGS, type HomeSettings } from "./components/HomeSettingsModal";
import CreateProfileModal from "./components/CreateProfileModal";
import { getAccent, applyAccentToDocument } from "./lib/accent";
void applyAccentToDocument;
import {
  type InstalledMod,
  type ModLoader,
  type ModHit,
  type ProjectType,
  downloadModJar,
  downloadModToProfile,
  getProjectVersions,
  findCompatibleFile,
  getSubfolderForType,
} from "./lib/modrinth";
import type { Account } from "./lib/accounts";
import { getActiveAccount } from "./lib/accounts";
import { launchMinecraftReal } from "./lib/minecraft";
import { PlayIcon } from "./components/icons";
import type { ProfileInfo } from "./types/electron";

export default function App() {
  const [tab, setTab] = useState<Tab>("play");
  const [gameVersion, setGameVersion] = useState<string>("26.2");
  const [loader, setLoader] = useState<ModLoader>("fabric");
  const [ram, setRam] = useState(4);
  const [activeProfile, setActiveProfile] = useState<string>("Default");
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([]);
  const [modStates, setModStates] = useState<Record<string, boolean>>({});
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [launching, setLaunching] = useState<{ open: boolean; progress: number; label: string }>({
    open: false,
    progress: 0,
    label: "",
  });
  const [launchStatus, setLaunchStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [homeSettingsOpen, setHomeSettingsOpen] = useState(false);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [homeSettings, setHomeSettings] = useState<HomeSettings>(() => {
    try {
      const saved = localStorage.getItem("anlaunch_home_settings");
      return saved ? { ...DEFAULT_HOME_SETTINGS, ...JSON.parse(saved) } : DEFAULT_HOME_SETTINGS;
    } catch {
      return DEFAULT_HOME_SETTINGS;
    }
  });

  const [diagToast, setDiagToast] = useState<string | null>(null);

  // Load active account
  useEffect(() => {
    const account = getActiveAccount();
    setActiveAccount(account);
    refreshProfiles();
  }, []);

  // Сохранение home settings
  useEffect(() => {
    localStorage.setItem("anlaunch_home_settings", JSON.stringify(homeSettings));
    applyAccentToDocument(homeSettings.accentColor);
  }, [homeSettings]);

  // Применяем accent при загрузке
  useEffect(() => {
    applyAccentToDocument(homeSettings.accentColor);
  }, []);

  function updateHomeSettings(next: HomeSettings) {
    setHomeSettings(next);
  }

  // Копирует диагностику системы в буфер обмена
  async function copyDiagnostics() {
    const info = [
      "=== AnLaunch Diagnostics ===",
      `Версия AnLaunch: 1.0.0`,
      `User Agent: ${navigator.userAgent}`,
      `Платформа: ${navigator.platform}`,
      `Язык: ${navigator.language}`,
      `Разрешение: ${window.screen.width}x${window.screen.height}`,
      `Версия: ${gameVersion}`,
      `Загрузчик: ${loader}`,
      `RAM: ${ram} ГБ`,
      `Аккаунт: ${activeAccount?.username || "не выбран"} (${activeAccount?.type || "-"})`,
      `Установлено модов: ${installedMods.length}`,
      `Активный профиль: ${activeProfile}`,
      `Electron: ${!!window.electronAPI}`,
      `localStorage: ${localStorage.length} ключей`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(info);
      setDiagToast("✓ Диагностика скопирована в буфер обмена");
    } catch {
      setDiagToast("Не удалось скопировать. Попробуйте вручную.");
    }
    setTimeout(() => setDiagToast(null), 3000);
  }

  // Escape закрывает модальные окна
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Escape") {
        setAccountsOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function installMod(hit: ModHit, projectType: ProjectType = "mod") {
    // 1. Находим совместимый файл
    const versions = await getProjectVersions(hit.project_id);
    const file = findCompatibleFile(versions, loader, gameVersion as any, projectType);
    if (!file) throw new Error("Нет совместимого файла для этой версии/загрузчика");

    // 2. Реально скачиваем в папку профиля
    const dl = await downloadModToProfile(
      {
        id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        icon_url: hit.icon_url,
        author: hit.author,
        source: "modrinth",
        projectType,
        loader,
        gameVersion,
        fileName: file.filename,
        size: file.size,
        downloadsUrl: file.url,
        profile: activeProfile,
      },
      activeProfile
    );
    if (!dl.success) throw new Error(dl.error || "Не удалось скачать");

    // 3. Добавляем в список
    const installed: InstalledMod = {
      id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      icon_url: hit.icon_url,
      author: hit.author,
      source: "modrinth",
      projectType,
      loader,
      gameVersion,
      fileName: file.filename,
      size: file.size,
      downloadsUrl: file.url,
      profile: activeProfile,
      installedAt: Date.now(),
    };
    setInstalledMods((prev) => (prev.some((m) => m.id === installed.id) ? prev : [...prev, installed]));
    setModStates((s) => ({ ...s, [installed.id]: true }));
  }

  async function exportInstalled(mod: InstalledMod) {
    await downloadModJar(mod);
  }

  async function removeMod(id: string) {
    const mod = installedMods.find((m) => m.id === id);
    // Реально удаляем файл из папки профиля
    if (mod && window.electronAPI) {
      try {
        await window.electronAPI.removeModFromProfile({
          profile: mod.profile || activeProfile,
          fileName: mod.fileName,
          subfolder: getSubfolderForType(mod.projectType),
        });
      } catch {
        /* игнорируем */
      }
    }
    setInstalledMods((prev) => prev.filter((m) => m.id !== id));
    setModStates((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
  }

  function addLog(level: "info" | "warn" | "error" | "success", text: string) {
    const entry = { time: Date.now(), level, text };
    // Отправляем в отдельное окно логов
    window.electronAPI?.appendLog(entry);
  }

  async function refreshProfiles() {
    if (!window.electronAPI) return;
    try {
      const list = await window.electronAPI.listProfiles();
      setProfiles(list);
    } catch {
      /* ignore */
    }
  }

  async function launch() {
    if (!activeAccount) {
      setAccountsOpen(true);
      return;
    }

    // Автоматически создаём профиль для версии
    const profileName = gameVersion;

    setLaunching({ open: true, progress: 0, label: "Подготовка запуска..." });
    setLaunchStatus("running");
    // Открываем отдельное окно логов (как в Lunar Client)
    if (window.electronAPI) {
      window.electronAPI.openLogsWindow();
    }
    // Очищаем предыдущие логи и пишем новые
    if (window.electronAPI) {
      window.electronAPI.clearLogs();
    }
    const headerEntries = [
      { time: Date.now(), level: "info" as const, text: `=== Запуск Minecraft ${gameVersion} (${loader}) ===` },
      { time: Date.now(), level: "info" as const, text: `Аккаунт: ${activeAccount.username} (${activeAccount.type})` },
      { time: Date.now(), level: "info" as const, text: `Профиль: ${profileName}` },
      { time: Date.now(), level: "info" as const, text: `RAM: ${ram} ГБ` },
      { time: Date.now(), level: "info" as const, text: `Установленных модов: ${installedMods.length}` },
    ];
    for (const e of headerEntries) {
      window.electronAPI?.appendLog(e);
    }

    // Попытка реального запуска через Electron
    if (window.electronAPI) {
      try {
        await window.electronAPI.createProfile(profileName);
        setActiveProfile(profileName);
        addLog("info", `Профиль ${profileName} готов`);
        await refreshProfiles();

        setLaunching((l) => ({ ...l, progress: 10, label: "Проверка Java..." }));
        addLog("info", "Проверка Java...");

        let step = 10;
        const unsub = window.electronAPI.onLaunchProgress((msg) => {
          step = Math.min(95, step + 5);
          setLaunching((l) => ({ ...l, progress: step, label: msg }));
          addLog("info", msg);
        });

        const result = await launchMinecraftReal({
          account: activeAccount,
          version: gameVersion,
          loader,
          ram,
          profile: profileName,
          mods: installedMods.filter((m) => m.profile === profileName),
          modStates,
        });

        unsub();

        if (result.success) {
          addLog("success", result.message);
          setLaunchStatus("success");
          setLaunching((l) => ({
            ...l,
            progress: 100,
            label: `✅ ${result.message}`,
          }));
        } else {
          addLog("error", result.message);
          setLaunchStatus("error");
          setLaunching((l) => ({
            ...l,
            progress: 100,
            label: `❌ ${result.message}`,
          }));
        }
        return;
      } catch (e) {
        addLog("error", e instanceof Error ? e.message : String(e));
        setLaunchStatus("error");
        setLaunching((l) => ({
          ...l,
          progress: 100,
          label: `❌ ${e instanceof Error ? e.message : "Ошибка запуска"}`,
        }));
        return;
      }
    }

    // Симуляция запуска в браузере
    const steps = [
      "Проверка файлов игры...",
      "Загрузка модов Modrinth...",
      "Запуск JVM...",
      `Выделение ${ram} ГБ RAM...`,
      `Запуск Minecraft ${gameVersion}...`,
    ];
    let i = 0;
    const tick = () => {
      i++;
      const progress = Math.min(100, Math.round((i / steps.length) * 100));
      setLaunching((l) => ({ ...l, progress, label: steps[Math.min(i, steps.length - 1)] }));
      if (i < steps.length) {
        setTimeout(tick, 700);
      } else {
        setTimeout(() => {
          setLaunching((l) => ({
            ...l,
            label: "✅ Minecraft запущен (симуляция)",
          }));
        }, 600);
      }
    };
    setTimeout(tick, 600);
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#06070a] p-0 sm:p-6">
      {/* Animated aurora background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="aurora-blob absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/20" />
        <div className="aurora-blob absolute -right-40 top-20 h-[460px] w-[460px] rounded-full bg-teal-500/15" style={{ animationDelay: "-8s" }} />
        <div className="aurora-blob absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-500/10" style={{ animationDelay: "-16s" }} />
      </div>

      <div className="relative flex h-full w-full max-w-[1220px] flex-col overflow-hidden rounded-none border border-white/[0.06] bg-[#0a0b0f]/80 shadow-2xl backdrop-blur-2xl sm:h-[820px] sm:rounded-3xl">
        <TopNav
          active={tab}
          onSelect={setTab}
          installedCount={installedMods.length}
          activeAccount={activeAccount}
          onOpenAccounts={() => setAccountsOpen(true)}
          onDiagnostics={copyDiagnostics}
          onHomeSettings={() => setHomeSettingsOpen(true)}
          onShowLogs={() => window.electronAPI?.openLogsWindow()}
          hasRunningLaunch={launchStatus === "running"}
          accent={getAccent(homeSettings.accentColor)}
        />

        <main className="min-h-0 flex-1">
          {tab === "play" && (
            <PlayView
              gameVersion={gameVersion}
              setGameVersion={setGameVersion}
              loader={loader}
              setLoader={setLoader}
              ram={ram}
              setRam={setRam}
              installedCount={installedMods.length}
              activeAccount={activeAccount}
              activeProfile={activeProfile}
              onLaunch={launch}
              profiles={profiles}
              onProfileChange={(n) => {
                setActiveProfile(n);
                if (window.electronAPI) {
                  localStorage.setItem("anlaunch_active_profile", n);
                }
              }}
              onRenameProfile={async (old: string, n: string) => {
                const r = await window.electronAPI?.renameProfile(old, n);
                if (r?.success && activeProfile === old) setActiveProfile(n);
                await refreshProfiles();
              }}
              onDeleteProfile={async (n) => {
                await window.electronAPI?.deleteProfile(n);
                if (activeProfile === n && profiles.length > 0) {
                  const next = profiles.find((p) => p.name !== n);
                  if (next) setActiveProfile(next.name);
                }
                await refreshProfiles();
              }}
              homeSettings={homeSettings}
              onOpenHomeSettings={() => setHomeSettingsOpen(true)}
              onOpenCreateProfile={() => setCreateProfileOpen(true)}
            />
          )}
          {tab === "mods" && (
            <ModsView
              gameVersion={gameVersion}
              loader={loader}
              activeProfile={activeProfile}
              installedMods={installedMods}
              onInstall={installMod}
              onExport={exportInstalled}
              onRemove={removeMod}
            />
          )}
          {tab === "settings" && (
            <SettingsView
              ram={ram}
              setRam={setRam}
              gameVersion={gameVersion}
              loader={loader}
              activeProfile={activeProfile}
              setActiveProfile={setActiveProfile}
            />
          )}
        </main>
      </div>

      <AccountsModal
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        activeAccount={activeAccount}
        onChange={(acc) => setActiveAccount(acc)}
      />

      {/* В TopNav есть кнопка открытия отдельного окна логов */}

      <HomeSettingsModal
        open={homeSettingsOpen}
        onClose={() => setHomeSettingsOpen(false)}
        settings={homeSettings}
        onChange={updateHomeSettings}
        activeProfile={activeProfile}
        onOpenProfileFolder={() => window.electronAPI?.openProfileFolder(activeProfile)}
      />

      <CreateProfileModal
        open={createProfileOpen}
        onClose={() => setCreateProfileOpen(false)}
        onCreate={async (data) => {
          await window.electronAPI?.createProfile(data.name);
          setActiveProfile(data.name);
          setGameVersion(data.version);
          setLoader(data.loader);
          // Сохраняем данные профиля в localStorage
          const key = `anlaunch_profile_${data.name}`;
          localStorage.setItem(
            key,
            JSON.stringify({
              description: data.description,
              avatarUrl: data.avatarUrl,
              accentColor: data.accentColor,
            })
          );
          await refreshProfiles();
        }}
        homeSettings={homeSettings}
        defaultVersion={gameVersion}
        defaultLoader={loader}
      />

      {diagToast && (
        <div className="fixed bottom-6 right-6 z-[80] animate-scale-in rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200 shadow-2xl backdrop-blur-md">
          {diagToast}
        </div>
      )}

      {launching.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="w-[420px] animate-scale-in rounded-2xl border border-white/[0.08] bg-[#141419] p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500">
                <PlayIcon className="h-5 w-5 text-[#06070a]" />
              </div>
              <div>
                <div className="font-semibold text-white">Запуск Minecraft</div>
                <div className="text-xs text-white/40">
                  {loader === "vanilla" ? "Vanilla" : loader} · {gameVersion}
                </div>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-500"
                style={{ width: `${launching.progress}%` }}
              />
            </div>
            <div className="mt-3 min-h-[40px] whitespace-pre-line text-sm leading-relaxed text-white/55">
              {launching.label}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs font-medium text-white/30">{launching.progress}%</span>
              <button
                onClick={() => setLaunching((l) => ({ ...l, open: false }))}
                className="rounded-lg bg-white/[0.06] px-4 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/[0.1]"
              >
                {launching.progress >= 100 ? "Закрыть" : "Отмена"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
