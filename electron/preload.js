const { contextBridge, ipcRenderer } = require("electron");

const isLogs = process.argv.includes("--is-logs-window");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: () => ipcRenderer.invoke("is-electron"),
  isLogsWindow: isLogs,
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
  saveFile: (data) => ipcRenderer.invoke("save-file", data),
  checkJava: () => ipcRenderer.invoke("check-java"),
  launchMinecraftReal: (config) => ipcRenderer.invoke("launch-minecraft-real", config),

  // Профили
  listProfiles: () => ipcRenderer.invoke("list-profiles"),
  createProfile: (name) => ipcRenderer.invoke("create-profile", name),
  renameProfile: (oldName, newName) => ipcRenderer.invoke("rename-profile", { oldName, newName }),
  deleteProfile: (name) => ipcRenderer.invoke("delete-profile", name),
  openProfileFolder: (name) => ipcRenderer.invoke("open-profile-folder", name),
  openProfilesRoot: () => ipcRenderer.invoke("open-profiles-root"),

  // Моды
  downloadModToProfile: (data) => ipcRenderer.invoke("download-mod-to-profile", data),
  removeModFromProfile: (data) => ipcRenderer.invoke("remove-mod-from-profile", data),

  // Настройки главного экрана
  openFileDialog: (data) => ipcRenderer.invoke("open-file-dialog", data),
  readFileAsDataUrl: (filePath) => ipcRenderer.invoke("read-file-as-data-url", filePath),
  saveDataUrl: (data) => ipcRenderer.invoke("save-data-url", data),
  openGameDir: (profileName) => ipcRenderer.invoke("open-game-dir", profileName),
  getProfileInfo: (name) => ipcRenderer.invoke("get-profile-info", name),

  // Microsoft
  loginMicrosoft: () => ipcRenderer.invoke("login-microsoft"),
  refreshMicrosoft: (token) => ipcRenderer.invoke("refresh-microsoft", token),

  // Отдельное окно логов
  openLogsWindow: () => ipcRenderer.invoke("open-logs-window"),
  getLogs: () => ipcRenderer.invoke("get-logs"),
  appendLog: (entry) => ipcRenderer.invoke("append-log", entry),
  clearLogs: () => ipcRenderer.invoke("clear-logs"),
  onLogEntry: (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on("log-entry", handler);
    return () => ipcRenderer.removeListener("log-entry", handler);
  },

  // Прогресс
  onLaunchProgress: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on("launch-progress", handler);
    return () => ipcRenderer.removeListener("launch-progress", handler);
  },
  onAuthProgress: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on("auth-progress", handler);
    return () => ipcRenderer.removeListener("auth-progress", handler);
  },

  // Автообновление
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
});
