// Реальный запуск Minecraft через Java
// Работает только в Electron (через IPC)

import type { Account } from "./accounts";
import type { InstalledMod, ModLoader } from "./modrinth";

export interface LaunchConfig {
  account: Account;
  version: string;
  loader: ModLoader;
  ram: number; // в ГБ
  profile: string;
  mods: InstalledMod[];
  modStates: Record<string, boolean>;
}

export interface LaunchResult {
  success: boolean;
  message: string;
  javaPath?: string;
  command?: string;
}

// Проверка наличия Java в системе (через IPC)
export async function checkJava(): Promise<{ exists: boolean; path?: string; version?: string }> {
  if (!window.electronAPI) {
    return { exists: false };
  }
  try {
    return await window.electronAPI.checkJava();
  } catch {
    return { exists: false };
  }
}

// Реальный запуск Minecraft
export async function launchMinecraftReal(config: LaunchConfig): Promise<LaunchResult> {
  if (!window.electronAPI) {
    return {
      success: false,
      message: "Не в Electron окружении. Используйте npm run electron:dev",
    };
  }

  try {
    const java = await checkJava();
    if (!java.exists) {
      return {
        success: false,
        message:
          "Java не найдена. Установите Java 17+ (https://adoptium.net/) и перезапустите приложение.",
      };
    }

    const enabledMods = config.mods.filter((m) => config.modStates[m.id]);

    const result = await window.electronAPI.launchMinecraftReal({
      account: {
        username: config.account.username,
        uuid: config.account.uuid,
        accessToken: (config.account as Account & { accessToken?: string }).accessToken,
        type: config.account.type,
      },
      version: config.version,
      loader: config.loader,
      ram: config.ram,
      profile: config.profile,
      mods: enabledMods.map((m) => ({
        fileName: m.fileName,
        downloadsUrl: m.downloadsUrl,
      })),
    });

    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Неизвестная ошибка запуска",
    };
  }
}
