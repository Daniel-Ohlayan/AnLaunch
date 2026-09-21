'use strict';
/**
 * AnLauncher — Electron main process.
 *
 * Ответственности:
 *  - окно приложения, конфиг, профили
 *  - Modrinth API: поиск модов, версий, РЕКУРСИВНОЕ разрешение обязательных
 *    зависимостей и библиотек (dependency_type: "required" / "alternative") и их
 *    установка вместе с модом — как на Modrinth. Опциональные зависимости
 *    ("optional") не ставятся, уже установленное в профиле не дублируется
 *  - Mojang API: версии, ассеты, библиотеки, natives, запуск игры
 *  - Forge / NeoForge профили через install-эндпоинт Modrinth
 *  - Авторизация: offline + Microsoft (OAuth2 + PKCE, loopback-редирект)
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const AdmZip = require('adm-zip');

const execFileP = promisify(execFile);
const pkg = require('../package.json');

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const PLATFORM = IS_WINDOWS ? 'windows' : IS_MAC ? 'osx' : 'linux';
const CLASSPATH_SEP = IS_WINDOWS ? ';' : ':';
const MODRINTH = 'https://api.modrinth.com';
const PISTON_META = 'https://piston-meta.mojang.com';
const MS_AUTH_PORT_BASE = 5723;

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function request(url, { method = 'GET', headers = {}, body = null, timeout = 30000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method,
        timeout,
        headers: { 'User-Agent': `AnLauncher/${pkg.version}`, 'Accept': 'application/json, */*', ...headers },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(request(next, { method, headers, body, timeout, redirects: redirects - 1 }));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Таймаут запроса: ${url}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getJSON(url, opts = {}) {
  const r = await request(url, opts);
  if (r.status >= 400) {
    throw new Error(`HTTP ${r.status} при запросе ${url}`);
  }
  return JSON.parse(r.body.toString('utf8'));
}

async function downloadFile(url, dest, { expectedSha1, expectedSha512, retries = 2, onProgress } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await request(url, { timeout: 120000 });
      if (r.status >= 400) throw new Error(`HTTP ${r.status} при загрузке ${url}`);
      const buf = r.body;
      if (expectedSha1 && crypto.createHash('sha1').update(buf).digest('hex') !== expectedSha1.toLowerCase()) {
        throw new Error(`SHA-1 не совпадает для ${path.basename(dest)}`);
      }
      if (expectedSha512 && crypto.createHash('sha512').update(buf).digest('hex') !== expectedSha512.toLowerCase()) {
        throw new Error(`SHA-512 не совпадает для ${path.basename(dest)}`);
      }
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buf);
      if (onProgress) onProgress(buf.length, buf.length);
      return dest;
    } catch (e) {
      lastErr = e;
      await fsp.rm(dest, { force: true }).catch(() => {});
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw lastErr;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Конфиг и профили
// ---------------------------------------------------------------------------
function defaultConfig() {
  const home = os.homedir();
  const gameDir = IS_WINDOWS
    ? path.join(home, 'AppData', 'Roaming', '.minecraft')
    : IS_MAC
      ? path.join(home, 'Library', 'Application Support', 'minecraft')
      : path.join(home, '.minecraft');
  return {
    gameDir,
    javaPath: '',
    defaultRamMB: 4096,
    activeProfileId: null,
    msClientId: '',
    offlineName: 'Player',
    profiles: [],
  };
}

function cfgPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  const d = defaultConfig();
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    return { ...d, ...raw, profiles: Array.isArray(raw.profiles) ? raw.profiles : [] };
  } catch {
    return d;
  }
}

function saveConfigNow(cfg) {
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Не удалось сохранить конфиг:', e);
  }
}

const profileDir = (cfg, p) => path.join(cfg.gameDir, 'instances', p.name);
const profileModsDir = (cfg, p) => path.join(profileDir(cfg, p), 'mods');

/**
 * AnLaunch → AnLauncher: Electron держит конфиг и токены в userData по имени
 * приложения, поэтому один раз переносим их из папки с прежним именем, чтобы у
 * тех, кто уже пользовался лаунчером, не слетели профили и аккаунт.
 */
function migrateLegacyUserData() {
  try {
    const current = app.getPath('userData');
    const legacy = path.join(path.dirname(current), 'AnLaunch');
    if (path.resolve(legacy) === path.resolve(current) || !fs.existsSync(legacy)) return;
    fs.mkdirSync(current, { recursive: true });
    for (const file of ['config.json', 'auth.json']) {
      const from = path.join(legacy, file);
      const to = path.join(current, file);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
        console.log(`[AnLauncher] Настройки перенесены из прежней папки: ${from}`);
      }
    }
  } catch (e) {
    console.error('[AnLauncher] Не удалось перенести данные прежней версии:', e);
  }
}

// ---------------------------------------------------------------------------
// Окно
// ---------------------------------------------------------------------------
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 1000,
    minHeight: 620,
    title: 'AnLauncher',
    backgroundColor: '#0b1220',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => (win = null));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------------------------------------------------------------------------
// Modrinth API
// ---------------------------------------------------------------------------
async function modrinthGet(p, params = {}) {
  const u = new URL(MODRINTH + p);
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v.join(',') : v;
    if (val !== undefined && val !== null && val !== '') u.searchParams.set(k, String(val));
  }
  return getJSON(u.toString());
}

function normalizeFile(f) {
  return {
    url: f.url,
    filename: f.filename,
    primary: !!f.primary,
    size: f.size ?? 0,
    sha1: f.hashes && f.hashes.sha1,
    sha512: f.hashes && f.hashes.sha512,
  };
}

/**
 * Возвращает версию проекта Modrinth.
 * dep: { project_id, project_slug, version, version_type }
 */
async function fetchVersionForDep(dep, { gameVersion, loaders }) {
  // 1) точная версия (id или slug версии)
  if (dep.version && (dep.version_type === 'version' || dep.version_type === 'any')) {
    try {
      const v = await modrinthGet(`/v2/project/${dep.project_id}/version/${encodeURIComponent(dep.version)}`);
      if (v && v.id) return v;
    } catch {
      /* пробуем подбор по фильтрам ниже */
    }
  }
  // 2) подбор по версии игры и загрузчикам
  const qs = { limit: 1 };
  if (gameVersion) qs.game_versions = gameVersion;
  if (loaders && loaders.length) qs.loaders = loaders;
  try {
    const list = await modrinthGet(`/v2/project/${dep.project_id}/version`, qs);
    if (list && list.length) return list[0];
  } catch {
    /* fallback ниже */
  }
  // 3) последняя версия без фильтров
  const any = await modrinthGet(`/v2/project/${dep.project_id}/version`, { limit: 1 });
  return any && any.length ? any[0] : null;
}

/**
 * Что уже стоит в профиле: метаданные profile.installed + реальные файлы в mods/.
 * Нужно, чтобы не качать одно и то же дважды (например, Fabric API уже пришёл как
 * зависимость другого мода) и не плодить дубликаты jar-ов.
 */
function installedIndex(cfg, profile) {
  const modsDir = profileModsDir(cfg, profile);
  const byKey = new Map();
  for (const m of profile.installed || []) {
    if (m.projectId) byKey.set(String(m.projectId).toLowerCase(), m);
    if (m.slug) byKey.set(String(m.slug).toLowerCase(), m);
  }
  return {
    modsDir,
    /**
     * @returns {{ meta: object|null, onDisk: boolean, sameVersion: boolean }|null}
     *          null — этого мода в профиле нет
     */
    find(item) {
      const meta = byKey.get(String(item.projectId).toLowerCase()) || byKey.get(String(item.slug).toLowerCase()) || null;
      if (meta) {
        return {
          meta,
          onDisk: !meta.filename || fs.existsSync(path.join(modsDir, meta.filename)),
          sameVersion: String(meta.versionId || '') === String(item.versionId || ''),
        };
      }
      // метаданных нет, но файл с таким именем уже лежит в mods/ (поставлен вручную)
      if (item.file && fs.existsSync(path.join(modsDir, item.file.filename))) {
        return { meta: null, onDisk: true, sameVersion: false };
      }
      return null;
    },
  };
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ: разбирает выбранный мод и ВСЕ его обязательные зависимости и
 * библиотеки (рекурсивно, с защитой от циклов и дубликатов) — аналогично тому,
 * как Modrinth показывает "required" на странице мода. Опциональные зависимости
 * ("optional") в план не попадают.
 *
 * Позиции, которые уже стоят в профиле (profileId), помечаются
 * alreadyInstalled — их не качаем повторно.
 *
 * @returns {{ items: Array, conflicts: string[], errors: string[] }}
 */
async function resolveInstallPlan({ projectId, versionId, gameVersion, loader, projectSlug, projectTitle, profileId }) {
  const loaders = loader && loader !== 'vanilla' ? [loader] : [];
  const items = new Map(); // versionId -> item
  const byProject = new Map(); // projectId -> item
  const conflicts = [];
  const errors = [];
  const queue = [];

  const addItem = (version, { kind, reason, slug, title }) => {
    if (items.has(version.id)) return items.get(version.id);
    const item = {
      key: version.id,
      kind, // 'mod' | 'dependency'
      slug: slug || version.slug || version.project_slug || '',
      title: title || version.title || version.name || slug || version.id,
      projectId: version.project_id || projectId || version.id,
      versionId: version.id,
      versionNumber: version.version_number || version.name || '',
      gameVersions: version.game_versions || [],
      loaders: version.loaders || [],
      reason: reason || null,
      file: null,
      skipped: false,
      note: null,
      alreadyInstalled: false, // уже есть в профиле — повторно не качаем
      installedVersionNumber: null, // что именно уже стоит
      previousFilename: null, // старый файл, который надо убрать при обновлении
    };
    const files = (version.files || []).filter((f) => f.primary !== false);
    const primary = files.find((f) => f.primary) || files[0];
    if (!primary) {
      item.skipped = true;
      item.note = 'Нет файла для загрузки';
    } else {
      item.file = normalizeFile(primary);
    }
    // обратная проверка: уже добавленные моды могут объявлять incompatible против этого
    for (const prev of queue) {
      for (const d of prev.dependencies || []) {
        if (d.dependency_type !== 'incompatible') continue;
        if (d.project_id === item.projectId || (item.slug && d.project_slug === item.slug)) {
          const prevItem = items.get(prev.id);
          conflicts.push(`«${item.title}» несовместим с «${prevItem ? prevItem.title : '?'}»`);
        }
      }
    }
    items.set(version.id, item);
    byProject.set(item.projectId, item);
    queue.push(version);
    return item;
  };

  const metaCache = new Map();
  const projectMeta = async (pid) => {
    if (metaCache.has(pid)) return metaCache.get(pid);
    let m = { slug: '', title: '' };
    try {
      const p = await modrinthGet('/v2/project/' + pid);
      m = { slug: p.slug, title: p.title };
    } catch {
      /* оставим пустое */
    }
    metaCache.set(pid, m);
    return m;
  };

  const findBySlug = (slug) => {
    if (!slug) return undefined;
    for (const it of items.values()) if (it.slug === slug) return it;
    return undefined;
  };

  const checkIncompatibility = (version, item) => {
    for (const d of version.dependencies || []) {
      if (d.dependency_type !== 'incompatible') continue;
      const existing = byProject.get(d.project_id) || findBySlug(d.project_slug);
      if (existing && existing.key !== item.key) {
        conflicts.push(`«${item.title}» несовместим с «${existing.title}»`);
      }
    }
  };

  // стартовая версия
  let base = null;
  if (versionId) {
    try {
      base = await modrinthGet(`/v2/project/${projectId}/version/${encodeURIComponent(versionId)}`);
    } catch {
      errors.push(`Не удалось получить версию ${versionId} мода`);
    }
  }
  if (!base) {
    const qs = { limit: 5 };
    if (gameVersion) qs.game_versions = gameVersion;
    if (loaders.length) qs.loaders = loaders;
    const list = await modrinthGet(`/v2/project/${projectId}/version`, qs);
    base = list && list.length ? list[0] : null;
    if (!base) errors.push('Для выбранной версии игры нет совместимых версий этого мода');
  }
  if (!base) return { items: [], conflicts, errors };

  const baseItem = addItem(base, { kind: 'mod', reason: null, slug: projectSlug, title: projectTitle });
  checkIncompatibility(base, baseItem);

  let head = 0;
  while (head < queue.length) {
    const version = queue[head++];
    const parentTitle = items.get(version.id)?.title || '?';
    for (const dep of version.dependencies || []) {
      const type = dep.dependency_type;
      if (type === 'incompatible' || type === 'included') continue;
      if (type === 'optional') continue; // опциональные не ставим — как на сайте Modrinth
      if (dep.version_type === 'incompatible') continue;

      const exists = byProject.get(dep.project_id) || findBySlug(dep.project_slug);
      if (exists) continue; // уже в плане (дедупликация, защита от циклов)

      // подпись: имя проекта (для UI и dedupe по slug)
      const depMeta = await projectMeta(dep.project_id);
      const depSlug = dep.project_slug || depMeta.slug;
      const depTitle = depMeta.title || depSlug;

      if (type === 'alternative') {
        const dv = await fetchVersionForDep(dep, { gameVersion, loaders }).catch(() => null);
        if (dv) {
          const it = addItem(dv, { kind: 'dependency', reason: `альтернатива (нужна ${parentTitle})`, slug: depSlug, title: depTitle });
          checkIncompatibility(dv, it);
        } else {
          errors.push(`Не найдена альтернативная зависимость: ${depSlug}`);
        }
        continue;
      }

      // type === 'required' (и прочие, что требуются)
      const dv = await fetchVersionForDep(dep, { gameVersion, loaders }).catch(() => null);
      if (dv) {
        const it = addItem(dv, { kind: 'dependency', reason: `требуется ${parentTitle}`, slug: depSlug, title: depTitle });
        checkIncompatibility(dv, it);
      } else {
        errors.push(`Не найдена обязательная зависимость: ${depSlug} (для ${parentTitle})`);
      }
    }
  }

  // Что уже стоит в профиле — повторно не качаем и не дублируем.
  const cfg = loadConfig();
  const profile = profileId ? cfg.profiles.find((p) => p.id === profileId) : null;
  if (profile) {
    const index = installedIndex(cfg, profile);
    for (const item of items.values()) {
      const found = index.find(item);
      if (!found) continue;
      item.installedVersionNumber = found.meta ? found.meta.versionNumber || null : null;
      // основной мод: пропускаем только если стоит ровно та же версия, иначе это обновление
      if (item.kind === 'mod' && !found.sameVersion) {
        if (found.onDisk && found.meta && item.file && found.meta.filename !== item.file.filename) {
          item.previousFilename = found.meta.filename; // старый файл уберём после установки новой версии
        }
        continue;
      }
      if (!found.onDisk) continue; // в метаданных есть, а файла нет — ставим заново
      item.alreadyInstalled = true;
    }
  }

  const ordered = [...items.values()].sort((a, b) => {
    if (a.kind === 'mod') return -1;
    if (b.kind === 'mod') return 1;
    return 0;
  });
  return { items: ordered, conflicts, errors };
}

// ---------------------------------------------------------------------------
// Mojang: версии, ассеты, библиотеки
// ---------------------------------------------------------------------------
const cacheDir = () => path.join(app.getPath('userData'), 'cache');

async function getVersionManifest(force = false) {
  const p = path.join(cacheDir(), 'version_manifest.json');
  if (!force) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(raw.versions) && raw.versions.length) return raw;
    } catch {
      /* нет кэша */
    }
  }
  const data = await getJSON(`${PISTON_META}/mc/game/version_manifest_v2.json`);
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
  return data;
}

async function getVersionJson(id, force = false) {
  const p = path.join(cacheDir(), 'versions', `${id}.json`);
  if (!force) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      /* нет кэша */
    }
  }
  const manifest = await getVersionManifest();
  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Версия ${id} не найдена в списке Mojang`);
  const data = await getJSON(entry.url);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
  return data;
}

async function getAssetIndex(versionJson) {
  const idxMeta = versionJson.assets?.index || versionJson.assetIndex;
  if (!idxMeta) throw new Error('Нет данных об индексе ассетов');
  const p = path.join(cacheDir(), 'asset_index', `${versionJson.assets?.id || idxMeta.id}.json`);
  if (!fs.existsSync(p)) {
    const buf = (await request(idxMeta.url)).body;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const LIBRARIES_BASE = 'https://libraries.mojang.com/services/api/v1/assets/artifacts/maven';
function libUrl(lib) {
  if (lib.url) return lib.url;
  const parts = lib.name.split(':');
  const group = parts[0].split('.').join('/');
  const file = `${parts[1]}-${parts[2]}${parts[3] ? `-${parts[3]}` : ''}.jar`;
  return `${LIBRARIES_BASE}/${group}/${parts[1]}/${parts[2]}/${file}`;
}
function libLocalPath(libsRoot, name) {
  const parts = name.split(':');
  const group = parts[0].split('.').join(path.sep);
  const file = `${parts[1]}-${parts[2]}${parts[3] ? `-${parts[3]}` : ''}.jar`;
  return path.join(libsRoot, group, parts[1], parts[2], file);
}

const OS_ARCH = process.arch === 'x64' ? 'x86_64' : process.arch;
function libAllowed(lib) {
  let allow = true;
  for (const rule of lib.rules || []) {
    const osRule = rule.os;
    if (osRule) {
      if (osRule.name && osRule.name !== PLATFORM) continue;
      if (osRule.arch && osRule.arch !== OS_ARCH) continue;
      if (osRule.version && !new RegExp(osRule.version).test(os.release())) continue;
    }
    allow = rule.action === 'allow';
  }
  return allow;
}

function extractNatives(lib, libsRoot, destDir) {
  const token = lib.natives && lib.natives[PLATFORM];
  if (!token) return null;
  const jar = libLocalPath(libsRoot, lib.name);
  if (!fs.existsSync(jar)) return null;
  const sub = token.replace(/\$\{arch\}/g, process.arch === 'x64' ? '64' : '32');
  const outDir = path.join(destDir, sub);
  try {
    const zip = new AdmZip(jar);
    const exclude = new Set((lib.extract && lib.extract.exclude) || []);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (exclude.has(entry.entryName)) continue;
      const out = path.join(outDir, entry.entryName);
      if (!out.startsWith(outDir + path.sep)) continue; // защита от zip-slip
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, entry.getData());
    }
    return outDir;
  } catch (e) {
    console.error('Ошибка распаковки natives:', e);
    return null;
  }
}

/** Профиль Forge / NeoForge через install-эндпоинт Modrinth. */
async function getLoaderProfile(loader, loaderVersion) {
  const slug = loader === 'neoforge' ? 'neo-forge' : loader;
  const key = `${slug}-${loaderVersion}`.replace(/[\\/:*?"<>|]/g, '_');
  const p = path.join(cacheDir(), 'loader', `${key}.json`);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      /* перечитываем */
    }
  }
  const data = await getJSON(`${MODRINTH}/minecraft/${slug}/${encodeURIComponent(loaderVersion)}/install`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data));
  return data;
}

/** Собирает финальный versionJson с учётом Forge/NeoForge. */
async function buildVersionJson(profile, cfg, onProgress) {
  const base = await getVersionJson(profile.gameVersion);
  if (!profile.loader || profile.loader === 'vanilla') return base;
  if (!profile.loaderVersion) throw new Error('Не выбрана версия Forge/NeoForge в профиле');

  onProgress?.('loader', 'Загружаем профиль ' + profile.loader + '…');
  const lp = await getLoaderProfile(profile.loader, profile.loaderVersion);
  const mcId = lp.minecraftId || profile.gameVersion;
  const vanilla = mcId === base.id ? base : await getVersionJson(mcId);

  const libs = [...(vanilla.libraries || [])];
  const extraLibs = lp.libraries || (lp.versionInfo && lp.versionInfo.libraries) || [];
  for (const l of extraLibs) {
    if (l && l.name && !libs.some((x) => x.name === l.name)) libs.push(l);
  }
  return {
    ...vanilla,
    id: `${profile.loader}-${profile.loaderVersion}`,
    mainClass: lp.mainClass || vanilla.mainClass,
    libraries: libs,
    javaVersion: lp.javaVersion || vanilla.javaVersion,
  };
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------
function parseJavaMajor(v) {
  if (!v) return 0;
  const parts = v.split('.');
  const major = parts[0] === '1' && parts.length > 1 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
  return Number.isFinite(major) ? major : 0;
}

async function detectJavaCandidates() {
  const candidates = [];
  const seen = new Set();
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      candidates.push(p);
    }
  };
  const exe = IS_WINDOWS ? 'java.exe' : 'java';
  if (process.env.JAVA_HOME) add(path.join(process.env.JAVA_HOME, 'bin', exe));

  if (IS_WINDOWS) {
    const bases = [
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\Glowstone',
    ];
    for (const base of bases) {
      try {
        for (const d of fs.readdirSync(base)) add(path.join(base, d, 'bin', exe));
      } catch {
        /* каталога нет */
      }
    }
  } else {
    for (const base of ['/usr/lib/jvm', '/usr/local/opt', '/opt/homebrew/opt', '/opt/java', '/usr/java']) {
      try {
        for (const d of fs.readdirSync(base)) {
          const bin = fs.existsSync(path.join(base, d, 'bin', exe)) ? path.join(base, d, 'bin', exe) : null;
          add(bin);
          // homebrew: /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java
          const hk = path.join(base, d, 'libexec', 'openjdk.jdk', 'Contents', 'Home', 'bin', 'java');
          add(hk);
        }
      } catch {
        /* каталога нет */
      }
    }
    add('/usr/bin/java');
    add('/usr/local/bin/java');
  }

  const out = [];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const { stdout, stderr } = await execFileP(p, ['-version'], { timeout: 6000 });
      const text = (stdout || '') + (stderr || '');
      const m = /version "([^"]+)"/.exec(text);
      out.push({ path: p, version: m ? m[1] : '?', major: parseJavaMajor(m && m[1]) });
    } catch {
      /* не запустилось */
    }
  }
  // сортируем: новее — выше
  out.sort((a, b) => b.major - a.major);
  return out;
}

async function findJava(requiredMajor) {
  const cfg = loadConfig();
  const tryPaths = [cfg.javaPath];
  if (process.env.JAVA_HOME) tryPaths.push(path.join(process.env.JAVA_HOME, 'bin', IS_WINDOWS ? 'java.exe' : 'java'));
  const candidates = await detectJavaCandidates();
  const all = [...new Set([...tryPaths, ...candidates.map((c) => c.path)])].filter(Boolean);
  for (const p of all) {
    try {
      if (!fs.existsSync(p)) continue;
      const { stdout, stderr } = await execFileP(p, ['-version'], { timeout: 6000 });
      const m = /version "([^"]+)"/.exec((stdout || '') + (stderr || ''));
      if (m && (!requiredMajor || parseJavaMajor(m[1]) >= requiredMajor)) return p;
    } catch {
      /* мимо */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Запуск игры
// ---------------------------------------------------------------------------
let gameProc = null;

function fillArgs(template, map) {
  return template.replace(/\$\{(\w+)\}/g, (s, k) => (k in map ? String(map[k]) : s));
}

async function launchGame(profileId, emit) {
  const cfg = loadConfig();
  const profile = cfg.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Профиль не найден');
  if (gameProc) throw new Error('Игра уже запущена');

  const instDir = profileDir(cfg, profile);
  const gameDirRoot = cfg.gameDir;
  const assetsRoot = path.join(gameDirRoot, 'assets');
  const versionsRoot = path.join(gameDirRoot, 'versions');
  const libsRoot = path.join(gameDirRoot, 'libraries');
  const nativesRoot = path.join(instDir, 'natives');
  fs.mkdirSync(instDir, { recursive: true });

  emit({ type: 'state', state: 'preparing' });
  const vjson = await buildVersionJson(profile, cfg, (stage, label) => emit({ type: 'progress', stage, label }));

  const major = vjson.javaVersion ? vjson.javaVersion.major_version : 0;
  const java = (await findJava(major)) || cfg.javaPath;
  if (!java || !fs.existsSync(java)) {
    throw new Error(`Java ${major || ''} не найдена. Укажите путь к java в Настройках (java ${major || '—'}+).`);
  }

  // клиентский jar
  emit({ type: 'progress', stage: 'client', label: 'Клиентская jar…' });
  const clientJar = path.join(versionsRoot, vjson.id, `${vjson.id}.jar`);
  const dl = vjson.downloads && vjson.downloads.client;
  if (dl && !fs.existsSync(clientJar)) {
    await downloadFile(dl.url, clientJar, { expectedSha1: dl.sha1 });
  } else if (!fs.existsSync(clientJar) && !dl) {
    throw new Error('Неизвестный клиент для версии ' + vjson.id);
  }

  // библиотеки
  const libs = (vjson.libraries || []).filter(libAllowed);
  const missing = libs.filter((l) => !fs.existsSync(libLocalPath(libsRoot, l.name)));
  emit({ type: 'progress', stage: 'libraries', label: `Библиотеки: ${missing.length} шт.`, total: missing.length });
  let doneLibs = 0;
  await pool(missing, 6, async (l) => {
    await downloadFile(libUrl(l), libLocalPath(libsRoot, l.name));
    doneLibs++;
    emit({ type: 'progress', stage: 'libraries', label: `Библиотеки: ${doneLibs}/${missing.length}`, done: doneLibs, total: missing.length });
  });

  // ассеты
  emit({ type: 'progress', stage: 'assets', label: 'Проверяем ассеты…' });
  const assetIndex = await getAssetIndex(vjson);
  const objects = assetIndex.objects || {};
  const missingAssets = Object.values(objects).filter((a) => !fs.existsSync(path.join(assetsRoot, 'objects', a.hash.slice(0, 2), a.hash)));
  let doneAssets = 0;
  await pool(missingAssets, 8, async (a) => {
    const dest = path.join(assetsRoot, 'objects', a.hash.slice(0, 2), a.hash);
    await downloadFile(`${PISTON_META.replace('/mc/game', '')}/v1/objects/${a.hash.slice(0, 2)}/${a.hash}`, dest, { expectedSha1: a.hash });
    doneAssets++;
    if (doneAssets % 10 === 0 || doneAssets === missingAssets.length) {
      emit({ type: 'progress', stage: 'assets', label: `Ассеты: ${doneAssets}/${missingAssets.length}`, done: doneAssets, total: missingAssets.length });
    }
  });
  const assetIndexId = vjson.assets?.id || vjson.assetIndex?.id || 'legacy';
  fs.mkdirSync(path.join(assetsRoot, 'indexes'), { recursive: true });
  fs.writeFileSync(path.join(assetsRoot, 'indexes', `${assetIndexId}.json`), JSON.stringify(assetIndex));

  // natives
  const nativesDirs = [];
  for (const l of libs) {
    const dir = extractNatives(l, libsRoot, nativesRoot);
    if (dir) nativesDirs.push(dir);
  }

  // авторизация
  const auth = loadAuth();
  const player = auth && auth.loggedIn ? auth.username : cfg.offlineName || 'Player';
  const uuid = (auth && auth.uuid) || offlineUuid(player);

  // classpath
  const classpath = [clientJar, ...libs.map((l) => libLocalPath(libsRoot, l.name))];

  // аргументы
  const argsGame = vjson.arguments && vjson.arguments.game;
  const argsJvm = vjson.arguments && vjson.arguments.jvm;
  const legacyArgs = vjson.minecraftArguments;
  const map = {
    auth_player_name: player,
    version_name: vjson.id,
    game_directory: instDir,
    assets_root: assetsRoot,
    assets_index_name: assetIndexId,
    auth_uuid: uuid,
    auth_access_token: (auth && auth.accessToken) || '0',
    user_type: auth && auth.loggedIn ? 'msa' : 'legacy',
    version_type: vjson.type || 'release',
    user_properties: '{}',
    auth_session: `token:${(auth && auth.accessToken) || ''}:${uuid}`,
    clientid: '',
    auth_xuid: '',
    version_uuid: crypto.randomUUID(),
    natives_directory: nativesDirs.join(CLASSPATH_SEP) || nativesRoot,
    launcher_name: 'AnLauncher',
    launcher_version: pkg.version,
    classpath: classpath.join(CLASSPATH_SEP),
  };

  const jvm = [];
  if (IS_WINDOWS) jvm.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
  const ram = profile.ramMB || cfg.defaultRamMB || 4096;
  jvm.push(`-Xms${Math.min(ram, 1024)}M`, `-Xmx${ram}M`);
  if (nativesDirs.length) jvm.push(`-Djava.library.path=${nativesDirs.join(CLASSPATH_SEP)}`);

  if (argsJvm) {
    for (const a of argsJvm) {
      if (!libAllowed({ rules: a.rules })) continue;
      const value = a.value;
      const arr = Array.isArray(value) ? value : [value];
      for (const v of arr) jvm.push(fillArgs(v, map));
    }
  }
  jvm.push('-cp', classpath.join(CLASSPATH_SEP));

  const game = [];
  if (argsGame) {
    for (const a of argsGame) {
      const arr = Array.isArray(a.value) ? a.value : [a.value];
      for (const v of arr) game.push(fillArgs(v, map));
    }
  } else if (legacyArgs) {
    game.push(...legacyArgs.split(' ').map((v) => fillArgs(v, map)));
  }
  if (profile.customArgs) game.push(...profile.customArgs.trim().split(/\s+/));

  emit({ type: 'progress', stage: 'start', label: 'Запускаем Minecraft…' });
  emit({ type: 'log', line: `[AnLauncher] ${java} | ${vjson.id} | RAM ${ram}МБ` });

  const logsDir = path.join(instDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });

  gameProc = spawn(java, [...jvm, vjson.mainClass, ...game], {
    cwd: instDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: false,
    detached: !IS_WINDOWS,
  });
  const onOut = (buf) => {
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      logStream.write(line + '\n');
      emit({ type: 'log', line });
    }
  };
  gameProc.stdout.on('data', onOut);
  gameProc.stderr.on('data', onOut);
  gameProc.on('error', (e) => {
    emit({ type: 'log', line: `[AnLauncher] Ошибка запуска: ${e.message}` });
    emit({ type: 'state', state: 'exited', code: -1 });
    gameProc = null;
  });
  gameProc.on('close', (code) => {
    logStream.end();
    emit({ type: 'state', state: 'exited', code: code ?? -1 });
    gameProc = null;
  });
  emit({ type: 'state', state: 'running' });
  return { ok: true, pid: gameProc.pid };
}

function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Авторизация Microsoft (OAuth2 + PKCE, loopback redirect)
// ---------------------------------------------------------------------------
function authPath() {
  return path.join(app.getPath('userData'), 'auth.json');
}
function loadAuth() {
  try {
    return JSON.parse(fs.readFileSync(authPath(), 'utf8'));
  } catch {
    return { loggedIn: false };
  }
}
function saveAuth(a) {
  fs.mkdirSync(path.dirname(authPath()), { recursive: true });
  fs.writeFileSync(authPath(), JSON.stringify(a, null, 2));
  // в рендерер отправляем только публичные поля (без токенов)
  send('evt:auth', { loggedIn: !!a.loggedIn, kind: a.kind, username: a.username, uuid: a.uuid });
}

async function msExchangeXbox(code) {
  // 1) access_token -> Xbox Live
  const rps = 'd=' + code;
  const xbl = await getJSON('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: rps },
      AuthMethod: 'RPS',
      RpsTicket: rps,
    }),
  });
  // 2) XSTS
  const xsts = await getJSON('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Properties: { SandboxId: 'RETAIL' }, Token: 'XBL3.0 x=1;' + xbl.Token, AuthMethod: 'RPS', RelyingParty: 'http://auth.xboxlive.com' }),
  });
  // 3) Minecraft
  const mc = await getJSON('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: 'XBL3.0 x=1;xsts.' + xsts.Token }),
  });
  return mc;
}

let msServer = null;
function startMsLogin(clientId) {
  return new Promise((resolve, reject) => {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const scope =
      'XBL.auth.offline XboxLive.signin service::userapi.xboxlive.com::user_xboxlive service::member.stats.mps.xboxlive.com::read service::mcgameprofile.store.xboxlive.com::profile service::mcgameprofile.store.xboxlive.com::profiles service::mcservices.store.xboxlive.com::user_mcservices';
    let port = MS_AUTH_PORT_BASE;
    let server = null;
    let finished = false;
    function finish(err, code) {
      if (finished) return;
      finished = true;
      try {
        if (server) server.close();
      } catch {
        /* ignore */
      }
      msServer = null;
      if (err) return reject(err);
      const tokenUrl = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
      tokenUrl.searchParams.set('client_id', clientId);
      tokenUrl.searchParams.set('grant_type', 'authorization_code');
      tokenUrl.searchParams.set('code', code);
      tokenUrl.searchParams.set('redirect_uri', `http://127.0.0.1:${port}/auth/callback`);
      tokenUrl.searchParams.set('code_verifier', verifier);
      getJSON(tokenUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      })
        .then(async (tk) => {
          const mc = await msExchangeXbox(tk.access_token);
          saveAuth({
            loggedIn: true,
            kind: 'microsoft',
            username: mc.profile.name,
            uuid: mc.profile.id,
            accessToken: mc.access_token,
            refreshToken: tk.refresh_token,
            expiresAt: Date.now() + (tk.expires_in || 86400) * 1000,
            clientId,
          });
          resolve(mc.profile);
        })
        .catch(reject);
    }

    const onListening = () => {
      msServer = server;
      const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
      const url = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', scope);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('prompt', 'select_account');

      server.on('request', (req, res) => {
        try {
          const u = new URL(req.url, 'http://127.0.0.1');
          if (u.pathname === '/auth/callback') {
            const code = u.searchParams.get('code');
            const err = u.searchParams.get('error');
            if (err) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h2>AnLauncher: вход отклонён (ошибка Microsoft)</h2><p>Можно закрыть это окно.</p>');
              finish(new Error('Microsoft: ' + err));
            } else if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h2>AnLauncher: вход выполнен</h2><p>Можно закрыть это окно и вернуться к лаунчеру.</p>');
              finish(null, code);
            } else {
              res.writeHead(400);
              res.end('bad request');
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        } catch (e) {
          reject(e);
        }
      });
      shell.openExternal(url.toString()).catch(() => {});
    };
    const tryListen = () => {
      server = http.createServer();
      server.once('error', (e) => {
        if (port - MS_AUTH_PORT_BASE < 10 && e.code === 'EADDRINUSE') {
          port++;
          tryListen();
        } else {
          reject(e);
        }
      });
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };
    tryListen();
    setTimeout(() => finish(new Error('Таймаут ожидания входа Microsoft (5 минут)')), 5 * 60 * 1000).unref();
  });
}

async function refreshMsToken() {
  const auth = loadAuth();
  if (!auth.loggedIn || !auth.refreshToken || !auth.clientId) return;
  try {
    const tokenUrl = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
    tokenUrl.searchParams.set('client_id', auth.clientId);
    tokenUrl.searchParams.set('grant_type', 'refresh_token');
    tokenUrl.searchParams.set('refresh_token', auth.refreshToken);
    tokenUrl.searchParams.set('scope', 'XBL.auth.offline XboxLive.signin');
    const tk = await getJSON(tokenUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    const mc = await msExchangeXbox(tk.access_token);
    saveAuth({
      ...auth,
      accessToken: mc.access_token,
      refreshToken: tk.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + (tk.expires_in || 86400) * 1000,
    });
  } catch {
    saveAuth({ loggedIn: false });
  }
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('app:init', async () => {
    const cfg = loadConfig();
    let versions = [];
    try {
      const manifest = await getVersionManifest(false);
      versions = manifest.versions.map((v) => ({ id: v.id, type: v.type, url: v.url }));
    } catch {
      /* оффлайн — обновим из UI */
    }
    const auth = loadAuth();
    return {
      version: pkg.version,
      platform: PLATFORM,
      config: {
        gameDir: cfg.gameDir,
        javaPath: cfg.javaPath,
        defaultRamMB: cfg.defaultRamMB,
        msClientId: cfg.msClientId,
        offlineName: cfg.offlineName,
      },
      profiles: cfg.profiles,
      activeProfileId: cfg.activeProfileId,
      versions,
      auth: { loggedIn: !!auth.loggedIn, kind: auth.kind, username: auth.username, uuid: auth.uuid },
    };
  });

  ipcMain.handle('app:openExternal', (_e, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
  });

  ipcMain.handle('settings:save', (_e, patch) => {
    const cfg = loadConfig();
    const allowed = ['gameDir', 'javaPath', 'defaultRamMB', 'msClientId', 'offlineName'];
    for (const k of allowed) if (patch[k] !== undefined && patch[k] !== null) cfg[k] = patch[k];
    saveConfigNow(cfg);
    return {
      gameDir: cfg.gameDir,
      javaPath: cfg.javaPath,
      defaultRamMB: cfg.defaultRamMB,
      msClientId: cfg.msClientId,
      offlineName: cfg.offlineName,
    };
  });

  ipcMain.handle('java:detect', async () => detectJavaCandidates());

  ipcMain.handle('versions:refresh', async () => {
    const manifest = await getVersionManifest(true);
    return manifest.versions.map((v) => ({ id: v.id, type: v.type, url: v.url }));
  });

  ipcMain.handle('versions:loaders', async (_e, { loader, gameVersion }) => {
    if (!loader || loader === 'vanilla') return [];
    const slug = loader === 'neoforge' ? 'neoforge' : loader;
    try {
      const list = await modrinthGet(`/v2/project/${slug}/version`, {
        game_versions: gameVersion || undefined,
        limit: 80,
      });
      return list.map((v) => ({ versionNumber: v.version_number, id: v.id }));
    } catch {
      return [];
    }
  });

  // ---------------- профили ----------------
  ipcMain.handle('profile:create', (_e, data) => {
    const cfg = loadConfig();
    const name = (data.name || '').trim() || 'Профиль';
    if (cfg.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Профиль с таким именем уже есть');
    }
    const p = {
      id: crypto.randomUUID(),
      name,
      gameVersion: data.gameVersion || '1.21.4',
      loader: data.loader || 'vanilla',
      loaderVersion: data.loaderVersion || '',
      ramMB: data.ramMB || cfg.defaultRamMB || 4096,
      javaPath: data.javaPath || '',
      customArgs: data.customArgs || '',
      installed: [],
      createdAt: Date.now(),
    };
    cfg.profiles.push(p);
    if (!cfg.activeProfileId) cfg.activeProfileId = p.id;
    saveConfigNow(cfg);
    return p;
  });

  ipcMain.handle('profile:update', (_e, { id, patch }) => {
    const cfg = loadConfig();
    const p = cfg.profiles.find((x) => x.id === id);
    if (!p) throw new Error('Профиль не найден');
    const allowed = ['name', 'gameVersion', 'loader', 'loaderVersion', 'ramMB', 'javaPath', 'customArgs'];
    const oldName = p.name;
    for (const k of allowed) if (patch[k] !== undefined) p[k] = patch[k];
    // если изменилось имя — переименовываем папку инстанса, чтобы mods/ остались на месте
    if (p.name && p.name !== oldName) {
      const oldDir = profileDir(cfg, { name: oldName });
      const newDir = profileDir(cfg, { name: p.name });
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
          fs.renameSync(oldDir, newDir);
        } catch (e) {
          console.error('Не удалось переименовать папку инстанса:', e);
        }
      }
    }
    saveConfigNow(cfg);
    return p;
  });

  ipcMain.handle('profile:delete', (_e, id) => {
    const cfg = loadConfig();
    cfg.profiles = cfg.profiles.filter((p) => p.id !== id);
    if (cfg.activeProfileId === id) cfg.activeProfileId = cfg.profiles[0]?.id || null;
    saveConfigNow(cfg);
  });

  ipcMain.handle('profile:active', (_e, id) => {
    const cfg = loadConfig();
    cfg.activeProfileId = id || null;
    saveConfigNow(cfg);
    return cfg.activeProfileId;
  });

  // ---------------- моды (Modrinth) ----------------
  ipcMain.handle('mods:search', async (_e, { query, gameVersion, loader, offset = 0, limit = 24 }) => {
    const facets = [['project_types:mod']];
    if (gameVersion) facets.push(['game_versions:' + gameVersion]);
    if (loader && loader !== 'vanilla') facets.push(['loaders:' + loader]);
    const hits = await modrinthGet('/v2/search', {
      facets: JSON.stringify(facets),
      query: query || '',
      limit,
      offset,
    });
    return {
      hits: hits.map((h) => ({
        projectId: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        iconUrl: h.icon_url,
        downloads: h.downloads,
        followers: h.followers,
        gameVersions: h.game_versions,
        loaders: h.loaders,
        versionNumber: h.version_number,
      })),
      total: hits.length,
    };
  });

  ipcMain.handle('mods:versions', async (_e, { projectId, gameVersion, loader, limit = 30 }) => {
    const list = await modrinthGet(`/v2/project/${projectId}/version`, { limit });
    const out = list.map((v) => ({
      id: v.id,
      versionNumber: v.version_number || v.name,
      name: v.name,
      gameVersions: v.game_versions || [],
      loaders: v.loaders || [],
      releaseTime: v.release_time,
      dependencies: (v.dependencies || []).map((d) => ({
        projectId: d.project_id,
        projectSlug: d.project_slug,
        version: d.version,
        versionType: d.version_type,
        dependencyType: d.dependency_type,
      })),
    }));
    if (gameVersion) {
      out.sort((a, b) => (b.gameVersions.includes(gameVersion) ? 1 : 0) - (a.gameVersions.includes(gameVersion) ? 1 : 0));
    }
    return out;
  });

  ipcMain.handle('mods:resolve', async (_e, plan) => {
    return resolveInstallPlan(plan);
  });

  ipcMain.handle('mods:install', async (_e, { profileId, projectId, versionId, gameVersion, loader, projectSlug, projectTitle }) => {
    const cfg = loadConfig();
    const profile = cfg.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error('Выберите профиль, в который ставить мод');
    if (!profile.loader || profile.loader === 'vanilla') {
      throw new Error('В Vanilla-профиль моды не устанавливаются. Создайте профиль с Forge или NeoForge.');
    }
    const emit = (ev) => send('evt:install', ev);
    // Лог установки: консоль + файл instances/<имя>/logs/anlauncher.log (и событие для UI).
    const installLogDir = path.join(profileDir(cfg, profile), 'logs');
    const installLogFile = path.join(installLogDir, 'anlauncher.log');
    const log = (line) => {
      console.log(line);
      try {
        fs.mkdirSync(installLogDir, { recursive: true });
        fs.appendFileSync(installLogFile, `${new Date().toISOString()} ${line}\n`);
      } catch {
        /* лог не критичен для установки */
      }
      emit({ type: 'log', line });
    };

    const plan = await resolveInstallPlan({
      projectId,
      versionId,
      gameVersion: gameVersion || profile.gameVersion,
      loader: loader || profile.loader,
      projectSlug,
      projectTitle,
      profileId,
    });
    if (plan.conflicts.length) {
      throw new Error('Конфликт зависимостей: ' + plan.conflicts.join('; '));
    }
    emit({ type: 'plan', items: plan.items, errors: plan.errors });

    const modsDir = profileModsDir(cfg, profile);
    const mainItem = plan.items.find((i) => i.kind === 'mod');
    const loaderLabel = profile.loader && profile.loader !== 'vanilla' ? ` · ${profile.loader} ${profile.loaderVersion || ''}`.trimEnd() : '';
    log(`[AnLauncher] Установка «${(mainItem && mainItem.title) || projectTitle || projectSlug}» в профиль «${profile.name}» (${profile.gameVersion}${loaderLabel})`);

    const toInstall = plan.items.filter((i) => !i.alreadyInstalled && !i.skipped && i.file);
    const requiredCount = toInstall.filter((i) => i.kind === 'dependency').length;
    log(
      `[AnLauncher] Файлов к загрузке: ${toInstall.length}` +
        (requiredCount
          ? `, из них обязательных зависимостей и библиотек: ${requiredCount} — ставятся автоматически`
          : '') +
        (plan.items.length !== toInstall.length ? `, уже в профиле: ${plan.items.length - toInstall.length}` : ''),
    );

    let installed = 0;
    let failed = 0;
    let skipped = 0;
    const installedMeta = [];
    for (const item of plan.items) {
      if (item.alreadyInstalled) {
        skipped++;
        const was = item.installedVersionNumber ? ` · v${item.installedVersionNumber}` : '';
        emit({ type: 'item', key: item.key, status: 'skipped', note: `уже в профиле${was}` });
        log(`[AnLauncher] Уже в профиле, пропускаем: ${item.title}${item.installedVersionNumber ? ' v' + item.installedVersionNumber : ''}`);
        continue;
      }
      if (item.skipped || !item.file) {
        failed++;
        emit({ type: 'item', key: item.key, status: 'skipped', note: item.note || 'нет файла для загрузки' });
        log(`[AnLauncher] Пропущено: ${item.title} — ${item.note || 'нет файла для загрузки'}`);
        continue;
      }
      emit({ type: 'item', key: item.key, status: 'downloading' });
      try {
        const dest = path.join(modsDir, item.file.filename);
        await downloadFile(item.file.url, dest, { expectedSha1: item.file.sha1, expectedSha512: item.file.sha512 });
        // обновление версии: старый файл того же мода убираем, чтобы не было дублей в mods/
        if (item.previousFilename && item.previousFilename !== item.file.filename) {
          await fsp.rm(path.join(modsDir, item.previousFilename), { force: true }).catch(() => {});
          log(`[AnLauncher] Удалён старый файл: ${item.previousFilename}`);
        }
        emit({ type: 'item', key: item.key, status: 'done' });
        installed++;
        installedMeta.push({
          slug: item.slug,
          projectId: item.projectId,
          versionId: item.versionId,
          title: item.title,
          versionNumber: item.versionNumber,
          filename: item.file.filename,
        });
        log(`[AnLauncher] Доставлено: ${item.title} v${item.versionNumber} (${item.reason || 'основной мод'})`);
      } catch (e) {
        failed++;
        const msg = String((e && e.message) || e);
        emit({ type: 'item', key: item.key, status: 'error', error: msg });
        log(`[AnLauncher] Ошибка загрузки: ${item.title} — ${msg}`);
      }
    }

    // обновляем список установленного в профиле (без дублей по slug)
    const freshKeys = new Set();
    for (const m of installedMeta) {
      freshKeys.add(String(m.slug).toLowerCase());
      freshKeys.add(String(m.projectId).toLowerCase());
    }
    const keep = [];
    const seen = new Set();
    for (const m of profile.installed || []) {
      const slug = String(m.slug || '').toLowerCase();
      if (!slug || seen.has(slug)) continue; // дубликаты в метаданных
      if (freshKeys.has(slug) || freshKeys.has(String(m.projectId || '').toLowerCase())) continue; // заменено новой версией
      seen.add(slug);
      keep.push(m);
    }
    profile.installed = [...keep, ...installedMeta];
    saveConfigNow(cfg);

    log(`[AnLauncher] Готово: доставлено ${installed}, уже было ${skipped}, ошибок ${failed}`);
    emit({ type: 'done', installed, failed, skipped });
    return { installed, failed, skipped, modsDir };
  });

  ipcMain.handle('mods:installed', (_e, profileId) => {
    const cfg = loadConfig();
    const p = cfg.profiles.find((x) => x.id === profileId);
    return p ? p.installed || [] : [];
  });

  ipcMain.handle('mods:uninstall', (_e, { profileId, slug }) => {
    const cfg = loadConfig();
    const p = cfg.profiles.find((x) => x.id === profileId);
    if (!p) throw new Error('Профиль не найден');
    const meta = (p.installed || []).find((m) => m.slug === slug);
    if (meta) {
      const f = path.join(profileModsDir(cfg, p), meta.filename);
      if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      p.installed = p.installed.filter((m) => m.slug !== slug);
      saveConfigNow(cfg);
    }
    return { removed: !!meta };
  });

  // ---------------- запуск ----------------
  ipcMain.handle('game:launch', async (_e, profileId) => {
    return launchGame(profileId, (ev) => send('evt:launch', ev));
  });
  ipcMain.handle('game:stop', () => {
    if (!gameProc) return false;
    try {
      if (IS_WINDOWS) {
        execFile('taskkill', ['/pid', String(gameProc.pid), '/t', '/f'], () => {});
      } else {
        try {
          process.kill(-gameProc.pid, 'SIGTERM');
        } catch {
          gameProc.kill('SIGTERM');
        }
      }
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('game:status', () => (gameProc ? { running: true, pid: gameProc.pid } : { running: false }));

  // ---------------- авторизация ----------------
  ipcMain.handle('auth:state', () => {
    const a = loadAuth();
    return { loggedIn: !!a.loggedIn, kind: a.kind, username: a.username, uuid: a.uuid };
  });
  ipcMain.handle('auth:offline', (_e, name) => {
    saveAuth({ loggedIn: true, kind: 'offline', username: name || 'Player', uuid: offlineUuid(name || 'Player') });
  });
  ipcMain.handle('auth:microsoft', async () => {
    const cfg = loadConfig();
    if (!cfg.msClientId) throw new Error('Укажите Azure Client ID в Настройках, чтобы входить через Microsoft');
    return startMsLogin(cfg.msClientId);
  });
  ipcMain.handle('auth:logout', () => {
    saveAuth({ loggedIn: false });
  });
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    migrateLegacyUserData();
    registerIpc();
    createWindow();
    // попытка тихого обновления токена Microsoft
    const a = loadAuth();
    if (a.loggedIn && a.kind === 'microsoft' && a.refreshToken) refreshMsToken();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (gameProc) {
      try {
        gameProc.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    if (!IS_MAC) app.quit();
  });
}
