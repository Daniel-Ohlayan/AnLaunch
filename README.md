# AnLaunch

Кастомный лаунчер для Minecraft (Electron + React + Vite + Tailwind).

## Возможности

- **Моды (Modrinth)** — поиск, выбор версии, установка. **Обязательные зависимости
  (`required` и `alternative`) подтягиваются и ставятся автоматически** — как на
  странице мода на Modrinth; опциональные (`optional`) — только если отметите
  галочкой. Поддерживается рекурсивная вложенность, дедупликация и проверка на
  конфликты (`incompatible`).
- **Профили** — несколько инстансов: версия Minecraft, загрузчик (Vanilla / Forge /
  NeoForge), RAM, Java, свои аргументы. Папки: `<.minecraft>/instances/<имя>/`
  (моды — в `instances/<имя>/mods`).
- **Запуск игры** — загрузка версии/ассетов/библиотек с проверкой контрольных сумм,
  natives, Forge/NeoForge через install-профили Modrinth, живой лог консоли.
- **Аккаунт** — offline-режим + вход через Microsoft (OAuth2 + PKCE, нужен свой
  Azure Client ID — в Настройках).
- **Скины** — аватар игрока подгружается (crafatar).
- Автосохранение профиля, автопоиск Java.

## Версия

Текущая версия: **1.1.0** (поле `version` в `package.json`, отображается в интерфейсе).

## Разработка

```bash
npm install
npm run electron:dev     # vite (HMR) + electron
```

Просто в браузере (демо-режим, данные вымышленные, всё кликабельно):

```bash
npm run dev              # http://localhost:5173
```

## Сборка

```bash
npm run electron:build   # vite build + electron-builder (NSIS) + latest.yml + загрузка в GitHub
```

Нужен `GITHUB_TOKEN` в окружении, чтобы опубликовать релиз. Скрипты:
`scripts/dev.js`, `scripts/ensure-latest-yml.js`, `scripts/upload-github-assets.js`.

Иконки генерируются: `node scripts/gen-icons.js` → `public/icon.png`, `build/icon.ico`.

## Структура

```
electron/main.js      # main-процесс: Modrinth-API + разрешение зависимостей,
                      # Mojang-API, запуск игры, авторизация, IPC
electron/preload.js   # мост window.anlaunch (contextBridge)
src/                  # React-приложение
  views/              # Моды / Профили / Настройки + модалки установки и запуска
  lib/demo.ts         # демо-режим для браузера (имитация API)
scripts/              # dev-скрипты, latest.yml, загрузка релизов, иконки
```
