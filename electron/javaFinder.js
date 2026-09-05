// Поиск всех установленных версий Java в системе и выбор подходящей
// под требования конкретной версии Minecraft (details.javaVersion.majorVersion).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

function getJavaExeName() {
  return os.platform() === "win32" ? "java.exe" : "java";
}

// Спрашивает у конкретного java-бинарника его major-версию (17, 21, 25, ...).
function getJavaMajorVersion(javaBin) {
  try {
    // spawnSync безопасно захватывает и stdout, и stderr, не падая из-за кодов возврата.
    // Это важно, так как Java 8/11/17 печатает версию в stderr, а Java 21+ — в stdout.
    const result = spawnSync(javaBin, ["-version"], { encoding: "utf8", windowsHide: true });
    const combined = (result.stdout || "") + (result.stderr || "");
    return parseJavaVersionOutput(combined);
  } catch (e) {
    return null;
  }
}

function parseJavaVersionOutput(text) {
  if (!text) return null;
  // Примеры: `openjdk version "21.0.3"`, `java version "1.8.0_401"`, `openjdk version "25"`
  const match = text.match(/version\s+"?(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  const first = parseInt(match[1], 10);
  // Старый формат версий Java: 1.8 -> major = 8
  if (first === 1 && match[2]) return parseInt(match[2], 10);
  return first;
}

// Возвращает список кандидатов { path, version } без дублей.
function findAllJavaInstalls() {
  const candidates = new Set();
  const exeName = getJavaExeName();

  // 1. java из PATH
  candidates.add("java");

  // 2. JAVA_HOME
  if (process.env.JAVA_HOME) {
    candidates.add(path.join(process.env.JAVA_HOME, "bin", exeName));
  }

  const platform = os.platform();

  if (platform === "win32") {
    const roots = [
      "C:\\Program Files\\Java",
      "C:\\Program Files (x86)\\Java",
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Eclipse Foundation",
      "C:\\Program Files\\Microsoft",
      "C:\\Program Files\\Zulu",
      "C:\\Program Files\\BellSoft",
      path.join(os.homedir(), "AppData", "Local", "Programs", "Eclipse Adoptium"),
      // Java, поставляемая с оф. лаунчером Minecraft
      path.join(os.homedir(), "AppData", "Local", "Packages"),
      "C:\\Program Files (x86)\\Minecraft Launcher\\runtime",
      path.join(os.homedir(), "AppData", "Roaming", ".minecraft", "runtime"),
    ];
    for (const root of roots) {
      collectJavaHomes(root, exeName, candidates, 3);
    }
  } else if (platform === "darwin") {
    const roots = [
      "/Library/Java/JavaVirtualMachines",
      path.join(os.homedir(), "Library", "Java", "JavaVirtualMachines"),
    ];
    for (const root of roots) {
      try {
        const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
        for (const d of dirs) {
          candidates.add(path.join(root, d.name, "Contents", "Home", "bin", exeName));
        }
      } catch {}
    }
  } else {
    const roots = ["/usr/lib/jvm", "/opt/java", "/usr/java"];
    for (const root of roots) {
      collectJavaHomes(root, exeName, candidates, 2);
    }
  }

  // Проверяем какие пути реально существуют, и запрашиваем их версии
  const results = [];
  for (const candidate of candidates) {
    if (candidate !== "java" && !fs.existsSync(candidate)) continue;
    const version = getJavaMajorVersion(candidate);
    if (version) {
      results.push({ path: candidate, version });
    }
  }

  // Убираем дубликаты по версии+пути
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.version}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Рекурсивно ищет bin/java(.exe) в поддиректориях (максимум depth уровней вниз).
function collectJavaHomes(root, exeName, out, depth) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  const directBin = path.join(root, "bin", exeName);
  if (fs.existsSync(directBin)) out.add(directBin);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "bin") continue;
    collectJavaHomes(path.join(root, entry.name), exeName, out, depth - 1);
  }
}

// Достаёт требуемую major-версию Java из details.javaVersion (version.json Mojang).
function getRequiredJavaVersion(details) {
  if (details && details.javaVersion && details.javaVersion.majorVersion) {
    return details.javaVersion.majorVersion;
  }
  return 17; // разумное значение по умолчанию для старых версий без этого поля
}

// Ищет установленную Java конкретной major-версии (например 8) среди кандидатов.
// Возвращает null, если такой версии нет — тогда вызывающий код должен
// использовать то, что есть, и явно предупредить пользователя.
function findJavaByVersion(installs, majorVersion) {
  const match = installs.find((i) => i.version === majorVersion);
  return match || null;
}

// Выбирает лучший установленный java-бинарник для требуемой версии.
// Предпочитает точное совпадение или более новую версию, если точной нет.
function pickJavaForVersion(installs, requiredMajor, maxMajor) {
  if (installs.length === 0) return null;
  const max = maxMajor == null ? 99 : maxMajor;

  const inRange = installs.filter((i) => i.version >= requiredMajor && i.version <= max);
  if (inRange.length > 0) {
    const exact = inRange.filter((i) => i.version === requiredMajor);
    if (exact.length > 0) return exact[0];
    return [...inRange].sort((a, b) => a.version - b.version)[0];
  }

  const newerOrEqual = installs
    .filter((i) => i.version >= requiredMajor)
    .sort((a, b) => a.version - b.version);
  if (newerOrEqual.length > 0) return newerOrEqual[0];

  const sorted = [...installs].sort((a, b) => b.version - a.version);
  return sorted[0];
}

// Forge/NeoForge 1.18–1.20.4 рассчитаны на Java 17 (до 21). Java 24/25 их ломает
// (sun.misc.Unsafe в securejarhandler / BootstrapLauncher).
function maxJavaForGame(loader, mcVersion, requiredMajor) {
  const ver = String(mcVersion || "");
  if (loader === "forge" || loader === "neoforge") {
    if (requiredMajor <= 8) return 8;
    if (/^26(\.|$)/.test(ver) || requiredMajor >= 25) return 99;
    if (requiredMajor <= 17) return 21;
    if (requiredMajor <= 21) return 21;
  }
  if (/^26(\.|$)/.test(ver) || requiredMajor >= 25) return 99;
  if (requiredMajor <= 17) return 21;
  return 99;
}

module.exports = {
  findAllJavaInstalls,
  getJavaMajorVersion,
  getRequiredJavaVersion,
  pickJavaForVersion,
  findJavaByVersion,
  maxJavaForGame,
};
