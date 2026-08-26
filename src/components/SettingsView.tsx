import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModLoader } from "../lib/modrinth";
import type { ProfileInfo } from "../types/electron";
import { GaugeIcon, ShieldIcon, CubeIcon, DownloadIcon, SettingsIcon } from "./icons";

const MC_LANGUAGES = [
  { id: "", label: "Системный" },
  { id: "ru_ru", label: "Русский" },
  { id: "en_us", label: "English (US)" },
  { id: "uk_ua", label: "Українська" },
  { id: "be_by", label: "Беларуская" },
  { id: "de_de", label: "Deutsch" },
  { id: "pl_pl", label: "Polski" },
  { id: "fr_fr", label: "Français" },
  { id: "es_es", label: "Español" },
  { id: "zh_cn", label: "简体中文" },
  { id: "ja_jp", label: "日本語" },
];

const JVM_PRESETS = [
  { id: "default", label: "По умолчанию", value: "" },
  {
    id: "g1",
    label: "G1GC",
    value: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+ParallelRefProcEnabled",
  },
  { id: "zgc", label: "ZGC", value: "-XX:+UseZGC" },
  {
    id: "aikar",
    label: "Aikar",
    value:
      "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:InitiatingHeapOccupancyPercent=15 -XX:SurvivorRatio=32 -XX:MaxTenuringThreshold=1",
  },
];

type SettingsTab = "game" | "launcher" | "profiles" | "data";

export default function SettingsView({
  ram,
  setRam,
  ramMin,
  setRamMin,
  gameVersion,
  loader,
  activeProfile,
  setActiveProfile,
  javaPath,
  setJavaPath,
  openLogsOnLaunch,
  setOpenLogsOnLaunch,
  clearLogsOnLaunch,
  setClearLogsOnLaunch,
  minimizeOnLaunch,
  setMinimizeOnLaunch,
  closeOnLaunch,
  setCloseOnLaunch,
  alwaysOnTop,
  setAlwaysOnTop,
  confirmLaunch,
  setConfirmLaunch,
  mcFullscreen,
  setMcFullscreen,
  mcWidth,
  setMcWidth,
  mcHeight,
  setMcHeight,
  jvmArgs,
  setJvmArgs,
  mcLanguage,
  setMcLanguage,
}: {
  ram: number;
  setRam: (n: number) => void;
  ramMin: number;
  setRamMin: (n: number) => void;
  gameVersion: string;
  loader: ModLoader;
  activeProfile: string;
  setActiveProfile: (p: string) => void;
  javaPath: string;
  setJavaPath: (path: string) => void;
  openLogsOnLaunch: boolean;
  setOpenLogsOnLaunch: (value: boolean) => void;
  clearLogsOnLaunch: boolean;
  setClearLogsOnLaunch: (value: boolean) => void;
  minimizeOnLaunch: boolean;
  setMinimizeOnLaunch: (value: boolean) => void;
  closeOnLaunch: boolean;
  setCloseOnLaunch: (value: boolean) => void;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (value: boolean) => void;
  confirmLaunch: boolean;
  setConfirmLaunch: (value: boolean) => void;
  mcFullscreen: boolean;
  setMcFullscreen: (value: boolean) => void;
  mcWidth: number;
  setMcWidth: (value: number) => void;
  mcHeight: number;
  setMcHeight: (value: number) => void;
  jvmArgs: string;
  setJvmArgs: (value: string) => void;
  mcLanguage: string;
  setMcLanguage: (value: string) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("game");
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [newProfile, setNewProfile] = useState("");
  const [isElectron, setIsElectron] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [javaInput, setJavaInput] = useState(javaPath);
  const [javaInfo, setJavaInfo] = useState("");
  const [autoStart, setAutoStart] = useState(false);
  const [sysMem, setSysMem] = useState<{ totalGB: number; freeGB: number; cpus: number } | null>(null);

  const [appVersion, setAppVersion] = useState("1.0.4");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "error">("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const maxRam = useMemo(() => {
    if (!sysMem) return 16;
    return Math.max(4, sysMem.totalGB - 1);
  }, [sysMem]);

  useEffect(() => {
    setJavaInput(javaPath);
  }, [javaPath]);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getAppVersion().then(setAppVersion);
    window.electronAPI.getAutoStart().then((r) => setAutoStart(!!r.enabled));
    window.electronAPI.getSystemMemory().then((m) =>
      setSysMem({ totalGB: m.totalGB, freeGB: m.freeGB, cpus: m.cpus })
    );
    const unsub = window.electronAPI.onUpdateStatus((data) => {
      setUpdateStatus(data.status as any);
      if (data.percent !== undefined) setUpdateProgress(data.percent);
      if (data.version) setUpdateVersion(data.version);
      if (data.error) setUpdateError(data.error);
    });
    return unsub;
  }, []);

  async function handleCheckUpdates() {
    if (!window.electronAPI) {
      showToast("Обновления доступны только в десктоп-версии", "err");
      return;
    }
    setUpdateStatus("checking");
    setUpdateError(null);
    showToast("Проверяю обновления…");
    const res = await window.electronAPI.checkForUpdates();
    if (res.success) {
      if (res.updateAvailable) {
        showToast(`Доступно обновление v${res.version}. Загружается автоматически.`);
      } else {
        showToast("Установлена последняя версия ✓");
        setUpdateStatus("idle");
      }
    } else {
      setUpdateStatus("error");
      setUpdateError(res.error || "Не удалось проверить");
    }
  }

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function chooseJavaPath() {
    if (!window.electronAPI) return showToast("Доступно только в Electron", "err");
    const result = await window.electronAPI.openFileDialog({
      title: "Выберите исполняемый файл Java",
      filters: [
        { name: "Все файлы", extensions: ["*"] },
        { name: "Java executable", extensions: ["exe"] },
      ],
    });
    if (result.success && result.paths?.[0]) {
      setJavaInput(result.paths[0]);
      const check = await window.electronAPI.validateJavaPath(result.paths[0]);
      if (check.exists) {
        setJavaInfo(`Java ${check.version} — путь корректен`);
      } else {
        setJavaInfo("Выбранный файл не является рабочей Java");
      }
    }
  }

  async function saveJavaPath() {
    const value = javaInput.trim();
    if (!value) {
      setJavaPath("");
      setJavaInfo("Используется автоматический выбор Java");
      showToast("Автоматический выбор Java включён");
      return;
    }
    if (!window.electronAPI) return;
    const check = await window.electronAPI.validateJavaPath(value);
    if (!check.exists) {
      setJavaInfo("Путь не работает");
      showToast("Не удалось запустить Java по этому пути", "err");
      return;
    }
    setJavaPath(value);
    setJavaInfo(`Java ${check.version} сохранена`);
    showToast(`Путь к Java ${check.version} сохранён`);
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

  useEffect(() => {
    setIsElectron(!!window.electronAPI);
    refreshProfiles();
  }, []);

  async function handleCreateProfile() {
    const name = newProfile.trim();
    if (!name || !window.electronAPI) return;
    if (profiles.some((p) => p.name === name)) {
      showToast("Профиль с таким именем уже существует", "err");
      return;
    }
    await window.electronAPI.createProfile(name);
    setNewProfile("");
    setActiveProfile(name);
    showToast(`Профиль «${name}» создан`);
    await refreshProfiles();
  }

  async function handleStartRename(p: ProfileInfo) {
    setEditingName(p.name);
    setEditValue(p.name);
  }

  async function handleSaveRename(oldName: string) {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditingName(null);
      return;
    }
    if (profiles.some((p) => p.name === newName && p.name !== oldName)) {
      showToast("Профиль с таким именем уже существует", "err");
      return;
    }
    if (!window.electronAPI) return;
    const res = await window.electronAPI.renameProfile(oldName, newName);
    if (res.success) {
      const oldKey = `anlaunch_profile_${oldName}`;
      const saved = localStorage.getItem(oldKey);
      if (saved) {
        localStorage.setItem(`anlaunch_profile_${newName}`, saved);
        localStorage.removeItem(oldKey);
      }
      showToast(`Профиль переименован → «${newName}»`);
      if (activeProfile === oldName) setActiveProfile(newName);
      await refreshProfiles();
    } else {
      showToast(res.error || "Не удалось переименовать", "err");
    }
    setEditingName(null);
  }

  async function handleDelete(name: string) {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.deleteProfile(name);
    if (res.success) {
      showToast(`Профиль «${name}» удалён`);
      if (activeProfile === name && profiles.length > 0) {
        const remaining = profiles.filter((p) => p.name !== name);
        if (remaining.length > 0) setActiveProfile(remaining[0].name);
      }
      await refreshProfiles();
    } else {
      showToast(res.error || "Не удалось удалить", "err");
    }
    setConfirmDelete(null);
  }

  async function handleResetAll() {
    if (confirm("Удалить ВСЕ локальные данные (аккаунты, настройки, кеш)? Игры и моды останутся.")) {
      try {
        localStorage.clear();
        showToast("Все локальные данные очищены");
        setTimeout(() => location.reload(), 1500);
      } catch {
        showToast("Не удалось очистить", "err");
      }
    }
  }

  async function handleExportAccounts() {
    try {
      const accounts = JSON.parse(localStorage.getItem("anlaunch_accounts") || "[]");
      const active = localStorage.getItem("anlaunch_active_account") || "";
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        activeAccount: active,
        accounts,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anlaunch-accounts-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Экспортировано ${accounts.length} аккаунт(ов)`);
    } catch {
      showToast("Не удалось экспортировать", "err");
    }
  }

  async function handleImportAccounts() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data.accounts)) {
          localStorage.setItem("anlaunch_accounts", JSON.stringify(data.accounts));
          if (data.activeAccount) {
            localStorage.setItem("anlaunch_active_account", data.activeAccount);
          }
          showToast(`Импортировано ${data.accounts.length} аккаунт(ов)`);
          setTimeout(() => location.reload(), 1500);
        } else {
          showToast("Неверный формат файла", "err");
        }
      } catch {
        showToast("Не удалось импортировать", "err");
      }
    };
    input.click();
  }

  function handleExportSettings() {
    const data: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("anlaunch_")) continue;
      if (key === "anlaunch_accounts" || key === "anlaunch_active_account") continue;
      data[key] = localStorage.getItem(key);
    }
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anlaunch-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Настройки экспортированы");
  }

  function handleImportSettings() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const settings = parsed.settings || parsed;
        if (!settings || typeof settings !== "object") {
          showToast("Неверный формат файла", "err");
          return;
        }
        let count = 0;
        for (const [key, value] of Object.entries(settings)) {
          if (!key.startsWith("anlaunch_")) continue;
          if (key === "anlaunch_accounts" || key === "anlaunch_active_account") continue;
          if (typeof value === "string") {
            localStorage.setItem(key, value);
            count++;
          }
        }
        showToast(`Импортировано ${count} настроек`);
        setTimeout(() => location.reload(), 1200);
      } catch {
        showToast("Не удалось импортировать", "err");
      }
    };
    input.click();
  }

  async function openSub(subfolder: string) {
    if (!window.electronAPI) return showToast("Только в десктоп-версии", "err");
    const res = await window.electronAPI.openProfileSubfolder({ name: activeProfile, subfolder });
    if (res.success) showToast(`Открыта папка «${subfolder}»`);
    else showToast(res.error || "Не удалось открыть", "err");
  }

  function applyRecommendedRam() {
    const total = sysMem?.totalGB || 8;
    const rec = Math.max(2, Math.min(maxRam, Math.floor(total / 2)));
    const min = Math.max(1, Math.min(rec, rec <= 4 ? 1 : 2));
    setRam(rec);
    setRamMin(min);
    showToast(`Рекомендуемо: ${min}–${rec} ГБ`);
  }

  const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
    { id: "game", label: "Игра", icon: <GaugeIcon className="h-3.5 w-3.5" /> },
    { id: "launcher", label: "Лаунчер", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
    { id: "profiles", label: "Профили", icon: <CubeIcon className="h-3.5 w-3.5" /> },
    { id: "data", label: "Данные", icon: <ShieldIcon className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-up">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                tab === t.id ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/75"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "game" && (
          <>
            <Section title="Производительность" icon={<GaugeIcon className="h-4 w-4" />}>
              {sysMem && (
                <div className="mb-2 px-2 text-xs text-white/40">
                  Система: {sysMem.totalGB} ГБ RAM · свободно {sysMem.freeGB} ГБ · {sysMem.cpus} CPU
                </div>
              )}
              <Row label="Максимум памяти (Xmx)" hint={`${ram} ГБ зарезервировано для Minecraft`}>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={maxRam}
                    value={Math.min(ram, maxRam)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setRam(next);
                      if (ramMin > next) setRamMin(next);
                    }}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-400"
                  />
                  <span className="w-12 text-sm font-medium text-white">{ram} ГБ</span>
                </div>
              </Row>
              <Row label="Стартовая память (Xms)" hint="Сколько RAM выделить сразу при старте JVM">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={ram}
                    value={Math.min(ramMin, ram)}
                    onChange={(e) => setRamMin(Number(e.target.value))}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-400"
                  />
                  <span className="w-12 text-sm font-medium text-white">{Math.min(ramMin, ram)} ГБ</span>
                </div>
              </Row>
              <div className="px-2 pt-1">
                <button
                  onClick={applyRecommendedRam}
                  className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
                >
                  Подобрать автоматически
                </button>
              </div>
              <Row label="Активный профиль" hint="Применяется при следующем запуске">
                <span className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-sm text-white/70">
                  {activeProfile} · {loader === "vanilla" ? "Vanilla" : loader} · {gameVersion}
                </span>
              </Row>
            </Section>

            <Section title="Окно Minecraft" icon={<GaugeIcon className="h-4 w-4" />}>
              <Row label="Полноэкранный режим" hint="Minecraft откроется на весь экран">
                <Switch checked={mcFullscreen} onChange={setMcFullscreen} />
              </Row>
              {!mcFullscreen && (
                <Row label="Разрешение окна" hint="Ширина × высота игрового окна">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={320}
                      max={7680}
                      value={mcWidth}
                      onChange={(e) => setMcWidth(Math.max(320, Number(e.target.value) || 1280))}
                      className="w-20 rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-emerald-400/50"
                    />
                    <span className="text-white/40">×</span>
                    <input
                      type="number"
                      min={240}
                      max={4320}
                      value={mcHeight}
                      onChange={(e) => setMcHeight(Math.max(240, Number(e.target.value) || 720))}
                      className="w-20 rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-emerald-400/50"
                    />
                  </div>
                </Row>
              )}
              <Row label="Пресеты разрешения">
                <div className="flex gap-1.5">
                  {[
                    { w: 854, h: 480, label: "480p" },
                    { w: 1280, h: 720, label: "720p" },
                    { w: 1920, h: 1080, label: "1080p" },
                    { w: 2560, h: 1440, label: "1440p" },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setMcFullscreen(false);
                        setMcWidth(p.w);
                        setMcHeight(p.h);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                        !mcFullscreen && mcWidth === p.w && mcHeight === p.h
                          ? "bg-emerald-400 text-[#06070a]"
                          : "bg-white/[0.05] text-white/55 hover:bg-white/[0.1]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="Язык игры" hint="Передаётся как --lang при запуске">
                <select
                  value={mcLanguage}
                  onChange={(e) => setMcLanguage(e.target.value)}
                  className="rounded-lg border border-white/[0.08] bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-emerald-400/50"
                >
                  {MC_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id} className="bg-[#141419]">
                      {l.label}
                    </option>
                  ))}
                </select>
              </Row>
            </Section>

            <Section title="JVM" icon={<DownloadIcon className="h-4 w-4" />}>
              <Row label="Пресеты аргументов" hint="Можно править вручную ниже">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {JVM_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setJvmArgs(p.value)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                        jvmArgs === p.value
                          ? "bg-emerald-400 text-[#06070a]"
                          : "bg-white/[0.05] text-white/55 hover:bg-white/[0.1]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Row>
              <div className="px-2 pt-2">
                <div className="mb-1 text-xs text-white/60">Дополнительные JVM-аргументы</div>
                <input
                  value={jvmArgs}
                  onChange={(e) => setJvmArgs(e.target.value)}
                  placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50"
                  className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                />
                <div className="mt-1 text-[11px] text-white/35">
                  Передаются в команду java при запуске. Оставьте пусто, если не уверены.
                </div>
              </div>
            </Section>
          </>
        )}

        {tab === "launcher" && (
          <>
            <Section title="Поведение при запуске" icon={<GaugeIcon className="h-4 w-4" />}>
              <Row label="Открывать окно логов" hint="Показывать этапы запуска Minecraft">
                <Switch checked={openLogsOnLaunch} onChange={setOpenLogsOnLaunch} />
              </Row>
              <Row label="Очищать старые логи" hint="Начинать каждый запуск с пустого лога">
                <Switch checked={clearLogsOnLaunch} onChange={setClearLogsOnLaunch} />
              </Row>
              <Row label="Сворачивать лаунчер" hint="Главное окно свернётся при успешном старте">
                <Switch
                  checked={minimizeOnLaunch}
                  onChange={(v) => {
                    setMinimizeOnLaunch(v);
                    if (v) setCloseOnLaunch(false);
                  }}
                />
              </Row>
              <Row label="Закрывать лаунчер" hint="AnLaunch закроется после успешного запуска">
                <Switch
                  checked={closeOnLaunch}
                  onChange={(v) => {
                    setCloseOnLaunch(v);
                    if (v) setMinimizeOnLaunch(false);
                  }}
                />
              </Row>
              <Row label="Подтверждать запуск" hint="Спросить перед стартом игры">
                <Switch checked={confirmLaunch} onChange={setConfirmLaunch} />
              </Row>
            </Section>

            <Section title="Окно AnLaunch" icon={<SettingsIcon className="h-4 w-4" />}>
              <Row label="Поверх остальных окон" hint="Лаунчер всегда будет на переднем плане">
                <Switch checked={alwaysOnTop} onChange={setAlwaysOnTop} />
              </Row>
              <Row label="Запускать с системой" hint="Открывать AnLaunch при входе в аккаунт ОС">
                <Switch
                  checked={autoStart}
                  onChange={async (v) => {
                    if (!window.electronAPI) return showToast("Только в десктоп-версии", "err");
                    const res = await window.electronAPI.setAutoStart(v);
                    if (res.success) {
                      setAutoStart(!!res.enabled);
                      showToast(res.enabled ? "Автозапуск включён" : "Автозапуск выключен");
                    } else {
                      showToast(res.error || "Не удалось изменить автозапуск", "err");
                    }
                  }}
                />
              </Row>
              <div className="grid grid-cols-2 gap-2 px-2 pt-2">
                <ActionButton onClick={() => window.electronAPI?.openLogsWindow()}>📜 Окно логов</ActionButton>
                <ActionButton
                  onClick={async () => {
                    if (window.electronAPI) {
                      const java = javaPath
                        ? await window.electronAPI.validateJavaPath(javaPath)
                        : await window.electronAPI.checkJava();
                      if (java.exists) showToast(`Java обнаружена: v${java.version || "?"}`);
                      else {
                        showToast("Java не найдена. Скачайте с adoptium.net", "err");
                        window.open("https://adoptium.net/", "_blank");
                      }
                    }
                  }}
                >
                  ☕ Проверить Java
                </ActionButton>
              </div>
            </Section>

            <Section title="Java для запуска" icon={<DownloadIcon className="h-4 w-4" />}>
              <p className="mb-3 px-2 text-sm text-white/50">
                Оставьте пустым для автоматического выбора или укажите полный путь к java / java.exe.
              </p>
              <div className="flex flex-wrap gap-2 px-2">
                <input
                  value={javaInput}
                  onChange={(e) => setJavaInput(e.target.value)}
                  placeholder="Автоматически"
                  className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                />
                <button onClick={chooseJavaPath} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.1]">
                  Обзор
                </button>
                <button onClick={saveJavaPath} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-[#06070a] hover:bg-emerald-300">
                  Сохранить
                </button>
                <button
                  onClick={() => {
                    setJavaInput("");
                    setJavaPath("");
                    setJavaInfo("Используется автоматический выбор Java");
                  }}
                  className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/60 hover:bg-white/[0.1]"
                >
                  Сбросить
                </button>
              </div>
              {javaInfo && <div className="mt-2 px-2 text-xs text-white/45">{javaInfo}</div>}
            </Section>

            <Section title="Обновления AnLaunch" icon={<DownloadIcon className="h-4 w-4" />}>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-white/85">Текущая версия</div>
                  <div className="text-xs text-white/40">v{appVersion}</div>
                </div>
                <button
                  onClick={handleCheckUpdates}
                  disabled={updateStatus === "checking" || updateStatus === "downloading"}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {updateStatus === "checking"
                    ? "Проверка..."
                    : updateStatus === "downloading"
                      ? `Загрузка ${Math.round(updateProgress)}%`
                      : "Проверить"}
                </button>
              </div>
              {updateStatus === "ready" && (
                <div className="mb-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3">
                  <div className="text-sm font-semibold text-emerald-300">✓ Обновление v{updateVersion} готово</div>
                  <div className="mt-1 text-xs text-white/60">Перезапустите AnLaunch для установки.</div>
                </div>
              )}
              {updateStatus === "error" && (
                <div className="mb-3 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-300">
                  ✗ {updateError || "Ошибка проверки обновлений"}
                </div>
              )}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/50">
                AnLaunch проверяет обновления при запуске и каждые 6 часов. Новая версия скачивается в фоне.
              </div>
            </Section>
          </>
        )}

        {tab === "profiles" && (
          <Section title="Профили" icon={<CubeIcon className="h-4 w-4" />}>
            <p className="mb-3 px-2 text-sm text-white/50">
              Каждый профиль — отдельная папка с собственными <b className="text-white/75">модами</b>,{" "}
              <b className="text-white/75">ресурспаками</b>, <b className="text-white/75">шейдерами</b> и{" "}
              <b className="text-white/75">мирами</b>.
            </p>

            {!isElectron && (
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/70">
                Управление профилями доступно только в десктоп-версии (Electron).
              </div>
            )}

            <div className="space-y-2">
              {profiles.length === 0 && isElectron && (
                <div className="rounded-lg bg-white/[0.02] px-3 py-4 text-center text-xs text-white/40">
                  Профили появятся после первого запуска.
                </div>
              )}
              {profiles.map((p) => {
                const isActive = activeProfile === p.name;
                const isEditing = editingName === p.name;
                const isConfirming = confirmDelete === p.name;

                return (
                  <div
                    key={p.name}
                    className={`rounded-xl border p-3 transition ${
                      isActive ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-[#06070a]">
                        {p.name[0].toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(p.name);
                              if (e.key === "Escape") setEditingName(null);
                            }}
                            className="w-full rounded border border-emerald-400/50 bg-black/40 px-2 py-1 text-sm font-semibold text-white outline-none"
                          />
                        ) : (
                          <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                        )}
                        <div className="truncate text-xs text-white/40">
                          {p.mods} модов · {p.resourcepacks} ресурспаков · {p.shaderpacks} шейдеров · {p.saves} миров
                        </div>
                      </div>

                      {!isEditing && !isConfirming && (
                        <>
                          {isActive ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                              Активен
                            </span>
                          ) : (
                            <button
                              onClick={() => setActiveProfile(p.name)}
                              className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
                            >
                              Выбрать
                            </button>
                          )}
                          <button
                            onClick={() => handleStartRename(p)}
                            className="rounded-lg bg-white/[0.05] p-2 text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                            title="Переименовать"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => window.electronAPI?.openProfileFolder(p.name)}
                            className="rounded-lg bg-white/[0.05] p-2 text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                            title="Открыть папку профиля"
                          >
                            📂
                          </button>
                          <button
                            onClick={() => setConfirmDelete(p.name)}
                            className="rounded-lg bg-white/[0.05] p-2 text-red-300/60 transition hover:bg-red-500/15 hover:text-red-300"
                            title="Удалить профиль"
                          >
                            🗑️
                          </button>
                        </>
                      )}

                      {isEditing && (
                        <>
                          <button
                            onClick={() => handleSaveRename(p.name)}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingName(null)}
                            className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>

                    {isConfirming && (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                        <span className="text-xs text-red-200">
                          Удалить профиль <b>«{p.name}»</b> и все его файлы?
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDelete(p.name)}
                            className="rounded bg-red-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-400"
                          >
                            Удалить
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="rounded bg-white/[0.1] px-3 py-1 text-xs font-medium text-white transition hover:bg-white/[0.15]"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isElectron && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newProfile}
                  onChange={(e) => setNewProfile(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProfile()}
                  placeholder="Имя нового профиля…"
                  className="min-w-[180px] flex-1 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                />
                <button
                  onClick={handleCreateProfile}
                  className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
                >
                  + Создать
                </button>
                <button
                  onClick={() => window.electronAPI?.openProfilesRoot()}
                  className="rounded-lg bg-white/[0.05] px-4 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.1]"
                >
                  Все папки
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { id: "mods", label: "Моды" },
                { id: "resourcepacks", label: "Ресурспаки" },
                { id: "shaderpacks", label: "Шейдеры" },
                { id: "saves", label: "Миры" },
                { id: "screenshots", label: "Скриншоты" },
                { id: "logs", label: "Логи игры" },
              ].map((f) => (
                <ActionButton key={f.id} onClick={() => openSub(f.id)}>
                  {f.label}
                </ActionButton>
              ))}
            </div>
          </Section>
        )}

        {tab === "data" && (
          <>
            <Section title="Данные и аккаунты" icon={<ShieldIcon className="h-4 w-4" />}>
              <ActionRow label="Экспортировать аккаунты" hint="Скачать файл со всеми аккаунтами" onClick={handleExportAccounts} />
              <ActionRow label="Импортировать аккаунты" hint="Загрузить аккаунты из JSON-файла" onClick={handleImportAccounts} />
              <ActionRow label="Экспортировать настройки" hint="Без аккаунтов — только параметры лаунчера" onClick={handleExportSettings} />
              <ActionRow label="Импортировать настройки" hint="Восстановить параметры из JSON" onClick={handleImportSettings} />
              <ActionRow
                label="Открыть папку профиля"
                hint={`Профиль «${activeProfile}»`}
                onClick={() => {
                  window.electronAPI?.openProfileFolder(activeProfile);
                  showToast("Папка профиля открыта");
                }}
              />
              <ActionRow label="Сбросить все локальные данные" hint="Удалит все аккаунты, настройки, кеш" onClick={handleResetAll} danger />
            </Section>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[80] animate-scale-in rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${
            toast.type === "ok"
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
              : "border-red-400/30 bg-red-500/15 text-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
        {icon}
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-white/[0.03]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/85">{label}</div>
        {hint && <div className="truncate text-xs text-white/40">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ActionRow({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-white/[0.03]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white/85">{label}</div>
        {hint && <div className="truncate text-xs text-white/40">{hint}</div>}
      </div>
      <button
        onClick={onClick}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          danger ? "bg-red-500/15 text-red-300 hover:bg-red-500/25" : "bg-white/[0.05] text-white/80 hover:bg-white/[0.1]"
        }`}
      >
        Выполнить
      </button>
    </div>
  );
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
    >
      {children}
    </button>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-400" : "bg-white/15"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
