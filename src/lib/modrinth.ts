// Modrinth API client (v2)
// Docs: https://docs.modrinth.com/

const BASE = "https://api.modrinth.com/v2";

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

export interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: VersionFile[];
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
  // Resourcepacks, shaders, modpacks, datapacks don't need loader filter
  if (projectType === "mod" && loader && loader !== "vanilla") {
    facets.push([`categories:${loader}`]);
  }
  if (version) facets.push([`versions:${version}`]);

  const url = new URL(`${BASE}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("index", index);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("facets", JSON.stringify(facets));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Modrinth search failed: ${res.status}`);
  return res.json();
}

export async function getProjectVersions(projectId: string): Promise<ProjectVersion[]> {
  const res = await fetch(`${BASE}/project/${projectId}/version`, {
    headers: { Accept: "application/json" },
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
  const pool = matches.length ? matches : versions;
  if (!pool.length) return null;
  const primary = pool[0].files.find((f) => f.primary) ?? pool[0].files[0];
  return primary ?? null;
}

export type ModSource = "modrinth";

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
