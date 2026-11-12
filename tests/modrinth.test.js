'use strict';

const test = require('node:test');
const assert = require('node:assert');

// Модель разрешения зависимостей Modrinth по ТЗ
function resolveDependencies({
  dependencies,
  installedSlugs,
  profileLoader,
}) {
  if (profileLoader === 'vanilla') {
    throw new Error('Установка модов в профиль с Vanilla запрещена. Выберите Fabric, Forge или NeoForge.');
  }

  const toInstall = [];
  const skipped = [];

  for (const dep of dependencies) {
    // ТЗ: При установке мода сразу качай и ставь required зависимости/библиотеки.
    // Optional не ставить.
    if (dep.dependency_type !== 'required') {
      skipped.push({ slug: dep.project_slug, reason: 'optional' });
      continue;
    }

    // ТЗ: Уже стоящее в профиле не дублировать.
    if (installedSlugs.has(dep.project_slug.toLowerCase())) {
      skipped.push({ slug: dep.project_slug, reason: 'already_installed' });
      continue;
    }

    toInstall.push(dep);
  }

  return { toInstall, skipped };
}

test('Vanilla profile forbids mod installation', () => {
  assert.throws(
    () =>
      resolveDependencies({
        dependencies: [{ project_slug: 'sodium', dependency_type: 'required' }],
        installedSlugs: new Set(),
        profileLoader: 'vanilla',
      }),
    /Установка модов в профиль с Vanilla запрещена/
  );
});

test('Required dependencies are resolved, optional dependencies are skipped', () => {
  const deps = [
    { project_slug: 'fabric-api', dependency_type: 'required' },
    { project_slug: 'modmenu', dependency_type: 'optional' },
    { project_slug: 'cloth-config', dependency_type: 'required' },
  ];

  const res = resolveDependencies({
    dependencies: deps,
    installedSlugs: new Set(),
    profileLoader: 'neoforge',
  });

  assert.strictEqual(res.toInstall.length, 2);
  assert.deepStrictEqual(
    res.toInstall.map((d) => d.project_slug),
    ['fabric-api', 'cloth-config']
  );
  assert.strictEqual(res.skipped.length, 1);
  assert.strictEqual(res.skipped[0].slug, 'modmenu');
  assert.strictEqual(res.skipped[0].reason, 'optional');
});

test('Already installed mods are not duplicated', () => {
  const deps = [
    { project_slug: 'fabric-api', dependency_type: 'required' },
    { project_slug: 'cloth-config', dependency_type: 'required' },
  ];

  const res = resolveDependencies({
    dependencies: deps,
    installedSlugs: new Set(['fabric-api']),
    profileLoader: 'forge',
  });

  assert.strictEqual(res.toInstall.length, 1);
  assert.strictEqual(res.toInstall[0].project_slug, 'cloth-config');
  assert.strictEqual(res.skipped.length, 1);
  assert.strictEqual(res.skipped[0].slug, 'fabric-api');
  assert.strictEqual(res.skipped[0].reason, 'already_installed');
});
