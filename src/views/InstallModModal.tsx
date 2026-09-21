import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, formatBytes } from "../lib/api";
import { cn } from "../lib/cn";
import type { InstallEvent, InstallItem, ModHit, ModVersion, ResolvePlan } from "../lib/types";
import type { Ctx } from "../App";
import { Badge, Button, LogView, Modal, Progress, Spinner } from "../components/ui";

type Step = "versions" | "plan" | "install" | "done";

type ItemStatus = "pending" | "downloading" | "done" | "error" | "skipped";

export function InstallModModal({
  hit,
  ctx,
  onClose,
  onInstalled,
}: {
  hit: ModHit;
  ctx: Ctx;
  onClose: () => void;
  onInstalled: () => Promise<void> | void;
}) {
  const profile = ctx.activeProfile;
  const [step, setStep] = useState<Step>("versions");
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // план
  const [plan, setPlan] = useState<ResolvePlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // лог установки: что доставили (мод, зависимости, библиотеки)
  const [logs, setLogs] = useState<string[]>([]);

  // установка
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [doneCount, setDoneCount] = useState<{ installed: number; failed: number; skipped: number } | null>(null);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const unsubRef = useRef<(() => void) | null>(null);

  const gameVersion = profile?.gameVersion ?? "";
  const loader = profile?.loader ?? "vanilla";
  const vanilla = loader === "vanilla"; // в Vanilla моды не ставятся

  // 1) список версий мода
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.getModVersions({
          projectId: hit.projectId,
          gameVersion: gameVersion || undefined,
          loader: loader === "vanilla" ? undefined : loader,
        });
        if (!alive) return;
        setVersions(list);
        const first = list[0]?.id ?? null;
        setVersionId(first);
      } catch (e) {
        if (alive) setError(String((e as Error).message || e));
      } finally {
        if (alive) setVersionsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [hit.projectId, gameVersion, loader]);

  // 2) разрешаем план установки: мод + обязательные зависимости и библиотеки
  const loadPlan = useCallback(async () => {
    if (!versionId) return;
    setPlanLoading(true);
    setError(null);
    try {
      const p = await api.resolveInstall({
        projectId: hit.projectId,
        versionId,
        gameVersion: gameVersion || undefined,
        loader: vanilla ? undefined : loader,
        profileId: profile?.id,
        projectSlug: hit.slug,
        projectTitle: hit.title,
      });
      setPlan(p);
      if (p.conflicts.length) setError(p.conflicts.join("; "));
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setPlanLoading(false);
    }
  }, [hit.projectId, hit.slug, hit.title, versionId, gameVersion, loader, vanilla, profile?.id]);

  const toPlan = () => {
    loadPlan();
    setStep("plan");
  };

  // 3) установка
  const startInstall = async () => {
    if (!profile) return;
    setStep("install");
    setStatuses(new Map((plan?.items ?? []).map((i) => [i.key, "pending"])));
    setErrors(new Map());
    setNotes(new Map());
    setDoneCount(null);
    setLogs([]);

    unsubRef.current?.();
    unsubRef.current = api.onInstall((e: InstallEvent) => {
      if (e.type === "item") {
        setStatuses((prev) => {
          const m = new Map(prev);
          m.set(e.key, e.status);
          return m;
        });
        const err = e.error;
        if (err) setErrors((prev) => new Map(prev).set(e.key, err));
        const note = e.note;
        if (note) setNotes((prev) => new Map(prev).set(e.key, note));
      } else if (e.type === "log") {
        setLogs((prev) => (prev.length > 800 ? [...prev.slice(-600), e.line] : [...prev, e.line]));
      } else if (e.type === "done") {
        setDoneCount({ installed: e.installed, failed: e.failed, skipped: e.skipped ?? 0 });
      }
    });

    try {
      await api.installMod({
        profileId: profile.id,
        projectId: hit.projectId,
        versionId: versionId ?? undefined,
        gameVersion: gameVersion || undefined,
        loader: vanilla ? undefined : loader,
        projectSlug: hit.slug,
        projectTitle: hit.title,
      });
      await onInstalled();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setStep("done");
      unsubRef.current?.();
      unsubRef.current = null;
    }
  };

  useEffect(() => () => unsubRef.current?.(), []);

  const items = plan?.items ?? [];
  const mainItem = items.find((i) => i.kind === "mod");
  const requiredItems = items.filter((i) => i.kind === "dependency");
  const alreadyCount = items.filter((i) => i.alreadyInstalled).length;
  const toInstall = items.filter((i) => !i.alreadyInstalled && !i.skipped && i.file);
  const doneTotal = doneCount ?? null;
  const finishedCount = [...statuses.values()].filter((s) => s === "done" || s === "error").length;
  const totalForProgress = toInstall.length;

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          Установка мода <span className="text-muted">·</span> {hit.title}
        </span>
      }
      onClose={step === "install" ? undefined : onClose}
      closable={step !== "install"}
      width={600}
    >
      {/* -------- шаг: выбор версии -------- */}
      {step === "versions" && (
        <div className="space-y-4">
          <div className="text-sm text-muted">
            Профиль: <b className="text-ink">{profile ? profile.name : "не выбран"}</b>
            {profile && (
              <span>
                {" "}
                · {profile.gameVersion}
                {profile.loader !== "vanilla" ? ` · ${profile.loader} ${profile.loaderVersion}` : ""}
              </span>
            )}
          </div>
          {vanilla && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              ⚠ Профиль «{profile?.name}» — Vanilla: загрузчика модов нет, поэтому моды в него не ставятся. Выберите профиль с
              Forge или NeoForge.
            </div>
          )}
          {versionsLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted">
              <Spinner /> Получаем версии…
            </div>
          ) : (
            <>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {versions.map((v) => {
                  const compatible = v.gameVersions.includes(gameVersion);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVersionId(v.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        versionId === v.id ? "border-accent/60 bg-accent/10" : "border-line hover:bg-panel-3",
                      )}
                    >
                      <span className="font-medium">{v.versionNumber}</span>
                      <span className="flex items-center gap-2 text-[11px] text-muted">
                        {new Date(v.releaseTime).toLocaleDateString("ru-RU")}
                        <Badge tone={compatible ? "ok" : "warn"}>{compatible ? "совместимо" : "другая версия"}</Badge>
                      </span>
                    </button>
                  );
                })}
                {versions.length === 0 && <div className="py-4 text-center text-sm text-muted">Версии не найдены</div>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Отмена
                </Button>
                <Button onClick={toPlan} disabled={!versionId || vanilla} title={vanilla ? "Vanilla-профиль: моды не устанавливаются" : undefined}>
                  Проверить зависимости
                </Button>
              </div>
            </>
          )}
          {error && <ErrorBox text={error} />}
        </div>
      )}

      {/* -------- шаг: план -------- */}
      {step === "plan" && (
        <div className="space-y-4">
          {planLoading || !plan ? (
            <div className="flex items-center gap-2 py-8 text-muted">
              <Spinner /> Разбираем зависимости…
            </div>
          ) : (
            <>
              <PlanItem
                item={mainItem!}
                badge={
                  mainItem?.alreadyInstalled ? (
                    <Badge tone="ok">уже в профиле{mainItem.installedVersionNumber ? ` · v${mainItem.installedVersionNumber}` : ""}</Badge>
                  ) : (
                    <Badge tone="accent">основной мод</Badge>
                  )
                }
              />

              {requiredItems.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Обязательные зависимости и библиотеки — ставятся сразу, как на сайте
                    <Badge tone="ok">{requiredItems.length}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {requiredItems.map((i) => (
                      <PlanItem
                        key={i.key}
                        item={i}
                        reason={i.reason}
                        badge={i.alreadyInstalled ? <Badge tone="ok">уже в профиле{i.installedVersionNumber ? ` · v${i.installedVersionNumber}` : ""}</Badge> : undefined}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[11px] text-muted/70">
                Опциональные зависимости не устанавливаются — их можно добавить вручную с сайта Modrinth.
              </div>

              {plan.errors.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  {plan.errors.map((e, i) => (
                    <div key={i}>⚠ {e}</div>
                  ))}
                </div>
              )}
            </>
          )}

          {error && <ErrorBox text={error} />}

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setStep("versions")}>
              ← Назад
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button
                onClick={startInstall}
                disabled={planLoading || !!error || !toInstall.length || !profile}
                title={alreadyCount && alreadyCount === items.length ? "Всё из списка уже стоит в профиле" : undefined}
              >
                {toInstall.length
                  ? `Установить (${toInstall.length} шт.)`
                  : alreadyCount === items.length
                    ? "Всё уже установлено"
                    : "Нет файлов для загрузки"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* -------- шаг: установка -------- */}
      {step === "install" && (
        <div className="space-y-4">
          <Progress value={totalForProgress ? (finishedCount / totalForProgress) * 100 : null} label={`Готово ${finishedCount} из ${totalForProgress}`} />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {items.map((i) => (
              <InstallRow key={i.key} item={i} status={statuses.get(i.key) ?? "pending"} error={errors.get(i.key)} note={notes.get(i.key)} />
            ))}
          </div>
          {doneTotal === null && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Ставим мод вместе с обязательными зависимостями и библиотеками…
            </div>
          )}
          {logs.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Лог установки</div>
              <LogView lines={logs} className="h-36" />
            </div>
          )}
        </div>
      )}

      {/* -------- шаг: готово -------- */}
      {step === "done" && (
        <div className="space-y-4">
          {doneCount ? (
            doneCount.installed === 0 && doneCount.skipped > 0 ? (
              <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
                ✅ Всё уже стоит в профиле — заново ничего не качали ({doneCount.skipped})
              </div>
            ) : doneCount.failed === 0 ? (
              <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
                ✅ Установлено {doneCount.installed}{" "}
                {doneCount.installed === 1 ? "мод" : doneCount.installed < 5 && doneCount.installed > 1 ? "мода" : "модов"}
                {doneCount.installed > 1 ? " (включая обязательные зависимости и библиотеки)" : ""}
                {doneCount.skipped > 0 ? ` · уже было в профиле: ${doneCount.skipped}` : ""}
              </div>
            ) : (
              <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                ⚠ Установлено {doneCount.installed}, ошибок: {doneCount.failed}
                {doneCount.skipped > 0 ? ` · уже было в профиле: ${doneCount.skipped}` : ""}
              </div>
            )
          ) : (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              Установку не удалось выполнить
            </div>
          )}
          {error && <ErrorBox text={error} />}
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {items.map((i) => (
              <InstallRow
                key={i.key}
                item={i}
                status={statuses.get(i.key) ?? (doneCount && doneCount.failed === 0 ? "done" : "skipped")}
                error={errors.get(i.key)}
                note={notes.get(i.key)}
              />
            ))}
          </div>
          {logs.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Лог установки</div>
              <LogView lines={logs} className="h-36" />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Готово</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function PlanItem({ item, reason, badge }: { item: InstallItem | undefined; reason?: string | null; badge?: ReactNode }) {
  if (!item) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
      <span className="truncate font-medium">{item.title}</span>
      {badge ?? (reason ? <span className="truncate text-[11px] text-muted">({reason})</span> : null)}
      <span className="ml-auto shrink-0 text-[11px] text-muted">
        {item.versionNumber}
        {item.file ? ` · ${formatBytes(item.file.size)}` : ""}
      </span>
    </div>
  );
}

function InstallRow({ item, status, error, note }: { item: InstallItem; status: ItemStatus; error?: string; note?: string }) {
  const skippedLabel = note ?? item.note ?? "пропущено";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
      {status === "downloading" ? (
        <Spinner />
      ) : status === "done" ? (
        <span className="text-ok">✓</span>
      ) : status === "error" ? (
        <span className="text-danger">✕</span>
      ) : (
        <span className="text-muted/50">·</span>
      )}
      <span className="truncate font-medium">
        {item.title} <span className="text-[11px] font-normal text-muted">v{item.versionNumber}</span>
      </span>
      <span className="ml-auto shrink-0 text-[11px]">
        {status === "downloading" && <span className="text-accent">загрузка…</span>}
        {status === "done" && <span className="text-ok">установлено</span>}
        {status === "error" && <span className="text-danger" title={error}>ошибка</span>}
        {status === "skipped" && <span className="text-muted">{skippedLabel}</span>}
        {status === "pending" && <span className="text-muted/50">ожидание</span>}
      </span>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{text}</div>;
}
