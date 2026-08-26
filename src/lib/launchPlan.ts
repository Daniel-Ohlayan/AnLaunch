import type { Account } from "./accounts";
import type { ModLoader } from "./modrinth";

export interface LaunchPlanInput {
  account: Account | null;
  version: string;
  loader: ModLoader;
  ram: number;
  ramMin: number;
  profile: string;
  javaPath: string;
  mcFullscreen: boolean;
  mcWidth: number;
  mcHeight: number;
  jvmArgs: string;
  mcLanguage: string;
  serverHost: string;
  serverPort: number;
  closeOnLaunch: boolean;
  minimizeOnLaunch: boolean;
  openLogsOnLaunch: boolean;
  confirmLaunch: boolean;
  alwaysOnTop: boolean;
  modsCount: number;
}

export interface LaunchPlan {
  rows: { label: string; value: string }[];
  gameArgs: string[];
  jvmFlags: string[];
  command: string;
  afterLaunch: string;
}

export function buildLaunchPlan(input: LaunchPlanInput): LaunchPlan {
  const minRam = Math.max(1, Math.min(input.ramMin, input.ram));
  const java = input.javaPath.trim() || "java";
  const extraJvm = input.jvmArgs.trim().split(/\s+/).filter(Boolean);
  const jvmFlags = [`-Xmx${input.ram}G`, `-Xms${minRam}G`, ...extraJvm];

  const gameArgs: string[] = [];
  if (input.mcFullscreen) {
    gameArgs.push("--fullscreen");
  } else {
    gameArgs.push("--width", String(input.mcWidth), "--height", String(input.mcHeight));
  }
  if (input.mcLanguage) gameArgs.push("--lang", input.mcLanguage);
  const host = input.serverHost.trim();
  if (host) {
    const port = input.serverPort || 25565;
    const id = String(input.version || "");
    const minor = Number(id.split(".")[1] || 0);
    const legacy = id.startsWith("1.") && minor < 20;
    if (legacy) gameArgs.push("--server", host, "--port", String(port));
    else gameArgs.push("--quickPlayMultiplayer", `${host}:${port}`);
  }

  const afterLaunch = input.closeOnLaunch
    ? "Закрыть AnLaunch"
    : input.minimizeOnLaunch
      ? "Свернуть AnLaunch"
      : "Оставить AnLaunch открытым";

  const rows: { label: string; value: string }[] = [
    { label: "Аккаунт", value: input.account ? `${input.account.username} (${input.account.type})` : "не выбран" },
    { label: "Профиль", value: input.profile },
    { label: "Версия", value: `${input.version} · ${input.loader === "vanilla" ? "Vanilla" : input.loader}` },
    { label: "Память", value: `${minRam}–${input.ram} ГБ  (−Xms / −Xmx)` },
    { label: "Окно", value: input.mcFullscreen ? "Полноэкранный режим" : `${input.mcWidth}×${input.mcHeight}` },
    { label: "Язык", value: input.mcLanguage || "системный" },
    { label: "Сервер", value: host ? `${host}:${input.serverPort || 25565}` : "не подключать" },
    { label: "Java", value: java },
    { label: "Моды в профиле", value: String(input.modsCount) },
    { label: "После запуска", value: afterLaunch },
    { label: "Логи", value: input.openLogsOnLaunch ? "открыть окно логов" : "не открывать" },
    { label: "Подтверждение", value: input.confirmLaunch ? "спросить перед стартом" : "сразу запускать" },
    { label: "Поверх окон", value: input.alwaysOnTop ? "да" : "нет" },
  ];

  const command = [java, ...jvmFlags, "<minecraft>", ...gameArgs].join(" ");

  return { rows, gameArgs, jvmFlags, command, afterLaunch };
}
