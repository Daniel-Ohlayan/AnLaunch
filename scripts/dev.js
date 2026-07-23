// Простой запуск Vite + Electron в одном процессе. Работает на Windows, Linux, macOS.
// Запускается командой: npm run electron:dev
const { spawn } = require("child_process");
const path = require("path");

const isWin = process.platform === "win32";

// Запускаем Vite в отдельном процессе
const vite = spawn("npx", ["vite"], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "development" },
  shell: true,
  stdio: "inherit",
});

let electron = null;

// Ждём, когда Vite запустится, потом стартуем Electron
function startElectron() {
  if (electron) return;
  console.log("\n🚀 Vite запущен. Запускаю Electron...");
  electron = spawn("npx", ["electron", "."], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development" },
    shell: true,
    stdio: "inherit",
  });
  electron.on("exit", () => {
    process.exit(0);
  });
}

// Ждём 3 секунды, чтобы Vite успел запуститься, потом пробуем достучаться
setTimeout(() => {
  const http = require("http");
  const tryConnect = () => {
    const req = http.get("http://localhost:5173", () => {
      startElectron();
    });
    req.on("error", () => {
      setTimeout(tryConnect, 500);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      setTimeout(tryConnect, 500);
    });
  };
  tryConnect();
}, 1000);

vite.on("exit", (code) => {
  if (electron) electron.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  if (electron) electron.kill();
  if (vite) vite.kill();
  process.exit(0);
});
