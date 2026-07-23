// Настоящая аутентификация Microsoft / Xbox Live / Minecraft
// Поток: Microsoft OAuth → Xbox Live → XSTS → Minecraft → профиль
//
// ВАЖНО: чтобы вход через Microsoft работал, нужно зарегистрировать
// приложение в Azure Portal (portal.azure.com → App registrations):
//   1. New registration → тип "Personal Microsoft accounts"
//   2. Redirect URI (тип "Mobile and desktop"): http://localhost:НОМЕР_ПОРТА
//   3. Скопируйте Application (client) ID и вставьте в CLIENT_ID ниже.
//   4. В API permissions включите XboxLive.signin
//
// Без своего CLIENT_ID Microsoft вернёт ошибку "unauthorized_client".

const { BrowserWindow } = require("electron");
const https = require("https");

// 👉 ЗАМЕНИТЕ на ваш Client ID из Azure Portal
const CLIENT_ID = "00000000-0000-0000-0000-000000000000";
const REDIRECT_URI = "https://login.microsoftonline.com/common/oauth2/nativeclient";
const SCOPE = "XboxLive.signin offline_access";

function httpsJSON(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error_description || parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Ошибка парсинга ответа: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function postForm(host, path, form) {
  const body = new URLSearchParams(form).toString();
  return httpsJSON(
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
}

function postJSON(host, path, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  return httpsJSON(
    {
      host,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...extraHeaders,
      },
    },
    body
  );
}

// Шаг 1: получить authorization code через окно логина Microsoft
function getAuthCode(parentWindow) {
  return new Promise((resolve, reject) => {
    const authUrl =
      `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&prompt=select_account`;

    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      parent: parentWindow,
      modal: true,
      show: true,
      title: "Вход через Microsoft",
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    authWindow.loadURL(authUrl);

    let done = false;
    const handleUrl = (url) => {
      if (done) return;
      if (url.startsWith(REDIRECT_URI)) {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        const error = parsed.searchParams.get("error");
        done = true;
        authWindow.close();
        if (code) resolve(code);
        else reject(new Error(error || "Вход отменён"));
      }
    };

    authWindow.webContents.on("will-redirect", (_e, url) => handleUrl(url));
    authWindow.webContents.on("will-navigate", (_e, url) => handleUrl(url));

    authWindow.on("closed", () => {
      if (!done) reject(new Error("Окно входа закрыто"));
    });
  });
}

// Шаг 2: обменять code на токены Microsoft
async function exchangeCode(code) {
  return postForm("login.microsoftonline.com", "/consumers/oauth2/v2.0/token", {
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
}

// Обновление токена
async function refreshToken(refresh_token) {
  return postForm("login.microsoftonline.com", "/consumers/oauth2/v2.0/token", {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token,
    scope: SCOPE,
  });
}

// Шаг 3: Xbox Live
async function authXboxLive(msAccessToken) {
  const res = await postJSON("user.auth.xboxlive.com", "/user/authenticate", {
    Properties: {
      AuthMethod: "RPS",
      SiteName: "user.auth.xboxlive.com",
      RpsTicket: `d=${msAccessToken}`,
    },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  });
  return { token: res.Token, uhs: res.DisplayClaims.xui[0].uhs };
}

// Шаг 4: XSTS
async function authXSTS(xblToken) {
  const res = await postJSON("xsts.auth.xboxlive.com", "/xsts/authorize", {
    Properties: {
      SandboxId: "RETAIL",
      UserTokens: [xblToken],
    },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT",
  });
  return res.Token;
}

// Шаг 5: Minecraft
async function authMinecraft(uhs, xstsToken) {
  const res = await postJSON("api.minecraftservices.com", "/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${uhs};${xstsToken}`,
  });
  return res.access_token;
}

// Шаг 6: профиль Minecraft (ник + uuid)
function getMinecraftProfile(mcAccessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "api.minecraftservices.com",
        path: "/minecraft/profile",
        method: "GET",
        headers: { Authorization: `Bearer ${mcAccessToken}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 404) {
              reject(new Error("У этого аккаунта Microsoft нет купленного Minecraft."));
            } else if (parsed.id) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.errorMessage || "Не удалось получить профиль"));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// Полный цикл входа
async function loginMicrosoft(parentWindow, onProgress) {
  const log = (m) => onProgress && onProgress(m);

  if (CLIENT_ID.startsWith("00000000")) {
    throw new Error(
      "Не настроен Azure Client ID. Откройте electron/msauth.js и вставьте свой CLIENT_ID из Azure Portal."
    );
  }

  log("Открываю окно входа Microsoft…");
  const code = await getAuthCode(parentWindow);

  log("Обмен кода на токен…");
  const msTokens = await exchangeCode(code);

  log("Авторизация в Xbox Live…");
  const { token: xblToken, uhs } = await authXboxLive(msTokens.access_token);

  log("Проверка XSTS…");
  const xstsToken = await authXSTS(xblToken);

  log("Вход в Minecraft…");
  const mcToken = await authMinecraft(uhs, xstsToken);

  log("Загрузка профиля…");
  const profile = await getMinecraftProfile(mcToken);

  // Форматируем UUID с дефисами
  const raw = profile.id;
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;

  return {
    id: `ms_${raw}`,
    username: profile.name,
    uuid,
    type: "microsoft",
    accessToken: mcToken,
    refreshToken: msTokens.refresh_token,
    createdAt: Date.now(),
  };
}

// Обновление сессии Microsoft (тихий вход)
async function refreshMicrosoft(refresh_token) {
  const msTokens = await refreshToken(refresh_token);
  const { token: xblToken, uhs } = await authXboxLive(msTokens.access_token);
  const xstsToken = await authXSTS(xblToken);
  const mcToken = await authMinecraft(uhs, xstsToken);
  const profile = await getMinecraftProfile(mcToken);
  const raw = profile.id;
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
  return {
    id: `ms_${raw}`,
    username: profile.name,
    uuid,
    type: "microsoft",
    accessToken: mcToken,
    refreshToken: msTokens.refresh_token,
    createdAt: Date.now(),
  };
}

module.exports = { loginMicrosoft, refreshMicrosoft };
