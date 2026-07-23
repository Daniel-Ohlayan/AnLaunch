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
  const fabricVersionDir = path.join(sharedDir, "versions", quiltId);
  const versionJsonPath = path.join(fabricVersionDir, `${quiltId}.json`);
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

  ensureDir(fabricVersionDir);
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
    throw new Error(`Forge не найден для Minecraft ${mcVersion}`);
  }

  const forgeId = `${mcVersion}-forge-${forgeVersion}`;
  const forgeDir = path.join(sharedDir, "versions", forgeId);
  const versionJsonPath = path.join(forgeDir, `${forgeId}.json`);

  if (fs.existsSync(versionJsonPath)) {
    return { id: forgeId };
  }

  log(`Скачивание Forge ${forgeVersion}…`);
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
  const installerPath = path.join(sharedDir, "versions", "forge-installer.jar");
  await downloadFile(installerUrl, installerPath);

  log("Установка Forge через installer…");
  try {
    execSync(
      `"${javaPath}" -jar "${installerPath}" --installClient --target "${sharedDir}"`,
      { stdio: "pipe", timeout: 180000 }
    );
  } catch (e) {
    throw new Error(`Forge installer не сработал: ${e.message}`);
  }

  if (!fs.existsSync(versionJsonPath)) {
    throw new Error("Forge installer не создал профиль");
  }
  return { id: forgeId };
}

// ── NEOFORGE ─────────────────────────────────────────────────

async function installNeoForge(mcVersion, sharedDir, javaPath, log) {
  log(`Установка NeoForge для ${mcVersion}…`);

  const meta = await downloadJSON(
    "https://maven.neoforged.net/api/maven-central/net/neoforged/neoforge/maven-metadata.json"
  ).catch(() => null);

  if (!meta || !meta.versions) {
    throw new Error("Не удалось получить список NeoForge");
  }

  // Ищем совместимую версию
  const candidates = meta.versions
    .filter((v) => {
      // NeoForge 1.20.4+ имеет формат 21.0.x, а для 1.20.1/1.20.2 — 47.0.x
      // mcVersion типа "1.21.4" → ищем "<с>.<что-то>"
      if (mcVersion.startsWith("1.20.1")) return v.startsWith("47.");
      if (mcVersion.startsWith("1.20.2")) return v.startsWith("48.");
      if (mcVersion.startsWith("1.20.4")) return v.startsWith("20.4");
      const parts = mcVersion.split(".");
      if (parts.length >= 2) {
        const major = parseInt(parts[1], 10);
        return v.startsWith(`${parts[0]}.${major}`) || v.startsWith(`${major}.0`);
      }
      return false;
    })
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (candidates.length === 0) {
    throw new Error(`NeoForge не найден для ${mcVersion}`);
  }

  const nfVersion = candidates[0];
  const nfId = `neoforge-${nfVersion}`;
  const nfDir = path.join(sharedDir, "versions", nfId);
  const versionJsonPath = path.join(nfDir, `${nfId}.json`);

  if (fs.existsSync(versionJsonPath)) {
    return { id: nfId };
  }

  log(`Скачивание NeoForge ${nfVersion}…`);
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nfVersion}/neoforge-${nfVersion}-installer.jar`;
  const installerPath = path.join(sharedDir, "versions", "neoforge-installer.jar");
  await downloadFile(installerUrl, installerPath);

  log("Установка NeoForge через installer…");
  try {
    execSync(
      `"${javaPath}" -jar "${installerPath}" --installClient --target "${sharedDir}"`,
      { stdio: "pipe", timeout: 180000 }
    );
  } catch (e) {
    throw new Error(`NeoForge installer не сработал: ${e.message}`);
  }

  if (!fs.existsSync(versionJsonPath)) {
    throw new Error("NeoForge installer не создал профиль");
  }
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
