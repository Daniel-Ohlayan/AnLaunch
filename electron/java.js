// Поиск и автозагрузка Java. Ищет все установленные JDK/JRE в системе,
// выбирает самую свежую. Если нужной версии нет — качает Temurin с Adoptium.
const fs = require("fs");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getProto(url) {
  return url.startsWith("https") ? require("https") : require("http");
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    getProto(url)
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(destPath, () => {});
          return resolve(downloadFile(res.headers.location, destPath));
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
  });
}

// Определяет мажорную версию конкретного java бинарника
function detectJavaVersion(javaExe) {
  try {
    const { execSync } = require("child_process");
    const out = execSync(`"${javaExe}" -version 2>&1`, { encoding: "utf8", timeout: 10000 });
    const m = out.match(/version\s+"?(\d+)/);
    if (m) return parseInt(m[1], 10);
  } catch {}
  return 0;
}

// Ищет java.exe / java в дереве папок (2 уровня вглубь)
function findJavaExeIn(root) {
  if (!root || !fs.existsSync(root)) return null;
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const direct = path.join(root, "bin", exe);
  if (fs.existsSync(direct)) return direct;
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const sub = path.join(root, e.name);
      const subExe = path.join(sub, "bin", exe);
      if (fs.existsSync(subExe)) return subExe;
      try {
        const inner = fs.readdirSync(sub, { withFileTypes: true });
        for (const e2 of inner) {
          if (!e2.isDirectory()) continue;
          const sub2 = path.join(sub, e2.name);
          const sub2Exe = path.join(sub2, "bin", exe);
          if (fs.existsSync(sub2Exe)) return sub2Exe;
        }
      } catch {}
    }
  } catch {}
  return null;
}

// Все стандартные места установки Java
function getJavaSearchDirs() {
  const dirs = [];
  const env = process.env;

  if (env.JAVA_HOME) dirs.push(env.JAVA_HOME);
  if (env.JDK_HOME) dirs.push(env.JDK_HOME);

  const programFiles = [env["ProgramFiles"], env["ProgramFiles(x86)"], env["ProgramW6432"], env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs") : null].filter(Boolean);
  const vendorDirs = ["Java", "Eclipse Adoptium", "Eclipse Foundation", "Microsoft", "Zulu", "Amazon Corretto", "BellSoft", "SAPMachine", "ojdkbuild"];
  const mcLauncherJava = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "runtime") : null;

  for (const pf of programFiles) {
    for (const v of vendorDirs) {
      dirs.push(path.join(pf, v));
    }
  }
  if (mcLauncherJava) dirs.push(mcLauncherJava);
  return dirs.filter((d) => d && d.length > 2);
}

// Находит лучшую Java в системе (самую свежую)
function findBestJava() {
  const found = [];
  const exeName = process.platform === "win32" ? "java.exe" : "java";

  // 1. Из PATH
  try {
    const { execSync } = require("child_process");
    const which = process.platform === "win32" ? "where java" : "which java";
    const out = execSync(which, { encoding: "utf8" }).trim();
    if (out) {
      const first = out.split("\r?\n")[0].trim();
      if (first && fs.existsSync(first)) found.push(first);
    }
  } catch {}

  // 2. Из стандартных папок
  for (const dir of getJavaSearchDirs()) {
    const foundExe = findJavaExeIn(dir);
    if (foundExe) found.push(foundExe);
  }

  // 3. Из системного PATH через java -version fallback
  if (found.length === 0) {
    found.push(exeName); // полагаемся на PATH
  }

  // Определяем версии и выбираем максимальную
  let best = null;
  let bestVersion = 0;
  for (const j of found) {
    const v = detectJavaVersion(j);
    if (v > bestVersion) {
      bestVersion = v;
      best = j;
    }
  }

  return { path: best || exeName, version: bestVersion };
}

// Скачивает Temurin JDK нужной версии в sharedDir/java
async function downloadJava(majorVersion, sharedDir, onProgress) {
  const javaRoot = path.join(sharedDir, "java");
  ensureDir(javaRoot);

  // Проверяем уже скачанную
  const existing = findJavaExeIn(javaRoot);
  if (existing && detectJavaVersion(existing) >= majorVersion) {
    return existing;
  }

  const platform = os.platform();
  let osName = "windows";
  let arch = os.arch().includes("64") ? "x64" : "x32";
  if (platform === "darwin") osName = "mac";
  if (platform === "linux") osName = "linux";

  const url = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse`;
  const zipPath = path.join(javaRoot, `temurin-${majorVersion}.zip`);

  if (onProgress) onProgress(`Скачивание Java ${majorVersion} (Temurin, ~180 МБ)…`);
  await downloadFile(url, zipPath);

  if (onProgress) onProgress(`Распаковка Java ${majorVersion}…`);
  const extractDir = path.join(javaRoot, `jdk-${majorVersion}`);
  ensureDir(extractDir);

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);
  } catch (e) {
    throw new Error(`Не удалось распаковать Java: ${e.message}`);
  }
  try { fs.unlinkSync(zipPath); } catch {}

  const javaExe = findJavaExeIn(extractDir);
  if (!javaExe) throw new Error("Java не найдена после распаковки");

  if (onProgress) onProgress(`Java ${majorVersion} готова`);
  return javaExe;
}

module.exports = { detectJavaVersion, downloadJava, findJavaExeIn, findBestJava };
