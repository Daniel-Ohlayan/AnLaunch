// Менеджер версий Minecraft — получает реальный список из Mojang API

export interface MinecraftVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  time: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftVersion[];
}

const MANIFEST_URL = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
const CACHE_KEY = "anlaunch_version_manifest";
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

export async function fetchVersionManifest(forceRefresh = false): Promise<VersionManifest> {
  // Пробуем взять из кеша
  if (!forceRefresh) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_TTL) {
          return data.manifest;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    const manifest: VersionManifest = await res.json();
    
    // Сохраняем в кеш
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ manifest, timestamp: Date.now() })
    );
    
    return manifest;
  } catch (error) {
    // Если ошибка и есть кеш, используем его
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached).manifest;
    }
    throw error;
  }
}

// Дата выхода 1.8.9 — всё, что старше, скрываем
const MIN_RELEASE_TIME = new Date("2015-12-01").getTime();

function isModern(v: MinecraftVersion): boolean {
  const t = new Date(v.releaseTime).getTime();
  return t >= MIN_RELEASE_TIME;
}

// Получение списка release версий, отсортированных по дате (новые сверху, до 1.7.10)
export async function getReleases(): Promise<MinecraftVersion[]> {
  const manifest = await fetchVersionManifest();
  return manifest.versions.filter((v) => v.type === "release" && isModern(v));
}

// Получение всех версий (релизы + снапшоты), скрывая слишком старые (до 1.7.10)
export async function getAllVersions(): Promise<MinecraftVersion[]> {
  const manifest = await fetchVersionManifest();
  return manifest.versions.filter(isModern);
}

// Получение деталей конкретной версии
export async function getVersionDetails(versionId: string) {
  const manifest = await fetchVersionManifest();
  const version = manifest.versions.find((v) => v.id === versionId);
  if (!version) throw new Error(`Version ${versionId} not found`);
  
  const res = await fetch(version.url);
  if (!res.ok) throw new Error(`Failed to fetch version details: ${res.status}`);
  
  return res.json();
}

// Группировка версий по годам
export function groupVersionsByYear(versions: MinecraftVersion[]): Record<string, MinecraftVersion[]> {
  const groups: Record<string, MinecraftVersion[]> = {};
  for (const v of versions) {
    const year = new Date(v.releaseTime).getFullYear().toString();
    if (!groups[year]) groups[year] = [];
    groups[year].push(v);
  }
  return groups;
}

// Популярные версии для быстрого выбора (новейшие сверху, до 1.7.10)
// Начиная с 2026 года Mojang использует годовую нумерацию (26.1, 26.2, …)
export const POPULAR_VERSIONS = [
  "26.2",
  "26.1.2",
  "26.1",
  "1.21.8",
  "1.21.7",
  "1.21.6",
  "1.21.5",
  "1.21.4",
  "1.21.3",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.2",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
  "1.15.2",
  "1.14.4",
  "1.13.2",
  "1.12.2",
  "1.11.2",
  "1.10.2",
  "1.9.4",
  "1.8.9",
  "1.7.10",
];
