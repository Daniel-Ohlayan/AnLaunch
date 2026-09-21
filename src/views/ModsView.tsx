import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatDownloads } from "../lib/api";
import { cn } from "../lib/cn";
import type { Loader, ModHit } from "../lib/types";
import type { Ctx } from "../App";
import { Badge, Button, Spinner, inputCls } from "../components/ui";
import { InstallModModal } from "./InstallModModal";

const PAGE = 12;

export function ModsView({ ctx }: { ctx: Ctx }) {
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState(ctx.activeProfile?.gameVersion ?? "");
  const [loader, setLoader] = useState<Loader | "">(ctx.activeProfile?.loader ?? "");
  const [hits, setHits] = useState<ModHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<ModHit | null>(null);
  const reqId = useRef(0);

  // фильтры по умолчанию из активного профиля
  useEffect(() => {
    if (ctx.activeProfile) {
      setGameVersion((v) => v || ctx.activeProfile!.gameVersion);
      setLoader((l) => l || ctx.activeProfile!.loader);
    }
  }, [ctx.activeProfile]);

  const doSearch = useCallback(
    async (offset: number) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const res = await api.searchMods({
          query,
          gameVersion: gameVersion || undefined,
          loader: loader || undefined,
          offset,
          limit: PAGE,
        });
        if (id !== reqId.current) return;
        setHits((prev) => (offset === 0 ? res.hits : [...prev, ...res.hits]));
      } catch (e) {
        if (id !== reqId.current) return;
        setError(String((e as Error).message || e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [query, gameVersion, loader],
  );

  // поиск с дебаунсом по запросу; фильтры — сразу
  useEffect(() => {
    const t = setTimeout(() => doSearch(0), query ? 350 : 0);
    return () => clearTimeout(t);
  }, [doSearch, query]);

  const installedSet = new Set((ctx.activeProfile?.installed ?? []).map((m) => m.slug));
  // В Vanilla-профиль моды ставить нельзя — нужен Forge/NeoForge
  const vanilla = ctx.activeProfile?.loader === "vanilla";
  const canInstall = !!ctx.activeProfile && !vanilla;
  const installBlockedTitle = !ctx.activeProfile
    ? "Сначала создайте профиль"
    : vanilla
      ? "Профиль Vanilla: загрузчика модов нет. Создайте профиль с Forge или NeoForge."
      : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Заголовок и фильтры */}
      <div className="border-b border-line px-6 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Моды</h1>
            <p className="text-xs text-muted">
              При установке обязательные зависимости и библиотеки (required) ставятся сразу, уже установленное не дублируется
            </p>
          </div>
          {!ctx.activeProfile && (
            <Badge tone="warn">Сначала создайте профиль</Badge>
          )}
          {vanilla && (
            <Badge tone="warn">Профиль Vanilla — моды недоступны</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск модов на Modrinth…"
            className={cn(inputCls, "max-w-md flex-1")}
          />
          <select value={gameVersion} onChange={(e) => setGameVersion(e.target.value)} className={cn(inputCls, "w-auto")}>
            <option value="">Все версии</option>
            {ctx.versions.filter((v) => v.type === "release").map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
              </option>
            ))}
          </select>
          <select value={loader} onChange={(e) => setLoader(e.target.value as Loader | "")} className={cn(inputCls, "w-auto")}>
            <option value="">Любой загрузчик</option>
            <option value="vanilla">Vanilla</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
          </select>
        </div>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
            <div className="mt-2">
              <Button variant="outline" onClick={() => doSearch(0)}>
                Повторить
              </Button>
            </div>
          </div>
        )}
        {loading && hits.length === 0 ? (
          <div className="flex h-40 items-center justify-center gap-2 text-muted">
            <Spinner /> Ищем моды…
          </div>
        ) : hits.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-muted">
            <div className="text-3xl">🔍</div>
            <div>Ничего не найдено</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hits.map((h) => {
                const isInstalled = installedSet.has(h.slug);
                return (
                  <div
                    key={h.slug}
                    className="group flex gap-3 rounded-xl border border-line bg-panel-2 p-3 transition-colors hover:border-accent/40"
                  >
                    <ModIcon hit={h} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate text-sm font-semibold" title={h.title}>
                          {h.title}
                        </div>
                        {isInstalled && <Badge tone="ok">установлен</Badge>}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted">{h.description}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] text-muted">
                          <span>⬇ {formatDownloads(h.downloads)}</span>
                          <span className="text-muted/50">v{h.versionNumber}</span>
                        </div>
                        <Button
                          variant={isInstalled ? "outline" : "solid"}
                          className="!px-2.5 !py-1 text-xs"
                          disabled={!canInstall}
                          title={installBlockedTitle}
                          onClick={() => setInstalling(h)}
                        >
                          {isInstalled ? "Обновить" : "Установить"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {hits.length < PAGE * 3 && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" disabled={loading} onClick={() => doSearch(hits.length)}>
                  {loading ? "Загрузка…" : "Показать ещё"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {installing && (
        <InstallModModal
          hit={installing}
          ctx={ctx}
          onClose={() => setInstalling(null)}
          onInstalled={ctx.reload}
        />
      )}
    </div>
  );
}

function ModIcon({ hit }: { hit: ModHit }) {
  const [err, setErr] = useState(false);
  if (hit.iconUrl && !err) {
    return <img src={hit.iconUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-panel-3" onError={() => setErr(true)} />;
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-panel-3 to-panel text-xl font-bold text-muted">
      {hit.title.slice(0, 1).toUpperCase()}
    </div>
  );
}
