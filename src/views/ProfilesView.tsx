import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import type { Loader, Profile } from "../lib/types";
import type { Ctx } from "../App";
import { Avatar, Badge, Button, Field, Modal, inputCls } from "../components/ui";
import { LaunchModal } from "./LaunchModal";

export function ProfilesView({ ctx }: { ctx: Ctx }) {
  const [selectedId, setSelectedId] = useState<string | null>(ctx.activeProfile?.id ?? ctx.profiles[0]?.id ?? null);
  const [launching, setLaunching] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = ctx.profiles.find((p) => p.id === selectedId) ?? null;

  const update = useCallback(
    async (patch: Partial<Profile>) => {
      if (!selected) return;
      try {
        await api.updateProfile(selected.id, patch);
        await ctx.reload();
      } catch (e) {
        alert(String((e as Error).message || e));
      }
    },
    [selected, ctx],
  );

  return (
    <div className="flex h-full min-w-0">
      {/* Список профилей */}
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h1 className="text-base font-bold">Профили</h1>
          <Button variant="solid" className="!px-2.5 !py-1 text-xs" onClick={() => setCreating(true)}>
            + Создать
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {ctx.profiles.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted">
              Нет профилей.
              <br />
              Создайте первый, чтобы запускать игру и ставить моды.
            </div>
          )}
          {ctx.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                selectedId === p.id ? "border-accent/50 bg-accent/10" : "border-transparent hover:bg-panel-3",
                ctx.activeProfile?.id === p.id && selectedId !== p.id && "bg-panel-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{p.name}</span>
                {ctx.activeProfile?.id === p.id && <Badge tone="accent">активен</Badge>}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">
                {p.gameVersion}
                {p.loader !== "vanilla" ? ` · ${p.loader} ${p.loaderVersion}` : ""} · {p.ramMB}МБ
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Редактор профиля */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex h-full items-center justify-center text-muted">Выберите профиль</div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar name={ctx.auth.username || ctx.config.offlineName} size={64} />
                <div>
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted">
                    Игрок: {ctx.auth.loggedIn ? ctx.auth.username : ctx.config.offlineName} · скин подгружается из интернета
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {ctx.activeProfile?.id !== selected.id && (
                  <Button variant="outline" onClick={async () => { await ctx.setActive(selected.id); await ctx.reload(); }}>
                    Сделать активным
                  </Button>
                )}
                <Button variant="danger" onClick={async () => {
                  if (!confirm(`Удалить профиль «${selected.name}»? Папка инстанса останется на диске.`)) return;
                  await api.deleteProfile(selected.id);
                  setSelectedId(null);
                  await ctx.reload();
                }}>
                  Удалить
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Имя профиля">
                <input className={inputCls} value={selected.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Версия Minecraft">
                <select
                  className={inputCls}
                  value={selected.gameVersion}
                  onChange={(e) => update({ gameVersion: e.target.value, loaderVersion: "" })}
                >
                  <option value="">— выбрать —</option>
                  {ctx.versions.filter((v) => v.type === "release").map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Загрузчик">
                <select className={inputCls} value={selected.loader} onChange={(e) => update({ loader: e.target.value as Loader, loaderVersion: "" })}>
                  <option value="vanilla">Vanilla</option>
                  <option value="forge">Forge</option>
                  <option value="neoforge">NeoForge</option>
                </select>
              </Field>
              {selected.loader !== "vanilla" && (
                <LoaderVersionField profile={selected} onChange={(loaderVersion) => update({ loaderVersion })} />
              )}
              <Field label={`Память: ${selected.ramMB} МБ`}>
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={selected.ramMB}
                  onChange={(e) => update({ ramMB: Number(e.target.value) })}
                  className="w-full accent-[#22d3ee]"
                />
              </Field>
              <Field label="Java (пусто = авто)">
                <JavaPathField value={selected.javaPath} onChange={(javaPath) => update({ javaPath })} />
              </Field>
              <Field label="Имя игрока (offline)" hint="Используется, если нет входа через Microsoft">
                <input
                  className={inputCls}
                  value={ctx.config.offlineName}
                  onChange={async (e) => {
                    const name = e.target.value;
                    await ctx.saveConfig({ offlineName: name });
                    await api.loginOffline(name);
                    await ctx.refreshAuth();
                  }}
                />
              </Field>
              <Field label="Доп. аргументы JVM/игре">
                <input className={inputCls} value={selected.customArgs} placeholder="-Dminecraft.launcher.brand=anlaunch" onChange={(e) => update({ customArgs: e.target.value })} />
              </Field>
            </div>

            {/* Установка */}
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-4">
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {selected.gameVersion}
                  {selected.loader !== "vanilla" ? ` + ${selected.loader.toUpperCase()} ${selected.loaderVersion}` : ""}
                  {selected.installed.length > 0 ? ` · модов: ${selected.installed.length}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {selected.loaderVersion === "" && selected.loader !== "vanilla"
                    ? "⚠ Выберите версию загрузчика, чтобы запустить игру"
                    : "Все данные инстанса хранятся в папке instances/<имя>"}
                </div>
              </div>
              <Button
                className="!px-6 !py-2.5 text-base"
                disabled={!ctx.activeProfile || ctx.activeProfile.id !== selected.id || (selected.loader !== "vanilla" && !selected.loaderVersion)}
                title={ctx.activeProfile?.id !== selected.id ? "Сначала сделайте профиль активным" : undefined}
                onClick={() => setLaunching(selected)}
              >
                ▶ Запустить
              </Button>
            </div>

            {/* Установленные моды */}
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Установленные моды ({selected.installed.length})
              </div>
              {selected.installed.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                  Модно пока нет. Перейдите во вкладку «Моды» — обязательные зависимости установятся вместе с модом автоматически.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {selected.installed.map((m) => (
                    <div key={m.slug} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                      <span className="text-ok">✓</span>
                      <span className="truncate font-medium">{m.title}</span>
                      <span className="text-[11px] text-muted">v{m.versionNumber}</span>
                      <button
                        type="button"
                        className="ml-auto rounded px-2 py-0.5 text-xs text-muted hover:bg-danger/15 hover:text-danger"
                        onClick={async () => {
                          await api.uninstallMod(selected.id, m.slug);
                          await ctx.reload();
                        }}
                      >
                        удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {creating && <CreateProfileModal ctx={ctx} onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />}
      {launching && <LaunchModal profile={launching} onClose={() => setLaunching(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function LoaderVersionField({ profile, onChange }: { profile: Profile; onChange: (v: string) => void }) {
  const [list, setList] = useState<{ versionNumber: string; id: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile.loader === "vanilla" || !profile.gameVersion) {
      setList([]);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .getLoaderVersions({ loader: profile.loader, gameVersion: profile.gameVersion })
      .then((l) => alive && setList(l))
      .catch(() => alive && setList([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [profile.loader, profile.gameVersion]);

  return (
    <Field label={`Версия ${profile.loader === "neoforge" ? "NeoForge" : "Forge"}`}>
      <select className={inputCls} value={profile.loaderVersion} onChange={(e) => onChange(e.target.value)}>
        <option value="">{loading ? "загрузка…" : list.length ? "— выбрать —" : "нет версий"}</option>
        {list.map((v) => (
          <option key={v.id || v.versionNumber} value={v.versionNumber}>
            {v.versionNumber}
          </option>
        ))}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------------------
function JavaPathField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [found, setFound] = useState<{ path: string; version: string }[]>([]);
  const [scanning, setScanning] = useState(false);

  return (
    <div>
      <input className={inputCls} value={value} placeholder="C:\Program Files\...\bin\java.exe" onChange={(e) => onChange(e.target.value)} />
      <div className="mt-1.5 flex items-center gap-2">
        <Button
          variant="outline"
          className="!px-2.5 !py-1 text-xs"
          disabled={scanning}
          onClick={async () => {
            setScanning(true);
            try {
              setFound(await api.detectJava());
            } catch {
              setFound([]);
            } finally {
              setScanning(false);
            }
          }}
        >
          {scanning ? "Ищем…" : "Найти Java"}
        </Button>
        {found.length > 0 && (
          <select className={cn(inputCls, "!w-auto flex-1 !py-1 text-xs")} value="" onChange={(e) => e.target.value && onChange(e.target.value)}>
            <option value="">Найдено: {found.length}</option>
            {found.map((j) => (
              <option key={j.path} value={j.path}>
                Java {j.version} — {j.path}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CreateProfileModal({
  ctx,
  onClose,
  onCreated,
}: {
  ctx: Ctx;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("Профиль " + (ctx.profiles.length + 1));
  const [gameVersion, setGameVersion] = useState("1.21.4");
  const [loader, setLoader] = useState<Loader>("vanilla");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [ram, setRam] = useState(ctx.config.defaultRamMB);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProfile({ name, gameVersion, loader, loaderVersion, ramMB: ram });
      await ctx.setActive(p.id);
      await ctx.reload();
      onCreated(p.id);
      onClose();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Новый профиль" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Имя">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Версия Minecraft">
            <select className={inputCls} value={gameVersion} onChange={(e) => setGameVersion(e.target.value)}>
              {ctx.versions.filter((v) => v.type === "release").map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
              {!ctx.versions.length && <option value="1.21.4">1.21.4</option>}
            </select>
          </Field>
          <Field label="Загрузчик">
            <select className={inputCls} value={loader} onChange={(e) => setLoader(e.target.value as Loader)}>
              <option value="vanilla">Vanilla</option>
              <option value="forge">Forge</option>
              <option value="neoforge">NeoForge</option>
            </select>
          </Field>
        </div>
        {loader !== "vanilla" && (
          <LoaderVersionField
            profile={{ id: "", name, gameVersion, loader, loaderVersion, ramMB: ram, javaPath: "", customArgs: "", installed: [], createdAt: 0 }}
            onChange={(v) => setLoaderVersion(v)}
          />
        )}
        <Field label={`Память: ${ram} МБ`}>
          <input type="range" min={1024} max={16384} step={512} value={ram} onChange={(e) => setRam(Number(e.target.value))} className="w-full accent-[#22d3ee]" />
        </Field>
        {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={create} disabled={busy || !name.trim()}>
            {busy ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
