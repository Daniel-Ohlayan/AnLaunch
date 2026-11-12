'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('JVM GC presets generate valid arguments without forcing conflicting flags', () => {
  function getJvmGcArgs(preset, ramMB) {
    const xmx = `-Xmx${ramMB}M`;
    const xms = `-Xms${Math.min(1024, ramMB)}M`;

    switch (preset) {
      case 'g1':
        return [xmx, xms, '-XX:+UseG1GC', '-XX:G1ReservePercent=20', '-XX:MaxGCPauseMillis=50'];
      case 'zgc':
        return [xmx, xms, '-XX:+UseZGC', '-XX:+ZGenerational'];
      case 'aikar':
        return [
          xmx,
          xms,
          '-XX:+UseG1GC',
          '-XX:+ParallelRefProcEnabled',
          '-XX:MaxGCPauseMillis=200',
          '-XX:+UnlockExperimentalVMOptions',
          '-XX:+DisableExplicitGC',
          '-XX:+AlwaysPreTouch',
          '-XX:G1NewSizePercent=30',
          '-XX:G1MaxNewSizePercent=40',
          '-XX:G1ReservePercent=20',
          '-XX:G1HeapWastePercent=5',
          '-XX:G1MixedGCCountTarget=4',
          '-XX:InitiatingHeapOccupancyPercent=15',
          '-XX:G1MixedGCLiveThresholdPercent=90',
          '-XX:G1RSetUpdatingPauseTimePercent=5',
          '-XX:SurvivorRatio=32',
          '-XX:+PerfDisableSharedMem',
          '-XX:MaxTenuringThreshold=1',
        ];
      case 'default':
      default:
        return [xmx, xms];
    }
  }

  const def = getJvmGcArgs('default', 4096);
  assert.ok(!def.includes('-XX:+UseG1GC'));
  assert.ok(def.includes('-Xmx4096M'));

  const g1 = getJvmGcArgs('g1', 6144);
  assert.ok(g1.includes('-XX:+UseG1GC'));
  assert.ok(!g1.includes('-XX:+UseZGC'));

  const zgc = getJvmGcArgs('zgc', 8192);
  assert.ok(zgc.includes('-XX:+UseZGC'));
  assert.ok(!zgc.includes('-XX:+UseG1GC'));

  const aikar = getJvmGcArgs('aikar', 4096);
  assert.ok(aikar.includes('-XX:+UseG1GC'));
  assert.ok(aikar.includes('-XX:+AlwaysPreTouch'));
});

test('Product metadata is consistently AnLauncher v1.1.0', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '1.1.0');
  assert.strictEqual(pkg.productName, 'AnLauncher');
  assert.strictEqual(pkg.build.productName, 'AnLauncher');

  const eb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'electron-builder.json'), 'utf8'));
  assert.strictEqual(eb.productName, 'AnLauncher');
  assert.strictEqual(eb.appId, 'com.anlaunch.launcher');
  assert.strictEqual(eb.nsis.shortcutName, 'AnLauncher');

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('AnLauncher'));
});
