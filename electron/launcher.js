// Настоящий лаунчер Minecraft (vanilla + Fabric/Forge/NeoForge/Quilt)
// Скачивает клиент, библиотеки, нативы, ассеты и запускает Java

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { spawn, execSync } = require("child_process");
const os = require("os");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getProto(url) {
  return url.startsWith("https") ? https : http;
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
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} для ${url}`));
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

// Фильтрует JVM-аргументы из version.json Mojang, которые не поддерживает
// установленная Java. Например, --sun-misc-unsafe-memory-access=allow работает
// только с Java 24+, а Minecraft 26.x его добавляет в version.json.
// Без фильтра старый JDK отказывается запускаться с ошибкой "Unrecognized option".
function filterIncompatibleJvmArgs(args, javaVersion, log) {
  const rules = [
    { pattern: /^--sun-misc-unsafe-memory-access/, minJava: 24 },
    { pattern: /^--enable-native-access/, minJava: 22 },
    { pattern: /^--illegal-native-access/, minJava: 24 },
    { pattern: /^-XX:\+UnlockExperimentalVMOptions$/, minJava: 99 }, // убираем всегда
    { pattern: /^-XX:\+UnlockDiagnosticVMOptions$/, minJava: 99 },
    { pattern: /^-Xlog:gc/, minJava: 9 },
  ];

  const result = [];
  let removed = 0;
  let i = 0;
  while (i < args.length) {
    const arg = String(args[i]);
    const matched = rules.find((r) => r.pattern.test(arg));
    if (matched && javaVersion < matched.minJava) {
      // Если флаг в формате "--flag value" (без =), пропускаем и следующий элемент
      if (!arg.includes("=") && i + 1 < args.length && !String(args[i + 1]).startsWith("-")) {
        i += 2;
      } else {
        i++;
      }
      removed++;
      continue;
    }
    result.push(arg);
    i++;
  }

  if (removed > 0 && log) {
    log(`Отфильтровано ${removed} несовместимых JVM-аргументов (Java ${javaVersion})`);
  }
  return result;
}

function getCurrentOS() {
  const p = os.platform();
  if (p === "win32") return "windows";
  if (p === "darwin") return "osx";
  return "linux";
}

function isLibraryAllowed(lib) {
  if (!lib.rules) return true;
  let allowed = false;
  const currentOS = getCurrentOS();
  for (const rule of lib.rules) {
    if (rule.os && rule.os.name) {
      if (rule.os.name === currentOS) allowed = rule.action === "allow";
    } else {
      allowed = rule.action === "allow";
    }
  }
  return allowed;
}

function extractNatives(jarPath, nativesDir) {
  ensureDir(nativesDir);
  try {
    if (os.platform() === "win32") {
      const tmp = path.join(nativesDir, `_tmp_${Date.now()}`);
      execSync(
        `powershell -NoProfile -command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${jarPath}', '${tmp}')"`,
        { stdio: "ignore" }
      );
      copyNativeBinaries(tmp, nativesDir);
      fs.rmSync(tmp, { recursive: true, force: true });
    } else {
      execSync(`unzip -o "${jarPath}" -d "${nativesDir}" -x "META-INF/*"`, { stdio: "ignore" });
    }
  } catch (e) {
    console.error("Native extraction warning:", e.message);
  }
}

function copyNativeBinaries(src, dest) {
  let entries = [];
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(src, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "META-INF") continue;
      copyNativeBinaries(full, dest);
    } else if (/\.(dll|so|dylib|jnilib)$/i.test(entry.name)) {
      try {
        fs.copyFileSync(full, path.join(dest, entry.name));
      } catch {}
    }
  }
}

function resolveArguments(argList, vars, features = {}) {
  const out = [];
  for (const arg of argList) {
    if (typeof arg === "string") {
      out.push(substitute(arg, vars));
    } else if (arg && typeof arg === "object") {
      let allowed = true;
      if (arg.rules) {
        allowed = false;
        for (const rule of arg.rules) {
          let match = true;
          if (rule.os && rule.os.name && rule.os.name !== getCurrentOS()) match = false;
          if (rule.features) {
            for (const f of Object.keys(rule.features)) {
              if (!features[f]) match = false;
            }
          }
          if (match) allowed = rule.action === "allow";
        }
      }
      if (allowed && arg.value) {
        const vals = Array.isArray(arg.value) ? arg.value : [arg.value];
        for (const v of vals) out.push(substitute(v, vars));
      }
    }
  }
  return out;
}

function substitute(str, vars) {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `\${${key}}`));
}

// Загружает детали версии с поддержкой наследования
async function loadVersionDetails(versionId, versionsDir, log) {
  const versionJsonPath = path.join(versionsDir, versionId, `${versionId}.json`);
  if (fs.existsSync(versionJsonPath)) {
    let details = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));

    if (details.inheritsFrom) {
      log(`Загрузка родительской версии ${details.inheritsFrom}…`);
      const parent = await loadVersionDetails(details.inheritsFrom, versionsDir, log);

      const parentLibs = (parent.libraries || []).filter(
        (lib) => !(details.libraries || []).some((l) => l.name === lib.name)
      );
      details.libraries = [...parentLibs, ...(details.libraries || [])];

      if (parent.arguments) {
        if (!details.arguments) details.arguments = { game: [], jvm: [] };
        details.arguments.game = [
          ...(parent.arguments.game || []),
          ...(details.arguments.game || []),
        ];
        details.arguments.jvm = [
          ...(parent.arguments.jvm || []),
          ...(details.arguments.jvm || []),
        ];
      }

      if (!details.assetIndex && parent.assetIndex) {
        details.assetIndex = parent.assetIndex;
      }
      if (!details.downloads && parent.downloads) {
        details.downloads = parent.downloads;
      }
    }
    return details;
  }

  // Скачиваем с Mojang
  const manifest = await downloadJSON("https://launchermeta.mojang.com/mc/game/version_manifest.json");
  const versionInfo = manifest.versions.find((v) => v.id === versionId);
  if (!versionInfo) throw new Error(`Версия ${versionId} не найдена`);

  const details = await downloadJSON(versionInfo.url);
  const dir = path.join(versionsDir, versionId);
  ensureDir(dir);
  fs.writeFileSync(versionJsonPath, JSON.stringify(details));
  return details;
}

// Основная функция запуска
async function launchMinecraft(config, javaPath, dirs, onProgress) {
  const { account, version, ram } = config;
  const loader = config.loader || "vanilla";
  const requestedJavaPath = javaPath;
  const manualJavaPath = Boolean(config.javaPath);

  const { sharedDir, gameDir } = dirs;
  const log = (msg) => {
    if (onProgress) onProgress(msg);
    console.log("[Launcher]", msg);
  };

  const versionsDir = path.join(sharedDir, "versions");
  const librariesDir = path.join(sharedDir, "libraries");
  const assetsDir = path.join(sharedDir, "assets");

  ensureDir(versionsDir);
  ensureDir(librariesDir);
  ensureDir(assetsDir);
  ensureDir(gameDir);

  // Forge/NeoForge installers expect the vanilla version and client jar to
  // exist before they generate their profile.
  if (loader !== "vanilla") {
    const baseDetails = await loadVersionDetails(version, versionsDir, log);
    const baseJar = path.join(versionsDir, version, `${version}.jar`);
    if (baseDetails.downloads?.client && !fs.existsSync(baseJar)) {
      log(`Подготовка ванильной версии ${version} для ${loader}…`);
      await downloadFile(baseDetails.downloads.client.url, baseJar);
    }
  }

  // 0. Установка модлоадера если нужен
  let actualVersion = version;
  if (loader && loader !== "vanilla") {
    try {
      const { installLoader } = require("./loaders");
      const r = await installLoader(loader, version, sharedDir, javaPath, log);
      if (r && r.id) {
        actualVersion = r.id;
        log(`✓ Загрузчик ${loader} готов: ${actualVersion}`);
      }
    } catch (err) {
      log(`❌ Не удалось установить ${loader}: ${err.message}`);

      // Fabric поддерживает только Minecraft 1.14 и новее — пробовать его
      // для более старых версий бессмысленно, сервер Fabric вернёт HTTP 400.
      const versionParts = version.split(".").map((n) => parseInt(n, 10));
      const isFabricCompatible =
        versionParts[0] > 1 || (versionParts[0] === 1 && versionParts[1] >= 14);

      if (loader === "forge" && isFabricCompatible) {
        log("⚡ Не удалось установить Forge. Автоматически переключаюсь на Fabric...");
        try {
          const { installLoader } = require("./loaders");
          const r = await installLoader("fabric", version, sharedDir, javaPath, log);
          if (r && r.id) {
            actualVersion = r.id;
            log(`✓ Fabric установлен (вместо Forge): ${actualVersion}`);
          }
        } catch (e2) {
          log(`❌ Fabric тоже не установлен: ${e2.message}`);
          log("Запускаю ванильную версию");
        }
      } else if (loader === "forge") {
        // Для версий 1.7–1.13.x у Fabric нет поддержки — сразу предупреждаем
        // и переходим на ванильную версию, не тратя время на заведомо
        // провальную попытку установки Fabric.
        log("ℹ Fabric не поддерживает эту версию Minecraft (нужна 1.14+).");
        log("Для установки модов на эту версию используйте Forge вручную с Java 8, либо выберите версию 1.14 или новее.");
        log("Запускаю ванильную версию");
      } else {
        throw err;
      }
    }
  }

  const finalVersionsDir = path.join(versionsDir, actualVersion);
  const nativesDir = path.join(finalVersionsDir, "natives");
  ensureDir(nativesDir);

  // 1. Загружаем детали версии
  let details = await loadVersionDetails(actualVersion, versionsDir, log);

  // 1.5. Подбираем подходящую версию Java под требования этого релиза Minecraft.
  // Раньше лаунчер всегда использовал "java" из PATH, из-за чего могла запускаться
  // не та версия Java, что приводило к UnsupportedClassVersionError.
  let javaBin = requestedJavaPath || "java";
  let detectedJava = 17; // версия Java, реально используемая для запуска
  let mustUseExactJava = false; // true = нужна ТОЧНАЯ версия (Forge < 1.17)
  let requiredExactVersion = 0;

  try {
    const { findAllJavaInstalls, getRequiredJavaVersion, pickJavaForVersion, findJavaByVersion, getJavaMajorVersion } = require("./javaFinder");
    const requiredJava = getRequiredJavaVersion(details);
    const installs = findAllJavaInstalls();

    // Forge < 1.17 (LaunchWrapper) ТРЕБУЕТ Java 8 — на Java 9+ падает
    // ClassCastException: AppClassLoader cannot be cast to URLClassLoader
    // Потому что LaunchWrapper.launch() делает (URLClassLoader) getClass().getClassLoader()
    const isLegacyForge = loader === "forge" && parseFloat(version.split(".").slice(0, 2).join(".")) < 1.17;

    if (manualJavaPath) {
      const manualVersion = getJavaMajorVersion(javaBin);
      if (!manualVersion) throw new Error(`Не удалось запустить Java: ${javaBin}`);
      detectedJava = manualVersion;
      log(`Использую Java из настроек: ${javaBin} (Java ${manualVersion})`);
      if (isLegacyForge && manualVersion !== 8) {
        throw new Error(`Forge ${version} требует Java 8, а в настройках выбрана Java ${manualVersion}.`);
      }
      if (!isLegacyForge && manualVersion < requiredJava) {
        throw new Error(`Minecraft ${version} требует Java ${requiredJava}+, а в настройках выбрана Java ${manualVersion}.`);
      }
    } else if (isLegacyForge) {
      mustUseExactJava = true;
      requiredExactVersion = 8;
      log(`Forge ${version} требует ТОЧНО Java 8 (LaunchWrapper несовместим с Java 9+)`);

      if (installs.length > 0) {
        log(`Найдено Java: ${installs.map((i) => `v${i.version}`).join(", ")}`);
      }

      const java8 = findJavaByVersion(installs, 8);
      if (java8) {
        javaBin = java8.path;
        detectedJava = 8;
        log(`Использую Java 8: ${java8.path}`);
      } else {
        log(`❌ Java 8 НЕ НАЙДЕНА!`);
        throw new Error(
          `Для Forge ${version} нужна Java 8, но она не установлена.\n` +
          `Скачайте Adoptium Temurin 8: https://adoptium.net/temurin/releases/?version=8\n` +
          `Можно установить несколько Java одновременно — AnLaunch сама выберет нужную.`
        );
      }
    } else {
      log(`Minecraft ${version} требует Java ${requiredJava}+`);
      if (installs.length > 0) {
        log(`Найдено Java: ${installs.map((i) => `v${i.version}`).join(", ")}`);
      }
      const best = pickJavaForVersion(installs, requiredJava);
      if (best) {
        javaBin = best.path;
        log(`Использую Java ${best.version}: ${best.path}`);
        if (best.version < requiredJava) {
          log(`⚠ Установленная Java ${best.version} старее требуемой ${requiredJava}. Возможны ошибки запуска.`);
        }
      } else {
        log(`⚠ Не найдено ни одной установленной Java. Использую системную "java".`);
      }
    }
  } catch (e) {
    log(`❌ ${e.message}`);
    throw e;
  }

  // Определяем финальную версию Java (если ещё не определена выше)
  if (!mustUseExactJava) {
    try {
      const { getJavaMajorVersion } = require("./javaFinder");
      const v = getJavaMajorVersion(javaBin);
      if (v) detectedJava = v;
    } catch {}
  }
  log(`Используется Java ${detectedJava}: ${javaBin}`);

  // 2. Скачиваем клиентский jar ванильной версии (если нужно)
  const vanillaVersion = details.inheritsFrom || actualVersion;
  const clientJarPath = path.join(versionsDir, vanillaVersion, `${vanillaVersion}.jar`);
  if (details.downloads && details.downloads.client) {
    if (!fs.existsSync(clientJarPath)) {
      log("Скачивание Minecraft client.jar…");
      try {
        await downloadFile(details.downloads.client.url, clientJarPath);
      } catch (e) {
        log(`Ошибка скачивания client.jar: ${e.message}`);
      }
    }
  }

  // 3. Библиотеки — сначала собираем все недостающие файлы, потом качаем параллельно
  log("Загрузка библиотек…");
  const classpath = [];
  const libraries = details.libraries || [];
  const downloadQueue = []; // { url, path, isNative, libName }
  const nativeFiles = []; // для последующего извлечения

  for (const lib of libraries) {
    if (!isLibraryAllowed(lib)) continue;

    if (lib.downloads && lib.downloads.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (fs.existsSync(libPath)) {
        classpath.push(libPath);
      } else {
        downloadQueue.push({ url: lib.downloads.artifact.url, path: libPath, libName: lib.name, type: "lib" });
      }
    } else if (lib.url && lib.name) {
      const parts = lib.name.split(":");
      if (parts.length >= 3) {
        const [group, artifact, version] = parts;
        const groupPath = group.replace(/\./g, "/");
        const fileName = `${artifact}-${version}.jar`;
        const mavenPath = `${groupPath}/${artifact}/${version}/${fileName}`;
        const libPath = path.join(librariesDir, mavenPath);
        if (fs.existsSync(libPath)) {
          classpath.push(libPath);
        } else {
          downloadQueue.push({ url: lib.url + mavenPath, path: libPath, libName: lib.name, type: "lib" });
        }
      }
    }

    if (lib.downloads && lib.downloads.classifiers) {
      const currentOS = getCurrentOS();
      const nativeKey =
        lib.natives && lib.natives[currentOS]
          ? lib.natives[currentOS].replace("${arch}", os.arch().includes("64") ? "64" : "32")
          : null;
      if (nativeKey && lib.downloads.classifiers[nativeKey]) {
        const na = lib.downloads.classifiers[nativeKey];
        const nativePath = path.join(librariesDir, na.path);
        if (fs.existsSync(nativePath)) {
          nativeFiles.push(nativePath);
        } else {
          downloadQueue.push({ url: na.url, path: nativePath, libName: lib.name, type: "native" });
        }
      }
    }
  }

  // Параллельная загрузка библиотек по 10 за раз (в ~10 раз быстрее)
  if (downloadQueue.length > 0) {
    log(`Скачивание ${downloadQueue.length} недостающих библиотек (параллельно)…`);
    const PARALLEL = 10;
    let done = 0;
    for (let i = 0; i < downloadQueue.length; i += PARALLEL) {
      const batch = downloadQueue.slice(i, i + PARALLEL);
      await Promise.all(
        batch.map(async (item) => {
          try {
            await downloadFile(item.url, item.path);
            if (item.type === "lib") classpath.push(item.path);
            else if (item.type === "native") nativeFiles.push(item.path);
          } catch (e) {
            console.error(`Не скачано (${item.type}):`, item.libName, e.message);
          }
          done++;
        })
      );
      if (done % 10 < PARALLEL) log(`Библиотеки: ${done}/${downloadQueue.length}…`);
    }
  } else {
    log("Все библиотеки уже загружены ✓");
  }

  // Извлекаем нативы (после скачивания)
  for (const nativePath of nativeFiles) {
    extractNatives(nativePath, nativesDir);
  }

  if (fs.existsSync(clientJarPath)) classpath.push(clientJarPath);

  // Убираем дубликаты
  const seenCp = new Set();
  const dedupedCp = classpath.filter((c) => {
    if (seenCp.has(c)) return false;
    seenCp.add(c);
    return true;
  });
  classpath.length = 0;
  classpath.push(...dedupedCp);

  // 4. Ассеты
  log("Загрузка ассетов…");
  const assetIndex = details.assetIndex;
  let assetIndexId = "legacy";
  if (assetIndex) {
    assetIndexId = assetIndex.id;
    const indexPath = path.join(assetsDir, "indexes", `${assetIndex.id}.json`);
    let assetData;
    if (fs.existsSync(indexPath)) {
      assetData = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } else {
      assetData = await downloadJSON(assetIndex.url);
      ensureDir(path.dirname(indexPath));
      fs.writeFileSync(indexPath, JSON.stringify(assetData));
    }

    const objects = assetData.objects || {};
    const entries = Object.entries(objects);
    // Фильтруем только отсутствующие ассеты
    const missing = entries.filter(([, info]) => {
      const hash = info.hash;
      const subHash = hash.substring(0, 2);
      return !fs.existsSync(path.join(assetsDir, "objects", subHash, hash));
    });

    if (missing.length > 0) {
      log(`Загрузка ${missing.length} из ${entries.length} ассетов (параллельно)…`);
      // Параллельная загрузка ассетов — по 20 одновременно (в 20 раз быстрее!)
      const PARALLEL = 20;
      let done = 0;
      for (let i = 0; i < missing.length; i += PARALLEL) {
        const batch = missing.slice(i, i + PARALLEL);
        await Promise.all(
          batch.map(async ([name, info]) => {
            const hash = info.hash;
            const subHash = hash.substring(0, 2);
            const objPath = path.join(assetsDir, "objects", subHash, hash);
            try {
              await downloadFile(`https://resources.download.minecraft.net/${subHash}/${hash}`, objPath);
            } catch {
              /* пропускаем сбойные */
            }
            if (assetData.map_to_resources || assetIndex.id === "legacy" || assetIndex.id === "pre-1.6") {
              const legacyPath = path.join(assetsDir, "virtual", "legacy", name);
              if (!fs.existsSync(legacyPath) && fs.existsSync(objPath)) {
                ensureDir(path.dirname(legacyPath));
                try { fs.copyFileSync(objPath, legacyPath); } catch {}
              }
            }
            done++;
          })
        );
        if (done % 100 < PARALLEL) log(`Ассеты: ${done}/${missing.length}…`);
      }
    } else {
      log("Ассеты уже загружены ✓");
    }
  }

  // 5. Формируем аргументы
  log("Формирование команды запуска…");
  const mainClass = details.mainClass;
  const sep = path.delimiter;
  const cpString = classpath.join(sep);

  // UUID и токен — точно как в оффлайн-режиме Minecraft
  const crypto = require("crypto");
  let effectiveUuid = account.uuid ? account.uuid.replace(/-/g, "") : "";
  const isOffline = account.type !== "microsoft" && account.type !== "premium";
  if (isOffline) {
    // Правильный оффлайн UUID: md5("OfflinePlayer:Ник") в формате UUID v3
    const md5 = crypto.createHash("md5").update(`OfflinePlayer:${account.username}`, "utf8").digest();
    md5[6] = (md5[6] & 0x0f) | 0x30;
    md5[8] = (md5[8] & 0x3f) | 0x80;
    effectiveUuid = md5.toString("hex");
  }

  const vars = {
    auth_player_name: account.username,
    version_name: actualVersion,
    game_directory: gameDir,
    assets_root: assetsDir,
    assets_index_name: assetIndexId,
    auth_uuid: effectiveUuid,
    // Для оффлайн-аккаунтов accessToken должен быть "0", xuid тоже "0"
    auth_access_token: isOffline ? "0" : (account.accessToken || "0"),
    auth_xuid: isOffline ? "0" : (account.xuid || "0"),
    clientid: "anlaunch",
    user_type: isOffline ? "mojang" : "msa",
    version_type: "release",
    natives_directory: nativesDir,
    launcher_name: "AnLaunch",
    launcher_version: "1.0.2",
    classpath: cpString,
    game_assets: path.join(assetsDir, "virtual", "legacy"),
    // Правильная сессия для оффлайн-режима: "0" без псевдо-токена
    auth_session: isOffline ? "0" : (account.accessToken ? `token:${account.accessToken}:${effectiveUuid}` : "0"),
    library_directory: librariesDir,
    classpath_separator: sep,
  };

  let jvmArgs = [];
  let gameArgs = [];

  if (details.arguments) {
    jvmArgs = resolveArguments(details.arguments.jvm || [], vars);
    gameArgs = resolveArguments(details.arguments.game || [], vars);
  } else {
    jvmArgs = [`-Djava.library.path=${nativesDir}`, "-cp", cpString];
    const legacy = details.minecraftArguments || "";
    gameArgs = legacy.split(" ").filter(Boolean).map((a) => substitute(a, vars));
  }

  const minRam = Math.max(1, Math.min(Number(config.ramMin) || Math.min(ram, 2), ram));
  const memoryArgs = [
    `-Xmx${ram}G`,
    `-Xms${minRam}G`,
    "-XX:+UseG1GC",
    "-Dorg.lwjgl.librarypath=" + nativesDir,
  ];

  // Фильтруем JVM-аргументы, несовместимые с установленной Java.
  // Mojang в новых version.json добавляет флаги для Java 22-24, которые ломают
  // запуск на старых JDK (17, 21) ошибками "Unrecognized option".
  jvmArgs = filterIncompatibleJvmArgs(jvmArgs, detectedJava, log);

  const hasCP = jvmArgs.includes("-cp") || jvmArgs.includes("-classpath");
  if (!hasCP) {
    jvmArgs.push("-cp", cpString);
  }

  // Пользовательские JVM-аргументы из настроек — добавляются до mainClass
  if (config.jvmArgs) {
    const extra = String(config.jvmArgs).split(/\s+/).filter(Boolean);
    if (extra.length) {
      log(`Дополнительные JVM-аргументы: ${extra.join(" ")}`);
      jvmArgs.push(...extra);
    }
  }

  // Размер окна / полноэкранный режим Minecraft (аргументы клиента)
  if (config.mcFullscreen) {
    gameArgs.push("--fullscreen");
    log("Minecraft будет запущен в полноэкранном режиме");
  } else if (config.mcWidth && config.mcHeight) {
    gameArgs.push("--width", String(config.mcWidth), "--height", String(config.mcHeight));
    log(`Окно Minecraft: ${config.mcWidth}×${config.mcHeight}`);
  }

  if (config.mcLanguage) {
    gameArgs.push("--lang", String(config.mcLanguage));
    log(`Язык Minecraft: ${config.mcLanguage}`);
  }

  if (config.serverHost) {
    const host = String(config.serverHost).trim();
    const port = Number(config.serverPort) > 0 ? Number(config.serverPort) : 25565;
    if (host) {
      const id = String(version || "");
      const minor = Number(id.split(".")[1] || 0);
      const isLegacyServerArgs = id.startsWith("1.") && minor < 20;
      if (isLegacyServerArgs) {
        gameArgs.push("--server", host, "--port", String(port));
      } else {
        gameArgs.push("--quickPlayMultiplayer", `${host}:${port}`);
      }
      log(`Автоподключение к серверу ${host}:${port}`);
    }
  }

  const allArgs = [...memoryArgs, ...jvmArgs, mainClass, ...gameArgs];

  // 6. Запуск
  log(`Запуск Minecraft ${actualVersion}…`);
  log(`Main class: ${mainClass}`);
  log(`Java: ${javaBin}`);

  const child = spawn(javaBin, allArgs, {
    cwd: gameDir,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let started = false;
  let errBuffer = "";

  return new Promise((resolve) => {
    child.stdout.on("data", (d) => {
      const line = d.toString();
      console.log("[MC]", line.trim());
      if (
        !started &&
        (line.includes("Setting user") ||
          line.includes("LWJGL") ||
          line.includes("Backend library") ||
          line.includes("OpenAL") ||
          line.includes("Loading mod") ||
          line.includes("Forge") ||
          line.includes("Fabric") ||
          line.includes("Applying"))
      ) {
        started = true;
        resolve({
          success: true,
          message: `✅ Minecraft ${actualVersion} запущен! Игрок: ${account.username}`,
        });
      }
    });

    child.stderr.on("data", (d) => {
      const line = d.toString();
      errBuffer += line;
      console.error("[MC ERR]", line.trim());
    });

    child.on("error", (err) => {
      resolve({ success: false, message: `Ошибка запуска Java: ${err.message}` });
    });

    child.on("exit", (code) => {
      if (!started) {
        if (code === 0) {
          resolve({ success: true, message: "Minecraft закрыт." });
        } else if (errBuffer.includes("UnsupportedClassVersionError")) {
          const need = getRequiredJavaVersionSafe(details);
          resolve({
            success: false,
            message:
              `Установленная Java слишком старая для Minecraft ${actualVersion}.\n` +
              `Нужна Java ${need}+ , а использовалась: ${javaBin}.\n` +
              `Установите подходящую версию Java (например с adoptium.net) и повторите запуск.`,
          });
        } else {
          const hint = errBuffer.slice(-400);
          resolve({
            success: false,
            message: `Minecraft завершился с кодом ${code}.${hint ? "\n" + hint : ""}`,
          });
        }
      }
    });

    setTimeout(() => {
      if (!started && child.exitCode === null) {
        started = true;
        resolve({
          success: true,
          message: `✅ Minecraft ${actualVersion} запускается! Игрок: ${account.username}`,
        });
      }
    }, 12000);
  });
}

// Безопасно достаёт требуемую версию Java из details (не бросает исключений).
function getRequiredJavaVersionSafe(details) {
  try {
    const { getRequiredJavaVersion } = require("./javaFinder");
    return getRequiredJavaVersion(details);
  } catch {
    return 17;
  }
}

module.exports = { launchMinecraft, ensureDir };
