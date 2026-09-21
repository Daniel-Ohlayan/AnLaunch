// Демо-режим: полная имитация API AnLaunch для просмотра в браузере
// (без Electron). Используется, когда window.anlaunch недоступен.
// Данные вымышленные, но логика зависимостей повторяет реальную:
// "required" зависимости устанавливаются автоматически.

import type {
  AuthState,
  InstallEvent,
  InstallItem,
  JavaCandidate,
  LauncherApi,
  LaunchEvent,
  Profile,
  ResolveParams,
  ResolvePlan,
} from "./types";

// ---------------------------------------------------------------------------
// Каталог демо-модов
// ---------------------------------------------------------------------------
interface DemoDep {
  slug: string;
  type: "required" | "optional" | "alternative";
  version?: string;
}
interface DemoMod {
  slug: string;
  title: string;
  description: string;
  loaders: string[];
  gameVersions: string[];
  versionNumber: string;
  downloads: number;
  followers: number;
  deps: DemoDep[];
  extraVersions?: string[]; // дополнительные старые версии
}

const G1 = ["1.21.5", "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21"];
const G2 = ["1.20.6", "1.20.4", "1.20.2", "1.20.1"];
const ALL = [...G1, ...G2, "1.19.4", "1.18.2", "1.16.5", "1.12.2", "1.8.9"];

const CATALOG: DemoMod[] = [
  {
    slug: "sodium",
    title: "Sodium",
    description: "Оптимизация рендера и логики: значительный прирост FPS на всех версиях Minecraft.",
    loaders: ["fabric", "neoforge"],
    gameVersions: ALL,
    versionNumber: "0.6.3",
    downloads: 18234510,
    followers: 45210,
    deps: [],
    extraVersions: ["0.5.10", "0.4.10"],
  },
  {
    slug: "sodium-extra",
    title: "Sodium Extra",
    description: "Дополнительные опции оптимизации для Sodium: тени, туман, дальность прорисовки.",
    loaders: ["fabric", "neoforge"],
    gameVersions: G1,
    versionNumber: "0.6.0",
    downloads: 412390,
    followers: 8920,
    deps: [{ slug: "sodium", type: "required" }],
    extraVersions: ["0.5.5"],
  },
  {
    slug: "iris",
    title: "Iris Shaders",
    description: "Поддержка шейдеров: Seus, Complementary, BSL. Работает вместе с Sodium.",
    loaders: ["fabric"],
    gameVersions: ALL,
    versionNumber: "1.8.4",
    downloads: 9812300,
    followers: 30112,
    deps: [{ slug: "sodium", type: "required" }],
    extraVersions: ["1.7.2", "1.6.9"],
  },
  {
    slug: "embeddium",
    title: "Embeddium",
    description: "Порт Sodium для NeoForge: высокая производительность и оптимизация рендера.",
    loaders: ["neoforge"],
    gameVersions: G1,
    versionNumber: "0.3.28",
    downloads: 2311874,
    followers: 15320,
    deps: [{ slug: "starlight", type: "required" }],
    extraVersions: ["0.3.14", "0.2.15"],
  },
  {
    slug: "starlight",
    title: "Starlight",
    description: "Новая система вычисления света: быстрее vanilla до 10 раз.",
    loaders: ["neoforge", "fabric"],
    gameVersions: G1,
    versionNumber: "1.1.3",
    downloads: 3120980,
    followers: 12040,
    deps: [],
  },
  {
    slug: "lambdynamiclights",
    title: "LambDynamicLights",
    description: "Динамическое освещение от факелов в руках, сущностей и эффектов.",
    loaders: ["neoforge", "forge", "fabric"],
    gameVersions: ALL,
    versionNumber: "2.3.1",
    downloads: 5230001,
    followers: 9870,
    deps: [{ slug: "jei", type: "optional" }],
    extraVersions: ["2.2.6"],
  },
  {
    slug: "jei",
    title: "Just Enough Items",
    description: "Просмотр рецептов, предметов и ингредиентов. Обязателен во многих модпаках.",
    loaders: ["neoforge", "forge", "fabric"],
    gameVersions: ALL,
    versionNumber: "15.2.0",
    downloads: 12004530,
    followers: 21030,
    deps: [],
  },
  {
    slug: "xaeros-minimap",
    title: "Xaero's Minimap",
    description: "Миникарта с отображением игроков, мобов и структур. Настраиваемая.",
    loaders: ["neoforge", "forge"],
    gameVersions: ALL,
    versionNumber: "24.4.2",
    downloads: 8001120,
    followers: 18220,
    deps: [{ slug: "xaeros-world-map", type: "optional" }],
  },
  {
    slug: "xaeros-world-map",
    title: "Xaero's World Map",
    description: "Полноэкранная карта мира для Xaero's Minimap.",
    loaders: ["neoforge", "forge"],
    gameVersions: ALL,
    versionNumber: "1.37.6",
    downloads: 4002210,
    followers: 9110,
    deps: [{ slug: "xaeros-minimap", type: "required" }],
  },
  {
    slug: "phosphor",
    title: "Phosphor",
    description: "Оптимизация чанков и освещения: меньше лагов при движении.",
    loaders: ["fabric", "neoforge"],
    gameVersions: G1,
    versionNumber: "0.10.0",
    downloads: 1500330,
    followers: 5620,
    deps: [],
  },
  {
    slug: "journeymap",
    title: "JourneyMap",
    description: "Миникарта, карта мира, путеводитель и маркеры. Классика с 2015 года.",
    loaders: ["neoforge", "forge"],
    gameVersions: ALL,
    versionNumber: "5.17.14",
    downloads: 15200900,
    followers: 25400,
    deps: [],
  },
  {
    slug: "dynamic-fps",
    title: "Dynamic FPS",
    description: "Автоматически снижает FPS в меню и при простое, экономя ресурс.",
    loaders: ["fabric", "neoforge"],
    gameVersions: G1,
    versionNumber: "2.10.0",
    downloads: 2100450,
    followers: 6100,
    deps: [],
  },
];

const VERSIONS: { id: string; type: "release" }[] = ALL.map((id) => ({ id, type: "release" as const }));

const LOADER_VERSIONS: Record<string, string[]> = {
  neoforge: ["21.5.32", "21.4.117", "21.3.44", "21.1.77", "20.6.154", "20.4.80"],
  forge: ["47.3.0", "47.2.20", "49.1.0", "49.2.0"],
};

// ---------------------------------------------------------------------------
// Состояние демо
// ---------------------------------------------------------------------------
const state = {
  config: {
    gameDir: "C:\\Users\\demo\\AppData\\Roaming\\.minecraft",
    javaPath: "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.3.9-hotspot\\bin\\java.exe",
    defaultRamMB: 4096,
    msClientId: "",
    offlineName: "Player",
  },
  profiles: [] as Profile[],
  activeProfileId: null as string | null,
  auth: { loggedIn: false } as AuthState,
};

// стартовый профиль
const firstProfile: Profile = {
  id: "demo-profile-1",
  name: "Основной",
  gameVersion: "1.21.4",
  loader: "neoforge",
  loaderVersion: "21.4.117",
  ramMB: 4096,
  javaPath: "",
  customArgs: "",
  installed: [],
  createdAt: Date.now(),
};
state.profiles.push(firstProfile);
state.activeProfileId = firstProfile.id;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Разрешение зависимостей (та же логика, что и в main-процессе)
// ---------------------------------------------------------------------------
function bySlug(slug: string): DemoMod | undefined {
  return CATALOG.find((m) => m.slug === slug);
}

function demoItem(slug: string, kind: InstallItem["kind"], reason: string | null): InstallItem {
  const m = bySlug(slug)!;
  return {
    key: `demo-${slug}`,
    kind,
    slug: m.slug,
    title: m.title,
    projectId: `demo-project-${m.slug}`,
    versionId: `demo-version-${m.slug}`,
    versionNumber: m.versionNumber,
    gameVersions: m.gameVersions,
    loaders: m.loaders,
    reason,
    file: {
      url: `https://cdn.modrinth.demo/files/${m.slug}-${m.versionNumber}.jar`,
      filename: `${m.slug}-${m.versionNumber}.jar`,
      primary: true,
      size: 40960 + (m.slug.length * 131542) % 8000000,
      sha512: "demo-sha512",
    },
    skipped: false,
    note: null,
  };
}

async function resolveInstall(plan: ResolveParams): Promise<ResolvePlan> {
  await delay(350);
  const items = new Map<string, InstallItem>();
  const errors: string[] = [];
  const conflicts: string[] = [];
  const queue: string[] = [];
  const optionalSlugs = new Set(plan.optionalSlugs || []);

  const add = (slug: string, kind: InstallItem["kind"], reason: string | null) => {
    if (items.has(slug)) return items.get(slug)!;
    const item = demoItem(slug, kind, reason);
    items.set(slug, item);
    queue.push(slug);
    return item;
  };

  const base = bySlug(plan.projectSlug || "");
  if (!base) {
    errors.push("Мод не найден в демо-каталоге");
    return { items: [], conflicts, errors };
  }
  add(base.slug, "mod", null);

  let head = 0;
  while (head < queue.length) {
    const cur = bySlug(queue[head++])!;
    for (const dep of cur.deps) {
      if (items.has(dep.slug)) continue; // дедупликация / защита от циклов
      if (dep.type === "optional") {
        if (optionalSlugs.has(dep.slug)) add(dep.slug, "optional", `опционально для ${cur.title}`);
        continue;
      }
      add(dep.slug, "dependency", `требуется ${cur.title}`);
    }
  }

  const ordered = [...items.values()].sort((a, b) => (a.kind === "mod" ? -1 : b.kind === "mod" ? 1 : 0));
  return { items: ordered, conflicts, errors };
}

// ---------------------------------------------------------------------------
// Эммиттеры событий
// ---------------------------------------------------------------------------
type Cb<T> = (e: T) => void;
const listeners: Record<"install" | "launch" | "auth", Set<Cb<any>>> = {
  install: new Set(),
  launch: new Set(),
  auth: new Set(),
};
const emit = (kind: "install" | "launch" | "auth", e: unknown) => {
  listeners[kind].forEach((cb) => cb(e));
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export function createDemoApi(): LauncherApi {
  const demoProfile = () => state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  return {
    isElectron: false,

    async getInit() {
      await delay(200);
      return {
        version: "1.1.0",
        platform: "demo",
        config: { ...state.config },
        profiles: state.profiles.map((p) => ({ ...p, installed: [...p.installed] })),
        activeProfileId: state.activeProfileId,
        versions: VERSIONS,
        auth: { ...state.auth },
      };
    },

    async openExternal() {
      /* в браузере просто игнорируем */
    },

    async saveSettings(patch) {
      await delay(150);
      state.config = { ...state.config, ...patch };
      return state.config;
    },

    async detectJava(): Promise<JavaCandidate[]> {
      await delay(400);
      return [
        { path: "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.3.9-hotspot\\bin\\java.exe", version: "21.0.3", major: 21 },
        { path: "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.9.7-hotspot\\bin\\java.exe", version: "17.0.9", major: 17 },
        { path: "C:\\Program Files\\Microsoft\\jdk-17.0.9.8-hotspot\\bin\\java.exe", version: "17.0.9", major: 17 },
      ];
    },

    async refreshVersions() {
      await delay(400);
      return VERSIONS;
    },

    async getLoaderVersions({ loader }) {
      await delay(300);
      const list = LOADER_VERSIONS[loader] || [];
      return list.map((v, i) => ({ versionNumber: v, id: `${loader}-${i}` }));
    },

    async createProfile(data) {
      await delay(200);
      if (state.profiles.some((p) => p.name.toLowerCase() === data.name.toLowerCase())) {
        throw new Error("Профиль с таким именем уже есть");
      }
      const p: Profile = {
        id: `demo-${Date.now()}`,
        name: data.name,
        gameVersion: data.gameVersion,
        loader: data.loader,
        loaderVersion: data.loaderVersion || "",
        ramMB: data.ramMB || state.config.defaultRamMB,
        javaPath: "",
        customArgs: "",
        installed: [],
        createdAt: Date.now(),
      };
      state.profiles.push(p);
      if (!state.activeProfileId) state.activeProfileId = p.id;
      return p;
    },

    async updateProfile(id, patch) {
      await delay(150);
      const p = state.profiles.find((x) => x.id === id);
      if (!p) throw new Error("Профиль не найден");
      Object.assign(p, patch);
      return p;
    },

    async deleteProfile(id) {
      await delay(150);
      state.profiles = state.profiles.filter((p) => p.id !== id);
      if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id || null;
    },

    async setActiveProfile(id) {
      await delay(80);
      state.activeProfileId = id;
      return id;
    },

    async searchMods({ query = "", gameVersion, loader, limit = 24 } = {}) {
      await delay(300);
      let hits = CATALOG.map((m) => ({
        projectId: `demo-project-${m.slug}`,
        slug: m.slug,
        title: m.title,
        description: m.description,
        iconUrl: null,
        downloads: m.downloads,
        followers: m.followers,
        gameVersions: m.gameVersions,
        loaders: m.loaders,
        versionNumber: m.versionNumber,
      }));
      const q = query.trim().toLowerCase();
      if (q) hits = hits.filter((h) => h.title.toLowerCase().includes(q) || h.description.toLowerCase().includes(q));
      if (gameVersion) hits = hits.filter((h) => h.gameVersions.includes(gameVersion));
      if (loader && loader !== "vanilla") hits = hits.filter((h) => h.loaders.includes(loader));
      return { hits: hits.slice(0, limit), total: hits.length };
    },

    async getModVersions({ projectId }) {
      await delay(250);
      const m = CATALOG.find((x) => `demo-project-${x.slug}` === projectId);
      if (!m) return [];
      const versions = [m.versionNumber, ...(m.extraVersions || [])];
      return versions.map((vn, i) => ({
        id: `demo-version-${m.slug}-${i}`,
        versionNumber: vn,
        name: vn,
        gameVersions: m.gameVersions,
        loaders: m.loaders,
        releaseTime: new Date(Date.now() - i * 30 * 86400000).toISOString(),
        dependencies: m.deps.map((d) => ({
          projectId: `demo-project-${d.slug}`,
          projectSlug: d.slug,
          version: d.version || null,
          versionType: "version",
          dependencyType: d.type,
        })),
      }));
    },

    resolveInstall,

    async installMod(params) {
      const profile = state.profiles.find((p) => p.id === params.profileId) || demoProfile();
      const plan = await resolveInstall(params);
      emit("install", { type: "plan", items: plan.items, errors: plan.errors });
      let installed = 0;
      let failed = 0;
      for (const item of plan.items) {
        emit("install", { type: "item", key: item.key, status: "downloading" } satisfies InstallEvent);
        await delay(450 + Math.random() * 500);
        if (item.skipped) {
          emit("install", { type: "item", key: item.key, status: "skipped" } satisfies InstallEvent);
          failed++;
          continue;
        }
        emit("install", { type: "item", key: item.key, status: "done" } satisfies InstallEvent);
        installed++;
        profile.installed = profile.installed.filter((m) => m.slug !== item.slug);
        profile.installed.push({
          slug: item.slug,
          projectId: item.projectId,
          versionId: item.versionId,
          title: item.title,
          versionNumber: item.versionNumber,
          filename: item.file!.filename,
        });
      }
      emit("install", { type: "done", installed, failed } satisfies InstallEvent);
      return { installed, failed, modsDir: `${state.config.gameDir}\\instances\\${profile.name}\\mods` };
    },

    async getInstalledMods(profileId) {
      await delay(100);
      const p = state.profiles.find((x) => x.id === profileId);
      return p ? p.installed : [];
    },

    async uninstallMod(profileId, slug) {
      await delay(150);
      const p = state.profiles.find((x) => x.id === profileId);
      if (!p) return { removed: false };
      p.installed = p.installed.filter((m) => m.slug !== slug);
      return { removed: true };
    },

    async launchGame(profileId) {
      const profile = state.profiles.find((p) => p.id === profileId);
      if (!profile) throw new Error("Профиль не найден");
      emit("launch", { type: "state", state: "preparing" } satisfies LaunchEvent);
      const steps: [string, number][] = [
        ["client", 0],
        ["libraries", 12],
        ["assets", 120],
      ];
      for (const [stage, total] of steps) {
        for (let i = 0; i <= total; i++) {
          emit("launch", {
            type: "progress",
            stage,
            label:
              stage === "client"
                ? "Клиентская jar…"
                : stage === "libraries"
                  ? `Библиотеки: ${i}/${total}`
                  : `Ассеты: ${i}/${total}`,
            done: i,
            total,
          } satisfies LaunchEvent);
          await delay(stage === "assets" ? 25 : 90);
        }
      }
      emit("launch", { type: "progress", stage: "start", label: "Запускаем Minecraft…" } satisfies LaunchEvent);
      emit("launch", { type: "state", state: "running" } satisfies LaunchEvent);
      const lines = [
        `[${new Date().toLocaleTimeString()}] [main/INFO]: Loading Minecraft ${profile.gameVersion}${
          profile.loader !== "vanilla" ? ` (${profile.loader} ${profile.loaderVersion})` : ""
        }`,
        "[main/INFO]: Setting user: " + (state.auth.username || state.config.offlineName),
        "[main/INFO]: Backend library: LWJGL version 3.3.3",
        "[Render thread/INFO]: Sound engine started",
        "[Render thread/INFO]: Created: 1024x512x4 minecraft:textures/atlas/blocks.png-atlas",
        "[Worker-Main-11/INFO]: Preparing spawn area: 42%",
        "[Worker-Main-12/INFO]: Time elapsed: 1842 ms",
        "[Render thread/INFO]: Resolved 4125 unique sounds for 3187 files",
        "[Render thread/INFO]: [Demo] Игра запущена (демо-режим)",
      ];
      for (const line of lines) {
        await delay(250);
        emit("launch", { type: "log", line } satisfies LaunchEvent);
      }
      return { ok: true, pid: 4242 };
    },

    async stopGame() {
      emit("launch", { type: "log", line: "[Demo] Игра остановлена пользователем" } satisfies LaunchEvent);
      emit("launch", { type: "state", state: "exited", code: 0 } satisfies LaunchEvent);
      return true;
    },

    async getGameStatus() {
      return { running: false };
    },

    async getAuthState() {
      return { ...state.auth };
    },

    async loginOffline(name) {
      await delay(150);
      state.auth = { loggedIn: true, kind: "offline", username: name || "Player", uuid: "demo-uuid" };
      emit("auth", { ...state.auth });
    },

    async loginMicrosoft() {
      throw new Error("В демо-режиме (браузер) вход через Microsoft недоступен");
    },

    async logout() {
      state.auth = { loggedIn: false };
      emit("auth", { ...state.auth });
    },

    onInstall(cb) {
      listeners.install.add(cb);
      return () => listeners.install.delete(cb);
    },
    onLaunch(cb) {
      listeners.launch.add(cb);
      return () => listeners.launch.delete(cb);
    },
    onAuth(cb) {
      listeners.auth.add(cb);
      return () => listeners.auth.delete(cb);
    },
  };
}
