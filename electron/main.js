const { app, BrowserWindow, ipcMain, shell, dialog, Notification, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

if (process.platform === "win32") {
  app.setAppUserModelId("com.anlaunch.launcher");
}

function resolveAppIcon() {
  const resources = process.resourcesPath || "";
  const candidates = [
    path.join(__dirname, "icon.ico"),
    path.join(__dirname, "icon.png"),
    path.join(__dirname, "../build/icon.ico"),
    path.join(__dirname, "../public/icon.png"),
    path.join(resources, "icon.ico"),
    path.join(resources, "icon.png"),
    path.join(resources, "app.asar.unpacked", "electron", "icon.ico"),
    path.join(resources, "app.asar.unpacked", "build", "icon.ico"),
  ];
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file;
  }
  return undefined;
}

function loadAppIcon() {
  const file = resolveAppIcon();
  if (!file) return undefined;
  const image = nativeImage.createFromPath(file);
  return image.isEmpty() ? undefined : image;
}

let autoUpdater = null;
try {
  const { autoUpdater: upd } = require("electron-updater");
  autoUpdater = upd;
} catch {
  console.warn("electron-updater not available — auto-update disabled");
}

let mainWindow = null;
let isDev = false;

const { describeError, friendlyError } = require("./friendlyError");

function showAppError(error) {
  const { title, message } = describeError(error);
  try {
    dialog.showErrorBox(title, message);
  } catch {
    /* диалог недоступен на самом старте */
  }
}

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  showAppError(error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
  showAppError(error);
});

function createWindow() {
  const icon = loadAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "AnLaunch — Minecraft Launcher",
    icon,
    frame: true,
    backgroundColor: "#06070a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (icon) mainWindow.setIcon(icon);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Логи запуска Minecraft — отдельное окно как в Lunar Client
let logsWindow = null;
const logHistory = [];
const logListeners = new Set();

function appendLog(level, text) {
  const entry = { time: Date.now(), level, text };
  logHistory.push(entry);
  if (logHistory.length > 1000) logHistory.shift();
  // Рассылаем ВСЕМ окнам
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.webContents.send("log-entry", entry);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("log-entry", entry);
  }
  for (const cb of logListeners) {
    try { cb(entry); } catch (e) {}
  }
}

function broadcastLog(entry) {
  appendLog(entry.level, entry.text);
}

function createLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.show();
    logsWindow.focus();
    return logsWindow;
  }
  const icon = loadAppIcon();
  logsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    title: "AnLaunch — Логи запуска",
    icon,
    backgroundColor: "#0a0a0f",
    frame: true,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["anlaunch-role=logs"],
    },
  });
  if (icon) logsWindow.setIcon(icon);
  logsWindow.setMenuBarVisibility(false);
  logsWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    appendLog("error", `Окно логов не загрузилось: ${code} ${desc}`);
  });
  const html = path.join(__dirname, "../dist/index.html");
  if (isDev) {
    logsWindow.loadURL("http://localhost:5173/#logs");
  } else {
    logsWindow.loadFile(html, { hash: "logs", query: { logs: "1" } }).catch((err) => {
      appendLog("error", `Не удалось открыть окно логов: ${err.message}`);
    });
  }
  logsWindow.once("ready-to-show", () => {
    logsWindow.show();
    logsWindow.focus();
  });
  logsWindow.on("closed", () => {
    logsWindow = null;
  });
  return logsWindow;
}

// Создаём структуру папок при первом запуске (как при установке)
function initFolders() {
  const { getRootDir, getProfilesDir, getSharedDir } = require("./profiles");
  const userData = app.getPath("userData");
  getRootDir(userData);
  getProfilesDir(userData);
  getSharedDir(userData);
}

// ── IPC: базовое ─────────────────────────────────────────────

ipcMain.handle("is-electron", () => true);
ipcMain.handle("get-user-data-path", () => app.getPath("userData"));

ipcMain.handle("check-java", () => {
  try {
    const { findAllJavaInstalls } = require("./javaFinder");
    const installs = findAllJavaInstalls();
    if (installs.length === 0) return { exists: false };
    const best = [...installs].sort((a, b) => b.version - a.version)[0];
    return { exists: true, path: best.path, version: String(best.version) };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle("validate-java-path", (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { exists: false };
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync(filePath, ["-version"], { encoding: "utf8", windowsHide: true });
    const output = (result.stdout || "") + (result.stderr || "");
    const match = output.match(/version\s+"?(\d+(?:[._]\d+)*)/i);
    return { exists: result.status === 0 || !!match, path: filePath, version: match?.[1] || "unknown" };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle("minimize-main-window", () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  return { success: true };
});

ipcMain.handle("quit-app", () => {
  app.quit();
  return { success: true };
});

ipcMain.handle("set-always-on-top", (_event, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(!!value);
  }
  return { success: true, value: !!value };
});

ipcMain.handle("get-system-memory", () => {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalBytes: total,
    freeBytes: free,
    totalGB: Math.max(1, Math.floor(total / (1024 ** 3))),
    freeGB: Math.max(0, Math.floor(free / (1024 ** 3))),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus()?.length || 0,
  };
});

ipcMain.handle("set-auto-start", (_event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, name: "AnLaunch" });
    return { success: true, enabled: app.getLoginItemSettings().openAtLogin };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-auto-start", () => {
  try {
    return { success: true, enabled: !!app.getLoginItemSettings().openAtLogin };
  } catch {
    return { success: true, enabled: false };
  }
});

ipcMain.handle("save-file", async (_event, { defaultName, buffer }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "Minecraft Mod", extensions: ["jar", "zip"] }],
  });
  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, Buffer.from(buffer));
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false };
});

// Открыть отдельное окно логов (как в Lunar Client)
ipcMain.handle("open-logs-window", () => {
  try {
    const win = createLogsWindow();
    if (win) win._isLogsWindow = true;
    return { success: true };
  } catch (err) {
    appendLog("error", `Окно логов: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-logs", () => {
  return { success: true, logs: [...logHistory] };
});

ipcMain.handle("append-log", (_event, entry) => {
  broadcastLog(entry);
  return { success: true };
});

ipcMain.handle("clear-logs", () => {
  logHistory.length = 0;
  for (const cb of logListeners) {
    try { cb({ time: Date.now(), level: "info", text: "Логи очищены" }); } catch (e) {}
  }
  return { success: true };
});

ipcMain.on("logs-window-ready", (event) => {
  // Регистрируем это окно как logs window
  const win = event.sender.getOwnerBrowserWindow();
  if (win) {
    win._isLogsWindow = true;
  }
});

ipcMain.handle("is-logs-window", (event) => {
  const win = event.sender.getOwnerBrowserWindow();
  return win?._isLogsWindow === true;
});

// Подписка на логи (только для logs-окна)
ipcMain.handle("subscribe-logs", (event) => {
  const win = event.sender.getOwnerBrowserWindow();
  if (!win) return () => {};
  const cb = (_event, entry) => {
    if (win.isDestroyed()) return;
    event.sender.send("log-entry", entry);
  };
  ipcMain.on("log-broadcast", cb);
  return () => ipcMain.removeListener("log-broadcast", cb);
});

// Открыть нативный диалог выбора файла
ipcMain.handle("open-file-dialog", async (_event, { title, filters, multiple }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || "Выберите файл",
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: filters || [],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false };
  return { success: true, paths: result.filePaths };
});

// Прочитать локальный файл как data URL (для превью)
function textureDest(accountId, kind) {
  const id = String(accountId || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  if (!id) throw new Error("Нет аккаунта");
  const name = kind === "cape" ? "cape.png" : "skin.png";
  return { id, dest: path.join(app.getPath("userData"), "textures", id, name) };
}

ipcMain.handle("save-account-texture", async (_event, { accountId, kind, sourcePath }) => {
  try {
    const { copyTextureFile, pngDataUrl } = require("./skins");
    const { dest } = textureDest(accountId, kind);
    copyTextureFile(sourcePath, dest);
    const buf = fs.readFileSync(dest);
    return { success: true, path: dest, dataUrl: pngDataUrl(buf) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("save-account-texture-bytes", async (_event, { accountId, kind, base64 }) => {
  try {
    const { writeTextureBuffer, pngDataUrl } = require("./skins");
    const { dest } = textureDest(accountId, kind);
    const buf = Buffer.from(String(base64 || ""), "base64");
    writeTextureBuffer(buf, dest);
    return { success: true, path: dest, dataUrl: pngDataUrl(buf) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("fetch-player-skin", async (_event, { accountId, username }) => {
  try {
    const { fetchSkinPng, writeTextureBuffer, pngDataUrl } = require("./skins");
    const { dest } = textureDest(accountId, "skin");
    const buf = await fetchSkinPng(username);
    writeTextureBuffer(buf, dest);
    return { success: true, path: dest, dataUrl: pngDataUrl(buf) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("remove-account-texture", async (_event, { accountId, kind }) => {
  try {
    const id = String(accountId || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
    const name = kind === "cape" ? "cape.png" : "skin.png";
    const dest = path.join(app.getPath("userData"), "textures", id, name);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("read-file-as-data-url", async (_event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return { success: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Сохранить data URL как файл
ipcMain.handle("save-data-url", async (_event, { dataUrl, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || "image.png",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (result.canceled || !result.filePath) return { success: false };
  try {
    const base64 = dataUrl.split(",")[1];
    fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
    return { success: true, filePath: result.filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Открыть папку с игрой (для отладки)
ipcMain.handle("open-game-dir", async (_event, profileName) => {
  const { ensureProfile } = require("./profiles");
  const { dir } = ensureProfile(app.getPath("userData"), profileName || "Default");
  shell.openPath(dir);
  return { success: true, dir };
});

// Получить детальную информацию о профиле
ipcMain.handle("get-profile-info", (_event, name) => {
  const { ensureProfile } = require("./profiles");
  const userData = app.getPath("userData");
  const { dir } = ensureProfile(userData, name || "Default");

  // Подсчитываем файлы и общий размер
  function dirSize(folder) {
    let total = 0;
    let files = 0;
    try {
      const entries = fs.readdirSync(folder, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(folder, e.name);
        if (e.isDirectory()) {
          const sub = dirSize(full);
          total += sub.size;
          files += sub.files;
        } else {
          total += fs.statSync(full).size;
          files++;
        }
      }
    } catch {}
    return { size: total, files };
  }

  const stats = dirSize(dir);

  // Версия Java
  let javaVersion = "не найдена";
  try {
    const out = execSync("java -version 2>&1", { encoding: "utf8" });
    const m = out.match(/version\s+"?(\d+)/);
    if (m) javaVersion = "v" + m[1];
  } catch {}

  return {
    success: true,
    info: {
      path: dir,
      size: stats.size,
      files: stats.files,
      java: javaVersion,
      system: os.platform() + " " + os.arch(),
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    },
  };
});

// ── IPC: профили ─────────────────────────────────────────────

ipcMain.handle("list-profiles", () => {
  const { listProfiles } = require("./profiles");
  return listProfiles(app.getPath("userData"));
});

ipcMain.handle("list-profile-content", (_event, name) => {
  const { listProfileContent } = require("./profiles");
  return listProfileContent(app.getPath("userData"), name || "Default");
});

ipcMain.handle("create-profile", (_event, name) => {
  const { ensureProfile } = require("./profiles");
  return ensureProfile(app.getPath("userData"), name);
});

ipcMain.handle("open-profile-folder", (_event, name) => {
  const { ensureProfile } = require("./profiles");
  const { dir } = ensureProfile(app.getPath("userData"), name || "Default");
  shell.openPath(dir);
  return { success: true, dir };
});

ipcMain.handle("open-profile-subfolder", (_event, { name, subfolder }) => {
  const { ensureProfile, PROFILE_SUBDIRS } = require("./profiles");
  const allowed = new Set([...(PROFILE_SUBDIRS || []), "logs", "crash-reports"]);
  const sub = String(subfolder || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "");
  if (!allowed.has(sub)) {
    return { success: false, error: "Недопустимая папка" };
  }
  const { dir } = ensureProfile(app.getPath("userData"), name || "Default");
  const target = path.join(dir, sub);
  if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });
  shell.openPath(target);
  return { success: true, dir: target };
});

ipcMain.handle("open-profiles-root", () => {
  const { getProfilesDir } = require("./profiles");
  const dir = getProfilesDir(app.getPath("userData"));
  shell.openPath(dir);
  return { success: true, dir };
});

// Переименование профиля
ipcMain.handle("rename-profile", async (_event, { oldName, newName }) => {
  const fs = require("fs");
  const { getProfilesDir, sanitizeProfileName } = require("./profiles");
  try {
    const safeOld = sanitizeProfileName(oldName);
    const safeNew = sanitizeProfileName(newName);
    if (!safeOld || !safeNew) {
      return { success: false, error: "Некорректное имя" };
    }
    if (safeOld === safeNew) {
      return { success: true };
    }
    const profilesDir = getProfilesDir(app.getPath("userData"));
    const oldPath = path.join(profilesDir, safeOld);
    const newPath = path.join(profilesDir, safeNew);
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: "Профиль не найден" };
    }
    if (fs.existsSync(newPath)) {
      return { success: false, error: "Профиль с таким именем уже существует" };
    }
    fs.renameSync(oldPath, newPath);
    return { success: true, oldName: safeOld, newName: safeNew };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Удаление профиля
ipcMain.handle("delete-profile", async (_event, name) => {
  const fs = require("fs");
  const { getProfilesDir, sanitizeProfileName } = require("./profiles");
  try {
    const safe = sanitizeProfileName(name);
    const profilesDir = getProfilesDir(app.getPath("userData"));
    const target = path.join(profilesDir, safe);
    if (!fs.existsSync(target)) {
      return { success: false, error: "Профиль не найден" };
    }
    fs.rmSync(target, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function safeDownloadName(name) {
  const base = path.basename(String(name || "mod.jar"));
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "");
  return cleaned || "mod.jar";
}

function downloadWithChromium(url, destPath) {
  const { net, session } = require("electron");
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: "GET",
      url,
      session: session.defaultSession,
      redirect: "follow",
    });
    request.setHeader("User-Agent", "AnLaunch/1.0.3 (https://github.com/Daniel-Ohlayan/AnLaunch)");
    request.setHeader("Accept", "*/*");
    const file = fs.createWriteStream(destPath);
    file.on("error", (err) => fail(err));
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try {
        request.abort();
      } catch {}
      file.close(() => {
        try {
          fs.unlinkSync(destPath);
        } catch {}
        reject(err);
      });
    };
    file.on("error", fail);
    request.on("response", (response) => {
      const code = response.statusCode;
      if (code !== 200) {
        fail(new Error(`Не удалось скачать файл (HTTP ${code})`));
        return;
      }
      response.on("data", (chunk) => file.write(chunk));
      response.on("end", () => {
        file.end(() => {
          if (settled) return;
          settled = true;
          resolve(destPath);
        });
      });
      response.on("error", fail);
    });
    request.on("error", fail);
    request.end();
  });
}

async function downloadModFile(url, destPath) {
  const { downloadFile } = require("./launcher");
  let lastErr = null;
  try {
    await downloadWithChromium(url, destPath);
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) return;
    try {
      fs.unlinkSync(destPath);
    } catch {}
    lastErr = new Error("Файл скачался пустым");
  } catch (err) {
    lastErr = err;
  }
  await downloadFile(url, destPath);
  if (!fs.existsSync(destPath) || !fs.statSync(destPath).size) {
    try {
      fs.unlinkSync(destPath);
    } catch {}
    throw lastErr || new Error("Файл скачался пустым");
  }
}

// Скачивание файла напрямую в папку профиля (mods, resourcepacks, shaderpacks, datapacks)
ipcMain.handle("download-mod-to-profile", async (_event, { profile, fileName, url, subfolder }) => {
  const { ensureProfile } = require("./profiles");
  try {
    if (!url) return { success: false, error: "Нет ссылки на файл Modrinth" };
    const { dir } = ensureProfile(app.getPath("userData"), profile || "Default");
    const targetDir = path.join(dir, subfolder || "mods");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, safeDownloadName(fileName));
    await downloadModFile(url, destPath);
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
});

// Удаление файла из папки профиля
ipcMain.handle("remove-mod-from-profile", async (_event, { profile, fileName, subfolder }) => {
  const { ensureProfile } = require("./profiles");
  try {
    const { dir } = ensureProfile(app.getPath("userData"), profile || "Default");
    const safeName = path.basename(String(fileName || ""));
    if (!safeName || safeName === "." || safeName === "..") {
      return { success: false, error: "Некорректное имя файла" };
    }
    const filePath = path.join(dir, subfolder || "mods", safeName);
    if (fs.existsSync(filePath)) {
      const st = fs.lstatSync(filePath);
      if (st.isDirectory()) fs.rmSync(filePath, { recursive: true, force: true });
      else fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: вход через Microsoft ────────────────────────────────

function sendAuthProgress(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth-progress", msg);
  }
}

ipcMain.handle("login-microsoft", async () => {
  const { loginMicrosoft } = require("./msauth");
  try {
    const account = await loginMicrosoft(mainWindow, sendAuthProgress);
    return { success: true, account };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("login-microsoft-code", async (_event, codeOrUrl) => {
  const { loginMicrosoftWithCode } = require("./msauth");
  try {
    const account = await loginMicrosoftWithCode(codeOrUrl, sendAuthProgress);
    return { success: true, account };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-microsoft-auth-url", () => {
  const { getAuthUrl } = require("./msauth");
  return { success: true, url: getAuthUrl() };
});

ipcMain.handle("open-microsoft-login", async () => {
  const { openMicrosoftLoginExternal } = require("./msauth");
  try {
    await openMicrosoftLoginExternal();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("refresh-microsoft", async (_event, refreshToken) => {
  const { refreshMicrosoft } = require("./msauth");
  try {
    const account = await refreshMicrosoft(refreshToken);
    return { success: true, account };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("stop-minecraft", () => {
  const { stopMinecraft } = require("./launcher");
  return stopMinecraft();
});

ipcMain.handle("is-game-running", () => {
  const { isGameRunning } = require("./launcher");
  return isGameRunning();
});

// ── IPC: запуск Minecraft ────────────────────────────────────

ipcMain.handle("launch-minecraft-real", async (_event, config) => {
  const { launchMinecraft } = require("./launcher");
  const { getSharedDir, resolveLaunchProfile } = require("./profiles");

  if (config.javaPath) {
    const { getJavaMajorVersion } = require("./javaFinder");
    if (!getJavaMajorVersion(config.javaPath)) {
      return {
        success: false,
        message: `Java не запускается по указанному пути: ${config.javaPath}`,
      };
    }
  }

  const userData = app.getPath("userData");
  const sharedDir = getSharedDir(userData);
  const resolved = resolveLaunchProfile(userData, config.profile);
  appendLog("info", `Игровой профиль: «${resolved.name}»`);

  try {
    const result = await launchMinecraft(
      { ...config, profile: resolved.name },
      config.javaPath || undefined,
      { sharedDir, gameDir: resolved.dir },
      (msg) => {
        appendLog("info", msg);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("launch-progress", msg);
        }
      }
    );
    return { ...result, profile: resolved.name };
  } catch (err) {
    console.error("Launch error:", err);
    const text = friendlyError(err);
    appendLog("error", text);
    return { success: false, message: text, profile: resolved.name };
  }
});

// ── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");
  console.log("AnLaunch starting…", isDev ? "DEV mode" : "PROD mode");

  try {
    initFolders();
  } catch (e) {
    console.error("initFolders error:", e);
  }

  createWindow();

  // ── АВТООБНОВЛЕНИЯ ───────────────────────────────────────────
  if (!isDev) {
    setupAutoUpdater();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── Автообновление через electron-updater ─────────────────────
function setupAutoUpdater() {
  if (!autoUpdater) return; // Не установлен — выходим

  // Настройка логирования
  autoUpdater.logger = {
    info: (msg) => console.log("[Updater]", msg),
    warn: (msg) => console.warn("[Updater]", msg),
    error: (msg) => console.error("[Updater]", msg),
    debug: () => {},
  };

  autoUpdater.autoDownload = true; // скачивать обновления автоматически
  autoUpdater.autoInstallOnAppQuit = true; // устанавливать при выходе

  // Уведомляем renderer при обновлениях
  autoUpdater.on("checking-for-update", () => {
    mainWindow?.webContents.send("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
    // Уведомление в системе
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: "Доступно обновление AnLaunch",
          body: `Версия ${info.version} загружается…`,
        }).show();
      }
    } catch {}
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-status", {
      status: "downloading",
      percent: progress.percent,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-status", {
      status: "ready",
      version: info.version,
    });
    // Спрашиваем пользователя
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Обновление готово",
        message: `AnLaunch v${info.version} загружен`,
        detail: "Перезапустите приложение для установки обновления.",
        buttons: ["Перезапустить", "Позже"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-status", {
      status: "error",
      error: err.message,
    });
    console.error("[Updater] Error:", err);
  });

  // Проверка обновлений при запуске (через 3 сек, чтобы окно успело открыться)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[Updater] Initial check failed:", err);
    });
  }, 3000);

  // Периодическая проверка каждые 6 часов
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    6 * 60 * 60 * 1000,
  );
}

// IPC для ручной проверки обновлений из настроек
ipcMain.handle("check-for-updates", async () => {
  if (!autoUpdater) {
    return { success: false, error: "Updater недоступен" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      success: true,
      updateAvailable: !!result,
      version: result?.updateInfo?.version,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});
