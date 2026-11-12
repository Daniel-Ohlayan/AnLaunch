'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Windows installer executables exist and have valid NSIS GUI headers', () => {
  const root = path.join(__dirname, '..');
  const files = [
    path.join(root, 'release', 'AnLauncher-Setup-1.1.0.exe'),
    path.join(root, 'release', 'AnLaunch-Setup-1.1.0.exe'),
  ];

  for (const file of files) {
    assert.ok(fs.existsSync(file), `${path.basename(file)} must exist`);
    const buf = fs.readFileSync(file);
    const peOffset = buf.readUInt32LE(0x3c);
    const sig = buf.toString('ascii', peOffset, peOffset + 4);
    assert.strictEqual(sig, 'PE\0\0', 'Valid PE signature');

    const optOffset = peOffset + 24;
    const subsystem = buf.readUInt16LE(optOffset + 68);
    assert.strictEqual(subsystem, 2, 'Subsystem must be Windows GUI (2)');

    // Проверяем наличие NSIS сигнатуры NullsoftInst
    const nsisOffset = buf.indexOf('NullsoftInst');
    assert.ok(nsisOffset > 0, 'Must contain NullsoftInst signature');

    // Размер должен быть размером полноценного Electron-приложения (> 50 МБ)
    assert.ok(buf.length > 50 * 1024 * 1024, 'Installer size must be > 50 MB');
  }
});

test('latest.yml contains valid release metadata for AnLauncher 1.1.0', () => {
  const ymlPath = path.join(__dirname, '..', 'release', 'latest.yml');
  assert.ok(fs.existsSync(ymlPath), 'release/latest.yml must exist');
  const content = fs.readFileSync(ymlPath, 'utf8');

  assert.ok(content.includes('version: 1.1.0'));
  assert.ok(content.includes('AnLauncher-Setup-1.1.0.exe'));
  assert.ok(content.includes('sha512:'));
});
