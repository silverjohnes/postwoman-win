# Postwoman для Windows

Переделка [Postwoman](https://github.com/silverjohnes/postwoman) под Electron. Репозиторий: https://github.com/silverjohnes/postwoman-win

**Гораздо лучше, чем Постман (для простых задач)**

Бесплатное приложение для Windows (переделка нативного macOS-приложения под Electron) для работы с коллекциями Postman. Быстрое и лёгкое. Коллекции можно хранить локально или удалённо (например, в синхронизируемой или сетевой папке), с необязательной резервной копией; чувствительные данные шифруются.

**Версия 0.8.5** (сборка 080511)

Встроенный Newman: Electron, внешний Newman и Node.js не нужны.

## Запуск из исходников
    npm install
    npm start          # разработка
    npm test           # тесты ядра (импорт/экспорт, curl, раннер, скрипты, хранилище, секреты)

## Сборка установщика (на Windows 10/11)
    npm install
    npm run dist       # dist/Postwoman Setup 0.8.5.exe  и  dist/Postwoman 0.8.5.exe (portable)

## Особенности Windows-версии
- Горячие клавиши: Ctrl вместо ⌘, Alt вместо ⌥ (список — F1 или Настройки → Keyboard shortcuts).
- Ctrl+Z / Shift+Ctrl+Z — отмена/возврат в активном окне (список или запрос); Alt+Ctrl+Z / Shift+Alt+Ctrl+Z — по всей программе.
- Секретные переменные (замок): AES-256-GCM, ключ защищён Windows DPAPI (привязан к учётной записи Windows),
  просмотр и первое использование за сессию требуют Windows Hello (отпечаток/лицо/PIN).
  DPAPI не синхронизируется с облаком; для переноса между ПК используйте одинаковую учётку Microsoft + резервную папку хранилища
  (секреты на другом ПК придётся ввести заново).
- Данные: %APPDATA%\Postwoman\data (путь и резервный путь — в Настройках). Формат — Postman v2.1 + служебные поля `_pw`.
- Язык интерфейса: 25 языков, авто по языку системы (украинский — русским написанием).

## Interface (mac layout port)
The UI follows the macOS version: sidebar with search, "By content", tree and a bottom bar (New Request / Import ▾ / Settings); pill tabs Request · Runner · Globals · Log; request editor with Params/Headers/Body/Scripts/History; folder and bulk editors; result pane and curl column; app icon taken from the mac asset. Icons are Lucide (see build/LICENSE-lucide.txt) instead of SF Symbols. Translations come from the mac Localizable.strings (`node scripts/build-lang.js <mac>/Resources/Localization`).

## Title bar, menu, secret encryption modes
- Windows/Linux: frameless-style window — custom title bar and HTML menu bar in the app colours (window buttons via titleBarOverlay). macOS keeps the native menu.
- Secrets have two modes (Settings → Secret variables): **account** (key protected by Windows DPAPI/safeStorage) and **local** (key in `secret.local.key` in the app data folder of this computer only). If account encryption is unavailable, the app offers local encryption with a warning: such variables cannot be decrypted on another computer after moving the data. The Settings button switches the mode in either direction and re-encrypts all secrets; values that cannot be decrypted are cleared only after confirmation.

Build number: bump `BUILD` in src/main/main.js and `build.buildVersion` in package.json by 1 for every new build and update the build number in the header of this README (current 080511).

## Installer (NSIS)
`build/installer.nsh` (wired via `build.nsis.include`; assisted installer, per-user by default, folder selectable): on start it looks for an installed Postwoman (HKCU, then HKLM) and asks **Yes = update / No = uninstall / Cancel = exit** (Russian or English by the Windows UI language). The uninstaller asks whether to delete program data (%APPDATA%\Postwoman: settings, history, key files); the storage folder with collections/globals is never touched. Silent runs (`/S`) skip all questions. Not tested on a real Windows machine: check once with `npm run dist`.

## Темы и меню
Темы (светлая, тёмная, ночная синяя, сепия) переключаются в меню «Окно», в Настройках и кнопкой-лампочкой в заголовке окна; выбор запоминается. Меню «Вид» убрано, «Во весь экран» (F11) находится в «Окне». Настройки открываются по Ctrl+P.
Запрос Windows Hello показывается один раз; если попытка не удалась, больше не спрашивается (Настройки → Секретные переменные → «Спрашивать снова»).
