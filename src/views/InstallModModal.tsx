import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, formatBytes } from "../lib/api";
import { cn } from "../lib/cn";
import type { InstallEvent, InstallItem, ModHit, ModVersion, ResolvePlan } from "../lib/types";
import type { Ctx } from "../App";
import { Badge, Button, Modal, Progress, Spinner } from "../components/ui";

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
  const [optionalSlugs, setOptionalSlugs] = useState<Set<string>>(new Set());

  // установка
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [doneCount, setDoneCount] = useState<{ installed: number; failed: number } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const gameVersion = profile?.gameVersion ?? "";
  const loader = profile?.loader ?? "vanilla";

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

  const selectedVersion = useMemo(() => versions.find((v) => v.id === versionId) ?? null, [versions, versionId]);

  const optionalDeps = useMemo(
    () => (selectedVersion ? selectedVersion.dependencies.filter((d) => d.dependencyType === "optional") : []),
    [selectedVersion],
  );

  // 2) разрешаем план установки (включая required-зависимости)
  const loadPlan = useCallback(
    async (optSlugs: string[]) => {
      if (!versionId) return;
      setPlanLoading(true);
      setError(null);
      try {
        const p = await api.resolveInstall({
          projectId: hit.projectId,
          versionId,
          gameVersion: gameVersion || undefined,
          loader: loader === "vanilla" ? undefined : loader,
          optionalSlugs: optSlugs,
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
    },
    [hit.projectId, hit.slug, hit.title, versionId, gameVersion, loader],
  );

  const toPlan = () => {
    loadPlan([...optionalSlugs]);
    setStep("plan");
  };

  const toggleOptional = (slug: string) => {
    const next = new Set(optionalSlugs);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setOptionalSlugs(next);
    if (step === "plan") loadPlan([...next]);
  };

  // 3) установка
  const startInstall = async () => {
    if (!profile) return;
    setStep("install");
    setStatuses(new Map((plan?.items ?? []).map((i) => [i.key, "pending"])));
    setErrors(new Map());
    setDoneCount(null);

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
      } else if (e.type === "done") {
        setDoneCount({ installed: e.installed, failed: e.failed });
      }
    });

    try {
      await api.installMod({
        profileId: profile.id,
        projectId: hit.projectId,
        versionId: versionId ?? undefined,
        gameVersion: gameVersion || undefined,
        loader: loader === "vanilla" ? undefined : loader,
        optionalSlugs: [...optionalSlugs],
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
  const optionalInPlan = items.filter((i) => i.kind === "optional");
  const doneTotal = doneCount ?? null;
  const finishedCount = [...statuses.values()].filter((s) => s !== "pending" && s !== "downloading").length;
  const totalForProgress = items.length;

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
                <Button onClick={toPlan} disabled={!versionId}>
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
              <PlanItem item={mainItem!} badge={<Badge tone="accent">основной мод</Badge>} />

              {requiredItems.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Обязательные зависимости — установятся автоматически
                    <Badge tone="ok">{requiredItems.length}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {requiredItems.map((i) => (
                      <PlanItem key={i.key} item={i} reason={i.reason} />
                    ))}
                  </div>
                </div>
              )}

              {optionalInPlan.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Выбранные опциональные
                  </div>
                  <div className="space-y-1.5">
                    {optionalInPlan.map((i) => (
                      <PlanItem key={i.key} item={i} reason={i.reason} />
                    ))}
                  </div>
                </div>
              )}

              {optionalDeps.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Опциональные зависимости</div>
                  <div className="space-y-1">
                    {optionalDeps.map((d) => (
                      <label
                        key={d.projectSlug}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-panel-3"
                      >
                        <input
                          type="checkbox"
                          className="accent-[#22d3ee]"
                          checked={optionalSlugs.has(d.projectSlug)}
                          onChange={() => toggleOptional(d.projectSlug)}
                        />
                        <span>{d.projectSlug}</span>
                        <span className="ml-auto text-[11px] text-muted">необязательно</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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
              <Button onClick={startInstall} disabled={planLoading || !!error || !plan?.items.length || !profile}>
                Установить ({items.length} шт.)
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
              <InstallRow key={i.key} item={i} status={statuses.get(i.key) ?? "pending"} error={errors.get(i.key)} />
            ))}
          </div>
          {doneTotal === null && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Устанавливаем вместе с обязательными зависимостями…
            </div>
          )}
        </div>
      )}

      {/* -------- шаг: готово -------- */}
      {step === "done" && (
        <div className="space-y-4">
          {doneCount ? (
            doneCount.failed === 0 ? (
              <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
                ✅ Установлено {doneCount.installed}{" "}
                {doneCount.installed === 1 ? "мод" : doneCount.installed < 5 && doneCount.installed > 1 ? "мода" : "модов"}
                {doneCount.installed > 1 ? " (включая зависимости)" : ""}
              </div>
            ) : (
              <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                ⚠ Установлено {doneCount.installed}, ошибок: {doneCount.failed}
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
              <InstallRow key={i.key} item={i} status={statuses.get(i.key) ?? (doneCount && doneCount.failed === 0 ? "done" : "skipped")} error={errors.get(i.key)} />
            ))}
          </div>
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

function InstallRow({ item, status, error }: { item: InstallItem; status: ItemStatus; error?: string }) {
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
        {status === "skipped" && <span className="text-muted">пропущено</span>}
        {status === "pending" && <span className="text-muted/50">ожидание</span>}
      </span>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{text}</div>;
}
