// Единая точка доступа к API: в Electron — через preload (window.anlaunch),
// в браузере — демо-режим.
import pkg from "../../package.json";
import { createDemoApi } from "./demo";
import type { LauncherApi } from "./types";

const real = (window as unknown as { anlaunch?: LauncherApi }).anlaunch;

export const isElectron: boolean = !!real;
export const api: LauncherApi = real ?? createDemoApi();
export const launcherVersion: string = pkg.version;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс.`;
  return String(n);
}
