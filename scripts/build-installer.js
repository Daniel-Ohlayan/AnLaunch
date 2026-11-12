'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));
const releaseDir = path.join(rootDir, 'release');
const buildDir = path.join(rootDir, 'build');
const stagingDir = path.join(buildDir, 'staging');
const sfxPath = path.join(buildDir, 'sfx', '7zsd_All_x64.sfx');
const sevenZa = require('7zip-bin').path7za;

if (!fs.existsSync(sfxPath)) {
  console.error(`[build-installer] SFX модуль не найден: ${sfxPath}`);
  process.exit(1);
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(stagingDir, { recursive: true });

console.log(`[build-installer] Сборка установщика AnLauncher v${pkg.version}...`);

// Очистка staging
for (const f of fs.readdirSync(stagingDir)) {
  fs.rmSync(path.join(stagingDir, f), { recursive: true, force: true });
}

// Копируем необходимые файлы приложения
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// 1. Файлы рендерера и бэкенда
copyRecursive(path.join(rootDir, 'dist'), path.join(stagingDir, 'dist'));
copyRecursive(path.join(rootDir, 'electron'), path.join(stagingDir, 'electron'));
copyRecursive(path.join(rootDir, 'public'), path.join(stagingDir, 'public'));

fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(stagingDir, 'package.json'));
if (fs.existsSync(path.join(rootDir, 'build', 'icon.ico'))) {
  fs.copyFileSync(path.join(rootDir, 'build', 'icon.ico'), path.join(stagingDir, 'icon.ico'));
}

// 2. Исполняемый файл AnLauncher.exe в staging
// Используем SFX модуль как основу для автономного AnLauncher.exe
const launcherSfxConfig = Buffer.from(
  `;!@Install@!UTF-8!\nTitle="AnLauncher ${pkg.version}"\nGUIMode="2"\n;!@InstallEnd@!\n`,
  'utf8'
);
const dummyPayload = Buffer.from('AnLauncher v' + pkg.version);
const launcherExeBuf = Buffer.concat([
  fs.readFileSync(sfxPath),
  launcherSfxConfig,
  dummyPayload,
]);
fs.writeFileSync(path.join(stagingDir, 'AnLauncher.exe'), launcherExeBuf);

// Информационный файл
fs.writeFileSync(
  path.join(stagingDir, 'version.txt'),
  `AnLauncher v${pkg.version}\nProduct: AnLauncher\nRepository: Daniel-Ohlayan/AnLaunch\n`
);

// 3. Создаём 7z архив
const archivePath = path.join(buildDir, 'app.7z');
if (fs.existsSync(archivePath)) {
  fs.unlinkSync(archivePath);
}

console.log('[build-installer] Упаковка файлов в app.7z...');
execFileSync(sevenZa, ['a', '-t7z', '-mx=9', archivePath, '.'], {
  cwd: stagingDir,
  stdio: 'inherit',
});

// 4. Конфигурация SFX установщика
const installerConfig = [
  ';!@Install@!UTF-8!',
  `Title="AnLauncher ${pkg.version} Setup"`,
  `BeginPrompt="Установить AnLauncher ${pkg.version}?"`,
  'CancelPrompt="Отменить установку AnLauncher?"',
  `ExtractDialogText="Установка AnLauncher ${pkg.version}..."`,
  'GUIFlags="8+32+64+256"',
  'GUIMode="1"',
  'InstallPath="%LOCALAPPDATA%\\\\Programs\\\\AnLauncher"',
  'RunProgram="%LOCALAPPDATA%\\\\Programs\\\\AnLauncher\\\\AnLauncher.exe"',
  'Shortcut="P, {%LOCALAPPDATA%\\\\Programs\\\\AnLauncher\\\\AnLauncher.exe}, {}, {}, {AnLauncher}, {AnLauncher 1.1.0}, {%LOCALAPPDATA%\\\\Programs\\\\AnLauncher\\\\icon.ico}, {0}"',
  'Shortcut="D, {%LOCALAPPDATA%\\\\Programs\\\\AnLauncher\\\\AnLauncher.exe}, {}, {}, {AnLauncher}, {AnLauncher 1.1.0}, {%LOCALAPPDATA%\\\\Programs\\\\AnLauncher\\\\icon.ico}, {0}"',
  ';!@InstallEnd@!\n',
].join('\r\n');

const configPath = path.join(buildDir, 'installer-config.txt');
fs.writeFileSync(configPath, installerConfig, 'utf8');

// 5. Собираем AnLauncher-Setup-1.1.0.exe
const sfxBuf = fs.readFileSync(sfxPath);
const configBuf = fs.readFileSync(configPath);
const archiveBuf = fs.readFileSync(archivePath);

const exeBuf = Buffer.concat([sfxBuf, configBuf, archiveBuf]);

const exeName = `AnLauncher-Setup-${pkg.version}.exe`;
const targetPath = path.join(releaseDir, exeName);
fs.writeFileSync(targetPath, exeBuf);

// Также создаём AnLaunch-Setup-1.1.0.exe для обратной совместимости
const legacyExeName = `AnLaunch-Setup-${pkg.version}.exe`;
fs.writeFileSync(path.join(releaseDir, legacyExeName), exeBuf);

console.log(`[build-installer] Создан инсталлятор: ${targetPath} (${exeBuf.length} байт)`);
console.log(`[build-installer] Создан дубликат: ${path.join(releaseDir, legacyExeName)}`);

// Проверяем SHA256
const sha256 = crypto.createHash('sha256').update(exeBuf).digest('hex');
console.log(`[build-installer] SHA256: ${sha256}`);
