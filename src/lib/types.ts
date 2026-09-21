// Общие типы AnLauncher (рендерер). Соответствуют ответам main-процесса.

export type Loader = "vanilla" | "forge" | "neoforge";

export interface McVersionMeta {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url?: string;
}

export interface LauncherConfig {
  gameDir: string;
  javaPath: string;
  defaultRamMB: number;
  msClientId: string;
  offlineName: string;
}

export interface InstalledMod {
  slug: string;
  projectId: string;
  versionId: string;
  title: string;
  versionNumber: string;
  filename: string;
}

export interface Profile {
  id: string;
  name: string;
  gameVersion: string;
  loader: Loader;
  loaderVersion: string;
  ramMB: number;
  javaPath: string;
  customArgs: string;
  installed: InstalledMod[];
  createdAt: number;
}

export interface AuthState {
  loggedIn: boolean;
  kind?: "offline" | "microsoft";
  username?: string;
  uuid?: string;
}

export interface InitData {
  version: string;
  platform: string;
  config: LauncherConfig;
  profiles: Profile[];
  activeProfileId: string | null;
  versions: McVersionMeta[];
  auth: AuthState;
}

export interface ModHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  followers: number;
  gameVersions: string[];
  loaders: string[];
  versionNumber: string;
}

export interface ModDependency {
  projectId: string;
  projectSlug: string;
  version: string | null;
  versionType: string;
  dependencyType: "required" | "optional" | "incompatible" | "alternative" | "included";
}

export interface ModVersion {
  id: string;
  versionNumber: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  releaseTime: string;
  dependencies: ModDependency[];
}

export interface InstallFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  sha1?: string;
  sha512?: string;
}

export interface InstallItem {
  key: string;
  kind: "mod" | "dependency";
  slug: string;
  title: string;
  projectId: string;
  versionId: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  reason: string | null;
  file: InstallFile | null;
  skipped: boolean;
  note: string | null;
  /** Мод/зависимость уже стоят в профиле — повторно не качаем. */
  alreadyInstalled?: boolean;
  /** Версия, которая уже стоит в профиле (для подписи «уже установлен»). */
  installedVersionNumber?: string | null;
}

export interface ResolvePlan {
  items: InstallItem[];
  conflicts: string[];
  errors: string[];
}

export interface ResolveParams {
  projectId: string;
  versionId?: string;
  gameVersion?: string;
  loader?: Loader;
  /** Профиль, в который ставим: по нему отсекаем уже установленное. */
  profileId?: string;
  projectSlug?: string;
  projectTitle?: string;
}

export interface JavaCandidate {
  path: string;
  version: string;
  major: number;
}

export type InstallEvent =
  | { type: "plan"; items: InstallItem[]; errors: string[] }
  | { type: "item"; key: string; status: "downloading" | "done" | "error" | "skipped"; error?: string; note?: string }
  | { type: "log"; line: string }
  | { type: "done"; installed: number; failed: number; skipped?: number };

export type LaunchEvent =
  | { type: "progress"; stage: string; label: string; done?: number; total?: number }
  | { type: "log"; line: string }
  | { type: "state"; state: "preparing" | "running" | "exited"; code?: number };

// Единый интерфейс API: main-процесс (через preload) или демо-режим в браузере.
export interface LauncherApi {
  isElectron: boolean;
  getInit(): Promise<InitData>;
  openExternal(url: string): Promise<void>;
  saveSettings(patch: Partial<LauncherConfig>): Promise<LauncherConfig>;
  detectJava(): Promise<JavaCandidate[]>;
  refreshVersions(): Promise<McVersionMeta[]>;
  getLoaderVersions(p: { loader: Loader; gameVersion?: string }): Promise<{ versionNumber: string; id: string }[]>;
  createProfile(data: {
    name: string;
    gameVersion: string;
    loader: Loader;
    loaderVersion?: string;
    ramMB?: number;
  }): Promise<Profile>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;
  setActiveProfile(id: string | null): Promise<string | null>;
  searchMods(p: {
    query?: string;
    gameVersion?: string;
    loader?: Loader;
    offset?: number;
    limit?: number;
  }): Promise<{ hits: ModHit[]; total: number }>;
  getModVersions(p: { projectId: string; gameVersion?: string; loader?: Loader; limit?: number }): Promise<ModVersion[]>;
  resolveInstall(plan: ResolveParams): Promise<ResolvePlan>;
  installMod(p: {
    profileId: string;
    projectId: string;
    versionId?: string;
    gameVersion?: string;
    loader?: Loader;
    projectSlug?: string;
    projectTitle?: string;
  }): Promise<{ installed: number; failed: number; skipped: number; modsDir: string }>;
  getInstalledMods(profileId: string): Promise<InstalledMod[]>;
  uninstallMod(profileId: string, slug: string): Promise<{ removed: boolean }>;
  launchGame(profileId: string): Promise<{ ok: boolean; pid: number }>;
  stopGame(): Promise<boolean>;
  getGameStatus(): Promise<{ running: boolean; pid?: number }>;
  getAuthState(): Promise<AuthState>;
  loginOffline(name: string): Promise<void>;
  loginMicrosoft(): Promise<{ name: string }>;
  logout(): Promise<void>;
  onInstall(cb: (e: InstallEvent) => void): () => void;
  onLaunch(cb: (e: LaunchEvent) => void): () => void;
  onAuth(cb: (e: AuthState) => void): () => void;
}
