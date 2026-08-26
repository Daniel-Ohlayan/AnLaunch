export interface ProfileInfo {
  name: string;
  dir: string;
  mods: number;
  resourcepacks: number;
  shaderpacks: number;
  saves: number;
}

export interface MicrosoftAccount {
  id: string;
  username: string;
  uuid: string;
  type: "microsoft";
  accessToken: string;
  refreshToken: string;
  createdAt: number;
}

export interface ElectronAPI {
  isElectron: () => Promise<boolean>;
  getUserDataPath: () => Promise<string>;
  saveFile: (data: { defaultName: string; buffer: ArrayBuffer }) => Promise<
    { success: true; filePath: string } | { success: false; error?: string }
  >;
  checkJava: () => Promise<{ exists: boolean; path?: string; version?: string }>;
  validateJavaPath: (path: string) => Promise<{ exists: boolean; path?: string; version?: string }>;
  minimizeMainWindow: () => Promise<{ success: boolean }>;
  quitApp: () => Promise<{ success: boolean }>;
  setAlwaysOnTop: (value: boolean) => Promise<{ success: boolean; value: boolean }>;
  getSystemMemory: () => Promise<{
    totalBytes: number;
    freeBytes: number;
    totalGB: number;
    freeGB: number;
    platform: string;
    arch: string;
    cpus: number;
  }>;
  setAutoStart: (enabled: boolean) => Promise<{ success: boolean; enabled?: boolean; error?: string }>;
  getAutoStart: () => Promise<{ success: boolean; enabled: boolean }>;
  launchMinecraftReal: (config: {
    account: { username: string; uuid: string; accessToken?: string; type?: string; xuid?: string };
    version: string;
    loader: string;
    ram: number;
    ramMin?: number;
    profile: string;
    mods: { fileName: string; downloadsUrl: string }[];
    javaPath?: string;
    mcFullscreen?: boolean;
    mcWidth?: number;
    mcHeight?: number;
    jvmArgs?: string;
    mcLanguage?: string;
    serverHost?: string;
    serverPort?: number;
    server?: { host: string; port?: number };
  }) => Promise<{ success: boolean; message: string }>;

  // Профили
  listProfiles: () => Promise<ProfileInfo[]>;
  createProfile: (name: string) => Promise<{ name: string; dir: string }>;
  renameProfile: (oldName: string, newName: string) => Promise<{
    success: boolean;
    oldName?: string;
    newName?: string;
    error?: string;
  }>;
  deleteProfile: (name: string) => Promise<{ success: boolean; error?: string }>;
  openProfileFolder: (name: string) => Promise<{ success: boolean; dir: string }>;
  openProfileSubfolder: (data: { name: string; subfolder: string }) => Promise<{ success: boolean; dir?: string; error?: string }>;
  openProfilesRoot: () => Promise<{ success: boolean; dir: string }>;

  // Моды
  downloadModToProfile: (data: {
    profile: string;
    fileName: string;
    url: string;
    subfolder?: string;
  }) => Promise<{
    success: boolean;
    path?: string;
    error?: string;
  }>;

  // Настройки главного экрана
  openFileDialog: (data: { title?: string; filters?: { name: string; extensions: string[] }[]; multiple?: boolean }) => Promise<{
    success: boolean;
    paths?: string[];
  }>;
  readFileAsDataUrl: (filePath: string) => Promise<{
    success: boolean;
    dataUrl?: string;
    error?: string;
  }>;
  saveDataUrl: (data: { dataUrl: string; defaultName?: string }) => Promise<{
    success: boolean;
    filePath?: string;
  }>;
  openGameDir: (profileName: string) => Promise<{ success: boolean; dir: string }>;
  getProfileInfo: (name: string) => Promise<{
    success: boolean;
    info?: {
      path: string;
      size: number;
      files: number;
      java: string;
      system: string;
      nodeVersion: string;
      electronVersion: string;
    };
  }>;
  removeModFromProfile: (data: {
    profile: string;
    fileName: string;
    subfolder?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;

  // Microsoft
  loginMicrosoft: () => Promise<
    { success: true; account: MicrosoftAccount } | { success: false; error: string }
  >;
  refreshMicrosoft: (token: string) => Promise<
    { success: true; account: MicrosoftAccount } | { success: false; error: string }
  >;

  onLaunchProgress: (callback: (msg: string) => void) => () => void;
  onAuthProgress: (callback: (msg: string) => void) => () => void;

  // Отдельное окно логов
  isLogsWindow: boolean;
  openLogsWindow: () => Promise<{ success: boolean }>;
  getLogs: () => Promise<{ success: boolean; logs: LogEntry[] }>;
  appendLog: (entry: { time: number; level: "info" | "warn" | "error" | "success"; text: string }) => Promise<{ success: boolean }>;
  clearLogs: () => Promise<{ success: boolean }>;
  onLogEntry: (callback: (entry: LogEntry) => void) => () => void;

  // Автообновление
  checkForUpdates: () => Promise<{
    success: boolean;
    updateAvailable?: boolean;
    version?: string;
    error?: string;
  }>;
  getAppVersion: () => Promise<string>;
  onUpdateStatus: (
    callback: (data: {
      status: "checking" | "available" | "downloading" | "ready" | "error";
      version?: string;
      percent?: number;
      error?: string;
      releaseNotes?: string | null;
    }) => void
  ) => () => void;
}

export interface LogEntry {
  time: number;
  level: "info" | "warn" | "error" | "success";
  text: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
