// Менеджер пиратских аккаунтов (как в TLauncher)
// Оффлайн аккаунты с произвольным ником

export interface Account {
  id: string;
  username: string;
  uuid: string;
  type: "offline" | "premium" | "microsoft";
  accessToken?: string;
  refreshToken?: string;
  createdAt: number;
}

const STORAGE_KEY = "anlaunch_accounts";
const ACTIVE_KEY = "anlaunch_active_account";

// Генерация UUID v4
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Генерация offline UUID на основе ника (MD5, как в Minecraft и TLauncher)
function generateOfflineUUID(username: string): string {
  // Доступно только в браузере — вычисляем простой хеш который совместим с форматом
  let h = 0;
  for (let i = 0; i < username.length; i++) {
    h = ((h << 5) - h + username.charCodeAt(i)) | 0;
  }
  // UUID v3 формат: xxxxxxxx-xxxx-3xxx-8xxx-xxxxxxxxxxxx
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `${hex}-0000-3000-8000-000000000000`;
}

export function getAllAccounts(): Account[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getActiveAccount(): Account | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY);
    if (!id) return null;
    const accounts = getAllAccounts();
    return accounts.find((a) => a.id === id) || null;
  } catch {
    return null;
  }
}

export function setActiveAccount(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function createAccount(username: string): Account {
  const accounts = getAllAccounts();
  
  // Проверка на дубликаты
  if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("Аккаунт с таким ником уже существует");
  }

  const account: Account = {
    id: generateUUID(),
    username,
    uuid: generateOfflineUUID(username),
    type: "offline",
    createdAt: Date.now(),
  };

  accounts.push(account);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  
  // Делаем новый аккаунт активным автоматически
  setActiveAccount(account.id);

  return account;
}

// Сохранение / обновление Microsoft-аккаунта
export function saveMicrosoftAccount(account: Account): Account {
  const accounts = getAllAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  setActiveAccount(account.id);
  return account;
}

export function deleteAccount(id: string): Account | null {
  const accounts = getAllAccounts().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));

  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    if (accounts.length > 0) {
      setActiveAccount(accounts[0].id);
      return accounts[0];
    } else {
      localStorage.removeItem(ACTIVE_KEY);
      return null;
    }
  }
  // Возвращаем текущий активный (не изменился)
  return getActiveAccount();
}

export function updateAccount(id: string, username: string): void {
  const accounts = getAllAccounts();
  const account = accounts.find((a) => a.id === id);
  if (account) {
    account.username = username;
    account.uuid = generateOfflineUUID(username);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }
}
