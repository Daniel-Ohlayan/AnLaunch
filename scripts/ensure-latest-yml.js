'use strict';
/**
 * Генерирует release/latest.yml (нужен electron-updater) из собранного
 * установщика в release/. Вызывается в npm run electron:build.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pkg = require('../package.json');
const releaseDir = path.join(__dirname, '..', 'release');
const exeName = `AnLaunch-Setup-${pkg.version}.exe`;
const exePath = path.join(releaseDir, exeName);

if (!fs.existsSync(exePath)) {
  console.error(`[ensure-latest-yml] Не найден ${exePath} — сначала соберите electron-builder`);
  process.exit(1);
}

const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const yml = [
  `version: ${pkg.version}`,
  'files:',
  `  - url: ${exeName}`,
  `    sha512: ${sha512}`,
  `    size: ${buf.length}`,
  `path: ${exeName}`,
  `sha512: ${sha512}`,
  `releaseDate: ${new Date().toISOString()}`,
  '',
].join('\n');

fs.writeFileSync(path.join(releaseDir, 'latest.yml'), yml, 'utf8');
console.log(`[ensure-latest-yml] release/latest.yml для ${pkg.version} готов`);
