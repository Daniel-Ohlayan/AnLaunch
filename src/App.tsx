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
  // Моды загружаются из localStorage — каждый мод привязан к своему профилю
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("anlaunch_installed_mods") || "[]");
    } catch {
      return [];
    }
  });
  const [modStates, setModStates] = useState<Record<string, boolean>>({});
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [javaPath, setJavaPath] = useState(() => localStorage.getItem("anlaunch_java_path") || "");
  const [openLogsOnLaunch, setOpenLogsOnLaunch] = useState(
    () => localStorage.getItem("anlaunch_open_logs") !== "false"
  );
  const [clearLogsOnLaunch, setClearLogsOnLaunch] = useState(
    () => localStorage.getItem("anlaunch_clear_logs") !== "false"
  );
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(
    () => localStorage.getItem("anlaunch_minimize_on_launch") === "true"
  );
  // Настройки окна и JVM Minecraft — реально применяются к команде запуска
  const [mcFullscreen, setMcFullscreen] = useState(
    () => localStorage.getItem("anlaunch_mc_fullscreen") === "true"
  );
  const [mcWidth, setMcWidth] = useState(
    () => parseInt(localStorage.getItem("anlaunch_mc_width") || "1280", 10) || 1280
  );
  const [mcHeight, setMcHeight] = useState(
    () => parseInt(localStorage.getItem("anlaunch_mc_height") || "720", 10) || 720
  );
  const [jvmArgs, setJvmArgs] = useState(
    () => localStorage.getItem("anlaunch_jvm_args") || ""
  );
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

  // Сохраняем установленные моды при каждом изменении
  useEffect(() => {
    localStorage.setItem("anlaunch_installed_mods", JSON.stringify(installedMods));
  }, [installedMods]);

  useEffect(() => {
    localStorage.setItem("anlaunch_java_path", javaPath);
    localStorage.setItem("anlaunch_open_logs", String(openLogsOnLaunch));
    localStorage.setItem("anlaunch_clear_logs", String(clearLogsOnLaunch));
    localStorage.setItem("anlaunch_minimize_on_launch", String(minimizeOnLaunch));
    localStorage.setItem("anlaunch_mc_fullscreen", String(mcFullscreen));
    localStorage.setItem("anlaunch_mc_width", String(mcWidth));
    localStorage.setItem("anlaunch_mc_height", String(mcHeight));
    localStorage.setItem("anlaunch_jvm_args", jvmArgs);
  }, [javaPath, openLogsOnLaunch, clearLogsOnLaunch, minimizeOnLaunch, mcFullscreen, mcWidth, mcHeight, jvmArgs]);

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
      `Версия AnLaunch: 1.0.2`,
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
    const versions = await getProjectVersions(hit.project_id, {
      loader,
      gameVersion,
      projectType,
    });
    const file = findCompatibleFile(versions, loader, gameVersion as any, projectType);
    if (!file) {
      throw new Error(
        `Для Minecraft ${gameVersion} (${loader}) нет совместимой версии «${hit.title}». ` +
        `Старый файл установлен не будет.`
      );
    }

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
    setInstalledMods((prev) =>
      prev.some((m) => m.id === installed.id && m.profile === installed.profile)
        ? prev
        : [...prev, installed]
    );
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
    setInstalledMods((prev) =>
      prev.filter((m) => !(m.id === id && (m.profile === activeProfile || m.profile === mod?.profile)))
    );
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

    // Запускаем игру в АКТИВНОМ профиле пользователя — никогда не создаём
    // новый профиль по имени версии и не переключаемся на него.
    const profileName = activeProfile || "Default";

    setLaunching({ open: true, progress: 0, label: "Подготовка запуска..." });
    setLaunchStatus("running");
    // Открываем отдельное окно логов (как в Lunar Client)
    if (window.electronAPI && openLogsOnLaunch) {
      window.electronAPI.openLogsWindow();
    }
    // Очищаем предыдущие логи и пишем новые
    if (window.electronAPI && clearLogsOnLaunch) {
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
        // ensureProfile создаст папку профиля, если её ещё нет, но НЕ переключает
        await window.electronAPI.createProfile(profileName);
        addLog("info", `Запуск в профиле «${profileName}»`);
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
          javaPath: javaPath || undefined,
          mcFullscreen,
          mcWidth: mcFullscreen ? undefined : mcWidth,
          mcHeight: mcFullscreen ? undefined : mcHeight,
          jvmArgs: jvmArgs.trim() ? jvmArgs : undefined,
        });

        unsub();

        if (result.success) {
          if (minimizeOnLaunch) window.electronAPI?.minimizeMainWindow();
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
              loader={loader}
              ram={ram}
              activeAccount={activeAccount}
              activeProfile={activeProfile}
              onLaunch={launch}
              profiles={profiles}
              onProfileChange={(n) => {
                setActiveProfile(n);
                localStorage.setItem("anlaunch_active_profile", n);
                // Загружаем version и loader из сохранённых данных профиля
                try {
                  const data = localStorage.getItem(`anlaunch_profile_${n}`);
                  if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.version) setGameVersion(parsed.version);
                    if (parsed.loader) setLoader(parsed.loader as ModLoader);
                  }
                } catch {}
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
              homeSettings={homeSettings}
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
              javaPath={javaPath}
              setJavaPath={setJavaPath}
              openLogsOnLaunch={openLogsOnLaunch}
              setOpenLogsOnLaunch={setOpenLogsOnLaunch}
              clearLogsOnLaunch={clearLogsOnLaunch}
              setClearLogsOnLaunch={setClearLogsOnLaunch}
              minimizeOnLaunch={minimizeOnLaunch}
              setMinimizeOnLaunch={setMinimizeOnLaunch}
              mcFullscreen={mcFullscreen}
              setMcFullscreen={setMcFullscreen}
              mcWidth={mcWidth}
              setMcWidth={setMcWidth}
              mcHeight={mcHeight}
              setMcHeight={setMcHeight}
              jvmArgs={jvmArgs}
              setJvmArgs={setJvmArgs}
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
          // Сохраняем данные профиля в localStorage (включая version и loader)
          const key = `anlaunch_profile_${data.name}`;
          localStorage.setItem(
            key,
            JSON.stringify({
              version: data.version,
              loader: data.loader,
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
