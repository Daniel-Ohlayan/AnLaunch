// Microsoft → Xbox Live → XSTS → Minecraft
// Используем публичный Client ID официального лаунчера Minecraft —
// отдельная регистрация в Azure не нужна.
// Документация: https://minecraft.wiki/w/Microsoft_authentication

const { BrowserWindow, shell } = require("electron");
const https = require("https");

const CLIENT_ID = "00000000402b5328";
const REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf";
const SCOPE = "service::user.auth.xboxlive.com::MBI_SSL";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const XSTS_ERRORS = {
  2148916233: "У этого Microsoft-аккаунта нет профиля Xbox. Создайте его на xbox.com и повторите вход.",
  2148916235: "Xbox Live недоступен в стране этого аккаунта.",
  2148916236: "Нужно подтвердить возраст на account.microsoft.com.",
  2148916237: "Детский аккаунт: добавьте его во взрослый Family на account.microsoft.com.",
  2148916238: "Детский аккаунт: его должен подтвердить взрослый в Microsoft Family.",
};

function getAuthUrl() {
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    display: "touch",
    prompt: "select_account",
  });
  return `https://login.live.com/oauth20_authorize.srf?${q.toString()}`;
}

function extractCode(url) {
  if (!url || typeof url !== "string") return { code: null, error: null };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { code: null, error: null };
  }
  const isRedirect =
    url.startsWith(REDIRECT_URI) ||
    parsed.pathname.endsWith("/oauth20_desktop.srf") ||
    parsed.pathname.endsWith("/oauth2/nativeclient");
  if (!isRedirect) return { code: null, error: null };
  const code = parsed.searchParams.get("code");
  const error = parsed.searchParams.get("error");
  const desc = parsed.searchParams.get("error_description");
  return { code, error: error ? desc || error : null };
}

function httpsRaw(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        ...options,
        headers: {
          "User-Agent": CHROME_UA,
          Accept: "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, data }));
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Сервер Microsoft не ответил (таймаут). Проверьте сеть или VPN."));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function httpsJSON(options, body) {
  const { status, data } = await httpsRaw(options, body);
  let parsed = {};
  try {
    parsed = data ? JSON.parse(data) : {};
  } catch {
    throw new Error(`Ошибка ответа Microsoft (HTTP ${status}): ${String(data).slice(0, 180)}`);
  }
  return { status, parsed };
}

async function postForm(host, path, form) {
  const body = new URLSearchParams(form).toString();
  const { status, parsed } = await httpsJSON(
    {
      host,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    body
  );
  if (status >= 400) {
    throw new Error(parsed.error_description || parsed.error || `Microsoft token HTTP ${status}`);
  }
  return parsed;
}

async function postJSON(host, path, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  const { status, parsed } = await httpsJSON(
    {
      host,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders,
      },
    },
    body
  );
  return { status, parsed };
}

function getAuthCode(parentWindow) {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 700,
      parent: parentWindow || undefined,
      modal: !!parentWindow,
      show: true,
      title: "Вход через Microsoft",
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: `temp:msauth-${Date.now()}`,
      },
    });

    authWindow.webContents.setUserAgent(CHROME_UA);
    authWindow.setMenuBarVisibility(false);

    let done = false;
    const finish = (err, code) => {
      if (done) return;
      done = true;
      try {
        if (!authWindow.isDestroyed()) authWindow.close();
      } catch {}
      if (err) reject(err);
      else resolve(code);
    };

    const handleUrl = (url) => {
      const { code, error } = extractCode(url);
      if (code) finish(null, code);
      else if (error) finish(new Error(error));
    };

    authWindow.webContents.on("will-redirect", (_e, url) => handleUrl(url));
    authWindow.webContents.on("will-navigate", (_e, url) => handleUrl(url));
    authWindow.webContents.on("did-navigate", (_e, url) => handleUrl(url));
    authWindow.webContents.on("did-redirect-navigation", (_e, url) => handleUrl(url));
    authWindow.webContents.on("did-navigate-in-page", (_e, url) => handleUrl(url));

    try {
      authWindow.webContents.session.webRequest.onBeforeRequest(
        { urls: ["https://login.live.com/oauth20_desktop.srf*"] },
        (details, callback) => {
          handleUrl(details.url);
          callback({ cancel: true });
        }
      );
    } catch {}

    authWindow.on("closed", () => {
      if (!done) reject(new Error("Окно входа закрыто"));
    });

    authWindow.loadURL(getAuthUrl()).catch((e) => {
      finish(
        new Error(
          `Не удалось открыть страницу Microsoft: ${e.message}. Если login.live.com заблокирован, включите VPN или войдите через браузер.`
        )
      );
    });
  });
}

async function exchangeCode(code) {
  return postForm("login.live.com", "/oauth20_token.srf", {
    client_id: CLIENT_ID,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
}

async function refreshToken(refresh_token) {
  return postForm("login.live.com", "/oauth20_token.srf", {
    client_id: CLIENT_ID,
    refresh_token,
    grant_type: "refresh_token",
    scope: SCOPE,
  });
}

async function authXboxLive(msAccessToken) {
  const payload = {
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: msAccessToken,
    },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  };

  let { status, parsed } = await postJSON("user.auth.xboxlive.com", "/user/authenticate", payload);

  // Старый Azure-поток использует префикс d=
  if (status >= 400) {
    payload.Properties.RpsTicket = `d=${msAccessToken}`;
    ({ status, parsed } = await postJSON("user.auth.xboxlive.com", "/user/authenticate", payload));
  }

  if (status >= 400 || !parsed.Token) {
    throw new Error(parsed.Message || parsed.errorMessage || `Xbox Live HTTP ${status}`);
  }

  const xui = parsed.DisplayClaims && parsed.DisplayClaims.xui && parsed.DisplayClaims.xui[0];
  return {
    token: parsed.Token,
    uhs: xui && xui.uhs,
    xuid: xui && xui.xid,
  };
}

async function authXSTS(xblToken) {
  const { status, parsed } = await postJSON("xsts.auth.xboxlive.com", "/xsts/authorize", {
    Properties: {
      SandboxId: "RETAIL",
      UserTokens: [xblToken],
    },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT",
  });

  if (status >= 400 || !parsed.Token) {
    const xerr = parsed.XErr || parsed.xerr;
    throw new Error(XSTS_ERRORS[xerr] || parsed.Message || `XSTS ошибка ${xerr || status}`);
  }

  const xui = parsed.DisplayClaims && parsed.DisplayClaims.xui && parsed.DisplayClaims.xui[0];
  return { token: parsed.Token, uhs: xui && xui.uhs };
}

async function authMinecraft(uhs, xstsToken) {
  const { status, parsed } = await postJSON(
    "api.minecraftservices.com",
    "/authentication/login_with_xbox",
    { identityToken: `XBL3.0 x=${uhs};${xstsToken}` }
  );
  if (status >= 400 || !parsed.access_token) {
    throw new Error(parsed.errorMessage || parsed.error || `Minecraft login HTTP ${status}`);
  }
  return parsed.access_token;
}

function getMinecraftProfile(mcAccessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "api.minecraftservices.com",
        path: "/minecraft/profile",
        method: "GET",
        headers: {
          Authorization: `Bearer ${mcAccessToken}`,
          "User-Agent": CHROME_UA,
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            return reject(new Error(`Профиль Minecraft: неверный ответ (HTTP ${res.statusCode})`));
          }
          if (res.statusCode === 404) {
            reject(new Error("У этого аккаунта Microsoft нет купленного Minecraft: Java Edition."));
          } else if (parsed.id && parsed.name) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.errorMessage || parsed.error || "Не удалось получить профиль Minecraft"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("api.minecraftservices.com не ответил. Проверьте сеть или VPN."));
    });
    req.end();
  });
}

function formatAccount(profile, mcToken, refresh, xuid) {
  const raw = String(profile.id).replace(/-/g, "");
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  return {
    id: `ms_${raw}`,
    username: profile.name,
    uuid,
    xuid: xuid ? String(xuid) : "0",
    type: "microsoft",
    accessToken: mcToken,
    refreshToken: refresh || "",
    createdAt: Date.now(),
  };
}

async function completeWithMsTokens(msTokens, log) {
  if (!msTokens.access_token) throw new Error("Microsoft не вернул access_token");

  log("Авторизация в Xbox Live…");
  const xbox = await authXboxLive(msTokens.access_token);
  if (!xbox.uhs) throw new Error("Xbox Live не вернул user hash");

  log("Проверка XSTS…");
  const xsts = await authXSTS(xbox.token);
  const uhs = xsts.uhs || xbox.uhs;

  log("Вход в Minecraft…");
  const mcToken = await authMinecraft(uhs, xsts.token);

  log("Загрузка профиля…");
  const profile = await getMinecraftProfile(mcToken);

  return formatAccount(profile, mcToken, msTokens.refresh_token, xbox.xuid);
}

async function loginMicrosoft(parentWindow, onProgress) {
  const log = (m) => onProgress && onProgress(m);
  log("Открываю окно входа Microsoft…");
  const code = await getAuthCode(parentWindow);
  log("Обмен кода на токен…");
  const msTokens = await exchangeCode(code);
  return completeWithMsTokens(msTokens, log);
}

async function loginMicrosoftWithCode(codeOrUrl, onProgress) {
  const log = (m) => onProgress && onProgress(m);
  let code = String(codeOrUrl || "").trim();
  const extracted = extractCode(code);
  if (extracted.code) code = extracted.code;
  else {
    const m = code.match(/[?&]code=([^&]+)/);
    if (m) code = decodeURIComponent(m[1]);
  }
  if (!code || code.length < 8) throw new Error("Вставьте ссылку со страницы после входа или сам код.");
  log("Обмен кода на токен…");
  const msTokens = await exchangeCode(code);
  return completeWithMsTokens(msTokens, log);
}

async function refreshMicrosoft(refresh_token) {
  if (!refresh_token) throw new Error("Нет refresh-токена. Войдите через Microsoft заново.");
  const msTokens = await refreshToken(refresh_token);
  return completeWithMsTokens(msTokens, () => {});
}

function openMicrosoftLoginExternal() {
  return shell.openExternal(getAuthUrl());
}

module.exports = {
  loginMicrosoft,
  loginMicrosoftWithCode,
  refreshMicrosoft,
  getAuthUrl,
  openMicrosoftLoginExternal,
};
