const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execSync } = require("child_process");

let autoUpdater = null;
try {
  const { autoUpdater: upd } = require("electron-updater");
  autoUpdater = upd;
} catch {
  console.warn("electron-updater not available — auto-update disabled");
}

let mainWindow = null;
let isDev = false;

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  if (mainWindow) {
    dialog.showErrorBox("Ошибка AnLaunch", error.stack || error.message);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "AnLaunch — Minecraft Launcher",
    icon: path.join(__dirname, "../public/icon.png"),
    frame: true,
    backgroundColor: "#06070a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

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
    logsWindow.focus();
    return logsWindow;
  }
  logsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    title: "AnLaunch — Логи запуска",
    backgroundColor: "#0a0a0f",
    frame: true,
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--is-logs-window"],
    },
  });
  logsWindow.setMenuBarVisibility(false);
  logsWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
    query: { logs: "1" },
  });
  logsWindow.on("closed", () => {
    logsWindow = null;
  });
  return logsWindow;
}

// Создаём структуру папок при первом запуске (как при установке)
function initFolders() {
  const { getRootDir, getProfilesDir, getSharedDir, ensureProfile } = require("./profiles");
  const userData = app.getPath("userData");
  getRootDir(userData);
  getProfilesDir(userData);
  getSharedDir(userData);
  ensureProfile(userData, "Default"); // профиль по умолчанию
}

// ── IPC: базовое ─────────────────────────────────────────────

ipcMain.handle("is-electron", () => true);
ipcMain.handle("get-user-data-path", () => app.getPath("userData"));

ipcMain.handle("check-java", () => {
  const { execSync } = require("child_process");
  try {
    const output = execSync("java -version 2>&1", { encoding: "utf8" });
    const match = output.match(/version\s+"?(\d+[\d._]*)"?/i);
    return { exists: true, path: "java", version: match ? match[1] : "unknown" };
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
  createLogsWindow();
  return { success: true };
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

// Скачивание файла напрямую в папку профиля (mods, resourcepacks, shaderpacks, datapacks)
ipcMain.handle("download-mod-to-profile", async (_event, { profile, fileName, url, subfolder }) => {
  const https = require("https");
  const http = require("http");
  const { ensureProfile } = require("./profiles");

  try {
    const { dir } = ensureProfile(app.getPath("userData"), profile || "Default");
    const targetDir = path.join(dir, subfolder || "mods");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, fileName);

    await new Promise((resolve, reject) => {
      const download = (u, redirects = 0) => {
        if (redirects > 5) return reject(new Error("Слишком много редиректов"));
        const proto = u.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destPath);
        proto
          .get(u, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              file.close();
              fs.unlink(destPath, () => {});
              return download(res.headers.location, redirects + 1);
            }
            if (res.statusCode !== 200) {
              file.close();
              fs.unlink(destPath, () => {});
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            res.pipe(file);
            file.on("finish", () => file.close(resolve));
          })
          .on("error", (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
          });
      };
      download(url);
    });

    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Удаление файла из папки профиля
ipcMain.handle("remove-mod-from-profile", async (_event, { profile, fileName, subfolder }) => {
  const { ensureProfile } = require("./profiles");
  try {
    const { dir } = ensureProfile(app.getPath("userData"), profile || "Default");
    const filePath = path.join(dir, subfolder || "mods", fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── IPC: вход через Microsoft ────────────────────────────────

ipcMain.handle("login-microsoft", async () => {
  const { loginMicrosoft } = require("./msauth");
  try {
    const account = await loginMicrosoft(mainWindow, (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auth-progress", msg);
      }
    });
    return { success: true, account };
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

// ── IPC: запуск Minecraft ────────────────────────────────────

ipcMain.handle("launch-minecraft-real", async (_event, config) => {
  const { execSync } = require("child_process");
  const { launchMinecraft } = require("./launcher");
  const { getSharedDir, ensureProfile } = require("./profiles");

  let javaPath = config.javaPath || "java";
  try {
    execSync(`"${javaPath}" -version 2>&1`, { encoding: "utf8" });
  } catch {
    return {
      success: false,
      message: config.javaPath
        ? `Java не запускается по указанному пути: ${config.javaPath}`
        : "Java не найдена. Установите Java или укажите путь в настройках AnLaunch.",
    };
  }

  const userData = app.getPath("userData");
  const sharedDir = getSharedDir(userData);
  const { dir: gameDir } = ensureProfile(userData, config.profile || "Default");

  try {
    const result = await launchMinecraft(config, javaPath, { sharedDir, gameDir }, (msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("launch-progress", msg);
      }
    });
    return result;
  } catch (err) {
    console.error("Launch error:", err);
    return { success: false, message: `Ошибка запуска: ${err.message}` };
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
