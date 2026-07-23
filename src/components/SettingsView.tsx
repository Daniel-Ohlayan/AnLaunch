import { useEffect, useState } from "react";
import type { ModLoader } from "../lib/modrinth";
import type { ProfileInfo } from "../types/electron";
import { GaugeIcon, ShieldIcon, CubeIcon, DownloadIcon } from "./icons";

export default function SettingsView({
  ram,
  setRam,
  gameVersion,
  loader,
  activeProfile,
  setActiveProfile,
}: {
  ram: number;
  setRam: (n: number) => void;
  gameVersion: string;
  loader: ModLoader;
  activeProfile: string;
  setActiveProfile: (p: string) => void;
}) {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [newProfile, setNewProfile] = useState("");
  const [isElectron, setIsElectron] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Приватность
  const [telemetry, setTelemetry] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [closeOnLaunch, setCloseOnLaunch] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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
    } catch (e) {
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
      } catch (e) {
        showToast("Не удалось импортировать", "err");
      }
    };
    input.click();
  }

  function handleCopyModsFolder() {
    if (window.electronAPI && activeProfile) {
      window.electronAPI.openProfileFolder(activeProfile);
      showToast("Папка модов открыта");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-up">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Профили */}
        <Section title="Профили" icon={<CubeIcon className="h-4 w-4" />}>
          <p className="mb-3 px-2 text-sm text-white/50">
            Каждый профиль — отдельная папка с собственными{" "}
            <b className="text-white/75">модами</b>, <b className="text-white/75">ресурспаками</b>,{" "}
            <b className="text-white/75">шейдерами</b> и <b className="text-white/75">мирами</b>.
            Открывайте папку и закидывайте файлы вручную.
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
                    isActive
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-white/[0.06] bg-white/[0.02]"
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
                        <div className="truncate text-sm font-semibold text-white">
                          {p.name}
                        </div>
                      )}
                      <div className="truncate text-xs text-white/40">
                        {p.mods} модов · {p.resourcepacks} ресурспаков · {p.shaderpacks} шейдеров ·{" "}
                        {p.saves} миров
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
                📁 Все папки
              </button>
            </div>
          )}
        </Section>

        {/* Производительность */}
        <Section title="Производительность" icon={<GaugeIcon className="h-4 w-4" />}>
          <Row label="Выделенная память" hint={`${ram} ГБ зарезервировано для Minecraft`}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={16}
                value={ram}
                onChange={(e) => setRam(Number(e.target.value))}
                className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-400"
              />
              <span className="w-12 text-sm font-medium text-white">{ram} ГБ</span>
            </div>
          </Row>
          <Row label="Активный профиль" hint="Применяется при следующем запуске">
            <span className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-sm text-white/70">
              {activeProfile} · {loader === "vanilla" ? "Vanilla" : loader} · {gameVersion}
            </span>
          </Row>
          <Row label="Закрывать лаунчер при запуске" hint="Игровое окно откроется отдельно">
            <Toggle checked={closeOnLaunch} onChange={setCloseOnLaunch} />
          </Row>
          <Row label="Показывать снапшоты" hint="Включить в списке версий preview-сборки">
            <Toggle checked={showSnapshots} onChange={setShowSnapshots} />
          </Row>
        </Section>

        {/* Приватность */}
        <Section title="Приватность" icon={<ShieldIcon className="h-4 w-4" />}>
          <Row label="Анонимная телеметрия" hint="Помогает улучшать AnLaunch">
            <Toggle checked={telemetry} onChange={setTelemetry} />
          </Row>
          <Row label="Автообновление" hint="Держать AnLaunch в актуальной версии">
            <Toggle checked={autoUpdate} onChange={setAutoUpdate} />
          </Row>
          <ActionRow
            label="Экспортировать аккаунты"
            hint="Скачать файл со всеми аккаунтами"
            onClick={handleExportAccounts}
          />
          <ActionRow
            label="Импортировать аккаунты"
            hint="Загрузить аккаунты из JSON-файла"
            onClick={handleImportAccounts}
          />
          <ActionRow
            label="Открыть папку модов"
            hint={`Профиль «${activeProfile}»`}
            onClick={handleCopyModsFolder}
          />
          <ActionRow
            label="Сбросить все локальные данные"
            hint="Удалит все аккаунты, настройки, кеш"
            onClick={handleResetAll}
            danger
          />
        </Section>

        {/* Java & Обновления */}
        <Section title="Java и обновления" icon={<DownloadIcon className="h-4 w-4" />}>
          <p className="px-2 pb-3 text-sm leading-relaxed text-white/55">
            Для запуска Minecraft нужна установленная <b className="text-white/80">Java 17+</b>. Если
            игра не запускается — скачайте Java с{" "}
            <a
              href="https://adoptium.net/"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
            >
              adoptium.net
            </a>
            .
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ActionButton onClick={async () => {
              if (window.electronAPI) {
                const java = await window.electronAPI.checkJava();
                if (java.exists) {
                  showToast(`Java обнаружена: v${java.version || "?"}`);
                } else {
                  showToast("Java не найдена. Скачайте с adoptium.net", "err");
                  window.open("https://adoptium.net/", "_blank");
                }
              }
            }}>
              ☕ Проверить Java
            </ActionButton>
            <ActionButton onClick={async () => {
              if (window.electronAPI) {
                const path = await window.electronAPI.getUserDataPath();
                window.electronAPI.openProfilesRoot();
                showToast(`Открыта: ${path}`);
              } else {
                showToast("Только в десктоп-версии", "err");
              }
            }}>
              📁 Открыть папку профилей
            </ActionButton>
          </div>
        </Section>
      </div>

      {/* Toast */}
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

      {/* Модал подтверждения сброса */}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
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
  children: React.ReactNode;
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
          danger
            ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
            : "bg-white/[0.05] text-white/80 hover:bg-white/[0.1]"
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
  children: React.ReactNode;
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-400" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
