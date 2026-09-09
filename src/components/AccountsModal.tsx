import { useEffect, useRef, useState } from "react";
import type { Account } from "../lib/accounts";
import {
  createAccount,
  deleteAccount,
  getAllAccounts,
  saveMicrosoftAccount,
  setActiveAccount,
  updateAccountTextures,
} from "../lib/accounts";
import { CheckIcon, CloseIcon } from "./icons";
import SkinViewer from "./SkinViewer";

function McHead({ src, letter, active }: { src?: string; letter: string; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const s = img.width / 64;
      ctx.clearRect(0, 0, 40, 40);
      ctx.drawImage(img, 8 * s, 8 * s, 8 * s, 8 * s, 0, 0, 40, 40);
      ctx.drawImage(img, 40 * s, 8 * s, 8 * s, 8 * s, 0, 0, 40, 40);
    };
    img.src = src;
  }, [src]);
  return (
    <div
      className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ${
        src
          ? "bg-[#1a1a22]"
          : active
            ? "bg-gradient-to-br from-emerald-400 to-teal-500"
            : "bg-gradient-to-br from-slate-500 to-slate-700"
      }`}
    >
      {src ? (
        <canvas ref={canvasRef} width={40} height={40} className="h-10 w-10" style={{ imageRendering: "pixelated" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">{letter}</div>
      )}
    </div>
  );
}

export default function AccountsModal({
  open,
  onClose,
  activeAccount,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  activeAccount: Account | null;
  onChange: (account: Account | null) => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [msLoading, setMsLoading] = useState(false);
  const [msStatus, setMsStatus] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [previews, setPreviews] = useState<Record<string, { skin?: string; cape?: string }>>({});
  const [nickQuery, setNickQuery] = useState("");
  const [nickLoading, setNickLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const list = getAllAccounts();
    setAccounts(list);
    setConfirmDelete(null);
    setError(null);
    setMsStatus(null);
    (async () => {
      if (!window.electronAPI) return;
      const next: Record<string, { skin?: string; cape?: string }> = {};
      for (const a of list) {
        const p: { skin?: string; cape?: string } = {};
        if (a.skinPath) {
          const r = await window.electronAPI.readFileAsDataUrl(a.skinPath);
          if (r.success && r.dataUrl) p.skin = r.dataUrl;
        }
        if (a.capePath) {
          const r = await window.electronAPI.readFileAsDataUrl(a.capePath);
          if (r.success && r.dataUrl) p.cape = r.dataUrl;
        }
        next[a.id] = p;
      }
      setPreviews(next);
    })();
  }, [open]);

  function applySaved(account: Account, kind: "skin" | "cape", path: string, dataUrl?: string) {
    const updated = updateAccountTextures(account.id, kind === "cape" ? { capePath: path } : { skinPath: path });
    setAccounts(getAllAccounts());
    if (updated) {
      if (activeAccount?.id === account.id || !activeAccount) onChange(updated);
    }
    if (dataUrl) {
      setPreviews((s) => ({ ...s, [account.id]: { ...s[account.id], [kind]: dataUrl } }));
    }
  }

  async function pickTexture(account: Account, kind: "skin" | "cape") {
    if (!window.electronAPI) {
      setError("Скин и плащ можно добавить только в установленном лаунчере.");
      return;
    }
    setError(null);
    const dlg = await window.electronAPI.openFileDialog({
      title: kind === "cape" ? "Выберите плащ (PNG 64×32)" : "Выберите скин (PNG 64×64)",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!dlg.success || !dlg.paths?.[0]) return;
    const saved = await window.electronAPI.saveAccountTexture({
      accountId: account.id,
      kind,
      sourcePath: dlg.paths[0],
    });
    if (!saved.success || !saved.path) {
      setError(saved.error || "Не удалось сохранить PNG");
      return;
    }
    applySaved(account, kind, saved.path, saved.dataUrl);
  }

  async function saveBytes(account: Account, kind: "skin" | "cape", file: File) {
    if (!window.electronAPI?.saveAccountTextureBytes) {
      setError("Обновите лаунчер — эта сборка не умеет принимать PNG.");
      return;
    }
    setError(null);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const saved = await window.electronAPI.saveAccountTextureBytes({
      accountId: account.id,
      kind,
      base64,
    });
    if (!saved.success || !saved.path) {
      setError(saved.error || "Не удалось сохранить PNG");
      return;
    }
    applySaved(account, kind, saved.path, saved.dataUrl);
  }

  async function fetchNickSkin(account: Account) {
    if (!window.electronAPI?.fetchPlayerSkin) {
      setError("Обновите лаунчер, чтобы качать скин по нику.");
      return;
    }
    const name = (nickQuery.trim() || account.username).trim();
    setError(null);
    setNickLoading(true);
    try {
      const saved = await window.electronAPI.fetchPlayerSkin({ accountId: account.id, username: name });
      if (!saved.success || !saved.path) {
        setError(saved.error || `Скин «${name}» не найден`);
        return;
      }
      applySaved(account, "skin", saved.path, saved.dataUrl);
    } finally {
      setNickLoading(false);
    }
  }

  async function clearTexture(account: Account, kind: "skin" | "cape") {
    await window.electronAPI?.removeAccountTexture({ accountId: account.id, kind });
    const updated = updateAccountTextures(account.id, kind === "cape" ? { capePath: null } : { skinPath: null });
    setAccounts(getAllAccounts());
    if (updated && activeAccount?.id === account.id) onChange(updated);
    setPreviews((s) => ({
      ...s,
      [account.id]: { ...s[account.id], [kind]: undefined },
    }));
  }

  async function finishMicrosoft(res: { success: true; account: Account } | { success: false; error: string }) {
    if (res.success) {
      const account = saveMicrosoftAccount(res.account);
      setAccounts(getAllAccounts());
      onChange(account);
      setMsStatus(null);
      setPasteUrl("");
      onClose();
      return;
    }
    setError(res.error || "Не удалось войти через Microsoft");
  }

  async function handleMicrosoftLogin() {
    if (!window.electronAPI) {
      setError("Вход через Microsoft доступен только в установленном лаунчере, не в браузере.");
      return;
    }
    setError(null);
    setMsLoading(true);
    setMsStatus("Открываю окно входа…");

    const unsub = window.electronAPI.onAuthProgress((msg) => setMsStatus(msg));
    try {
      const res = await window.electronAPI.loginMicrosoft();
      await finishMicrosoft(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа Microsoft");
    } finally {
      unsub();
      setMsLoading(false);
    }
  }

  async function handleOpenBrowser() {
    if (!window.electronAPI) {
      setError("Вход через Microsoft доступен только в установленном лаунчере.");
      return;
    }
    setError(null);
    setShowBrowser(true);
    try {
      const info = await window.electronAPI.getMicrosoftAuthUrl();
      if (info.success) setBrowserUrl(info.url);
      await window.electronAPI.openMicrosoftLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть браузер");
    }
  }

  async function handlePasteCode() {
    if (!window.electronAPI) return;
    setError(null);
    setMsLoading(true);
    setMsStatus("Обмен кода…");
    const unsub = window.electronAPI.onAuthProgress((msg) => setMsStatus(msg));
    try {
      const res = await window.electronAPI.loginMicrosoftCode(pasteUrl);
      await finishMicrosoft(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка входа Microsoft");
    } finally {
      unsub();
      setMsLoading(false);
    }
  }

  function handleCreate() {
    setError(null);
    const name = newUsername.trim();
    if (!name) return setError("Введите имя игрока");
    if (name.length < 3) return setError("Имя должно быть не короче 3 символов");
    if (name.length > 16) return setError("Имя не должно превышать 16 символов");
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return setError("Только буквы, цифры и символ _");

    try {
      const account = createAccount(name);
      setAccounts(getAllAccounts());
      setNewUsername("");
      onChange(account);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания");
    }
  }

  function handleSelect(account: Account) {
    setActiveAccount(account.id);
    onChange(account);
  }

  function performDelete(account: Account) {
    const newActive = deleteAccount(account.id);
    setAccounts(getAllAccounts());
    onChange(newActive);
    setConfirmDelete(null);
  }

  function handleSaveEdit() {
    if (!editingId) return;
    const name = editName.trim();
    if (!name || name.length < 3) return;

    const updated = accounts.map((a) => (a.id === editingId ? { ...a, username: name } : a));
    localStorage.setItem("anlaunch_accounts", JSON.stringify(updated));
    setAccounts(updated);

    if (activeAccount?.id === editingId) {
      onChange({ ...activeAccount, username: name });
    }
    setEditingId(null);
  }

  if (!open) return null;

  const previewAccount = accounts.find((a) => a.id === activeAccount?.id) || activeAccount;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-4xl animate-scale-in flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141419] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#06070a]" fill="currentColor">
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-white">Аккаунты</div>
              <div className="text-xs text-white/40">
                Скин, плащ, 3D-превью · {accounts.length}{" "}
                {accounts.length === 1 ? "аккаунт" : accounts.length > 1 && accounts.length < 5 ? "аккаунта" : "аккаунтов"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 transition hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          <div className="max-h-[70vh] overflow-y-auto p-5 lg:max-h-none">
            <div className="mb-3 text-sm font-medium text-white/80">Выберите аккаунт</div>

            {accounts.length === 0 ? (
              <div className="mb-4 py-6 text-center text-sm text-white/40">
                Нет аккаунтов. Добавьте оффлайн-ник или войдите через Microsoft.
              </div>
            ) : (
              <div className="mb-4 space-y-2">
                {accounts.map((account) => {
                  const isActive = activeAccount?.id === account.id;
                  const isEditing = editingId === account.id;
                  const isConfirming = confirmDelete?.id === account.id;

                  return (
                    <div
                      key={account.id}
                      className={`rounded-xl border p-3 transition ${
                        isActive
                          ? "border-emerald-400/40 bg-emerald-500/10"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => handleSelect(account)} className="shrink-0">
                          <McHead
                            src={previews[account.id]?.skin}
                            letter={account.username[0].toUpperCase()}
                            active={isActive}
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                              maxLength={16}
                              autoFocus
                              className="w-full rounded border border-emerald-400/50 bg-black/30 px-2 py-1 text-sm text-white outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelect(account)}
                              className="block truncate text-left text-sm font-semibold text-white"
                            >
                              {account.username}
                            </button>
                          )}
                          <div className="truncate text-xs text-white/40">
                            {account.type === "microsoft"
                              ? "🪟 Microsoft"
                              : account.type === "premium"
                                ? "🔑 Лицензия"
                                : "🔓 Оффлайн"}
                          </div>
                        </div>

                        {!isConfirming && (
                          <div className="flex shrink-0 items-center gap-1">
                            {isActive ? (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                                <CheckIcon className="h-3 w-3" /> Активен
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSelect(account)}
                                className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-[#06070a] hover:bg-emerald-300"
                              >
                                Выбрать
                              </button>
                            )}
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                className="rounded px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
                              >
                                ✓
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(account.id);
                                  setEditName(account.username);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/5 hover:text-white"
                                title="Переименовать"
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(account)}
                              className="flex h-7 w-7 items-center justify-center rounded text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                              title="Удалить"
                            >
                              🗑️
                            </button>
                          </div>
                        )}
                      </div>

                      {isConfirming && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                          <span className="text-xs text-red-200">Удалить «{account.username}»?</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => performDelete(account)}
                              className="rounded bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-400"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/15"
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
            )}

            {error && <div className="mb-3 text-xs text-red-400">⚠ {error}</div>}

            <div className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-medium text-white/70">Добавить оффлайн-аккаунт</div>
              <div className="flex gap-2">
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Введите ник…"
                  maxLength={16}
                  className="flex-1 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
                >
                  Добавить
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleMicrosoftLogin}
              disabled={msLoading}
              className="mb-2 flex w-full items-center justify-center gap-3 rounded-xl bg-[#2f2f9e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3a3ab5] disabled:opacity-60"
            >
              <svg viewBox="0 0 23 23" className="h-5 w-5">
                <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
                <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
                <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
              </svg>
              {msLoading ? msStatus || "Вход…" : "Войти через Microsoft"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowBrowser(!showBrowser);
                if (!showBrowser) handleOpenBrowser();
              }}
              disabled={msLoading}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06]"
            >
              Войти через браузер (если окно не открывается)
            </button>

            {showBrowser && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="mb-2 text-xs leading-relaxed text-white/55">
                  1. Войдите в Microsoft в открывшемся браузере. 2. После входа откроется пустая страница — скопируйте её
                  адрес (начинается с login.live.com/oauth20_desktop.srf) и вставьте сюда. Если login.live.com не
                  открывается, включите VPN.
                </p>
                {browserUrl && (
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(browserUrl).catch(() => {})}
                    className="mb-2 text-[11px] text-blue-300 underline"
                  >
                    Скопировать ссылку входа
                  </button>
                )}
                <input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="Вставьте ссылку с code=…"
                  className="mb-2 w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                />
                <button
                  type="button"
                  onClick={handlePasteCode}
                  disabled={msLoading || !pasteUrl.trim()}
                  className="w-full rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300 disabled:opacity-50"
                >
                  {msLoading ? msStatus || "Вход…" : "Продолжить вход"}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.06] bg-black/20 p-4 lg:border-l lg:border-t-0">
            {previewAccount ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  const name = file.name.toLowerCase();
                  if (!name.endsWith(".png") && file.type !== "image/png") {
                    setError("Нужен файл PNG");
                    return;
                  }
                  saveBytes(previewAccount, /cape|cloak|плащ/i.test(file.name) ? "cape" : "skin", file);
                }}
              >
                <div className="mb-2 text-sm font-semibold text-white">{previewAccount.username}</div>
                <SkinViewer
                  skin={previews[previewAccount.id]?.skin}
                  cape={previews[previewAccount.id]?.cape}
                  slim={previewAccount.slim}
                />
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => pickTexture(previewAccount, "skin")}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/[0.12]"
                    >
                      {previewAccount.skinPath ? "Сменить скин" : "Скин PNG"}
                    </button>
                    {previewAccount.skinPath && (
                      <button
                        type="button"
                        onClick={() => clearTexture(previewAccount, "skin")}
                        className="text-[11px] text-white/35 hover:text-red-300"
                      >
                        сбросить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => pickTexture(previewAccount, "cape")}
                      className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/[0.12]"
                    >
                      {previewAccount.capePath ? "Сменить плащ" : "Плащ PNG"}
                    </button>
                    {previewAccount.capePath && (
                      <button
                        type="button"
                        onClick={() => clearTexture(previewAccount, "cape")}
                        className="text-[11px] text-white/35 hover:text-red-300"
                      >
                        сбросить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = updateAccountTextures(previewAccount.id, { slim: !previewAccount.slim });
                        setAccounts(getAllAccounts());
                        if (updated) onChange(updated);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                        previewAccount.slim ? "bg-emerald-500/20 text-emerald-200" : "bg-white/[0.06] text-white/55"
                      }`}
                    >
                      {previewAccount.slim ? "Alex" : "Steve"}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={nickQuery}
                      onChange={(e) => setNickQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchNickSkin(previewAccount)}
                      placeholder={`Ник (пусто = ${previewAccount.username})`}
                      maxLength={16}
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-black/30 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
                    />
                    <button
                      type="button"
                      disabled={nickLoading}
                      onClick={() => fetchNickSkin(previewAccount)}
                      className="shrink-0 rounded-lg bg-emerald-400 px-2.5 py-1.5 text-[11px] font-semibold text-[#06070a] hover:bg-emerald-300 disabled:opacity-60"
                    >
                      {nickLoading ? "…" : "По нику"}
                    </button>
                  </div>
                  <div className="text-[10px] leading-relaxed text-white/35">
                    Перетащите PNG сюда. «По нику» берёт скин с Mojang / Ely.by. На оффлайн он виден в игре после запуска.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center text-center text-xs text-white/35">
                Выберите аккаунт, чтобы поставить скин
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
