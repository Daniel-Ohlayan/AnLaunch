// Modrinth API client (v2)
// Docs: https://docs.modrinth.com/

const BASE = "https://api.modrinth.com/v2";
const MR_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "AnLaunch/1.0.3 (https://github.com/Daniel-Ohlayan/AnLaunch)",
};

export type ModLoader = "fabric" | "forge" | "quilt" | "neoforge" | "vanilla";

export type SortIndex =
  | "relevance"
  | "downloads"
  | "follows"
  | "newest"
  | "updated";

export type ProjectType = "mod" | "resourcepack" | "modpack" | "datapack" | "shader";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  mod: "Моды",
  resourcepack: "Ресурспаки",
  modpack: "Модпаки",
  datapack: "Датапаки",
  shader: "Шейдеры",
};

export function loaderLabel(loader: ModLoader): string {
  if (loader === "vanilla") return "Vanilla";
  if (loader === "neoforge") return "NeoForge";
  return loader.charAt(0).toUpperCase() + loader.slice(1);
}

/** Как на Modrinth: моды/модпаки только с загрузчиком, Vanilla — ресурспаки и датапаки. */
export function contentTypesForLoader(loader: ModLoader): ProjectType[] {
  if (loader === "vanilla") return ["resourcepack", "datapack"];
  return ["mod", "resourcepack", "modpack", "datapack", "shader"];
}

export function canInstallProjectType(loader: ModLoader, projectType: ProjectType): boolean {
  return contentTypesForLoader(loader).includes(projectType);
}

export interface ModHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: string;
  downloads: number;
  icon_url: string | null;
  author: string;
  versions: string[];
  follows: number;
  date_created: string;
  date_modified: string;
  license: string;
  display_categories?: string[];
}

export interface SearchResponse {
  hits: ModHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface VersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: { sha1?: string; sha512?: string };
}

export interface ModrinthGalleryItem {
  url: string;
  raw_url?: string | null;
  featured?: boolean;
  title?: string | null;
  description?: string | null;
}

/** Полный кадр с CDN, без кропа и без уменьшенных превью. */
export function fullImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.searchParams.delete("width");
    u.searchParams.delete("height");
    u.searchParams.delete("w");
    u.searchParams.delete("h");
    u.searchParams.delete("size");
    u.searchParams.delete("fit");
    return u.toString();
  } catch {
    return url;
  }
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body?: string;
  categories: string[];
  additional_categories?: string[];
  client_side?: string;
  server_side?: string;
  project_type: string;
  downloads: number;
  followers?: number;
  icon_url: string | null;
  license?: { id?: string; name?: string } | string;
  gallery?: ModrinthGalleryItem[];
  published?: string;
  updated?: string;
  issues_url?: string | null;
  source_url?: string | null;
  wiki_url?: string | null;
  discord_url?: string | null;
  donation_urls?: { id?: string; platform?: string; url: string }[];
  loaders?: string[];
  game_versions?: string[];
}

export async function getProject(idOrSlug: string): Promise<ModrinthProject> {
  const res = await fetch(`${BASE}/project/${encodeURIComponent(idOrSlug)}`, {
    headers: MR_HEADERS,
  });
  if (!res.ok) throw new Error(`Modrinth project failed: ${res.status}`);
  return res.json();
}

export function ruCount(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${many}`;
  if (d === 1) return `${n} ${one}`;
  if (d >= 2 && d <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: VersionFile[];
  date_published?: string;
  version_type?: "release" | "beta" | "alpha";
  dependencies: { version_id?: string; project_id?: string; dependency_type: string }[];
}

export async function searchMods(params: {
  query?: string;
  loader?: ModLoader;
  version?: string;
  index?: SortIndex;
  limit?: number;
  offset?: number;
  projectType?: ProjectType;
}): Promise<SearchResponse> {
  const { query = "", loader, version, index = "downloads", limit = 24, offset = 0, projectType = "mod" } = params;
  const facets: string[][] = [[`project_type:${projectType}`]];
  if ((projectType === "mod" || projectType === "modpack") && loader && loader !== "vanilla") {
    facets.push([`categories:${loader}`]);
  }
  if (projectType === "shader" && loader && loader !== "vanilla") {
    const shaderLoaders =
      loader === "forge" || loader === "neoforge" ? ["oculus"] : ["iris"];
    facets.push(shaderLoaders.map((id) => `categories:${id}`));
  }
  if (version) facets.push([`versions:${version}`]);

  const url = new URL(`${BASE}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("index", index);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("facets", JSON.stringify(facets));

  const res = await fetch(url.toString(), {
    headers: MR_HEADERS,
  });
  if (!res.ok) throw new Error(`Modrinth search failed: ${res.status}`);
  return res.json();
}

export async function getProjectVersions(
  projectId: string,
  options?: { loader?: ModLoader; gameVersion?: string; projectType?: ProjectType }
): Promise<ProjectVersion[]> {
  const url = new URL(`${BASE}/project/${projectId}/version`);
  if (options?.gameVersion) {
    url.searchParams.set("game_versions", JSON.stringify([options.gameVersion]));
  }
  if (
    (options?.projectType === "mod" || options?.projectType === "modpack") &&
    options.loader &&
    options.loader !== "vanilla"
  ) {
    url.searchParams.set("loaders", JSON.stringify([options.loader]));
  }

  const res = await fetch(url.toString(), {
    headers: MR_HEADERS,
  });
  if (!res.ok) throw new Error(`Modrinth versions failed: ${res.status}`);
  return res.json();
}

export function findCompatibleFile(
  versions: ProjectVersion[],
  loader?: ModLoader,
  gameVersion?: string,
  projectType?: ProjectType
): VersionFile | null {
  const matches = versions.filter((v) => {
    const okLoader = projectType === "mod"
      ? (!loader || loader === "vanilla" || v.loaders.includes(loader))
      : true;
    const okVer = !gameVersion || v.game_versions.includes(gameVersion);
    return okLoader && okVer;
  });
  // Никогда не откатываемся на произвольную старую версию. Именно этот fallback
  // раньше устанавливал старый Fabric API, если релиза для выбранного Minecraft
  // не было.
  if (!matches.length) return null;

  const pool = [...matches].sort((a, b) => {
    const releaseRank = (v: ProjectVersion) =>
      v.version_type === "release" ? 3 : v.version_type === "beta" ? 2 : 1;
    const rankDiff = releaseRank(b) - releaseRank(a);
    if (rankDiff) return rankDiff;
    return Date.parse(b.date_published || "0") - Date.parse(a.date_published || "0");
  });
  const primary = pool[0].files.find((f) => f.primary) ?? pool[0].files[0];
  return primary ?? null;
}

export type ModSource = "modrinth" | "curseforge";

export interface InstalledMod {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  author: string;
  source: ModSource;
  projectType: ProjectType;
  loader?: ModLoader;
  gameVersion?: string;
  fileName: string;
  size: number;
  downloadsUrl: string;
  profile?: string;
  installedAt: number;
}

// Возвращает имя подпапки внутри профиля в зависимости от типа контента
export function getSubfolderForType(projectType: ProjectType): string {
  switch (projectType) {
    case "mod": return "mods";
    case "resourcepack": return "resourcepacks";
    case "shader": return "shaderpacks";
    case "datapack": return "datapacks";
    case "modpack": return "modpacks";
    default: return "mods";
  }
}

// Скачивает файл напрямую в папку профиля (реально появляется и работает).
export async function downloadModToProfile(
  installed: Omit<InstalledMod, "installedAt">,
  profile: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  const subfolder = getSubfolderForType(installed.projectType);
  if (window.electronAPI) {
    return window.electronAPI.downloadModToProfile({
      profile,
      fileName: installed.fileName,
      url: installed.downloadsUrl,
      subfolder,
    });
  }

  // Fallback для браузера — скачиваем как файл
  const res = await fetch(installed.downloadsUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = installed.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { success: true };
}

// Экспорт мода на диск через диалог сохранения
export async function downloadModJar(installed: Omit<InstalledMod, "installedAt">) {
  const res = await fetch(installed.downloadsUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  if (window.electronAPI) {
    const arrayBuffer = await res.arrayBuffer();
    const result = await window.electronAPI.saveFile({
      defaultName: installed.fileName,
      buffer: arrayBuffer,
    });
    if (!result.success) throw new Error(result.error || "Save cancelled");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = installed.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface FileProjectMeta {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
}

export async function identifyModsByHashes(hashes: string[]): Promise<Record<string, FileProjectMeta>> {
  const unique = [...new Set(hashes.filter(Boolean))];
  if (!unique.length) return {};
  const res = await fetch(`${BASE}/version_files`, {
    method: "POST",
    headers: { ...MR_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ hashes: unique, algorithm: "sha1" }),
  });
  if (!res.ok) return {};
  const versions = (await res.json()) as Record<string, { project_id?: string }>;
  const ids = [...new Set(Object.values(versions).map((v) => v.project_id).filter(Boolean))] as string[];
  if (!ids.length) return {};
  const pres = await fetch(`${BASE}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, {
    headers: MR_HEADERS,
  });
  if (!pres.ok) return {};
  const projects = (await pres.json()) as ModrinthProject[];
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out: Record<string, FileProjectMeta> = {};
  for (const [hash, ver] of Object.entries(versions)) {
    const p = ver.project_id ? byId.get(ver.project_id) : null;
    if (!p) continue;
    out[hash] = {
      project_id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      icon_url: p.icon_url,
    };
  }
  return out;
}

export function guessModSlug(fileName: string): string {
  let n = String(fileName || "").replace(/\.(jar|zip|litemod)(\.disabled)?$/i, "");
  n = n.replace(/[+]mc[\d.]+$/i, "");
  n = n.replace(/[-_](fabric|forge|quilt|neoforge)$/i, "");
  n = n.replace(/[-_](\d+\.)+\d+[a-z0-9-+.]*$/i, "");
  n = n.replace(/[-_]mc[\d.]+$/i, "");
  return n.trim();
}

export async function identifyModByFilename(
  fileName: string,
  projectType: ProjectType,
  loader?: ModLoader
): Promise<FileProjectMeta | null> {
  const slug = guessModSlug(fileName);
  if (!slug || slug.length < 2) return null;
  const candidates = [slug.replace(/_/g, "-")];
  if (/-(fabric|forge|quilt|neoforge)$/i.test(candidates[0])) {
    candidates.push(candidates[0].replace(/-(fabric|forge|quilt|neoforge)$/i, ""));
  }
  for (const id of candidates) {
    if (id.length < 2) continue;
    try {
      const p = await getProject(id);
      if (p?.icon_url || p?.title) {
        return {
          project_id: p.id,
          slug: p.slug,
          title: p.title,
          description: p.description,
          icon_url: p.icon_url,
        };
      }
    } catch {
      /* slug не совпал */
    }
  }
  try {
    const data = await searchMods({ query: slug, projectType, loader, limit: 8, index: "relevance" });
    const norm = (s: string) => s.toLowerCase().replace(/[-_\s]/g, "");
    const key = norm(slug);
    const hit =
      data.hits.find((h) => norm(h.slug) === key) ||
      data.hits.find((h) => norm(h.title) === key) ||
      data.hits.find((h) => norm(h.slug).includes(key) || key.includes(norm(h.slug)));
    if (!hit) return null;
    return {
      project_id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      icon_url: hit.icon_url,
    };
  } catch {
    return null;
  }
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
