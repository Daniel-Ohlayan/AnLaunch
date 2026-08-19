// Установка модлоадеров (Fabric, Forge, NeoForge, Quilt)
// Реально качает и ставит загрузчик с библиотеками

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { spawn, execSync } = require("child_process");

function getProto(url) {
  return url.startsWith("https") ? https : http;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDirSync(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      try { fs.copyFileSync(srcPath, destPath); } catch {}
    }
  }
}

function downloadFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    getProto(url)
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(destPath, () => {});
          return resolve(downloadFile(res.headers.location, destPath, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          return reject(new Error(`HTTP ${res.statusCode} для ${url}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(destPath)));
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

function downloadJSON(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    getProto(url)
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadJSON(res.headers.location, redirects + 1));
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Превращает groupId:artifactId:version в Maven-путь
function mavenPath(name) {
  const parts = name.split(":");
  if (parts.length < 3) return null;
  const [group, artifact, version, classifier] = parts;
  const groupPath = group.replace(/\./g, "/");
  const fileName = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
  return {
    path: `${groupPath}/${artifact}/${version}/${fileName}`,
    name: `${artifact}-${version}${classifier ? "-" + classifier : ""}.jar`,
  };
}

// Скачивает библиотеку из Maven-репозитория
async function downloadMavenLib(lib, librariesDir, log) {
  const m = mavenPath(lib.name);
  if (!m) {
    log(`Пропускаю невалидную библиотеку: ${lib.name}`);
    return false;
  }
  const baseUrl = lib.url || "https://maven.fabricmc.net/";
  const libPath = path.join(librariesDir, m.path);
  if (fs.existsSync(libPath)) return true;
  const url = baseUrl + m.path;
  try {
    await downloadFile(url, libPath);
    return true;
  } catch (e) {
    log(`Не удалось скачать ${lib.name}: ${e.message}`);
    return false;
  }
}

// Простая утилита для вывода ошибок: для Windows "Command failed" -> читаемая причина.
function wrapExec(cmd, opts, log) {
  const { execSync } = require("child_process");
  try {
    return execSync(cmd, { ...opts, stdio: "pipe" });
  } catch (e) {
    const msg = (e.stderr || "").toString().trim() || e.message || String(e);
    log(`Installer error: ${msg}`);
    throw new Error(msg);
  }
}

// ── Распаковка version.json из installer.jar БЕЗ внешних библиотек ──
// Installer-файлы Forge/NeoForge — это обычные ZIP-архивы. Внутри лежит
// version.json (или install_profile.json с versionInfo). Эта функция читает
// ZIP вручную с помощью встроенного zlib — не зависит от adm-zip, поэтому
// работает и в dev, и в упакованном .exe.

function extractVersionJsonFromInstaller(buffer) {
  // 1. Находим "End of Central Directory" (EOCD) — сигнатура 0x06054b50
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) {
    eocd--;
  }
  if (eocd < 0) return null;

  const cdEntries = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);

  // 2. Проходим по записям центрального каталога, собираем содержимое нужных файлов
  let offset = cdOffset;
  const zlib = require("zlib");

  // Хранилище: имя файла -> содержимое (raw data после распаковки)
  const entries = {};

  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);

    // Читаем все файлы, которые могут понадобиться
    if (
      name === "version.json" ||
      name === "install_profile.json" ||
      name.endsWith("/version.json")
    ) {
      const lSig = buffer.readUInt32LE(localOffset);
      if (lSig === 0x04034b50) {
        const lNameLen = buffer.readUInt16LE(localOffset + 26);
        const lExtraLen = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + lNameLen + lExtraLen;
        const compData = buffer.subarray(dataStart, dataStart + compSize);

        try {
          let raw;
          if (method === 0) raw = compData;
          else if (method === 8) raw = zlib.inflateRawSync(compData);
          if (raw) entries[name] = raw;
        } catch {
          // пропускаем
        }
      }
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  // 3. Разбираем найденные файлы
  if (entries["version.json"]) {
    try {
      return JSON.parse(entries["version.json"].toString("utf8"));
    } catch {
      // fallthrough
    }
  }

  if (entries["install_profile.json"]) {
    try {
      const profile = JSON.parse(entries["install_profile.json"].toString("utf8"));
      if (profile.versionInfo) return profile.versionInfo;

      // Новые версии: profile.json указывает путь к version.json
      if (profile.json) {
        const jsonPath = profile.json.replace(/^\.\//, "");
        if (entries[jsonPath]) {
          return JSON.parse(entries[jsonPath].toString("utf8"));
        }
        if (entries["version.json"]) {
          return JSON.parse(entries["version.json"].toString("utf8"));
        }
      }
    } catch {
      // fallthrough
    }
  }

  return null;
}

// Пытается прочитать version.json из installer.jar — сначала через adm-zip
// (если установлен), потом через собственный парсер ZIP.
function readInstallerVersionJson(installerPath, log) {
  const buffer = fs.readFileSync(installerPath);

  // Попытка 1: adm-zip (если доступен в упаковке)
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);

    // 1a. version.json в корне
    const entry = zip.getEntry("version.json");
    if (entry) {
      return JSON.parse(entry.getData().toString("utf8"));
    }

    // 1b. install_profile.json → versionInfo на верхнем уровне
    const profileEntry = zip.getEntry("install_profile.json");
    if (profileEntry) {
      const profile = JSON.parse(profileEntry.getData().toString("utf8"));
      if (profile.versionInfo) return profile.versionInfo;

      // 1c. install_profile.json → поле "json" = путь к version.json внутри jar
      if (profile.json) {
        const jsonPath = profile.json.replace(/^\.\//, "");
        const jsonEntry = zip.getEntry(jsonPath);
        if (jsonEntry) {
          return JSON.parse(jsonEntry.getData().toString("utf8"));
        }
        // также пробуем "version.json" если путь указан иначе
        const altEntry = zip.getEntry("version.json");
        if (altEntry) {
          return JSON.parse(altEntry.getData().toString("utf8"));
        }
      }
    }
  } catch (e) {
    log(`adm-zip недоступен (${e.message}), использую встроенный распаковщик`);
  }

  // Попытка 2: собственный парсер (не зависит ни от чего)
  // Он ищет version.json и install_profile.json; для install_profile.json
  // дополнительно обрабатывает поля versionInfo и json (путь к профилю).
  const parsed = extractVersionJsonFromInstaller(buffer);
  if (parsed) return parsed;
  throw new Error("Не удалось извлечь version.json из installer.jar");
}

// ── FABRIC ────────────────────────────────────────────────────

async function installFabric(mcVersion, sharedDir, log) {
  log(`Установка Fabric для ${mcVersion}…`);

  // Получаем список загрузчиков для версии
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
  const list = await downloadJSON(url);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`Fabric не поддерживает Minecraft ${mcVersion}`);
  }

  // Берём стабильный
  const stable = list.find((x) => x.loader?.stable) || list[0];
  const loaderVersion = stable.loader.version;
  const fabricId = `fabric-loader-${mcVersion}-${loaderVersion}`;
  const fabricVersionDir = path.join(sharedDir, "versions", fabricId);
  const versionJsonPath = path.join(fabricVersionDir, `${fabricId}.json`);
  const librariesDir = path.join(sharedDir, "libraries");

  // Если уже установлен, возвращаем
  if (fs.existsSync(versionJsonPath)) {
    return { id: fabricId };
  }

  // Качаем полный профиль Fabric (включает libraries и mainClass)
  log(`Скачивание профиля Fabric ${loaderVersion}…`);
  const profile = await downloadJSON(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
  );

  // Качаем все библиотеки Fabric
  const libraries = profile.libraries || [];
  log(`Скачивание ${libraries.length} библиотек Fabric…`);
  for (const lib of libraries) {
    await downloadMavenLib(lib, librariesDir, log);
  }

  ensureDir(fabricVersionDir);

  // Создаём version.json для Fabric
  const versionData = {
    id: fabricId,
    inheritsFrom: mcVersion,
    releaseTime: profile.releaseTime || new Date().toISOString(),
    time: profile.time || new Date().toISOString(),
    type: "release",
    mainClass: profile.mainClass,
    libraries: libraries,
    arguments: profile.arguments || { game: [], jvm: [] },
  };
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

  return { id: fabricId };
}

// ── QUILT ────────────────────────────────────────────────────

async function installQuilt(mcVersion, sharedDir, log) {
  log(`Установка Quilt для ${mcVersion}…`);

  const list = await downloadJSON(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`Quilt не поддерживает Minecraft ${mcVersion}`);
  }

  const stable = list.find((x) => x.loader?.stable) || list[0];
  const loaderVersion = stable.loader.version;
  const quiltId = `quilt-loader-${mcVersion}-${loaderVersion}`;
  const quiltVersionDir = path.join(sharedDir, "versions", quiltId);
  const versionJsonPath = path.join(quiltVersionDir, `${quiltId}.json`);
  const librariesDir = path.join(sharedDir, "libraries");

  if (fs.existsSync(versionJsonPath)) {
    return { id: quiltId };
  }

  log(`Скачивание профиля Quilt ${loaderVersion}…`);
  const profile = await downloadJSON(
    `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
  );

  const libraries = profile.libraries || [];
  log(`Скачивание ${libraries.length} библиотек Quilt…`);
  for (const lib of libraries) {
    await downloadMavenLib(lib, librariesDir, log);
  }

  // Сохраняем version.json с правильными путями
  ensureDir(quiltVersionDir);
  const versionData = {
    id: quiltId,
    inheritsFrom: mcVersion,
    releaseTime: profile.releaseTime || new Date().toISOString(),
    time: profile.time || new Date().toISOString(),
    type: "release",
    mainClass: profile.mainClass,
    libraries: libraries,
    arguments: profile.arguments || { game: [], jvm: [] },
  };
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

  return { id: quiltId };
}

// ── FORGE ────────────────────────────────────────────────────
// Устанавливается НЕ запуском installer (он требует Java 8 и часто падает),
// а извлечением version.json прямо из installer.jar через adm-zip.
// Это надёжно работает для ВСЕХ версий Forge (1.7–26.x).

async function installForge(mcVersion, sharedDir, javaPath, log) {
  log(`Установка Forge для ${mcVersion}…`);

  const promo = await downloadJSON(
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
  ).catch(() => null);

  if (!promo) throw new Error("Не удалось получить список версий Forge");

  let forgeVersion = null;
  const recKey = `${mcVersion}-recommended`;
  const latKey = `${mcVersion}-latest`;
  if (promo.promos[recKey]) forgeVersion = promo.promos[recKey];
  else if (promo.promos[latKey]) forgeVersion = promo.promos[latKey];

  if (!forgeVersion) {
    throw new Error(`Forge не поддерживает Minecraft ${mcVersion}. Рекомендую Fabric.`);
  }

  const forgeId = `${mcVersion}-forge-${forgeVersion}`;
  const forgeDir = path.join(sharedDir, "versions", forgeId);
  const versionJsonPath = path.join(forgeDir, `${forgeId}.json`);

  if (fs.existsSync(versionJsonPath)) {
    return { id: forgeId };
  }

  log(`Скачивание Forge ${forgeVersion}…`);
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
  const installerPath = path.join(sharedDir, "installers", `forge-${mcVersion}-${forgeVersion}-installer.jar`);
  await downloadFile(installerUrl, installerPath);

  // Извлекаем version.json из installer jar (через adm-zip или встроенный парсер)
  const versionData = readInstallerVersionJson(installerPath, log);

  // Приводим id к нашему формату
  versionData.id = forgeId;
  versionData.inheritsFrom = mcVersion;
  ensureDir(forgeDir);
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

  // Скачиваем все библиотеки Forge по ссылкам из version.json
  const librariesDir = path.join(sharedDir, "libraries");
  const libs = versionData.libraries || [];
  log(`Скачивание ${libs.length} библиотек Forge…`);
  let downloaded = 0;
  for (const lib of libs) {
    if (lib.downloads && lib.downloads.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (!fs.existsSync(libPath)) {
        try {
          await downloadFile(lib.downloads.artifact.url, libPath);
          downloaded++;
        } catch (e) {
          // Могут быть 404 — пропускаем
        }
      }
    }
  }
  log(`Загружено библиотек Forge: ${downloaded}`);

  log(`Forge ${forgeVersion} установлен ✓`);
  return { id: forgeId };
}

function findVersionProfile(root, hints) {
  const versionsDir = path.join(root, "versions");
  if (!fs.existsSync(versionsDir)) return null;
  const dirs = fs.readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      hints.some((hint) =>
        name === hint || name.startsWith(hint + "-") || name.includes(hint)
      )
    )
    .sort()
    .reverse();

  for (const id of dirs) {
    if (fs.existsSync(path.join(versionsDir, id, `${id}.json`))) return id;
  }
  return null;
}

// ── NEOFORGE ─────────────────────────────────────────────────

async function installNeoForge(mcVersion, sharedDir, javaPath, log) {
  log(`Установка NeoForge для ${mcVersion}…`);

  // Новый API NeoForge (с 2023): /api/maven/v2/versions/releases/net/neoforged/neoforge
  const api = "https://maven.neoforged.net/api/maven/v2/versions/releases/net/neoforged/neoforge";
  let versions = [];
  try {
    const data = await downloadJSON(api);
    versions = Array.isArray(data) ? data : (data.versions || []);
  } catch (err) {
    log(`NeoForge API недоступно (${err.message}). Попробуйте Fabric.`);
    throw new Error("NeoForge API недоступно. Попробуйте Fabric.");
  }

  if (versions.length === 0) throw new Error("NeoForge не поддерживает эту версию Minecraft");

  const mcMajor = String(parseInt(mcVersion.split(".")[1]));
  const matches = versions.filter((v) => {
    const parts = String(v).split(".");
    return parts[0] === mcMajor || parts[0] === mcVersion.replace(/\./g, ".");
  });
  if (matches.length === 0) throw new Error(`NeoForge не найден для ${mcVersion}`);
  const nfVersion = matches[matches.length - 1];
  const nfId = `neoforge-${nfVersion}`;
  const nfDir = path.join(sharedDir, "versions", nfId);
  const versionJsonPath = path.join(nfDir, `${nfId}.json`);

  if (fs.existsSync(versionJsonPath)) {
    return { id: nfId };
  }

  log(`Скачивание NeoForge ${nfVersion}…`);
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nfVersion}/neoforge-${nfVersion}-installer.jar`;
  const installerPath = path.join(sharedDir, "installers", `neoforge-${nfVersion}-installer.jar`);
  await downloadFile(installerUrl, installerPath);

  // Извлекаем version.json из installer jar (без запуска Java)
  const versionData = readInstallerVersionJson(installerPath, log);

  versionData.id = nfId;
  versionData.inheritsFrom = mcVersion;
  ensureDir(nfDir);
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

  // Скачиваем библиотеки NeoForge
  const librariesDir = path.join(sharedDir, "libraries");
  const libs = versionData.libraries || [];
  log(`Скачивание ${libs.length} библиотек NeoForge…`);
  let downloaded = 0;
  for (const lib of libs) {
    if (lib.downloads && lib.downloads.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (!fs.existsSync(libPath)) {
        try {
          await downloadFile(lib.downloads.artifact.url, libPath);
          downloaded++;
        } catch (e) {
          // 404 или недоступно — пропускаем
        }
      }
    }
  }
  log(`Загружено библиотек NeoForge: ${downloaded}`);

  log(`NeoForge ${nfVersion} установлен ✓`);
  return { id: nfId };
}

// Главная функция
async function installLoader(loaderType, mcVersion, sharedDir, javaPath, onProgress) {
  const log = onProgress || (() => {});
  if (loaderType === "vanilla") return null;

  switch (loaderType) {
    case "fabric":
      return installFabric(mcVersion, sharedDir, log);
    case "quilt":
      return installQuilt(mcVersion, sharedDir, log);
    case "forge":
      return installForge(mcVersion, sharedDir, javaPath, log);
    case "neoforge":
      return installNeoForge(mcVersion, sharedDir, javaPath, log);
    default:
      throw new Error(`Неизвестный загрузчик: ${loaderType}`);
  }
}

module.exports = { installLoader };
