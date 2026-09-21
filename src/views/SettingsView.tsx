import { useState } from "react";
import { api, isElectron } from "../lib/api";
import type { Ctx } from "../App";
import { Avatar, Badge, Button, Field, Spinner, inputCls } from "../components/ui";

export function SettingsView({ ctx }: { ctx: Ctx }) {
  const [gameDir, setGameDir] = useState(ctx.config.gameDir);
  const [javaPath, setJavaPath] = useState(ctx.config.javaPath);
  const [defaultRam, setDefaultRam] = useState(String(ctx.config.defaultRamMB));
  const [msClientId, setMsClientId] = useState(ctx.config.msClientId);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [msBusy, setMsBusy] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await ctx.saveConfig({
        gameDir,
        javaPath,
        defaultRamMB: Number(defaultRam) || 4096,
        msClientId: msClientId.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setMsg(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  };

  const refreshVersions = async () => {
    setVersionsLoading(true);
    setMsg(null);
    try {
      await ctx.refreshVersions();
      setMsg(null);
    } catch (e) {
      setMsg("Не удалось обновить список версий: " + String((e as Error).message || e));
    } finally {
      setVersionsLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-bold">Настройки</h1>
          <p className="text-xs text-muted">
            AnLaunch v{ctx.version} · платформа: {ctx.platform}
            {!isElectron && <Badge tone="warn"> демо-режим в браузере</Badge>}
          </p>
        </div>

        {/* Игровая папка и Java */}
        <section className="space-y-4 rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Игра</h2>
          <Field label="Папка .minecraft" hint="Общая папа: versions/, libraries/, assets/ — общие для всех профилей">
            <input className={inputCls} value={gameDir} onChange={(e) => setGameDir(e.target.value)} />
          </Field>
          <Field label="Путь к java (пусто = автопоиск)">
            <input className={inputCls} value={javaPath} placeholder="авто" onChange={(e) => setJavaPath(e.target.value)} />
          </Field>
          <Field label="Память по умолчанию, МБ">
            <input className={inputCls} type="number" min={1024} max={32768} step={512} value={defaultRam} onChange={(e) => setDefaultRam(e.target.value)} />
          </Field>
        </section>

        {/* Версии */}
        <section className="space-y-3 rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Список версий</h2>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={refreshVersions} disabled={versionsLoading}>
              {versionsLoading ? <Spinner /> : "⟳"} Обновить список версий Mojang
            </Button>
            <span className="text-xs text-muted">Версий в списке: {ctx.versions.length}</span>
          </div>
        </section>

        {/* Авторизация */}
        <section className="space-y-3 rounded-xl border border-line bg-panel-2 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Аккаунт</h2>
          <div className="flex items-center gap-3">
            <Avatar name={ctx.auth.username || ""} size={52} />
            <div className="flex-1">
              <div className="text-sm font-semibold">{ctx.auth.loggedIn ? ctx.auth.username : "Не авторизован"}</div>
              <div className="text-xs text-muted">
                {ctx.auth.loggedIn ? (ctx.auth.kind === "microsoft" ? "Microsoft-аккаунт" : "offline-режим") : "Игра будет запускаться в offline-режиме"}
              </div>
            </div>
            {ctx.auth.loggedIn && (
              <Button variant="outline" onClick={async () => { await api.logout(); await ctx.refreshAuth(); }}>
                Выйти
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Вход через Microsoft">
              <Button
                variant="outline"
                className="w-full"
                disabled={msBusy}
                onClick={async () => {
                  setMsBusy(true);
                  setMsg(null);
                  try {
                    await api.loginMicrosoft();
                    await ctx.refreshAuth();
                  } catch (e) {
                    setMsg(String((e as Error).message || e));
                  } finally {
                    setMsBusy(false);
                  }
                }}
              >
                {msBusy ? <Spinner /> : "Войти"}
              </Button>
            </Field>
            <Field label="Azure Client ID (для Microsoft OAuth)">
              <input className={inputCls} placeholder="укажите свой client id" value={msClientId} onChange={(e) => setMsClientId(e.target.value)} />
            </Field>
          </div>
          {!isElectron && (
            <p className="text-xs text-muted/70">В демо-режиме (браузере) Microsoft-вход недоступен — только offline.</p>
          )}
        </section>

        {msg && <div className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">{msg}</div>}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить настройки"}
          </Button>
          {saved && <span className="text-sm text-ok">✓ Сохранено</span>}
        </div>

        <p className="pb-4 text-[11px] leading-5 text-muted/60">
          Анварч (AnLaunch) — кастомный лаунчер для Minecraft. Моды загружаются с Modrinth: при установке мода его
          обязательные зависимости (required) подтягиваются и устанавливаются автоматически, опциональные — только по
          желанию. Версии Forge/NeoForge берутся из install-профилей Modrinth.
        </p>
      </div>
    </div>
  );
}
