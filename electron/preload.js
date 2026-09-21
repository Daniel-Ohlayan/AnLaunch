'use strict';
const { contextBridge, ipcRenderer } = require('electron');

/**
 * Мост между Electron (main) и React (renderer).
 * Рендерер обращается через window.anlaunch.*.
 */

// Подписка на события из main-процесса: api.onX(cb) -> function unsubscribe()
function subscribe(channel) {
  let currentCallback = null;
  const listener = (_e, payload) => {
    if (currentCallback) currentCallback(payload);
  };
  ipcRenderer.on(channel, listener);
  return (cb) => {
    currentCallback = cb;
    return () => {
      currentCallback = null;
    };
  };
}

const api = {
  isElectron: true,

  // --- app ---
  getInit: () => ipcRenderer.invoke('app:init'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // --- settings ---
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  detectJava: () => ipcRenderer.invoke('java:detect'),

  // --- versions ---
  refreshVersions: () => ipcRenderer.invoke('versions:refresh'),
  getLoaderVersions: ({ loader, gameVersion }) => ipcRenderer.invoke('versions:loaders', { loader, gameVersion }),

  // --- profiles ---
  createProfile: (data) => ipcRenderer.invoke('profile:create', data),
  updateProfile: (id, patch) => ipcRenderer.invoke('profile:update', { id, patch }),
  deleteProfile: (id) => ipcRenderer.invoke('profile:delete', id),
  setActiveProfile: (id) => ipcRenderer.invoke('profile:active', id),

  // --- mods (Modrinth) ---
  searchMods: (params) => ipcRenderer.invoke('mods:search', params),
  getModVersions: (params) => ipcRenderer.invoke('mods:versions', params),
  resolveInstall: (plan) => ipcRenderer.invoke('mods:resolve', plan),
  installMod: (params) => ipcRenderer.invoke('mods:install', params),
  getInstalledMods: (profileId) => ipcRenderer.invoke('mods:installed', profileId),
  uninstallMod: (profileId, slug) => ipcRenderer.invoke('mods:uninstall', { profileId, slug }),

  // --- game ---
  launchGame: (profileId) => ipcRenderer.invoke('game:launch', profileId),
  stopGame: () => ipcRenderer.invoke('game:stop'),
  getGameStatus: () => ipcRenderer.invoke('game:status'),

  // --- auth ---
  getAuthState: () => ipcRenderer.invoke('auth:state'),
  loginOffline: (name) => ipcRenderer.invoke('auth:offline', name),
  loginMicrosoft: () => ipcRenderer.invoke('auth:microsoft'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // --- events ---
  onInstall: subscribe('evt:install'),
  onLaunch: subscribe('evt:launch'),
  onAuth: subscribe('evt:auth'),
};

contextBridge.exposeInMainWorld('anlaunch', api);
