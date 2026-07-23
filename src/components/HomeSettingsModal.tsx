import { useState, useRef, useEffect } from "react";
import { CloseIcon } from "./icons";

export interface HomeSettings {
  backgroundUrl: string | null;
  customBackgroundUrl: string | null;
  avatarUrl: string | null;
  profileDescription: string;
  accentColor: string;
  showStats: boolean;
  showWelcome: boolean;
}

export const DEFAULT_HOME_SETTINGS: HomeSettings = {
  backgroundUrl: null,
  customBackgroundUrl: null,
  avatarUrl: null,
  profileDescription: "",
  accentColor: "emerald",
  showStats: true,
  showWelcome: true,
};

const ACCENT_COLORS: { id: string; label: string; preview: string; class: string }[] = [
  { id: "emerald", label: "Изумрудный", preview: "bg-emerald-400", class: "from-emerald-400 to-teal-500" },
  { id: "violet", label: "Фиолетовый", preview: "bg-violet-400", class: "from-violet-400 to-fuchsia-500" },
  { id: "rose", label: "Розовый", preview: "bg-rose-400", class: "from-rose-400 to-pink-500" },
  { id: "blue", label: "Синий", preview: "bg-blue-400", class: "from-blue-400 to-cyan-500" },
  { id: "amber", label: "Янтарный", preview: "bg-amber-400", class: "from-amber-400 to-orange-500" },
];

const PRESET_BACKGROUNDS: { id: string; url: string; label: string }[] = [
  { id: "hero", url: "./hero-bg.jpg", label: "Стандартный" },
  { id: "none", url: "", label: "Без фона" },
];

export default function HomeSettingsModal({
  open,
  onClose,
  settings,
  onChange,
  activeProfile,
  onOpenProfileFolder,
}: {
  open: boolean;
  onClose: () => void;
  settings: HomeSettings;
  onChange: (next: HomeSettings) => void;
  activeProfile: string;
  onOpenProfileFolder: () => void;
}) {
  const [tab, setTab] = useState<"background" | "avatar" | "profile" | "theme">(
    "background"
  );
  const [toast, setToast] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Файл слишком большой (макс. 5 МБ)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ ...settings, avatarUrl: reader.result as string });
      showToast("Аватар обновлён");
    };
    reader.readAsDataURL(file);
  }

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("Файл слишком большой (макс. 10 МБ)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        ...settings,
        customBackgroundUrl: reader.result as string,
        backgroundUrl: null,
      });
      showToast("Фон обновлён");
    };
    reader.readAsDataURL(file);
  }

  async function handleElectronAvatar() {
    if (!window.electronAPI) {
      showToast("Только в десктоп-версии");
      return;
    }
    const res = await window.electronAPI.openFileDialog({
      title: "Выберите изображение",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!res.success || !res.paths?.[0]) return;
    const fileRes = await window.electronAPI.readFileAsDataUrl(res.paths[0]);
    if (fileRes.success && fileRes.dataUrl) {
      onChange({ ...settings, avatarUrl: fileRes.dataUrl });
      showToast("Аватар загружен");
    }
  }

  async function handleElectronBackground() {
    if (!window.electronAPI) {
      showToast("Только в десктоп-версии");
      return;
    }
    const res = await window.electronAPI.openFileDialog({
      title: "Выберите фоновое изображение",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!res.success || !res.paths?.[0]) return;
    const fileRes = await window.electronAPI.readFileAsDataUrl(res.paths[0]);
    if (fileRes.success && fileRes.dataUrl) {
      onChange({
        ...settings,
        customBackgroundUrl: fileRes.dataUrl,
        backgroundUrl: null,
      });
      showToast("Фон загружен");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="flex h-[600px] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0b0f] shadow-2xl animate-scale-in">
        {/* Sidebar */}
        <div className="w-56 border-r border-white/[0.06] bg-black/30 p-4">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            Настройки
          </div>
          <div className="space-y-1">
            {(
              [
                { id: "background", icon: "🎨", label: "Фон" },
                { id: "avatar", icon: "👤", label: "Аватар" },
                { id: "profile", icon: "📝", label: "Описание" },
                { id: "theme", icon: "🎯", label: "Тема" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  tab === t.id ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-white/[0.06] pt-4 text-xs text-white/40">
            <div className="mb-1 font-medium text-white/60">Активный профиль</div>
            <div className="mb-2 text-emerald-300">{activeProfile}</div>
            <button
              onClick={onOpenProfileFolder}
              className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 transition hover:bg-white/[0.08]"
            >
              📂 Открыть папку
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {tab === "background" && "Фон главного экрана"}
              {tab === "avatar" && "Аватар"}
              {tab === "profile" && "Описание профиля"}
              {tab === "theme" && "Цвет темы"}
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-white/60 transition hover:bg-white/[0.1]"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>

          {tab === "background" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-white/70">
                  Пресеты
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_BACKGROUNDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() =>
                        onChange({
                          ...settings,
                          backgroundUrl: b.url || null,
                          customBackgroundUrl: null,
                        })
                      }
                      className={`relative h-24 overflow-hidden rounded-lg border-2 transition ${
                        (settings.backgroundUrl === b.url || (b.id === "none" && !settings.backgroundUrl && !settings.customBackgroundUrl))
                          ? "border-emerald-400"
                          : "border-white/[0.08]"
                      }`}
                    >
                      {b.id === "none" ? (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#06070a] to-[#1a1f30] text-xs text-white/40">
                          Без фона
                        </div>
                      ) : (
                        <div
                          className="h-full w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${b.url})` }}
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                        {b.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-white/70">
                  Своё изображение
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => bgInputRef.current?.click()}
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.08]"
                  >
                    📁 Выбрать файл
                  </button>
                  {window.electronAPI && (
                    <button
                      onClick={handleElectronBackground}
                      className="flex-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20"
                    >
                      💻 С диска
                    </button>
                  )}
                </div>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />
                {settings.customBackgroundUrl && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <div
                      className="h-12 w-16 rounded bg-cover bg-center"
                      style={{ backgroundImage: `url(${settings.customBackgroundUrl})` }}
                    />
                    <span className="text-white/60">Свой фон установлен</span>
                    <button
                      onClick={() =>
                        onChange({ ...settings, customBackgroundUrl: null })
                      }
                      className="ml-auto text-red-300 hover:text-red-200"
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "avatar" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className="h-24 w-24 overflow-hidden rounded-full border-2 border-emerald-400/30 bg-gradient-to-br from-emerald-400 to-teal-500 bg-cover bg-center"
                  style={{
                    backgroundImage: settings.avatarUrl ? `url(${settings.avatarUrl})` : undefined,
                  }}
                />
                <div>
                  <div className="text-sm font-medium text-white/70">Аватар</div>
                  <div className="text-xs text-white/40">
                    Используется на главном экране и в аккаунтах
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 transition hover:bg-white/[0.08]"
                >
                  📁 Выбрать файл
                </button>
                {window.electronAPI && (
                  <button
                    onClick={handleElectronAvatar}
                    className="flex-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    💻 С диска
                  </button>
                )}
                {settings.avatarUrl && (
                  <button
                    onClick={() => onChange({ ...settings, avatarUrl: null })}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/20"
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />

              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/50">
                💡 Можно использовать PNG, JPG, WebP, GIF. Максимум 5 МБ. Изображение автоматически обрежется в круг.
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-white/70">
                  Описание профиля «{activeProfile}»
                </div>
                <textarea
                  value={settings.profileDescription}
                  onChange={(e) =>
                    onChange({ ...settings, profileDescription: e.target.value })
                  }
                  maxLength={200}
                  rows={4}
                  placeholder="Расскажите о себе или ваших модах…"
                  className="w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
                />
                <div className="mt-1 text-right text-[10px] text-white/40">
                  {settings.profileDescription.length} / 200
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                  <span className="text-sm text-white/85">Показывать приветствие</span>
                  <input
                    type="checkbox"
                    checked={settings.showWelcome}
                    onChange={(e) =>
                      onChange({ ...settings, showWelcome: e.target.checked })
                    }
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                  <span className="text-sm text-white/85">Показывать статистику</span>
                  <input
                    type="checkbox"
                    checked={settings.showStats}
                    onChange={(e) =>
                      onChange({ ...settings, showStats: e.target.checked })
                    }
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
              </div>
            </div>
          )}

          {tab === "theme" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-white/70">
                  Цвет акцента
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onChange({ ...settings, accentColor: c.id })}
                      className={`group relative h-16 rounded-xl border-2 bg-gradient-to-br ${c.class} transition ${
                        settings.accentColor === c.id
                          ? "border-white scale-105"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      {settings.accentColor === c.id && (
                        <div className="absolute inset-0 flex items-center justify-center text-white">
                          ✓
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-center text-xs text-white/50">
                  {ACCENT_COLORS.find((c) => c.id === settings.accentColor)?.label}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-scale-in rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200 shadow-2xl backdrop-blur-md">
          {toast}
        </div>
      )}
    </div>
  );
}
