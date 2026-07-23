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
          className={`flex items-center gap-1.5 rounded-md border ${acc.border} bg-gradient-to-r ${acc.gradient} px-3 py-1.5 text-[11px] font-semibold text-white transition active:scale-95`}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Создать
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {profiles.length === 0 ? (
          <button
            onClick={onOpenCreate}
            className="w-full rounded-xl border-2 border-dashed border-white/[0.15] bg-white/[0.02] py-4 text-sm text-white/40 transition hover:border-emerald-400/40 hover:text-white/70"
          >
            + Создать первый профиль
          </button>
        ) : (
          profiles.map((p) => {
            const isActive = activeProfile === p.name;
            const isEditing = editingName === p.name;
            const isConfirming = confirmDelete === p.name;

            return (
              <div key={p.name} className="relative">
                {isEditing ? (
                  <div className={`flex items-center gap-1 rounded-full border ${acc.border} ${acc.bg} px-2 py-1`}>
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
                      className="w-24 rounded border border-white/30 bg-black/40 px-1 py-0.5 text-xs text-white outline-none"
                    />
                  </div>
                ) : isConfirming ? (
                  <div className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1">
                    <span className="px-2 text-xs text-red-200">Удалить «{p.name}»?</span>
                    <button
                      onClick={() => {
                        onDelete(p.name);
                        setConfirmDelete(null);
                      }}
                      className="rounded bg-red-500 px-2 py-0.5 text-xs font-semibold text-white"
                    >
                      Да
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="rounded bg-white/20 px-2 py-0.5 text-xs text-white"
                    >
                      Нет
                    </button>
                  </div>
                ) : (
                  <div
                    className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? `border-transparent bg-gradient-to-r ${acc.gradient} text-white shadow-lg`
                        : "border-white/[0.08] bg-white/[0.03] text-white/65 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <button onClick={() => onSelect(p.name)} className="flex items-center gap-1.5">
                      <span className="text-[10px] opacity-60">📦</span>
                      <span>{p.name}</span>
                      {isActive && <span className="opacity-80">●</span>}
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => {
                          setEditingName(p.name);
                          setEditValue(p.name);
                        }}
                        className="ml-1 text-[10px] opacity-0 transition hover:opacity-100"
                        title="Переименовать"
                      >
                        ✏️
                      </button>
                    )}
                    {!isActive && (
                      <button
                        onClick={() => setConfirmDelete(p.name)}
                        className="text-[10px] opacity-0 transition hover:opacity-100 hover:text-red-300"
                        title="Удалить"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
