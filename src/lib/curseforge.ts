// CurseForge API client
// Docs: https://docs.curseforge.com/
// Требуется публичный API-ключ. CurseForge выдаёт его на console.curseforge.com.

import type { ModLoader } from "./modrinth";

const BASE = "https://api.curseforge.com/v1";
const MINECRAFT_GAME_ID = 432;
const MODS_CLASS_ID = 6; // категория "Mods"

// Публичный API-ключ CurseForge (можно заменить на свой из console.curseforge.com)
const CF_API_KEY = "$2a$10$bL4bIL5pUWqfcO7KQtnMReakwtfHbNKh6v1uTpKlzhwoueEG/Reap";

// Соответствие загрузчиков → modLoaderType в CurseForge
const LOADER_TYPE: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

export interface CFAuthor {
  name: string;
}

export interface CFFileIndex {
  gameVersion: string;
  fileId: number;
  filename: string;
  modLoader?: number;
}

export interface CFMod {
  id: number;
  slug: string;
  name: string;
  summary: string;
  downloadCount: number;
  logo?: { thumbnailUrl?: string; url?: string };
  authors: CFAuthor[];
  latestFilesIndexes?: CFFileIndex[];
  categories?: { name: string }[];
}

export interface CFFile {
  id: number;
  displayName: string;
  fileName: string;
  fileLength: number;
  downloadUrl: string | null;
  gameVersions: string[];
}

function headers() {
  return {
    Accept: "application/json",
    "x-api-key": CF_API_KEY,
  };
}

export async function searchCurseForge(params: {
  query?: string;
  loader?: ModLoader;
  version?: string;
  index?: string;
  limit?: number;
  offset?: number;
}): Promise<CFMod[]> {
  const { query = "", loader, version, index = "downloads", limit = 24, offset = 0 } = params;

  const sortMap: Record<string, number> = {
    downloads: 6, // TotalDownloads
    relevance: 1,
    follows: 2, // Popularity
    newest: 11, // ReleasedDate
    updated: 3, // LastUpdated
  };

  const url = new URL(`${BASE}/mods/search`);
  url.searchParams.set("gameId", String(MINECRAFT_GAME_ID));
  url.searchParams.set("classId", String(MODS_CLASS_ID));
  if (query) url.searchParams.set("searchFilter", query);
  if (version) url.searchParams.set("gameVersion", version);
  if (loader && loader !== "vanilla" && LOADER_TYPE[loader]) {
    url.searchParams.set("modLoaderType", String(LOADER_TYPE[loader]));
  }
  url.searchParams.set("sortField", String(sortMap[index] ?? 6));
  url.searchParams.set("sortOrder", "desc");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("index", String(offset));

  const res = await fetch(url.toString(), { headers: headers() });
  if (res.status === 403) {
    throw new Error(
      "CurseForge отклонил запрос (нужен рабочий API-ключ). Вставьте свой ключ в src/lib/curseforge.ts (CF_API_KEY)."
    );
  }
  if (!res.ok) throw new Error(`CurseForge: ошибка ${res.status}`);
  const data = await res.json();
  return data.data as CFMod[];
}

export async function getCurseForgeFiles(
  modId: number,
  loader?: ModLoader,
  version?: string
): Promise<CFFile[]> {
  const url = new URL(`${BASE}/mods/${modId}/files`);
  if (version) url.searchParams.set("gameVersion", version);
  if (loader && loader !== "vanilla" && LOADER_TYPE[loader]) {
    url.searchParams.set("modLoaderType", String(LOADER_TYPE[loader]));
  }
  url.searchParams.set("pageSize", "30");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) throw new Error(`CurseForge files failed: ${res.status}`);
  const data = await res.json();
  return data.data as CFFile[];
}

// Некоторые файлы CurseForge не отдают downloadUrl напрямую — собираем вручную
export function buildCurseForgeDownloadUrl(fileId: number, fileName: string): string {
  const idStr = String(fileId);
  const part1 = idStr.slice(0, 4);
  const part2 = idStr.slice(4).replace(/^0+/, "") || "0";
  return `https://mediafilez.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(fileName)}`;
}
