'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Windows installer executables exist and have valid PE32+ GUI headers', () => {
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

    const machine = buf.readUInt16LE(peOffset + 4);
    assert.strictEqual(machine, 0x8664, 'Machine must be AMD64 (x64)');

    const optOffset = peOffset + 24;
    const magic = buf.readUInt16LE(optOffset);
    assert.strictEqual(magic, 0x20b, 'Magic must be PE32+ (0x20b)');

    const subsystem = buf.readUInt16LE(optOffset + 68);
    assert.strictEqual(subsystem, 2, 'Subsystem must be Windows GUI (2)');
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
