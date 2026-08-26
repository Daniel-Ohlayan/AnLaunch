// Менеджер профилей — создаёт отдельную папку для каждого профиля
// со структурой: mods, resourcepacks, shaderpacks, saves, config
// Расположение: <userData>/AnLaunch/profiles/<name>

const fs = require("fs");
const path = require("path");

const PROFILE_SUBDIRS = ["mods", "resourcepacks", "shaderpacks", "datapacks", "modpacks", "saves", "config", "screenshots"];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Windows-safe profile names. Cyrillic, Latin, digits, spaces, dots, `_` and `-` are allowed.
function sanitizeProfileName(value) {
  let name = String(value || "").trim();
  name = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  name = name.replace(/[^\p{L}\p{N}._ -]/gu, "_");
  name = name.replace(/[. ]+$/g, "").trim();
  if (!name || name === "." || name === "..") return "Default";

  // Windows reserves these device names even with an extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)) {
    name = `_${name}`;
  }
  return name.slice(0, 80);
}

// Базовая директория лаунчера внутри userData
function getRootDir(userDataPath) {
  const root = path.join(userDataPath, "AnLaunch");
  ensureDir(root);
  return root;
}

function getProfilesDir(userDataPath) {
  const dir = path.join(getRootDir(userDataPath), "profiles");
  ensureDir(dir);
  return dir;
}

// Общие файлы Minecraft (versions, libraries, assets) — общие для всех профилей
function getSharedDir(userDataPath) {
  const dir = path.join(getRootDir(userDataPath), "shared");
  ensureDir(dir);
  return dir;
}

// Создать/получить директорию профиля со всеми подпапками
function ensureProfile(userDataPath, profileName) {
  const safeName = sanitizeProfileName(profileName || "Default");
  const dir = path.join(getProfilesDir(userDataPath), safeName);
  ensureDir(dir);
  for (const sub of PROFILE_SUBDIRS) {
    ensureDir(path.join(dir, sub));
  }
  return { name: safeName, dir };
}

function findProfile(userDataPath, profileName) {
  const safeName = sanitizeProfileName(profileName || "");
  if (!safeName) return null;
  return listProfiles(userDataPath).find((p) => p.name === safeName) || null;
}

// Запуск НИКОГДА не создаёт новый профиль с другим именем.
// Берём выбранный, иначе уже существующий, и только при полном отсутствии — Default.
function resolveLaunchProfile(userDataPath, profileName) {
  const existing = listProfiles(userDataPath);
  const requested = sanitizeProfileName(profileName || "");
  const found = existing.find((p) => p.name === requested);
  if (found) {
    ensureProfile(userDataPath, found.name);
    return { name: found.name, dir: found.dir, created: false };
  }
  if (existing.length > 0) {
    const fallback = existing[0];
    ensureProfile(userDataPath, fallback.name);
    return { name: fallback.name, dir: fallback.dir, created: false };
  }
  const created = ensureProfile(userDataPath, requested || "Default");
  return { ...created, created: true };
}

// Список всех профилей с содержимым
function listProfiles(userDataPath) {
  const profilesDir = getProfilesDir(userDataPath);
  let names = [];
  try {
    names = fs
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    names = [];
  }

  return names.map((name) => {
    const dir = path.join(profilesDir, name);
    const countFiles = (sub) => {
      try {
        return fs.readdirSync(path.join(dir, sub)).filter((f) => !f.startsWith(".")).length;
      } catch {
        return 0;
      }
    };
    return {
      name,
      dir,
      mods: countFiles("mods"),
      resourcepacks: countFiles("resourcepacks"),
      shaderpacks: countFiles("shaderpacks"),
      saves: countFiles("saves"),
    };
  });
}

module.exports = {
  ensureDir,
  getRootDir,
  getProfilesDir,
  getSharedDir,
  ensureProfile,
  findProfile,
  resolveLaunchProfile,
  sanitizeProfileName,
  listProfiles,
  PROFILE_SUBDIRS,
};
