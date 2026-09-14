// Установка модпака Modrinth (.mrpack) в отдельный профиль.
// https://docs.modrinth.com/docs/modpacks/format/

const fs = require("fs");
const path = require("path");
const os = require("os");

function loaderFromDeps(deps) {
  const d = deps && typeof deps === "object" ? deps : {};
  const minecraft = d.minecraft || null;
  if (d["fabric-loader"]) return { loader: "fabric", loaderVersion: d["fabric-loader"], minecraft };
  if (d["quilt-loader"]) return { loader: "quilt", loaderVersion: d["quilt-loader"], minecraft };
  if (d.neoforge) return { loader: "neoforge", loaderVersion: d.neoforge, minecraft };
  if (d.forge) return { loader: "forge", loaderVersion: d.forge, minecraft };
  return { loader: "vanilla", loaderVersion: null, minecraft };
}

function safeJoin(root, rel) {
  const cleaned = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("..") || path.isAbsolute(cleaned)) return null;
  const full = path.normalize(path.join(root, cleaned));
  const base = path.normalize(root);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function extractOverrides(zip, prefix, destDir) {
  const pre = prefix.endsWith("/") ? prefix : `${prefix}/`;
  for (const e of zip.getEntries()) {
    const name = String(e.entryName || "").replace(/\\/g, "/");
    if (!name.startsWith(pre) || name === pre) continue;
    const rel = name.slice(pre.length);
    const dest = safeJoin(destDir, rel);
    if (!dest) continue;
    if (e.isDirectory || name.endsWith("/")) {
      fs.mkdirSync(dest, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.getData());
  }
}

async function installModpack({ url, title }, userData, downloadFile, log) {
  if (!url) throw new Error("Нет ссылки на модпак");
  const AdmZip = require("adm-zip");
  const { ensureDir } = require("./launcher");
  const { ensureProfile, uniqueProfileName } = require("./profiles");

  const tmp = path.join(os.tmpdir(), `anlaunch-pack-${Date.now()}.mrpack`);
  log("Скачивание модпака…");
  await downloadFile(url, tmp);

  let zip;
  try {
    zip = new AdmZip(tmp);
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw new Error("Не удалось прочитать .mrpack");
  }

  const indexEntry = zip.getEntry("modrinth.index.json");
  if (!indexEntry) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw new Error("Это не модпак Modrinth (нет modrinth.index.json)");
  }

  let index;
  try {
    index = JSON.parse(indexEntry.getData().toString("utf8"));
  } catch {
    throw new Error("Повреждён modrinth.index.json");
  }

  const deps = loaderFromDeps(index.dependencies);
  if (!deps.minecraft) throw new Error("В модпаке нет версии Minecraft");

  const packName = uniqueProfileName(userData, index.name || title || "Modpack");
  const { dir, name } = ensureProfile(userData, packName);

  const files = (index.files || []).filter((f) => {
    const client = f && f.env && f.env.client;
    return client !== "unsupported";
  });

  log(`Профиль «${name}»: Minecraft ${deps.minecraft} · ${deps.loader} · ${files.length} файлов`);

  const PARALLEL = 8;
  let done = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i += PARALLEL) {
    const batch = files.slice(i, i + PARALLEL);
    await Promise.all(
      batch.map(async (f) => {
        const dest = safeJoin(dir, f.path);
        if (!dest) {
          failed++;
          return;
        }
        try {
          if (fs.existsSync(dest) && f.fileSize && fs.statSync(dest).size === f.fileSize) {
            done++;
            return;
          }
          ensureDir(path.dirname(dest));
          const urls = (f.downloads || []).filter(Boolean);
          let lastErr;
          for (const u of urls) {
            try {
              await downloadFile(u, dest);
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
              try {
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
              } catch {}
            }
          }
          if (lastErr) throw lastErr;
          done++;
        } catch (e) {
          failed++;
          log(`Не скачан ${f.path}: ${e.message || e}`);
        }
      })
    );
    log(`Модпак: ${done}/${files.length} файлов…`);
  }

  log("Копирование overrides…");
  extractOverrides(zip, "overrides", dir);
  extractOverrides(zip, "client-overrides", dir);

  try {
    fs.unlinkSync(tmp);
  } catch {}

  if (!done && files.length) {
    throw new Error("Не удалось скачать файлы модпака");
  }

  return {
    success: true,
    profile: name,
    minecraft: deps.minecraft,
    loader: deps.loader,
    loaderVersion: deps.loaderVersion,
    files: done,
    failed,
    title: index.name || title || name,
  };
}

module.exports = { installModpack, loaderFromDeps };
