import { useEffect, useMemo, useRef, useState } from "react";
import type { InstalledMod, ModLoader, ModHit, SortIndex, ProjectType, ProjectVersion } from "../lib/modrinth";
import {
  PROJECT_TYPE_LABELS,
  searchMods,
  formatDownloads,
  formatSize,
  contentTypesForLoader,
  loaderLabel,
} from "../lib/modrinth";
import { SearchIcon, DownloadIcon, CheckIcon, CloseIcon, CubeIcon } from "./icons";
import { getAccent } from "../lib/accent";
import ModDetailModal from "./ModDetailModal";

const SORTS: { id: SortIndex; label: string }[] = [
  { id: "downloads", label: "По загрузкам" },
  { id: "relevance", label: "Релевантность" },
  { id: "follows", label: "Популярные" },
  { id: "newest", label: "Новые" },
  { id: "updated", label: "Обновлённые" },
];

const PROJECT_TYPE_ICONS: Record<ProjectType, string> = {
  mod: "🧩",
  resourcepack: "🎨",
  modpack: "📦",
  datapack: "💾",
  shader: "✨",
};

export default function ModsView({
  gameVersion,
  loader,
  activeProfile,
  installedMods,
  onInstall,
  onExport,
  onRemove,
  onContentChanged,
  homeSettings,
}: {
  gameVersion: string;
  loader: ModLoader;
  activeProfile: string;
  installedMods: InstalledMod[];
  onInstall: (hit: ModHit, projectType: ProjectType, version?: ProjectVersion) => Promise<void>;
  onExport: (mod: InstalledMod) => Promise<void>;
  onRemove: (mod: InstalledMod) => void;
  onContentChanged?: () => void;
  homeSettings?: { accentColor?: string };
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SortIndex>("downloads");
  const availableTypes = contentTypesForLoader(loader);
  const [projectType, setProjectType] = useState<ProjectType>(
    () => contentTypesForLoader(loader)[0]
  );
  const [results, setResults] = useState<ModHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"browse" | "installed">("browse");
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ModHit | null>(null);
  const [diskFiles, setDiskFiles] = useState<
    { fileName: string; size: number; subfolder: string; projectType: string }[]
  >([]);
  const LIMIT = 20;

  const accent = getAccent(homeSettings?.accentColor);

  // Моды фильтруются по активному профилю — у каждого профиля свои моды
  const profileMods = useMemo(
    () => installedMods.filter((m) => m.profile === activeProfile || !m.profile),
    [installedMods, activeProfile]
  );
  const installedIds = useMemo(() => new Set(profileMods.map((m) => m.id)), [profileMods]);
  const installedByType = useMemo(() => {
    const catalog = profileMods.filter((m) => m.projectType === projectType);
    const byFile = new Map(catalog.map((m) => [m.fileName, m]));
    const rows: (InstalledMod & { missing?: boolean; fromDisk?: boolean })[] = [];
    const seen = new Set<string>();
    for (const f of diskFiles.filter((d) => d.projectType === projectType)) {
      const known = byFile.get(f.fileName);
      if (known) {
        rows.push(known);
        seen.add(known.fileName);
      } else {
        rows.push({
          id: `disk:${f.subfolder}:${f.fileName}`,
          slug: "",
          title: f.fileName.replace(/\.(jar|zip|litemod)(\.disabled)?$/i, ""),
          description: "Файл из папки профиля",
          icon_url: null,
          author: "",
          source: "modrinth",
          projectType,
          fileName: f.fileName,
          size: f.size,
          downloadsUrl: "",
          profile: activeProfile,
          installedAt: 0,
          fromDisk: true,
        });
        seen.add(f.fileName);
      }
    }
    for (const m of catalog) {
      if (!seen.has(m.fileName)) rows.push({ ...m, missing: true });
    }
    return rows;
  }, [profileMods, projectType, diskFiles, activeProfile]);

  async function refreshDisk() {
    if (!window.electronAPI?.listProfileContent) {
      setDiskFiles([]);
      return;
    }
    try {
      const list = await window.electronAPI.listProfileContent(activeProfile);
      setDiskFiles(list || []);
    } catch {
      setDiskFiles([]);
    }
  }

  useEffect(() => {
    refreshDisk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile, tab]);

  async function runSearch(q?: string, p?: number) {
    if (!availableTypes.includes(projectType)) {
      setResults([]);
      setTotalHits(0);
      return;
    }
    setLoading(true);
    setError(null);
    const offset = (p ?? page) * LIMIT;
    try {
      const data = await searchMods({
        query: q ?? query,
        loader,
        version: gameVersion as any,
        index,
        projectType,
        limit: LIMIT,
        offset,
      });
      setResults(data.hits);
      setTotalHits(data.total_hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить данные");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(totalHits / LIMIT);

  const scrollRef = useRef<HTMLDivElement>(null);

  function goPage(p: number) {
    setPage(p);
    runSearch(undefined, p);
    // Прокручиваем список вверх при переключении страницы
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  useEffect(() => {
    const types = contentTypesForLoader(loader);
    if (!types.includes(projectType)) {
      setProjectType(types[0]);
      return;
    }
    setPage(0);
    const t = setTimeout(() => runSearch(undefined, 0), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, index, loader, gameVersion, projectType]);

  async function handleInstall(hit: ModHit, version?: ProjectVersion) {
    setInstalling((s) => new Set(s).add(hit.project_id));
    setError(null);
    try {
      await onInstall(hit, projectType, version);
      await refreshDisk();
      onContentChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка установки");
    } finally {
      setInstalling((s) => {
        const n = new Set(s);
        n.delete(hit.project_id);
        return n;
      });
    }
  }

  async function handleRemove(mod: InstalledMod) {
    onRemove(mod);
    setTimeout(() => {
      refreshDisk();
      onContentChanged?.();
    }, 50);
  }

  return (
    <div className="flex h-full flex-col p-6 animate-fade-up">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-white">Контент Modrinth</h2>
        <span className="text-xs text-white/35">
          {gameVersion} · {loaderLabel(loader)} · профиль {activeProfile}
        </span>
      </div>
      <p className="mb-4 text-sm text-white/40">
        {loader === "vanilla"
          ? "На Vanilla моды не ставятся — только ресурспаки и датапаки, как на Modrinth"
          : `Каталог только для ${loaderLabel(loader)} · ставится в папку профиля`}
      </p>

      {/* Project type tabs */}
      <div className="mb-4 flex gap-1.5">
      {availableTypes.map((pt) => (
        <button
          key={pt}
          onClick={() => setProjectType(pt)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            projectType === pt
              ? `${accent.bgSolid} text-[#06070a]`
              : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"
          }`}
        >
          <span>{PROJECT_TYPE_ICONS[pt]}</span>
          {PROJECT_TYPE_LABELS[pt]}
        </button>
      ))}
      </div>

      {/* Search & sort */}
      <div className="mb-4 flex items-center gap-2.5">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Поиск ${PROJECT_TYPE_LABELS[projectType].toLowerCase()}…`}
            className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40"
          />
        </div>
        <select
          value={index}
          onChange={(e) => setIndex(e.target.value as SortIndex)}
          className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-white/70 outline-none focus:border-emerald-400/40"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id} className="bg-[#141419]">
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${accent.bg} ${accent.text}`}>
          {loader === "vanilla" ? "Vanilla" : `Только ${loaderLabel(loader)}`}
        </div>

        <div className="flex rounded-lg bg-white/[0.04] p-0.5 text-xs font-medium">
          <button
            onClick={() => setTab("browse")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "browse" ? "bg-white/[0.08] text-white" : "text-white/45"
            }`}
          >
            Каталог
          </button>
          <button
            onClick={() => setTab("installed")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "installed" ? "bg-white/[0.08] text-white" : "text-white/45"
            }`}
          >
            Установлено
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "browse" ? (
          loading && results.length === 0 ? (
            <CenteredSpinner label={`Поиск ${PROJECT_TYPE_LABELS[projectType].toLowerCase()}…`} />
          ) : error && results.length === 0 ? (
            <CenteredError message={error} onRetry={() => runSearch()} />
          ) : results.length === 0 ? (
            <CenteredMessage text="Ничего не найдено. Измените запрос." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((hit) => (
                  <ModCard
                    key={hit.project_id}
                    hit={hit}
                    installed={installedIds.has(hit.project_id)}
                    installing={installing.has(hit.project_id)}
                    onInstall={() => handleInstall(hit)}
                    onOpen={() => setDetail(hit)}
                    accentColor={homeSettings?.accentColor}
                  />
                ))}
              </div>
              {/* Пагинация */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => goPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className={`rounded-lg ${accent.bgSolid} px-3 py-1.5 text-xs font-semibold text-[#06070a] transition disabled:bg-white/[0.06] disabled:text-white/30`}
                  >
                    ← Назад
                  </button>
                  <span className="text-xs text-white/50">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => goPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className={`rounded-lg ${accent.bgSolid} px-3 py-1.5 text-xs font-semibold text-[#06070a] transition disabled:bg-white/[0.06] disabled:text-white/30`}
                  >
                    Далее →
                  </button>
                </div>
              )}
            </>
          )
        ) : installedByType.length === 0 ? (
          <CenteredMessage text={`Пока нет установленных ${PROJECT_TYPE_LABELS[projectType].toLowerCase()}.`} />
        ) : (
          <div className="space-y-2">
            <div className="mb-1 text-xs text-white/40">
              В папке профиля: {installedByType.length} (включая файлы не из каталога)
            </div>
            {installedByType
              .filter((m) => {
                const q = query.trim().toLowerCase();
                if (!q) return true;
                return (
                  m.title.toLowerCase().includes(q) ||
                  m.fileName.toLowerCase().includes(q) ||
                  (m.author || "").toLowerCase().includes(q)
                );
              })
              .map((m) => (
                <InstalledRow
                  key={`${m.id}:${m.fileName}`}
                  mod={m}
                  missing={"missing" in m && !!m.missing}
                  fromDisk={"fromDisk" in m && !!m.fromDisk}
                  onOpen={() => {
                    if (m.slug && !String(m.id).startsWith("disk:")) {
                      setDetail({
                        project_id: m.id,
                        slug: m.slug,
                        title: m.title,
                        description: m.description,
                        categories: [],
                        client_side: "",
                        server_side: "",
                        project_type: m.projectType,
                        downloads: 0,
                        icon_url: m.icon_url,
                        author: m.author,
                        versions: [],
                        follows: 0,
                        date_created: "",
                        date_modified: "",
                        license: "",
                      });
                    }
                  }}
                  onExport={() => m.downloadsUrl && onExport(m)}
                  onRemove={() => handleRemove(m)}
                />
              ))}
          </div>
        )}
      </div>

      {detail && (
        <ModDetailModal
          hit={detail}
          onClose={() => setDetail(null)}
          onInstall={async (version) => {
            await handleInstall(detail, version);
          }}
          installing={installing.has(detail.project_id)}
          installed={installedIds.has(detail.project_id)}
          projectType={projectType}
          loader={loader}
          gameVersion={gameVersion}
          accentColor={homeSettings?.accentColor}
        />
      )}
    </div>
  );
}

function ModCard({
  hit,
  installed,
  installing,
  onInstall,
  onOpen,
  accentColor,
}: {
  hit: ModHit;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
  onOpen: () => void;
  accentColor?: string;
}) {
  const accent = getAccent(accentColor);
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition hover:border-white/12 hover:bg-white/[0.04]">
      <button onClick={onOpen} className="flex gap-3 p-3.5 text-left">
        <ModIcon url={hit.icon_url} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{hit.title}</div>
          <div className="truncate text-xs text-white/40">{hit.author}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
            <DownloadIcon className="h-3 w-3" />
            {formatDownloads(hit.downloads)}
            <span className="text-white/15">•</span>
            {(hit.display_categories ?? hit.categories).slice(0, 2).join(", ")}
          </div>
        </div>
      </button>
      <p className="line-clamp-2 px-3.5 text-xs leading-relaxed text-white/40">{hit.description}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.04] p-3.5">
        <div className="flex flex-wrap gap-1">
          {hit.versions.slice(0, 2).map((v) => (
            <span key={v} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/40">
              {v}
            </span>
          ))}
        </div>
        {installed ? (
          <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300">
            <CheckIcon className="h-3.5 w-3.5" /> Готово
          </span>
        ) : (
          <button
            onClick={onInstall}
            disabled={installing}
            className={`flex items-center gap-1.5 rounded-lg ${accent.bgSolid} px-3 py-1.5 text-xs font-semibold text-[#06070a] transition disabled:opacity-60`}
          >
            {installing ? (
              "Установка…"
            ) : (
              <>
                <DownloadIcon className="h-3.5 w-3.5" /> Установить
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function InstalledRow({
  mod,
  missing,
  fromDisk,
  onOpen,
  onExport,
  onRemove,
}: {
  mod: InstalledMod;
  missing?: boolean;
  fromDisk?: boolean;
  onOpen: () => void;
  onExport: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
      <button type="button" onClick={onOpen} className="shrink-0" title="Подробнее">
        <ModIcon url={mod.icon_url} />
      </button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold text-white">{mod.title}</div>
        <div className="truncate text-xs text-white/40">
          {mod.fileName} · {formatSize(mod.size)}
          {fromDisk ? " · не из каталога" : ""}
          {missing ? " · файл не найден" : ""}
        </div>
      </button>
      {mod.downloadsUrl ? (
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.1]"
        >
          <DownloadIcon className="h-3.5 w-3.5" /> Экспорт
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/70 transition hover:bg-red-500/15 hover:text-red-300"
        title="Удалить из профиля"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function DetailModal({
  hit,
  onClose,
  onInstall,
  installing,
  installed,
  projectType,
  accentColor,
}: {
  hit: ModHit;
  onClose: () => void;
  onInstall: () => void;
  installing: boolean;
  installed: boolean;
  projectType: ProjectType;
  accentColor?: string;
}) {
  const accent = getAccent(accentColor);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        className="w-full max-w-md animate-scale-in overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141419] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-white/[0.06] p-5">
          <ModIcon url={hit.icon_url} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-semibold text-white">{hit.title}</span>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">
                {PROJECT_TYPE_ICONS[projectType]} {PROJECT_TYPE_LABELS[projectType]}
              </span>
            </div>
            <div className="text-sm text-white/40">{hit.author}</div>
            <div className="mt-2 flex items-center gap-3 text-xs text-white/50">
              <span className="flex items-center gap-1">
                <DownloadIcon className="h-3.5 w-3.5" /> {formatDownloads(hit.downloads)}
              </span>
              {hit.license && <span>{hit.license}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 transition hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-48 overflow-y-auto p-5 text-sm leading-relaxed text-white/60">
          {hit.description || "Описание отсутствует."}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] p-4">
          <a
            href={`https://modrinth.com/${projectType === "mod" ? "mod" : projectType === "resourcepack" ? "resourcepack" : projectType === "shader" ? "shader" : projectType}/${hit.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-emerald-300 transition hover:text-emerald-200"
          >
            Открыть на Modrinth ↗
          </a>
          {installed ? (
            <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
              <CheckIcon className="h-4 w-4" /> Установлено
            </span>
          ) : (
            <button
              onClick={onInstall}
              disabled={installing}
              className={`flex items-center gap-2 rounded-lg ${accent.bgSolid} px-4 py-2 text-sm font-semibold text-[#06070a] transition disabled:opacity-60`}
            >
              {installing ? "Установка…" : "Установить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModIcon({ url, size = "md" }: { url: string | null; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  if (!url) {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-white/50`}>
        <CubeIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`${dim} shrink-0 rounded-xl object-cover`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function CenteredError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/60">
      <span className="max-w-md text-sm">⚠ {message}</span>
      <button onClick={onRetry} className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm text-white transition hover:bg-white/[0.1]">
        Повторить
      </button>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-white/40">{text}</div>;
}
