// Локальный Yggdrasil + authlib-injector: свои скины и плащи на оффлайн-аккаунтах.
// На Microsoft скин можно загрузить через API Mojang.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

let server = null;
let serverPort = 0;
let keyPair = null;
let current = {
  username: "Player",
  uuid: "00000000000000000000000000000000",
  skinPath: null,
  capePath: null,
  slim: false,
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function copyTextureFile(sourcePath, destPath) {
  const buf = fs.readFileSync(sourcePath);
  return writeTextureBuffer(buf, destPath);
}

function writeTextureBuffer(buf, destPath) {
  if (!isPng(buf)) throw new Error("Нужен файл PNG (скин 64×64 / 64×32 или плащ 64×32)");
  if (buf.length > 2 * 1024 * 1024) throw new Error("Файл слишком большой (макс. 2 МБ)");
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function pngDataUrl(buf) {
  return `data:image/png;base64,${Buffer.from(buf).toString("base64")}`;
}

function httpGetBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const proto = String(url).startsWith("https") ? https : http;
    const req = proto.get(url, { headers: { "User-Agent": "AnLaunch/1.0.3", Accept: "*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return resolve(httpGetBuffer(next, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function fetchSkinPng(username) {
  const name = String(username || "").trim();
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(name)) throw new Error("Некорректный ник");
  const urls = [];
  try {
    const raw = await httpGetBuffer(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    const profile = JSON.parse(raw.toString("utf8"));
    if (profile && profile.id) {
      const sess = JSON.parse(
        (await httpGetBuffer(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`)).toString("utf8")
      );
      const tex = (sess.properties || []).find((p) => p.name === "textures");
      if (tex && tex.value) {
        const data = JSON.parse(Buffer.from(tex.value, "base64").toString("utf8"));
        const skinUrl = data && data.textures && data.textures.SKIN && data.textures.SKIN.url;
        if (skinUrl) urls.push(skinUrl);
      }
    }
  } catch {}
  urls.push(
    `http://skinsystem.ely.by/skins/${encodeURIComponent(name)}.png`,
    `https://mc-heads.net/skin/${encodeURIComponent(name)}`,
    `https://minotar.net/skin/${encodeURIComponent(name)}`,
    `https://api.mineatar.io/skin/${encodeURIComponent(name)}`
  );
  let last;
  for (const u of urls) {
    try {
      const buf = await httpGetBuffer(u);
      if (isPng(buf) && buf.length > 200) return buf;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error(`Скин «${name}» не найден`);
}

function getKeyPair(userData) {
  if (keyPair) return keyPair;
  const file = path.join(userData, "textures", "ygg-key.json");
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.publicKey && saved.privateKey) {
      keyPair = saved;
      return keyPair;
    }
  } catch {}
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  keyPair = { publicKey: pair.publicKey, privateKey: pair.privateKey };
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(keyPair));
  return keyPair;
}

function uuidNodash(uuid) {
  return String(uuid || "").replace(/-/g, "").toLowerCase();
}

function pngSize(buf) {
  if (!isPng(buf) || buf.length < 24) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function apiRoot() {
  const pub = (keyPair && keyPair.publicKey) || "";
  return {
    signaturePublickey: pub,
    skinDomains: ["127.0.0.1", "localhost"],
    meta: {
      serverName: "AnLaunch",
      implementationName: "anlaunch",
      implementationVersion: "1.0.3",
      "feature.non_email_login": true,
    },
  };
}

function texturePayload() {
  const id = uuidNodash(current.uuid);
  const textures = {};
  const origin = `http://127.0.0.1:${serverPort}`;
  if (current.skinPath && fs.existsSync(current.skinPath)) {
    textures.SKIN = { url: `${origin}/textures/skin.png` };
    if (current.slim) textures.SKIN.metadata = { model: "slim" };
  }
  if (current.capePath && fs.existsSync(current.capePath)) {
    textures.CAPE = { url: `${origin}/textures/cape.png` };
  }
  return {
    timestamp: Date.now(),
    profileId: id,
    profileName: current.username,
    signatureRequired: true,
    textures,
  };
}

function signedProfile() {
  const id = uuidNodash(current.uuid);
  const value = Buffer.from(JSON.stringify(texturePayload()), "utf8").toString("base64");
  const sign = crypto.createSign("SHA1");
  sign.update(value);
  sign.end();
  const signature = sign.sign(keyPair.privateKey, "base64");
  return {
    id,
    name: current.username,
    properties: [{ name: "textures", value, signature }],
  };
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendFile(res, filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": buf.length,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const p = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    return res.end();
  }

  if (req.method === "GET" && (p === "/" || p === "/api" || p === "/yggdrasil" || p === "/api/yggdrasil")) {
    return sendJson(res, 200, apiRoot());
  }

  if (p === "/textures/skin.png" || p === "/textures/skin") {
    return current.skinPath ? sendFile(res, current.skinPath) : (res.writeHead(404), res.end());
  }
  if (p === "/textures/cape.png" || p === "/textures/cape") {
    return current.capePath ? sendFile(res, current.capePath) : (res.writeHead(404), res.end());
  }

  if (/\/profile\/[0-9a-f-]{32,36}$/i.test(p) || /\/minecraft\/profile$/i.test(p) && p.includes("session")) {
    return sendJson(res, 200, signedProfile());
  }

  if (p.endsWith("/hasJoined") || p.endsWith("/hasjoined")) {
    return sendJson(res, 200, signedProfile());
  }

  if (p === "/sessionserver/session/minecraft/join") {
    res.writeHead(204);
    return res.end();
  }

  if (p === "/authserver/authenticate" || p === "/authserver/refresh") {
    return sendJson(res, 200, {
      accessToken: "anlaunch",
      clientToken: "anlaunch",
      selectedProfile: { id: uuidNodash(current.uuid), name: current.username },
      availableProfiles: [{ id: uuidNodash(current.uuid), name: current.username }],
    });
  }

  if (p === "/authserver/validate" || p === "/authserver/invalidate" || p === "/authserver/signout") {
    res.writeHead(204);
    return res.end();
  }

  if (p === "/minecraftservices/minecraft/profile") {
    const textures = [];
    if (current.skinPath) textures.push({ id: "skin", url: `http://127.0.0.1:${serverPort}/textures/skin.png` });
    if (current.capePath) textures.push({ id: "cape", url: `http://127.0.0.1:${serverPort}/textures/cape.png` });
    return sendJson(res, 200, {
      id: uuidNodash(current.uuid),
      name: current.username,
      skins: current.skinPath
        ? [{ id: "skin", state: "ACTIVE", url: `http://127.0.0.1:${serverPort}/textures/skin.png`, variant: current.slim ? "SLIM" : "CLASSIC" }]
        : [],
      capes: current.capePath
        ? [{ id: "cape", state: "ACTIVE", url: `http://127.0.0.1:${serverPort}/textures/cape.png` }]
        : [],
    });
  }

  res.writeHead(404);
  res.end();
}

function startTextureServer(userData, opts) {
  current = {
    username: opts.username || "Player",
    uuid: opts.uuid || "0",
    skinPath: opts.skinPath && fs.existsSync(opts.skinPath) ? opts.skinPath : null,
    capePath: opts.capePath && fs.existsSync(opts.capePath) ? opts.capePath : null,
    slim: !!opts.slim,
  };
  getKeyPair(userData);

  return new Promise((resolve, reject) => {
    if (server) {
      return resolve(serverPort);
    }
    server = http.createServer(handle);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
  });
}

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    ensureDir(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith("https") ? https : http;
    proto
      .get(url, { headers: { "User-Agent": "AnLaunch/1.0.3" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(dest, () => {});
          return resolve(downloadFile(res.headers.location, dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve(dest)));
      })
      .on("error", (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function ensureAuthlibInjector(sharedDir, log) {
  const dest = path.join(sharedDir, "authlib-injector.jar");
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) return dest;
  log("Скачивание authlib-injector (скины/плащи)…");
  const urls = [
    "https://bmclapi2.bangbang93.com/mirrors/authlib-injector/artifact/1.2.5/authlib-injector-1.2.5.jar",
    "https://authlib-injector.yushi.moe/artifact/1.2.5/authlib-injector-1.2.5.jar",
    "https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar",
  ];
  let last;
  for (const url of urls) {
    try {
      await downloadFile(url, dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) return dest;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Не удалось скачать authlib-injector");
}

function uploadMojangSkin(accessToken, skinPath, slim) {
  return new Promise((resolve, reject) => {
    const png = fs.readFileSync(skinPath);
    const boundary = "----AnLaunch" + Date.now();
    const variant = slim ? "slim" : "classic";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const req = https.request(
      {
        hostname: "api.minecraftservices.com",
        path: "/minecraft/profile/skins",
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
          "User-Agent": "AnLaunch/1.0.3",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve();
          else reject(new Error(`Mojang skin HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function applyLaunchTextures(config, dirs, javaArgs, log) {
  const skinPath = config.skinPath;
  const capePath = config.capePath;
  const hasSkin = skinPath && fs.existsSync(skinPath);
  const hasCape = capePath && fs.existsSync(capePath);
  if (!hasSkin && !hasCape) return javaArgs;

  const type = config.account && config.account.type;
  const isOffline = type !== "microsoft" && type !== "premium";

  let mojangOk = false;
  if (!isOffline) {
    if (hasSkin && config.account && config.account.accessToken) {
      try {
        log("Загрузка скина на аккаунт Microsoft…");
        await uploadMojangSkin(config.account.accessToken, skinPath, !!config.slim);
        log("Скин загружен на аккаунт Mojang ✓");
        mojangOk = true;
      } catch (e) {
        log(`Не удалось загрузить скин на Mojang: ${e.message}`);
      }
    }
    if (hasCape) {
      log("Свой плащ на лицензии через Mojang недоступен — показываю локально через authlib.");
    }
    if (mojangOk && !hasCape) return javaArgs;
  }

  const { app } = (() => {
    try {
      return require("electron");
    } catch {
      return { app: null };
    }
  })();
  const userData = (app && app.getPath && app.getPath("userData")) || dirs.sharedDir;

  if (hasSkin) {
    try {
      const sz = pngSize(fs.readFileSync(skinPath));
      if (sz) log(`PNG скина: ${sz.w}×${sz.h}`);
    } catch {}
  }

  const uuid = config.account && config.account.uuid;
  const username = (config.account && config.account.username) || "Player";
  const port = await startTextureServer(userData, {
    username,
    uuid,
    skinPath: hasSkin ? skinPath : null,
    capePath: hasCape ? capePath : null,
    slim: !!config.slim,
  });
  const injector = await ensureAuthlibInjector(dirs.sharedDir, log);
  const api = `http://127.0.0.1:${port}`;
  const prefetch = Buffer.from(JSON.stringify(apiRoot()), "utf8").toString("base64");
  log(`Скин/плащ: ${api} (${hasSkin ? "скин" : ""}${hasSkin && hasCape ? "+" : ""}${hasCape ? "плащ" : ""})`);
  return [
    `-javaagent:${injector}=${api}`,
    `-Dauthlibinjector.yggdrasil.prefetched=${prefetch}`,
    ...javaArgs,
  ];
}

module.exports = {
  copyTextureFile,
  writeTextureBuffer,
  pngDataUrl,
  fetchSkinPng,
  applyLaunchTextures,
  isPng,
};
