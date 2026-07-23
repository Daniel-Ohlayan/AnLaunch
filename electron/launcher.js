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
      log("Проверьте интернет или выберите другую версию");
      throw err;
    }
  }

  const finalVersionsDir = path.join(versionsDir, actualVersion);
  const nativesDir = path.join(finalVersionsDir, "natives");
  ensureDir(nativesDir);

  // 1. Загружаем детали версии
  let details = await loadVersionDetails(actualVersion, versionsDir, log);

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

  // 3. Библиотеки
  log("Загрузка библиотек…");
  const classpath = [];
  const libraries = details.libraries || [];
  let libCount = 0;

  for (const lib of libraries) {
    if (!isLibraryAllowed(lib)) continue;

    if (lib.downloads && lib.downloads.artifact) {
      const libPath = path.join(librariesDir, lib.downloads.artifact.path);
      if (!fs.existsSync(libPath)) {
        try {
          await downloadFile(lib.downloads.artifact.url, libPath);
        } catch (e) {
          console.error("Библиотека не скачана:", lib.name, e.message);
        }
      }
      if (fs.existsSync(libPath)) classpath.push(libPath);
    } else if (lib.url) {
      // Для Fabric: библиотеки без downloads.artifact но с url — качаем по Maven-пути
      if (lib.name) {
        const parts = lib.name.split(":");
        if (parts.length >= 3) {
          const [group, artifact, version] = parts;
          const groupPath = group.replace(/\./g, "/");
          const fileName = `${artifact}-${version}.jar`;
          const mavenPath = `${groupPath}/${artifact}/${version}/${fileName}`;
          const libPath = path.join(librariesDir, mavenPath);
          if (!fs.existsSync(libPath)) {
            try {
              await downloadFile(lib.url + mavenPath, libPath);
            } catch (e) {
              console.error("Библиотека Fabric не скачана:", lib.name, e.message);
            }
          }
          if (fs.existsSync(libPath)) classpath.push(libPath);
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
        if (!fs.existsSync(nativePath)) {
          try {
            await downloadFile(na.url, nativePath);
          } catch (e) {
            console.error("Натив не скачан:", lib.name, e.message);
          }
        }
        if (fs.existsSync(nativePath)) extractNatives(nativePath, nativesDir);
      }
    }

    libCount++;
    if (libCount % 15 === 0) log(`Библиотеки: ${libCount}/${libraries.length}…`);
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
    let assetCount = 0;
    for (const [name, info] of entries) {
      const hash = info.hash;
      const subHash = hash.substring(0, 2);
      const objPath = path.join(assetsDir, "objects", subHash, hash);
      if (!fs.existsSync(objPath)) {
        try {
          await downloadFile(`https://resources.download.minecraft.net/${subHash}/${hash}`, objPath);
        } catch {
          /* пропускаем сбойные */
        }
      }
      if (assetData.map_to_resources || assetIndex.id === "legacy" || assetIndex.id === "pre-1.6") {
        const legacyPath = path.join(assetsDir, "virtual", "legacy", name);
        if (!fs.existsSync(legacyPath) && fs.existsSync(objPath)) {
          ensureDir(path.dirname(legacyPath));
          try {
            fs.copyFileSync(objPath, legacyPath);
          } catch {}
        }
      }
      assetCount++;
      if (assetCount % 200 === 0) log(`Ассеты: ${assetCount}/${entries.length}…`);
    }
  }

  // 5. Формируем аргументы
  log("Формирование команды запуска…");
  const mainClass = details.mainClass;
  const sep = path.delimiter;
  const cpString = classpath.join(sep);

  const crypto = require("crypto");
  let effectiveUuid = account.uuid ? account.uuid.replace(/-/g, "") : "";
  if (account.type !== "microsoft") {
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
    auth_access_token: account.accessToken || "0",
    auth_xuid: account.xuid || "0",
    clientid: "anlaunch",
    user_type: account.type === "microsoft" ? "msa" : "offline",
    version_type: "release",
    natives_directory: nativesDir,
    launcher_name: "AnLaunch",
    launcher_version: "1.0.0",
    classpath: cpString,
    game_assets: path.join(assetsDir, "virtual", "legacy"),
    auth_session: account.accessToken ? `token:${account.accessToken}:${effectiveUuid}` : "0",
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

  const memoryArgs = [
    `-Xmx${ram}G`,
    `-Xms${Math.min(ram, 2)}G`,
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+UseG1GC",
    "-Dorg.lwjgl.librarypath=" + nativesDir,
  ];

  // Версия Java
  let javaVersion = 17;
  try {
    const { execSync: ex } = require("child_process");
    const javaOut = ex("java -version 2>&1", { encoding: "utf8" });
    const versionMatch = javaOut.match(/version\s+"?(\d+)/);
    if (versionMatch) javaVersion = parseInt(versionMatch[1], 10);
  } catch {}
  if (javaVersion >= 22) {
    memoryArgs.push("--sun-misc-unsafe-memory-access=allow");
  }

  const hasCP = jvmArgs.includes("-cp") || jvmArgs.includes("-classpath");
  if (!hasCP) {
    jvmArgs.push("-cp", cpString);
  }

  const allArgs = [...memoryArgs, ...jvmArgs, mainClass, ...gameArgs];

  // 6. Запуск
  log(`Запуск Minecraft ${actualVersion}…`);
  log(`Main class: ${mainClass}`);

  const child = spawn(javaPath, allArgs, {
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

module.exports = { launchMinecraft, ensureDir };
