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

function downloadText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    getProto(url)
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadText(res.headers.location, redirects + 1));
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseMavenVersions(xml) {
  const versions = [];
  const re = /<version>([^<]+)<\/version>/g;
  let m;
  while ((m = re.exec(xml))) versions.push(m[1].trim());
  return versions;
}

function mcMinorParts(mcVersion) {
  const parts = String(mcVersion).split(".").map((n) => parseInt(n, 10));
  if (parts[0] === 1) return { major: 1, minor: parts[1] || 0, patch: parts[2] || 0 };
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function isLegacyForgeMc(mcVersion) {
  const p = mcMinorParts(mcVersion);
  return p.major === 1 && p.minor < 13;
}

function javaMajorForMc(mcVersion) {
  if (/^26(\.|$)/.test(mcVersion)) return 25;
  const p = mcMinorParts(mcVersion);
  const minor = p.major === 1 ? p.minor : p.major;
  if (minor >= 21) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

function pickInstallerJava(javaPath, mcVersion, log) {
  const { findAllJavaInstalls, pickJavaForVersion, getJavaMajorVersion } = require("./javaFinder");
  const required = javaMajorForMc(mcVersion);
  if (javaPath) {
    const v = getJavaMajorVersion(javaPath);
    if (v && v >= required) return javaPath;
    if (v) log(`Java из настроек (${v}) ниже ${required}+, ищу другую…`);
  }
  const installs = findAllJavaInstalls();
  const pick = pickJavaForVersion(installs, required);
  if (!pick || pick.version < required) {
    const have = installs.length ? installs.map((i) => `Java ${i.version}`).join(", ") : "не найдена";
    throw new Error(
      `Для Forge/NeoForge ${mcVersion} нужна Java ${required}+ (сейчас: ${have}). Установите Adoptium Temurin ${required}.`
    );
  }
  log(`Installer Java ${pick.version}: ${pick.path}`);
  return pick.path;
}

async function ensureVanillaClient(mcVersion, sharedDir, log) {
  const dir = path.join(sharedDir, "versions", mcVersion);
  const jsonPath = path.join(dir, `${mcVersion}.json`);
  const jarPath = path.join(dir, `${mcVersion}.jar`);
  if (!fs.existsSync(jsonPath)) {
    log(`Скачивание version.json ${mcVersion}…`);
    const manifest = await downloadJSON("https://launchermeta.mojang.com/mc/game/version_manifest.json");
    const info = (manifest.versions || []).find((v) => v.id === mcVersion);
    if (!info) throw new Error(`Minecraft ${mcVersion} не найден`);
    const details = await downloadJSON(info.url);
    ensureDir(dir);
    fs.writeFileSync(jsonPath, JSON.stringify(details));
  }
  if (!fs.existsSync(jarPath)) {
    const details = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!details.downloads?.client?.url) throw new Error(`Нет client.jar для ${mcVersion}`);
    log(`Скачивание client.jar ${mcVersion}…`);
    await downloadFile(details.downloads.client.url, jarPath);
  }
}

function ensureLauncherProfiles(targetDir) {
  const profilesPath = path.join(targetDir, "launcher_profiles.json");
  if (!fs.existsSync(profilesPath)) {
    fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {}, selectedProfile: "" }));
  }
}

function extractInstallerMaven(installerPath, librariesDir, log) {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(installerPath);
    let n = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const name = entry.entryName.replace(/\\/g, "/");
      if (!name.startsWith("maven/") || name.endsWith("/")) continue;
      const rel = name.slice("maven/".length);
      if (!rel) continue;
      const dest = path.join(librariesDir, rel);
      if (fs.existsSync(dest)) continue;
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, entry.getData());
      n++;
    }
    if (n) log(`Из installer извлечено ${n} maven-файлов`);
  } catch (e) {
    log(`Не удалось извлечь maven из installer: ${e.message}`);
  }
}

function spawnInstaller(javaBin, args, cwd, log) {
  return new Promise((resolve, reject) => {
    log(`java ${args.join(" ")}`);
    const child = spawn(javaBin, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, JAVA_TOOL_OPTIONS: "-Djava.awt.headless=true" },
    });
    let err = "";
    child.stdout.on("data", (d) => {
      const t = d.toString().trim();
      if (t) log(t.length > 400 ? `${t.slice(0, 400)}…` : t);
    });
    child.stderr.on("data", (d) => {
      const t = d.toString();
      err += t;
      const line = t.trim();
      if (line) log(line.length > 400 ? `${line.slice(0, 400)}…` : line);
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error("Installer завис (таймаут 5 мин)"));
    }, 5 * 60 * 1000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Installer завершился с кодом ${code}${err.trim() ? ": " + err.trim().slice(-400) : ""}`));
    });
  });
}

async function runForgeInstaller(javaBin, installerPath, targetDir, log) {
  ensureDir(targetDir);
  ensureLauncherProfiles(targetDir);
  const attempts = [
    ["-Djava.awt.headless=true", "-jar", installerPath, "--installClient", targetDir],
    ["-Djava.awt.headless=true", "-jar", installerPath, "--install-client", targetDir],
  ];
  let lastErr;
  for (const args of attempts) {
    try {
      await spawnInstaller(javaBin, args, targetDir, log);
      return;
    } catch (e) {
      lastErr = e;
      log(`Попытка installer не удалась: ${e.message}`);
    }
  }
  throw lastErr || new Error("Не удалось запустить Forge/NeoForge installer");
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

function findVersionProfile(root, hints) {
  const versionsDir = path.join(root, "versions");
  if (!fs.existsSync(versionsDir)) return null;
  const dirs = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      hints.some((hint) => name === hint || name.startsWith(hint + "-") || name.toLowerCase().includes(String(hint).toLowerCase()))
    )
    .sort()
    .reverse();

  for (const id of dirs) {
    if (fs.existsSync(path.join(versionsDir, id, `${id}.json`))) return id;
  }
  return null;
}

async function downloadVersionLibraries(versionData, librariesDir, log) {
  const libs = versionData.libraries || [];
  log(`Скачивание ${libs.length} библиотек…`);
  let downloaded = 0;
  for (const lib of libs) {
    const art = lib.downloads && lib.downloads.artifact;
    if (art && art.path && art.url) {
      const libPath = path.join(librariesDir, art.path);
      if (fs.existsSync(libPath)) continue;
      try {
        await downloadFile(art.url, libPath);
        downloaded++;
      } catch {
        /* 404 — часто лежит внутри installer */
      }
    } else if (lib.name && lib.url) {
      await downloadMavenLib(lib, librariesDir, log);
    }
  }
  log(`Докачано библиотек: ${downloaded}`);
}

async function resolveForgeInstallerSpec(mcVersion, log) {
  const xml = await downloadText(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"
  );
  const versions = parseMavenVersions(xml);
  const matches = versions.filter((v) => v === mcVersion || v.startsWith(`${mcVersion}-`));
  if (!matches.length) {
    throw new Error(`Forge не поддерживает Minecraft ${mcVersion}.`);
  }

  let chosen = matches[matches.length - 1];
  const promo = await downloadJSON(
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json"
  ).catch(() => null);
  if (promo && promo.promos) {
    const rec = promo.promos[`${mcVersion}-recommended`];
    const lat = promo.promos[`${mcVersion}-latest`];
    const recFull = rec && matches.find((v) => v === `${mcVersion}-${rec}` || v.startsWith(`${mcVersion}-${rec}`));
    const latFull = lat && matches.find((v) => v === `${mcVersion}-${lat}` || v.startsWith(`${mcVersion}-${lat}`));
    chosen = recFull || latFull || chosen;
  }

  log(`Forge installer: ${chosen}`);
  return {
    idHint: chosen,
    url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${chosen}/forge-${chosen}-installer.jar`,
    file: `forge-${chosen}-installer.jar`,
    hints: [chosen, `${mcVersion}-forge`, "forge"],
  };
}

async function resolveNeoForgeInstallerSpec(mcVersion, log) {
  const prefix = mcVersion.startsWith("1.") ? `${mcVersion.slice(2)}.` : `${mcVersion}.`;

  const neoXml = await downloadText(
    "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml"
  ).catch(() => null);
  const neoVersions = neoXml ? parseMavenVersions(neoXml) : [];
  const neoMatches = neoVersions.filter((v) => v.startsWith(prefix) && !String(v).includes("beta"));
  const neoAny = neoVersions.filter((v) => v.startsWith(prefix));
  const pick = (neoMatches.length ? neoMatches : neoAny).pop();

  if (pick) {
    log(`NeoForge installer: ${pick}`);
    return {
      idHint: pick,
      url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${pick}/neoforge-${pick}-installer.jar`,
      file: `neoforge-${pick}-installer.jar`,
      hints: [`neoforge-${pick}`, pick, "neoforge"],
    };
  }

  const forgeXml = await downloadText(
    "https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml"
  ).catch(() => null);
  const forgeVersions = forgeXml ? parseMavenVersions(forgeXml) : [];
  const forgeMatches = forgeVersions.filter((v) => v.startsWith(`${mcVersion}-`));
  const forgePick = forgeMatches.pop();
  if (!forgePick) {
    throw new Error(`NeoForge не найден для Minecraft ${mcVersion}.`);
  }
  log(`NeoForge (legacy artifact) installer: ${forgePick}`);
  return {
    idHint: forgePick,
    url: `https://maven.neoforged.net/releases/net/neoforged/forge/${forgePick}/forge-${forgePick}-installer.jar`,
    file: `neoforge-forge-${forgePick}-installer.jar`,
    hints: [forgePick, "neoforge", "forge"],
  };
}

function profileLooksComplete(root, id) {
  const jsonPath = path.join(root, "versions", id, `${id}.json`);
  if (!fs.existsSync(jsonPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!data.mainClass) return false;
    const librariesDir = path.join(root, "libraries");
    const libs = data.libraries || [];
    let missing = 0;
    let checked = 0;
    for (const lib of libs) {
      const p = lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path;
      if (!p) continue;
      checked++;
      if (!fs.existsSync(path.join(librariesDir, p))) missing++;
    }
    if (checked > 8 && missing > checked * 0.35) return false;
    return true;
  } catch {
    return false;
  }
}

async function installWithInstaller(kind, spec, mcVersion, sharedDir, javaPath, log) {
  const existing = findVersionProfile(sharedDir, spec.hints);
  if (existing && profileLooksComplete(sharedDir, existing)) {
    log(`${kind} уже установлен: ${existing}`);
    return { id: existing };
  }
  if (existing) {
    log(`${kind} профиль «${existing}» неполный — переустанавливаю через installer`);
  }

  await ensureVanillaClient(mcVersion, sharedDir, log);

  const installerPath = path.join(sharedDir, "installers", spec.file);
  log(`Скачивание ${kind} installer…`);
  await downloadFile(spec.url, installerPath);

  const librariesDir = path.join(sharedDir, "libraries");
  extractInstallerMaven(installerPath, librariesDir, log);

  if (isLegacyForgeMc(mcVersion) && kind === "Forge") {
    log("Старый Forge (до 1.13): собираю профиль из installer.jar без GUI");
    const versionData = readInstallerVersionJson(installerPath, log);
    const id = versionData.id || `${mcVersion}-forge-${spec.idHint}`;
    versionData.id = id;
    if (!versionData.inheritsFrom) versionData.inheritsFrom = mcVersion;
    const dir = path.join(sharedDir, "versions", id);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(versionData, null, 2));
    await downloadVersionLibraries(versionData, librariesDir, log);
    log(`${kind} ${id} установлен ✓`);
    return { id };
  }

  const javaBin = pickInstallerJava(javaPath, mcVersion, log);
  log(`Запуск ${kind} installer (это может занять пару минут)…`);
  await runForgeInstaller(javaBin, installerPath, sharedDir, log);

  const installed = findVersionProfile(sharedDir, spec.hints);
  if (!installed) {
    throw new Error(`${kind} installer отработал, но профиль версии не найден в ${path.join(sharedDir, "versions")}`);
  }
  log(`${kind} установлен ✓ (${installed})`);
  return { id: installed };
}

async function installForge(mcVersion, sharedDir, javaPath, log) {
  log(`Установка Forge для ${mcVersion}…`);
  const spec = await resolveForgeInstallerSpec(mcVersion, log);
  return installWithInstaller("Forge", spec, mcVersion, sharedDir, javaPath, log);
}

async function installNeoForge(mcVersion, sharedDir, javaPath, log) {
  log(`Установка NeoForge для ${mcVersion}…`);
  const spec = await resolveNeoForgeInstallerSpec(mcVersion, log);
  return installWithInstaller("NeoForge", spec, mcVersion, sharedDir, javaPath, log);
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
