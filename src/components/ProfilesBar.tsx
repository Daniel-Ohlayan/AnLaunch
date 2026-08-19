import { useState } from "react";
import type { ProfileInfo } from "../types/electron";

export default function ProfilesBar({
  profiles,
  activeProfile,
  onSelect,
  onRename,
  onDelete,
  onOpenCreate,
  accent,
}: {
  profiles: ProfileInfo[];
  activeProfile: string;
  onSelect: (name: string) => void;
  onRename: (oldName: string, newName: string) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
  onOpenCreate: () => void;
  accent?: { gradient: string; text: string; bg: string; border: string };
}) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const acc = accent || {
    gradient: "from-emerald-400 to-teal-500",
    text: "text-emerald-400",
    bg: "bg-emerald-400/15",
    border: "border-emerald-400/40",
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Профили
        </div>
        <button
          onClick={onOpenCreate}
          className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${acc.gradient} px-4 py-2 text-sm font-semibold text-[#06070a] transition active:scale-95`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Создать
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {profiles.length === 0 ? (
          <button
            onClick={onOpenCreate}
            className="w-full rounded-xl border-2 border-dashed border-white/[0.15] bg-white/[0.02] py-6 text-sm text-white/40 transition hover:border-emerald-400/40 hover:text-white/70"
          >
            + Создать первый профиль
          </button>
        ) : (
          profiles.map((p) => {
            const isActive = activeProfile === p.name;
            const isEditing = editingName === p.name;
            const isConfirming = confirmDelete === p.name;

            if (isEditing) {
              return (
                <div
                  key={p.name}
                  className={`flex items-center gap-2 rounded-xl border ${acc.border} ${acc.bg} px-3 py-3`}
                >
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (editValue.trim() && editValue !== p.name) onRename(p.name, editValue.trim());
                        setEditingName(null);
                      }
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    className="flex-1 rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-sm text-white outline-none"
                  />
                  <button
                    onClick={() => {
                      if (editValue.trim() && editValue !== p.name) onRename(p.name, editValue.trim());
                      setEditingName(null);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-sm text-white transition hover:bg-emerald-400"
                    title="Сохранить"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingName(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm text-white transition hover:bg-white/20"
                    title="Отмена"
                  >
                    ✕
                  </button>
                </div>
              );
            }

            if (isConfirming) {
              return (
                <div
                  key={p.name}
                  className="flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-3"
                >
                  <span className="text-sm text-red-200">
                    Удалить «{p.name}» и все файлы?
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onDelete(p.name);
                        setConfirmDelete(null);
                      }}
                      className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-400"
                    >
                      Удалить
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={p.name}
                className={`group flex items-center gap-2 rounded-xl border px-3 py-3 transition ${
                  isActive
                    ? `border-transparent bg-gradient-to-r ${acc.gradient} text-white shadow-lg`
                    : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white"
                }`}
              >
                {/* Profile name + info */}
                <button
                  onClick={() => onSelect(p.name)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="text-base">📦</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className={`truncate text-[10px] ${isActive ? "text-white/70" : "text-white/40"}`}>
                      {p.mods} модов · {p.resourcepacks} рп · {p.shaderpacks} шейдеров
                    </div>
                  </div>
                  {isActive && (
                    <span className="ml-1 flex h-2 w-2 shrink-0 items-center justify-center">
                      <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
                    </span>
                  )}
                </button>

                {/* Action buttons — всегда видны, больше */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditingName(p.name);
                      setEditValue(p.name);
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition ${
                      isActive
                        ? "bg-white/20 text-white hover:bg-white/30"
                        : "bg-white/[0.08] text-white/60 hover:bg-white/[0.15] hover:text-white"
                    }`}
                    title="Переименовать"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p.name)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition ${
                      isActive
                        ? "bg-white/20 text-white hover:bg-red-500/40"
                        : "bg-white/[0.08] text-white/60 hover:bg-red-500/20 hover:text-red-300"
                    }`}
                    title="Удалить"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
