# AnLauncher

Кастомный лаунчер для Minecraft (Electron + React + Vite + Tailwind).

> Продукт называется **AnLauncher**; репозиторий и релизы остаются на GitHub-имени `AnLaunch`.

## Возможности

- **Моды (Modrinth)** — поиск, выбор версии, установка. **Обязательные зависимости и
  библиотеки (`required`, например Fabric API) ставятся сразу вместе с модом** — как
  на странице мода на Modrinth; вложенные зависимости разрешаются рекурсивно.
  Опциональные (`optional`) не устанавливаются. То, что уже стоит в профиле (по slug
  или по файлу в `mods/`), повторно не скачивается и не дублируется: при обновлении
  версии старый jar удаляется. Есть проверка конфликтов (`incompatible`).
- **Логи установки** — что доставлено (мод, зависимости, библиотеки), что уже было в
  профиле и какие ошибки возникли: строки с префиксом `[AnLauncher]` идут в консоль и
  в файл `instances/<имя>/logs/anlauncher.log`. Интерфейс при этом не менялся.
- **Профили** — несколько инстансов: версия Minecraft, загрузчик (Vanilla / Forge /
  NeoForge), RAM, Java, свои аргументы. Папки: `<.minecraft>/instances/<имя>/`
  (моды — в `instances/<имя>/mods`). В Vanilla-профиль моды не устанавливаются —
  нужен Forge или NeoForge.
- **Запуск игры** — загрузка версии/ассетов/библиотек с проверкой контрольных сумм,
  natives, Forge/NeoForge через install-профили Modrinth, живой лог консоли.
- **Аккаунт** — offline-режим + вход через Microsoft (OAuth2 + PKCE, нужен свой
  Azure Client ID — в Настройках).
- **Скины** — аватар игрока подгружается (crafatar).
- Автосохранение профиля, автопоиск Java.

## Версия

Текущая версия: **1.1.0** (поле `version` в `package.json`, отображается в интерфейсе).

При первом запуске после переименования лаунчер переносит `config.json` и `auth.json`
из прежней папки данных (`AnLaunch`) в новую (`AnLauncher`), чтобы не потерять
профили и аккаунт.

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
electron/main.js      # main-процесс: Modrinth-API + разрешение обязательных
                      # зависимостей и библиотек, Mojang-API, запуск игры,
                      # авторизация, IPC, логи установки
electron/preload.js   # мост window.anlaunch (contextBridge)
src/                  # React-приложение
  views/              # Моды / Профили / Настройки + модалки установки и запуска
  lib/demo.ts         # демо-режим для браузера (имитация API)
scripts/              # dev-скрипты, latest.yml, загрузка релизов, иконки
```
