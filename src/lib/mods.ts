// Единый интерфейс поиска модов для Modrinth и CurseForge

import type { ModLoader, ModSource, SortIndex } from "./modrinth";
import { searchMods, getProjectVersions, findCompatibleFile } from "./modrinth";
import {
  searchCurseForge,
  getCurseForgeFiles,
  buildCurseForgeDownloadUrl,
} from "./curseforge";

// Общая карточка мода из любого источника
export interface UnifiedMod {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
  source: ModSource;
  license?: string;
}

export interface ResolvedFile {
  fileName: string;
  size: number;
  url: string;
}

export async function searchAllMods(params: {
  source: ModSource;
  query?: string;
  loader?: ModLoader;
  version?: string;
  index?: SortIndex;
  limit?: number;
}): Promise<UnifiedMod[]> {
  const { source, query, loader, version, index, limit } = params;

  if (source === "modrinth") {
    const data = await searchMods({
      query,
      loader,
      version: version as never,
      index,
      limit,
    });
    return data.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      icon_url: h.icon_url,
      categories: h.display_categories ?? h.categories,
      versions: h.versions,
      source: "modrinth" as const,
      license: h.license,
    }));
  }

  // CurseForge
  const results = await searchCurseForge({ query, loader, version, index, limit });
  return results.map((m) => ({
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    author: m.authors?.[0]?.name ?? "Unknown",
    downloads: m.downloadCount,
    icon_url: m.logo?.thumbnailUrl ?? m.logo?.url ?? null,
    categories: (m.categories ?? []).map((c) => c.name),
    versions: [...new Set((m.latestFilesIndexes ?? []).map((f) => f.gameVersion))].slice(0, 6),
    source: "curseforge" as const,
  }));
}

// Находит скачиваемый файл для выбранной версии/загрузчика
export async function resolveModFile(
  mod: UnifiedMod,
  loader?: ModLoader,
  version?: string
): Promise<ResolvedFile | null> {
  if (mod.source === "modrinth") {
    const versions = await getProjectVersions(mod.id);
    const file = findCompatibleFile(versions, loader, version as never);
    if (!file) return null;
    return { fileName: file.filename, size: file.size, url: file.url };
  }

  // CurseForge
  const files = await getCurseForgeFiles(Number(mod.id), loader, version);
  if (!files.length) return null;
  const file = files[0];
  const url = file.downloadUrl || buildCurseForgeDownloadUrl(file.id, file.fileName);
  return { fileName: file.fileName, size: file.fileLength, url };
}
