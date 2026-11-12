'use strict';
/**
 * Запуск в режиме разработки: vite (HMR) + electron.
 * npm run electron:dev
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const useShell = process.platform === 'win32';

const vite = spawn('npx', ['vite'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: useShell,
  env: process.env,
});

let electronProc = null;
let started = false;

function startElectron(url) {
  if (started) return;
  started = true;
  electronProc = spawn('npx', ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    shell: useShell,
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });
  electronProc.on('exit', (code) => {
    console.log(`[dev] Electron завершён (${code}). Останавливаю vite…`);
    cleanup();
    process.exit(code ?? 0);
  });
}

// vite может расписать строку "Local:" по нескольким chunk'ам — держим буфер
let recent = '';
function watch(data, out) {
  const text = data.toString();
  out.write(text);
  recent += text;
  if (recent.length > 4096) recent = recent.slice(-4096);
  const m = /Local:\s*(https?:\/\/\S+)/.exec(recent);
  if (m && !started) startElectron(m[1].replace(/\/$/, ''));
}

vite.stdout.on('data', (d) => watch(d, process.stdout));
// vite иногда пишет строку "Local:" в stderr
vite.stderr.on('data', (d) => watch(d, process.stderr));

function cleanup() {
  try {
    if (electronProc && electronProc.exitCode === null) electronProc.kill();
  } catch {
    /* ignore */
  }
  try {
    if (vite.exitCode === null) vite.kill();
  } catch {
    /* ignore */
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
vite.on('exit', (code) => {
  if (!started) process.exit(code ?? 0);
  cleanup();
});
