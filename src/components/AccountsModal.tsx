import { useEffect, useState } from "react";
import type { Account } from "../lib/accounts";
import {
  createAccount,
  deleteAccount,
  getAllAccounts,
  saveMicrosoftAccount,
  setActiveAccount,
} from "../lib/accounts";
import { CheckIcon, CloseIcon } from "./icons";

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
  const [manualToken, setManualToken] = useState("");
  const [manualUuid, setManualUuid] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (open) {
      setAccounts(getAllAccounts());
      setConfirmDelete(null);
      setError(null);
      setMsStatus(null);
    }
  }, [open]);

  async function handleMicrosoftLogin() {
    if (!window.electronAPI) {
      setError("Вход через Microsoft доступен только в десктоп-версии (Electron).");
      return;
    }
    setError(null);
    setMsLoading(true);
    setMsStatus("Открываю окно входа…");

    const unsub = window.electronAPI.onAuthProgress((msg) => setMsStatus(msg));
    try {
      const res = await window.electronAPI.loginMicrosoft();
      if (res.success) {
        const account = saveMicrosoftAccount(res.account as unknown as Account);
        setAccounts(getAllAccounts());
        onChange(account);
        setMsStatus(null);
        onClose();
      } else {
        setError(res.error || "Не удалось войти через Microsoft");
      }
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
    onClose();
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

    const updated = accounts.map((a) =>
      a.id === editingId ? { ...a, username: name } : a
    );
    localStorage.setItem("anlaunch_accounts", JSON.stringify(updated));
    setAccounts(updated);

    if (activeAccount?.id === editingId) {
      onChange({ ...activeAccount, username: name });
    }
    setEditingId(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141419] shadow-2xl">
        {/* Header */}
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
                Microsoft и оффлайн · {accounts.length}{" "}
                {accounts.length === 1 ? "аккаунт" : accounts.length > 1 && accounts.length < 5 ? "аккаунта" : "аккаунтов"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 transition hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[500px] overflow-y-auto p-5">
          {/* Microsoft login */}
          <button
            onClick={handleMicrosoftLogin}
            disabled={msLoading}
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-xl bg-[#2f2f9e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3a3ab5] disabled:opacity-60"
          >
            <svg viewBox="0 0 23 23" className="h-5 w-5">
              <rect x="1" y="1" width="10" height="10" fill="#f25022" />
              <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
              <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
              <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
            </svg>
            {msLoading ? msStatus || "Вход…" : "Войти через Microsoft"}
          </button>

          {/* Manual token entry for Russia */}
          <button
            onClick={() => setShowManual(!showManual)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.06]"
          >
            🔑 Ввести токен вручную (для России)
          </button>

          {showManual && (
            <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="mb-2 text-xs text-white/50">
                Получите токен на{" "}
                <a href="https://mclo.gs" target="_blank" rel="noreferrer" className="text-blue-300 underline">
                  mclo.gs
                </a>{" "}
                или{" "}
                <a href="https://authserver.mojang.com" target="_blank" rel="noreferrer" className="text-blue-300 underline">
                  authserver.mojang.com
                </a>{" "}
                и вставьте сюда.
              </div>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Ник в Minecraft…"
                className="mb-2 w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
              />
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Access Token…"
                className="mb-2 w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
              />
              <input
                value={manualUuid}
                onChange={(e) => setManualUuid(e.target.value)}
                placeholder="UUID (необязательно)…"
                className="mb-2 w-full rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/50"
              />
              <button
                onClick={() => {
                  setError(null);
                  const name = newUsername.trim();
                  if (!name) return setError("Введите ник");
                  const uuid = manualUuid.trim() || `00000000-0000-0000-0000-${Date.now().toString(16)}`;
                  const account: Account = {
                    id: `token_${Date.now()}`,
                    username: name,
                    uuid,
                    type: "premium",
                    accessToken: manualToken.trim(),
                    createdAt: Date.now(),
                  };
                  saveMicrosoftAccount(account);
                  setAccounts(getAllAccounts());
                  onChange(account);
                  setShowManual(false);
                  setManualToken("");
                  setManualUuid("");
                  onClose();
                }}
                className="w-full rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
              >
                Сохранить
              </button>
            </div>
          )}

          <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/25">
            <span className="h-px flex-1 bg-white/[0.08]" />
            или оффлайн-аккаунт
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>

          {/* Create */}
          <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
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
                onClick={handleCreate}
                className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-[#06070a] transition hover:bg-emerald-300"
              >
                Добавить
              </button>
            </div>
            {error && <div className="mt-2 text-xs text-red-400">⚠ {error}</div>}
          </div>

          {/* List */}
          {accounts.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/40">
              Нет аккаунтов. Создайте первый!
            </div>
          ) : (
            <div className="space-y-2">
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
                      {/* Minecraft-style head avatar */}
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
                          isActive ? "from-emerald-400 to-teal-500" : "from-slate-500 to-slate-700"
                        } text-sm font-bold text-white`}
                        style={{ imageRendering: "pixelated" }}
                      >
                        {account.username[0].toUpperCase()}
                      </div>

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
                            onClick={() => handleSelect(account)}
                            className="block truncate text-left text-sm font-semibold text-white transition hover:text-emerald-300"
                          >
                            {account.username}
                          </button>
                        )}
                        <div className="truncate text-xs text-white/40">
                          {account.type === "microsoft"
                            ? "🪟 Microsoft"
                            : account.type === "premium"
                              ? "🔑 Лицензия"
                              : "🔓 Оффлайн"}{" "}
                          ·{" "}
                          <span className="font-mono text-[10px]">{account.uuid.slice(0, 13)}…</span>
                        </div>
                      </div>

                      {isActive && !isConfirming && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                          <CheckIcon className="h-3 w-3" /> Активен
                        </span>
                      )}

                      {!isConfirming && (
                        <div className="flex gap-1">
                          {isEditing ? (
                            <button
                              onClick={handleSaveEdit}
                              className="rounded px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10"
                            >
                              ✓
                            </button>
                          ) : (
                            <button
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
                            onClick={() => setConfirmDelete(account)}
                            className="flex h-7 w-7 items-center justify-center rounded text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline delete confirmation */}
                    {isConfirming && (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                        <span className="text-xs text-red-200">Удалить «{account.username}»?</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => performDelete(account)}
                            className="rounded bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-400"
                          >
                            Удалить
                          </button>
                          <button
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
        </div>

        {/* Footer */}
        <div className="border-t border-[#1c2438] p-4">
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200/70">
            💡 <b className="text-yellow-200">Пиратские (оффлайн) аккаунты</b> работают без лицензии
            Minecraft — как в TLauncher. Можно играть в одиночке и на пиратских (offline-mode)
            серверах. UUID вычисляется правильно, ник сохраняется локально.
          </div>
        </div>
      </div>
    </div>
  );
}
