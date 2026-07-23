import { useEffect, useState } from "react";
import type { ModLoader } from "../lib/modrinth";
import { CloseIcon, SearchIcon } from "./icons";
import type { HomeSettings } from "./HomeSettingsModal";

export default function CreateProfileModal({
  open,
  onClose,
  onCreate,
  homeSettings,
  defaultVersion,
  defaultLoader,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    version: string;
    loader: ModLoader;
    description: string;
    avatarUrl: string | null;
    accentColor: string;
  }) => Promise<void> | void;
  homeSettings: HomeSettings;
  defaultVersion: string;
  defaultLoader: ModLoader;
}) {
  const [name, setName] = useState("");
  const [version, setVersion] = useState(defaultVersion);
  const [loader, setLoader] = useState<ModLoader>(defaultLoader);
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState(homeSettings.accentColor || "emerald");
  const [step, setStep] = useState<"name" | "version" | "loader" | "appearance">("name");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName("");
      setVersion(defaultVersion);
      setLoader(defaultLoader);
      setDescription("");
      setAvatarUrl(null);
      setAccentColor(homeSettings.accentColor || "emerald");
      setStep("name");
      setError(null);
      setSearch("");
    }
  }, [open, defaultVersion, defaultLoader, homeSettings.accentColor]);

  useEffect(() => {
    if (!open) return;
    fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json")
      .then((r) => r.json())
      .then((data) => {
        const versions = (data.versions || [])
          .filter((v: { type: string; id: string }) => v.type === "release")
          .map((v: { id: string }) => v.id)
          .slice(0, 100);
        setAvailableVersions(versions);
      })
      .catch(() => {
        setAvailableVersions([
          "26.2", "26.1.2", "26.1", "1.21.8", "1.21.4", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2",
        ]);
      });
  }, [open]);

  if (!open) return null;

  const filteredVersions = availableVersions.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Файл слишком большой (макс. 5 МБ)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleElectronAvatar() {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.openFileDialog({
      title: "Выберите аватар",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!res.success || !res.paths?.[0]) return;
    const fileRes = await window.electronAPI.readFileAsDataUrl(res.paths[0]);
    if (fileRes.success && fileRes.dataUrl) {
      setAvatarUrl(fileRes.dataUrl);
    }
  }

  async function handleCreate() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Введите имя профиля");
    if (trimmed.length < 2) return setError("Имя слишком короткое");
    if (trimmed.length > 32) return setError("Имя слишком длинное");
    if (!/^[a-zA-Z0-9_\- ]+$/.test(trimmed))
      return setError("Только латиница, цифры, _ и -");

    try {
      await onCreate({
        name: trimmed,
        version,
        loader,
        description: description.trim(),
        avatarUrl,
        accentColor,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания");
    }
  }

  function nextStep() {
    if (step === "name") {
      if (!name.trim()) return setError("Введите имя");
      setError(null);
      setStep("version");
    } else if (step === "version") {
      setError(null);
      setStep("loader");
    } else if (step === "loader") {
      setError(null);
      setStep("appearance");
    }
  }

  function prevStep() {
    setError(null);
    if (step === "appearance") setStep("loader");
    else if (step === "loader") setStep("version");
    else if (step === "version") setStep("name");
  }

  const ACCENT_COLORS = [
    { id: "emerald", label: "Изумрудный", preview: "from-emerald-400 to-teal-500" },
    { id: "violet", label: "Фиолетовый", preview: "from-violet-400 to-fuchsia-500" },
    { id: "rose", label: "Розовый", preview: "from-rose-400 to-pink-500" },
    { id: "blue", label: "Синий", preview: "from-blue-400 to-cyan-500" },
    { id: "amber", label: "Янтарный", preview: "from-amber-400 to-orange-500" },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0f] shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-white">Создать профиль</div>
            <div className="text-xs text-white/40">
              {step === "name" && "Шаг 1/4 · Имя"}
              {step === "version" && "Шаг 2/4 · Версия"}
              {step === "loader" && "Шаг 3/4 · Загрузчик"}
              {step === "appearance" && "Шаг 4/4 · Оформление"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 transition hover:bg-white/[0.1]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Steps progress */}
        <div className="flex border-b border-white/[0.04] bg-black/20">
          {(["name", "version", "loader", "appearance"] as const).map((s, i) => {
            const idx = ["name", "version", "loader", "appearance"].indexOf(step);
            const done = idx > i;
            const active = idx === i;
            return (
              <div
                key={s}
                className={`flex-1 border-b-2 py-2 text-center text-[10px] uppercase tracking-wider transition ${
                  active
                    ? "border-emerald-400 text-emerald-300"
                    : done
                    ? "border-emerald-400/30 text-emerald-300/50"
                    : "border-transparent text-white/30"
                }`}
              >
                {s === "name" && "Имя"}
                {s === "version" && "Версия"}
                {s === "loader" && "Загрузчик"}
                {s === "appearance" && "Стиль"}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-[300px] p-5">
          {step === "name" && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Название профиля
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && nextStep()}
                  maxLength={32}
                  placeholder="Мой крутой профиль"
                  className="w-full rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                />
                <div className="mt-1 text-right text-[10px] text-white/40">
                  {name.length} / 32
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Описание (опционально)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={150}
                  rows={2}
                  placeholder="Короткое описание профиля…"
                  className="w-full resize-none rounded-xl border border-white/[0.06] bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                />
              </div>
            </div>
          )}

          {step === "version" && (
            <div className="space-y-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск версии..."
                  className="w-full rounded-xl border border-white/[0.06] bg-black/30 py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {filteredVersions.slice(0, 36).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVersion(v)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        version === v
                          ? "bg-emerald-400 text-[#06070a]"
                          : "bg-white/[0.03] text-white/55 hover:bg-white/[0.08]"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "loader" && (
            <div className="space-y-2">
              {(
                [
                  { id: "vanilla" as ModLoader, label: "Vanilla", icon: "🎮", desc: "Чистая ванильная версия" },
                  { id: "fabric" as ModLoader, label: "Fabric", icon: "🧩", desc: "Лёгкий и быстрый загрузчик модов" },
                  { id: "forge" as ModLoader, label: "Forge", icon: "⚙️", desc: "Классический загрузчик" },
                  { id: "neoforge" as ModLoader, label: "NeoForge", icon: "✨", desc: "Форк Forge для новых версий" },
                  { id: "quilt" as ModLoader, label: "Quilt", icon: "🔷", desc: "Форк Fabric" },
                ]
              ).map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLoader(l.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    loader === l.id
                      ? "border-emerald-400/40 bg-emerald-500/10"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="text-2xl">{l.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{l.label}</div>
                    <div className="text-xs text-white/50">{l.desc}</div>
                  </div>
                  {loader === l.id && <div className="text-emerald-400">✓</div>}
                </button>
              ))}
            </div>
          )}

          {step === "appearance" && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Аватар (опционально)
                </label>
                <div className="flex items-center gap-3">
                  <div
                    className="h-16 w-16 rounded-full border-2 border-emerald-400/30 bg-gradient-to-br from-emerald-400 to-teal-500 bg-cover bg-center"
                    style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined }}
                  />
                  <div className="flex flex-1 gap-2">
                    <label className="flex-1 cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-xs text-white/70 transition hover:bg-white/[0.08]">
                      📁 Файл
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </label>
                    {window.electronAPI && (
                      <button
                        onClick={handleElectronAvatar}
                        className="flex-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        💻 С диска
                      </button>
                    )}
                    {avatarUrl && (
                      <button
                        onClick={() => setAvatarUrl(null)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/20"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/70">
                  Цвет темы
                </label>
                <div className="flex gap-2">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setAccentColor(c.id)}
                      className={`h-12 flex-1 rounded-xl border-2 bg-gradient-to-br transition ${
                        c.preview
                      } ${
                        accentColor === c.id
                          ? "border-white"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                      title={c.label}
                    >
                      {accentColor === c.id && <span className="text-sm text-white">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/30 px-5 py-3">
          <button
            onClick={step === "name" ? onClose : prevStep}
            className="rounded-lg px-3 py-1.5 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-white"
          >
            {step === "name" ? "Отмена" : "← Назад"}
          </button>

          {step === "appearance" ? (
            <button
              onClick={handleCreate}
              className="rounded-lg bg-emerald-400 px-4 py-1.5 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
            >
              ✓ Создать
            </button>
          ) : (
            <button
              onClick={nextStep}
              className="rounded-lg bg-emerald-400 px-4 py-1.5 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
            >
              Далее →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
