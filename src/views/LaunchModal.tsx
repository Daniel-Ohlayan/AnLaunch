import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { LaunchEvent, Profile } from "../lib/types";
import { Badge, Button, LogView, Modal, Progress, Spinner } from "../components/ui";

type Phase = "preparing" | "running" | "exited" | "error";

const STAGE_LABELS: Record<string, string> = {
  loader: "Профиль Forge/NeoForge",
  client: "Клиентская jar",
  libraries: "Библиотеки",
  assets: "Ассеты",
  natives: "Natives",
  start: "Запуск",
};

export function LaunchModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progressLabel, setProgressLabel] = useState("Подготовка…");
  const [progress, setProgress] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubRef.current = api.onLaunch((e: LaunchEvent) => {
      if (e.type === "progress") {
        setProgressLabel(`${STAGE_LABELS[e.stage] ?? e.stage}: ${e.label}`);
        setProgress(e.total ? (e.done ?? 0) : null);
      } else if (e.type === "log") {
        setLogs((prev) => {
          const next = [...prev, e.line];
          return next.length > 2000 ? next.slice(-1500) : next;
        });
      } else if (e.type === "state") {
        if (e.state === "running") setPhase("running");
        else if (e.state === "exited") {
          setPhase("exited");
          setExitCode(e.code ?? null);
        } else if (e.state === "preparing") setPhase("preparing");
      }
    });

    api
      .launchGame(profile.id)
      .catch((e) => {
        setError(String((e as Error).message || e));
        setPhase("error");
      });

    return () => unsubRef.current?.();
  }, [profile.id]);

  const canClose = phase === "exited" || phase === "error";

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          Запуск игры <Badge tone={phase === "running" ? "ok" : phase === "error" ? "danger" : "accent"}>
            {phase === "preparing" ? "подготовка" : phase === "running" ? "игра запущена" : phase === "exited" ? `выход ${exitCode ?? ""}` : "ошибка"}
          </Badge>
        </span>
      }
      onClose={canClose ? onClose : undefined}
      closable={canClose}
      width={720}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{profile.name}</span>
          <span className="text-muted">
            {profile.gameVersion}
            {profile.loader !== "vanilla" ? ` · ${profile.loader} ${profile.loaderVersion}` : ""} · {profile.ramMB}МБ
          </span>
        </div>

        {phase === "preparing" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> {progressLabel}
            </div>
            <Progress value={progress} />
          </div>
        )}

        {phase === "error" && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {(phase === "running" || phase === "exited") && <LogView lines={logs} className="h-64" />}

        {phase === "exited" && (
          <div className="text-sm text-muted">
            Игра завершена{exitCode !== null && exitCode !== 0 ? ` с кодом ${exitCode}` : ""}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {phase === "running" && (
            <Button variant="danger" onClick={async () => { await api.stopGame(); }}>
              Завершить игру
            </Button>
          )}
          {canClose && (
            <Button onClick={onClose}>Закрыть</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
