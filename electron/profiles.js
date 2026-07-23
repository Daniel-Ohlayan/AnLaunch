// Менеджер профилей — создаёт отдельную папку для каждого профиля
// со структурой: mods, resourcepacks, shaderpacks, saves, config
// Расположение: <userData>/AnLaunch/profiles/<name>

const fs = require("fs");
const path = require("path");

const PROFILE_SUBDIRS = ["mods", "resourcepacks", "shaderpacks", "datapacks", "modpacks", "saves", "config", "screenshots"];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  const safeName = (profileName || "default").replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const dir = path.join(getProfilesDir(userDataPath), safeName);
  ensureDir(dir);
  for (const sub of PROFILE_SUBDIRS) {
    ensureDir(path.join(dir, sub));
  }
  return { name: safeName, dir };
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
  listProfiles,
  PROFILE_SUBDIRS,
};
