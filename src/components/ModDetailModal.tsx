import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ModHit, ModLoader, ProjectType, ProjectVersion } from "../lib/modrinth";
import {
  PROJECT_TYPE_LABELS,
  formatDownloads,
  formatSize,
  fullImageUrl,
  getProject,
  getProjectVersions,
  loaderLabel,
  type ModrinthProject,
} from "../lib/modrinth";
import { CheckIcon, CloseIcon, CubeIcon, DownloadIcon } from "./icons";
import { getAccent } from "../lib/accent";

function licenseName(license: ModrinthProject["license"]): string {
  if (!license) return "";
  if (typeof license === "string") return license;
  return license.name || license.id || "";
}

function typeBadge(kind?: string) {
  if (kind === "beta") return "bg-amber-400/15 text-amber-200";
  if (kind === "alpha") return "bg-red-400/15 text-red-200";
  return "bg-emerald-400/15 text-emerald-200";
}

function MdBody({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const src = text.replace(/\r\n/g, "\n");
    const parts: { type: "img" | "h" | "p" | "code"; text: string; level?: number }[] = [];
    const chunks = src.split(/\n```/);
    chunks.forEach((chunk, i) => {
      if (i % 2 === 1) {
        const body = chunk.replace(/^[^\n]*\n/, "");
        parts.push({ type: "code", text: body.replace(/\n$/, "") });
        return;
      }
      for (const raw of chunk.split(/\n{2,}/)) {
        const line = raw.trim();
        if (!line) continue;
        const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
        if (img) {
          parts.push({ type: "img", text: img[2] });
          continue;
        }
        const h = line.match(/^(#{1,3})\s+(.+)/);
        if (h) {
          parts.push({ type: "h", level: h[1].length, text: h[2] });
          continue;
        }
        parts.push({ type: "p", text: line });
      }
    });
    return parts;
  }, [text]);

  function inline(s: string) {
    const html = s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-emerald-300 underline decoration-emerald-300/30 hover:decoration-emerald-300">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong class='text-white/80'>$1</strong>")
      .replace(/`([^`]+)`/g, "<code class='rounded bg-white/10 px-1 text-[12px] text-emerald-200'>$1</code>");
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-white/70">
      {blocks.map((b, i) => {
        if (b.type === "img") {
          return (
            <img
              key={i}
              src={fullImageUrl(b.text)}
              alt=""
              className="mx-auto max-h-[28rem] w-auto max-w-full rounded-xl object-contain"
            />
          );
        }
        if (b.type === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-xl bg-black/40 p-3 font-mono text-[11px] text-white/60">
              {b.text}
            </pre>
          );
        }
        if (b.type === "h") {
          const cls = b.level === 1 ? "text-lg" : b.level === 2 ? "text-base" : "text-sm";
          return (
            <div key={i} className={`${cls} font-semibold text-white`}>
              {inline(b.text)}
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(b.text)}
          </p>
        );
      })}
    </div>
  );
}

export default function ModDetailModal({
  hit,
  projectType,
  loader,
  gameVersion,
  installed,
  installing,
  accentColor,
  onClose,
  onInstall,
}: {
  hit: ModHit;
  projectType: ProjectType;
  loader: ModLoader;
  gameVersion: string;
  installed: boolean;
  installing: boolean;
  accentColor?: string;
  onClose: () => void;
  onInstall: (version: ProjectVersion) => Promise<void> | void;
}) {
  const accent = getAccent(accentColor);
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [allVersions, setAllVersions] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hero, setHero] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getProject(hit.project_id), getProjectVersions(hit.project_id)])
      .then(([p, vs]) => {
        if (cancelled) return;
        setProject(p);
        setVersions(vs);
        const first = p.gallery?.find((g) => g.featured) || p.gallery?.[0];
        setHero(fullImageUrl(first?.raw_url || first?.url) || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить проект");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hit.project_id]);

  const filtered = useMemo(() => {
    if (allVersions) return versions;
    return versions.filter((v) => {
      const okVer = !gameVersion || v.game_versions.includes(gameVersion);
      const needsLoader = projectType === "mod" || projectType === "modpack";
      const okLoader = !needsLoader || !loader || loader === "vanilla" || v.loaders.includes(loader);
      return okVer && okLoader;
    });
  }, [versions, allVersions, gameVersion, loader, projectType]);

  useEffect(() => {
    if (!filtered.length) {
      setSelected("");
      return;
    }
    if (!filtered.some((v) => v.id === selected)) setSelected(filtered[0].id);
  }, [filtered, selected]);

  const current = filtered.find((v) => v.id === selected) || null;
  const file = current ? current.files.find((f) => f.primary) || current.files[0] : null;
  const gallery = project?.gallery || [];
  const slugType =
    projectType === "mod"
      ? "mod"
      : projectType === "resourcepack"
        ? "resourcepack"
        : projectType === "shader"
          ? "shader"
          : projectType;

  const ui = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141419] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-white/[0.06] p-5">
          {hit.icon_url ? (
            <img src={hit.icon_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-contain" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-white/50">
              <CubeIcon className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-xl font-semibold text-white">{project?.title || hit.title}</h3>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">
                {PROJECT_TYPE_LABELS[projectType]}
              </span>
            </div>
            <div className="text-sm text-white/45">{hit.author}</div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <DownloadIcon className="h-3.5 w-3.5" /> {formatDownloads(project?.downloads ?? hit.downloads)}
              </span>
              {project?.followers != null && <span>{project.followers} подписчиков</span>}
              {licenseName(project?.license || hit.license) && <span>{licenseName(project?.license || hit.license)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 transition hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-white/40">Загрузка страницы мода…</div>
          ) : error ? (
            <div className="p-5 text-sm text-red-300">⚠ {error}</div>
          ) : (
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4 p-5">
                {hero && (
                  <button
                    type="button"
                    onClick={() => setLightbox(hero)}
                    className="block w-full rounded-xl bg-[#0c0d12] p-1"
                    title="Открыть в полном размере"
                  >
                    <img
                      src={hero}
                      alt=""
                      className="mx-auto max-h-[22rem] w-auto max-w-full object-contain"
                    />
                  </button>
                )}
                {gallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {gallery.map((g) => {
                      const src = fullImageUrl(g.raw_url || g.url);
                      return (
                        <button
                          key={g.url}
                          type="button"
                          onClick={() => setHero(src)}
                          className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border ${
                            hero === src ? "border-emerald-400" : "border-white/10"
                          }`}
                        >
                          <img src={src} alt={g.title || ""} className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-sm text-white/70">{project?.description || hit.description}</p>
                {(project?.categories || hit.categories || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(project?.categories || hit.categories).map((c) => (
                      <span key={c} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <MdBody text={project?.body || hit.description || "Описание отсутствует."} />
              </div>

              <aside className="flex min-h-0 flex-col border-t border-white/[0.06] bg-black/20 p-4 lg:border-l lg:border-t-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/35">Версия файла</div>
                <label className="mb-3 flex items-center gap-2 text-[11px] text-white/50">
                  <input type="checkbox" checked={allVersions} onChange={(e) => setAllVersions(e.target.checked)} />
                  Показать все версии
                </label>
                {filtered.length === 0 ? (
                  <div className="text-xs text-amber-200/80">
                    Нет файла для {gameVersion} / {loaderLabel(loader)}. Включите «все версии» или смените профиль.
                  </div>
                ) : (
                  <div className="min-h-0 max-h-[22rem] space-y-1.5 overflow-y-auto pr-0.5">
                    {filtered.map((v) => {
                      const active = v.id === selected;
                      const primary = v.files.find((f) => f.primary) || v.files[0];
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelected(v.id)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? `${accent.border} ${accent.bg}`
                              : "border-white/[0.06] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-white">{v.version_number}</span>
                            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${typeBadge(v.version_type)}`}>
                              {v.version_type || "release"}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(v.game_versions.slice(0, 3).length ? v.game_versions.slice(0, 3) : ["—"]).map((gv) => (
                              <span key={gv} className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/55">
                                {gv}
                              </span>
                            ))}
                            {v.loaders.map((l) => (
                              <span key={l} className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] capitalize text-white/55">
                                {l}
                              </span>
                            ))}
                          </div>
                          {primary && (
                            <div className="mt-1 truncate text-[10px] text-white/35">{formatSize(primary.size)}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {current && file && (
                  <div className="mt-3 truncate text-[11px] text-white/40" title={file.filename}>
                    {file.filename}
                  </div>
                )}
                <div className="mt-auto flex flex-col gap-2 pt-4">
                  {installed && !current ? (
                    <span className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                      <CheckIcon className="h-4 w-4" /> Установлено
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={installing || !current}
                      onClick={() => current && onInstall(current)}
                      className={`flex items-center justify-center gap-2 rounded-lg ${accent.bgSolid} px-4 py-2.5 text-sm font-semibold text-[#06070a] transition disabled:opacity-50`}
                    >
                      {installing ? "Установка…" : installed ? "Поставить эту версию" : "Установить"}
                    </button>
                  )}
                  <a
                    href={`https://modrinth.com/${slugType}/${hit.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center text-xs text-emerald-300 hover:text-emerald-200"
                  >
                    Открыть на Modrinth ↗
                  </a>
                  {project?.source_url && (
                    <a href={project.source_url} target="_blank" rel="noreferrer" className="text-center text-[11px] text-white/40 hover:text-white/70">
                      Исходный код
                    </a>
                  )}
                  {project?.wiki_url && (
                    <a href={project.wiki_url} target="_blank" rel="noreferrer" className="text-center text-[11px] text-white/40 hover:text-white/70">
                      Вики
                    </a>
                  )}
                  {project?.discord_url && (
                    <a href={project.discord_url} target="_blank" rel="noreferrer" className="text-center text-[11px] text-white/40 hover:text-white/70">
                      Discord
                    </a>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-6"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );

  return createPortal(ui, document.body);
}
