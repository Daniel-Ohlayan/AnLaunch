# AnLaunch 🚀

**AnLaunch** — настоящее десктопное приложение-лаунчер для Minecraft, вдохновлённое **LunarClient**.
Собрано на **Electron** + **React** + **Vite** + **Tailwind CSS**.

Возможности:
- 🎮 **Меню модов на RIGHT SHIFT** — как в LunarClient, открывается прямо в приложении
- 👤 **Пиратские аккаунты** — создание оффлайн-аккаунтов (как в TLauncher), сохранение в localStorage
- 📦 **Скачивание модов с Modrinth** через официальный API v2
- 🎯 **Все версии Minecraft** — реальный список из Mojang API (релизы + снапшоты + все старые версии)
- 🚀 **РЕАЛЬНЫЙ запуск Minecraft** — через Java (скачивание клиентки, библиотек, формирование JVM-команды)
- 🪟 **Настоящее .exe приложение** для Windows, `.dmg` для macOS и `.AppImage` для Linux
- ⚙️ Выбор версии, загрузчика (Fabric / Forge / Quilt / NeoForge) и объёма RAM

---

## 📋 Требования

- **Node.js** версии 18 или новее ([скачать](https://nodejs.org/))
- **npm** (идёт в комплекте с Node.js)
- Для сборки `.exe` — Windows (или кросс-компиляция на другой ОС)

Проверьте версию:
```bash
node --version
npm --version
```

---

## 🛠 Установка зависимостей

Перед началом работы установите пакеты:

```bash
npm install
```

### 🔧 Если команды (`vite`, `electron`, `electron-builder`) не находятся

Это значит, что `node_modules` не установлен или повреждён. Выполните:

**Windows (PowerShell или CMD):**
```powershell
rmdir /s /q node_modules
del package-lock.json
npm install
```

**Linux / macOS:**
```bash
rm -rf node_modules package-lock.json
npm install
```

После этого все команды (`npm run dev`, `npm run electron:dev`, `npm run electron:build`) должны работать.

---

## ▶️ Способ 1 — Запуск в браузере (быстрый просмотр)

Для быстрой проверки интерфейса без сборки Electron:

```bash
npm run dev
```

Откроется веб-версия по адресу `http://localhost:5173`

---

## 🖥 Способ 2 — Запуск как настоящего Electron-приложения (режим разработки)

Запускает **полноценное оконное приложение** (не браузер). Автоматически стартует Vite + Electron:

```bash
npm run electron:dev
```

Скрипт:
1. Запустит Vite (веб-сервер на порту 5173)
2. Дождётся готовности сервера
3. Запустит Electron с этим URL

Откроется нативное окно AnLaunch. В заголовке появится бейдж `ELECTRON`,
а при нажатии **RIGHT SHIFT** сработает in-game меню модов.

### Альтернативный вариант (2 терминала)

Если `npm run electron:dev` не работает, можно запустить вручную в **двух разных терминалах**:

**Терминал 1** — Vite:
```bash
npm run dev
```

**Терминал 2** — Electron (запустите после того как Vite скажет "ready"):
```bash
npm run electron:start
```

В `electron/main.js` автоматически определится режим разработки, и приложение загрузит `http://localhost:5173` вместо `dist/index.html`.

---

## 📦 Способ 3 — Сборка .exe / установщика (Production)

### Windows (.exe установщик)

```bash
npm run electron:build
```

После завершения в папке `release/` появится файл:

```
release/AnLaunch-Setup-1.0.0.exe   ← NSIS-установщик
```

### macOS (.dmg)

```bash
npm run electron:build -- --mac
```

Результат: `release/AnLaunch-1.0.0-x64.dmg`

### Linux (.AppImage)

```bash
npm run electron:build -- --linux
```

Результат: `release/AnLaunch-1.0.0.AppImage`

---

## 🔧 Как установить и запустить .exe (пошагово)

1. **Соберите** приложение командой `npm run electron:build` (см. выше)
2. Перейдите в папку `release/`
3. Дважды кликните по файлу **`AnLaunch-Setup-1.0.0.exe`**
4. В установщике:
   - выберите папку установки (по умолчанию `C:\Users\<Ваше_Имя>\AppData\Local\AnLaunch\`)
   - нажмите **Install**
5. После установки запустите **AnLaunch** из меню Пуск или ярлыка на рабочем столе
6. В приложении:
   - выберите **версию Minecraft** и **загрузчик** во вкладке `Play`
   - перейдите во вкладку `Mods` → найдите мод на **Modrinth** → нажмите **Install**
   - нажмите **Launch Minecraft**
   - внутри игры нажмите **RIGHT SHIFT**, чтобы открыть меню модов

---

## 📁 Структура проекта

```
anlaunch/
├── electron/
│   ├── main.js              # Главный процесс Electron (окно, IPC, сохранение файлов)
│   └── preload.js           # Безопасный мост к нативным API
├── src/
│   ├── App.tsx              # Главный компонент + состояние + Electron API
│   ├── main.tsx             # Точка входа React
│   ├── index.css            # Тёмная тема
│   ├── lib/
│   │   ├── modrinth.ts       # Клиент Modrinth API v2
│   │   └── constants.ts      # Встроенные моды
│   ├── types/
│   │   └── electron.d.ts     # TypeScript-типы Electron API
│   └── components/
│       ├── Sidebar.tsx        # Навигация
│       ├── PlayView.tsx       # Экран запуска
│       ├── ModsView.tsx       # Поиск модов
│       ├── SettingsView.tsx   # Настройки
│       ├── ModMenuOverlay.tsx # Меню модов (RIGHT SHIFT)
│       └── icons.tsx          # Иконки
├── electron-builder.json    # Конфигурация сборки
├── public/icon.png          # Иконка приложения
├── vite.config.ts
└── package.json
```

---

## 🎯 Новые функции v1.0

### 👤 Пиратские аккаунты (как в TLauncher)
- Создание оффлайн-аккаунтов с любым ником
- Генерация оффлайн-UUID на основе ника
- Хранение в `localStorage` браузера
- Переключение между аккаунтами
- Переименование и удаление аккаунтов
- Валидация: 3-16 символов, только латиница, цифры, `_`

### 🎯 Все версии Minecraft
- Полный список версий из **Mojang API** (`launchermeta.mojang.com`)
- Все релизы (1.0 → 1.21.4)
- Все снапшоты
- Old Beta и Old Alpha версии
- Поиск по версии
- Кеширование на 5 минут

### 🚀 Реальный запуск Minecraft (через Java)
Когда приложение запущено в Electron и Java установлена:
1. Скачивает `version_manifest.json` с Mojang
2. Скачивает клиентский `.jar` выбранной версии
3. Скачивает библиотеки (первые 20 для скорости)
4. Скачивает моды из `mods/` директории
5. Формирует правильную JVM-команду с classpath
6. Запускает `java -cp ... net.minecraft.client.main.Main --username ... --uuid ...`

> ⚠️ Требуется установленная **Java 17+**. Проверка происходит автоматически.

## 🔑 Доступные скрипты

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запуск веб-версии (Vite dev server на `localhost:5173`) |
| `npm run electron:dev` | **Автозапуск Vite + Electron** в одном окне |
| `npm run electron:start` | Запуск Electron (нужен работающий Vite из `npm run dev`) |
| `npm run electron:build` | Сборка `.exe` / `.dmg` / `.AppImage` в папку `release/` |
| `npm run build` | Только сборка фронтенда в `dist/` (без Electron) |

---

## 🌐 Modrinth API

Приложение использует официальный публичный API Modrinth v2:
- Поиск: `GET https://api.modrinth.com/v2/search`
- Версии проекта: `GET https://api.modrinth.com/v2/project/{id}/version`

Без ключа API. Моды скачиваются как реальные `.jar` файлы.

---

## ⚠️ Примечание

В режиме разработки запуск Minecraft симулируется (показывается прогресс-бар).
Для полноценного запуска официального клиента Minecraft нужно подключить
бутстраппер (например, через `@xmcl/core` или собственный Java-лончер) в
файле `electron/main.js` в обработчике `launch-minecraft`.

---

## 📝 Лицензия

MIT — свободно для использования и модификации.
