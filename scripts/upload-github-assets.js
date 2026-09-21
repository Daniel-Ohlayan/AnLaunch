'use strict';
/**
 * Загружает собранные артефакты (release/*.exe, latest.yml) в релиз GitHub
 * с тегом по версии из package.json. Вызывается в npm run electron:build.
 *
 * Требуется переменная окружения GITHUB_TOKEN (или GH_TOKEN).
 */
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const API = 'https://api.github.com';
const REPO = 'Daniel-Ohlayan/AnLaunch';

if (!token) {
  console.error('[upload-github] Не задан GITHUB_TOKEN — пропуск загрузки в GitHub');
  process.exit(0);
}

const headers = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': `AnLaunch/${pkg.version}`,
};

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  const releaseDir = path.join(__dirname, '..', 'release');
  const files = fs
    .readdirSync(releaseDir)
    .map((f) => path.join(releaseDir, f))
    .filter((f) => {
      const n = path.basename(f);
      return n === 'latest.yml' || (n.endsWith('.exe') && !n.endsWith('.exe.blockmap'));
    });
  if (!files.length) {
    console.error('[upload-github] Нет файлов для загрузки в release/');
    process.exit(1);
  }

  // 1) создаём (или перезаписываем существующий) релиз
  const release = await apiFetch(`${API}/repos/${REPO}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: pkg.version,
      target_commitish: 'main',
      name: pkg.version,
      draft: false,
      prerelease: false,
      force: true,
    }),
  });
  console.log(`[upload-github] Релиз ${pkg.version} (id ${release.id})`);

  // 2) загружаем файлы
  for (const f of files) {
    const name = path.basename(f);
    const buf = fs.readFileSync(f);
    const form = new FormData();
    form.append('name', name);
    form.append('file', new Blob([buf]), name);
    const url = `${API}/repos/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`;
    const asset = await apiFetch(url, {
      method: 'POST',
      headers: {
        Authorization: headers.Authorization,
        Accept: headers.Accept,
        'X-GitHub-Api-Version': headers['X-GitHub-Api-Version'],
        'User-Agent': headers['User-Agent'],
      },
      body: form,
    });
    console.log(`[upload-github] ${name} → ${asset.browser_download_url}`);
  }
}

main().catch((e) => {
  console.error('[upload-github] Ошибка:', e.message);
  process.exit(1);
});
