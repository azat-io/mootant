# Кэш вердиктов, `--incremental` и `--since` (раздел 2, BUG-400…BUG-499)

> Исследуемый коммит: `170ec52` (main). Пакет:
> `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`, Vitest 5.0.5, Vite 8.3.5,
> Node 22.23.4 (и 24 из `/opt/node24` для проверки смены версии), git 2.43.0.
> Фикстуры: `/home/user/projects/cache/*`, скрипты:
> `analysis/tools/cache/*.sh`, сырые отчёты: `analysis/data/cache/*.json`.
> Работа в процессе — файл дополняется по ходу.

## Как устроен кэш (кратко, по коду)

Это основа для оценки находок: что именно входит в ключ, а что нет.

1. **Файл.** `<root>/node_modules/.cache/mootant/run-v3.json`
   (`core/cache/get-cache-path.ts:13`, версия формата —
   `core/cache/cache-version.ts:6`). `root` — каталог конфига mootant или cwd
   (`core/config/prepare-run.ts:133`). Чтение стартует до dry run
   (`core/run-mutants.ts:377`), ключи строятся после dry run
   (`core/run-mutants.ts:442-459`), запись — в конце
   (`core/run-mutants.ts:515-530`).
2. **Ключ окружения** (`core/cache/get-environment-key.ts:70-87`): версия
   формата кэша, версия mootant из `package.json`, «штамп сборки» = `mtimeMs`
   файла `dist/core/cache/prepare-run-cache.js`
   (`core/cache/prepare-run-cache.ts:164`), версии инструментатора и рантайма,
   имя/версия адаптера и версия раннера, хэши «файлов окружения», настройки
   раннера от адаптера, лимиты (`timeout`, `hitLimit`), мутаторы с опциями,
   `settings` и пресет, **мажорная** версия Node, `platform`, `arch`. Файлы
   окружения: `CacheInputs.files` адаптера + первый найденный вверх по дереву
   lockfile (`core/cache/find-lockfile.ts:23-38`) + `package.json` корня + в
   корне `.env*`, `tsconfig*.json`, `jsconfig*.json`
   (`core/cache/prepare-run-cache.ts:121-128`).
3. **Ключ тестового файла** (`core/cache/get-test-file-keys.ts:41-66`): ключ
   окружения, переносимый путь теста, проект, хэши самого теста и **всех его
   зависимостей из текущего dry run**, хэши значений переменных окружения,
   прочитанных тестом по имени (`*` — если тест перечислял все).
4. **Ключ записи** (`core/cache/create-run-cache.ts:216-234`): слот =
   digest(id мутанта, путь теста, проект, `isolated`/`batch`, id теста); ключ =
   digest(слот, хэш текста мутируемого файла, `static`, ключ тестового файла).
   Инкрементальный ключ = digest(слот, digest региона мутанта, `static`, ключ
   тестового файла **без мутируемых файлов**). Id мутанта не содержит позиций:
   путь, scope, мутатор, исходный текст, замена, номер вхождения
   (`core/identity/create-mutant-id.ts:61-73`).
5. **Проверка при чтении** (`core/cache/create-run-cache.ts:265-297`): ключ
   совпал (или, с `--incremental`, совпал инкрементальный ключ), тест батча ещё
   есть в dry run, «лишние» входы, прочитанные прогоном мутанта сверх dry run
   (файлы и переменные), не изменились.
6. **Что хранится** (`core/cache/create-run-cache.ts:307-366`): только
   `Killed` (кроме `crash`) и `Survived`, и только если прогон сообщил свои
   входы. `Timeout` и `Error` не кэшируются никогда.
7. **Когда кэш не сохраняется**: любая error-диагностика в прогоне — даже
   ошибка разбора в одном несвязанном файле (`core/run-mutants.ts:517-520`,
   `core/cache/save-run-cache.ts:64-69`); файл окружения изменился во время
   прогона — `mtime >= start` и другое содержимое
   (`core/cache/save-run-cache.ts:70-93`).
8. **Когда кэш молча выключен** (`prepareRunCache` возвращает `null`, никакой
   диагностики, `totalCached: null`): у адаптера нет `cacheInputs`; **любой**
   файл окружения имеет `mtime >= start` — без сравнения содержимого
   (`core/cache/prepare-run-cache.ts:138-141`); ни у одного тестового файла нет
   ключа (`core/cache/prepare-run-cache.ts:184-186`), например при
   нестандартном test environment Vitest (`adapters/vitest/runner.ts:1070-1073`).
9. **Зависимости тестового файла (Vitest):** модули, вычисленные воркером,
   `require.cache`, файлы, прочитанные через `node:fs` **внутри root**
   (`adapters/shared/track-inputs.ts:31-37`), snapshot-файлы
   (`adapters/vitest/worker/list-dependencies.ts:32-48`), транзитивное
   замыкание по графу модулей Vite без виртуальных модулей и без
   `node_modules` (`adapters/vitest/collect-dependencies.ts:76-155`,
   `adapters/vitest/get-module-file.ts:17-20`), плюс цепочка `tsconfig.json`
   каждого каталога (`adapters/shared/list-tsconfig-files.ts:17-42`). Файлы
   окружения Vitest: зависимости конфига, `.env*` из `envDir`, `globalSetup` и
   то, что для него вычислил главный процесс, путь кастомного environment
   (`adapters/vitest/get-cache-inputs.ts:128-162`); настройки — фиксированный
   список (`adapters/vitest/get-cache-inputs.ts:76-114`).
10. **Зависимости (node:test):** загруженные модули, `require.cache`, файлы,
    прочитанные через `node:fs` внутри root, `<file>.snapshot`, цепочка
    `package.json`, `tsconfig.json` при tsx
    (`adapters/node-test/collect-node-dependencies.ts:30-74`); в настройках —
    полная версия Node, флаги, `NODE_OPTIONS`
    (`adapters/node-test/get-node-cache-inputs.ts:41-77`).

Ключевое свойство, которое делает кэш в целом надёжным: dry run выполняется
всегда, и список зависимостей каждого теста берётся из **текущего** dry run.
Поэтому новый файл, который тест начал загружать (новый модуль из
`import.meta.glob`, новый `__mocks__`, новый setup-файл), меняет список и ключ.
Устаревание возможно только для входов, которые **никогда** не попадают в
список: виртуальные модули, `node_modules`, чтения вне root, главный процесс,
дочерние процессы и воркеры, настройки Vitest вне списка.

## Таблица находок

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| -- | -------- | ----------- | ------ | ---------- | ----------------- |
| BUG-401 | `--since` теряет изменённые строки файла, если в том же диффе есть изменённая или новая символьная ссылка на него: обе записи `git diff` сводятся к одному real path, и `Map.set` второй записи (строки текста ссылки, обычно `{1}`) затирает первую. Выбираются не те строки, мутанты на реально изменённых строках молча пропускаются. Порядок записей — по пути в диффе, поэтому баг проявляется, только если путь ссылки сортируется после пути цели | low | подтверждён | `core/git/read-changed-lines.ts:83-93` (`files.set` без слияния), `core/git/read-changed-lines.ts:127-134` | `test/repros/BUG-401.test.ts` в `experiment/bug-repros` (2 падающих теста); сценарий `symlinks` в `analysis/tools/cache/s-since.sh` |
| BUG-402 | **Устаревший вердикт из кэша (без `--incremental`)**, когда тест зависит от виртуального модуля Vite, содержимое которого плагин берёт из файла и объявляет его через `this.addWatchFile()`. Vite добавляет такой файл в `importedModules` виртуального модуля, но `collectDependencies` не обходит виртуальные модули вовсе: ни как корни из отчёта воркера, ни как промежуточные узлы. Файл не попадает в ключ теста; после его правки кэш возвращает старые вердикты в обе стороны — ложный `Survived` и **ложный `Killed`**, без предупреждения. Нарушает контракт `DryFile.dependencies` («files plugins watch for them»). Типичные источники: сообщения i18n, маршруты из файлов, иконки, `astro:content` | high | подтверждён | `adapters/vitest/collect-dependencies.ts:93-100`, `:121-124`, `:131-134`; `adapters/vitest/get-module-file.ts:17-20`; контракт `types/adapter/dry-file.d.ts:6-9` | `test/repros/BUG-402.test.ts` (unit и интеграционный); сценарий `virtual_module` в `s-inputs.sh`; контроль `watched_real_module` (тот же плагин на реальном модуле) проходит |
| BUG-403 | **Устаревший вердикт**: файлы, которые тест читает через `node:fs` **вне root** mootant (общие фикстуры монорепозитория, `../../fixtures/*.json`, абсолютные пути), не входят в зависимости — и в Vitest, и в `node:test`. Модули вне root при этом учитываются, чтения — нет. Документация обещает обратное: вердикт переиспользуется, пока «the files and environment variables its tests read stay the same» | medium | подтверждён | `adapters/shared/track-inputs.ts:31-37`; документация `docs/content/guide/configuration.mdx:352-355` | `test/repros/BUG-403.test.ts`; сценарии `outside_root` (Vitest), `nt_outside_root` (node:test); контроль `inside_root` проходит |
| BUG-404 | **Кэш молча выключается**, если у любого файла окружения (`vitest.config.ts`, `package.json`, lockfile, `.env`, `tsconfig*.json`) `mtime` не раньше старта прогона: `prepareRunCache` сравнивает только `mtime`, без содержимого, и возвращает `null` без диагностики (`totalCached: null`, в тексте отчёта ни слова). Если такой `mtime` у зависимости теста — этот тест молча не получает ключа. Причины на практике: часы файловой системы впереди (WSL2 с `/mnt/c`, NFS/SMB, VM shared folders, распакованный архив с «будущими» датами), тест, который перезаписывает `package.json` тем же содержимым. `saveRunCache` в той же ситуации сравнивает содержимое и пишет предупреждение — несогласованность | medium | подтверждён | `core/cache/prepare-run-cache.ts:137-141`, `:171-175`, `:184-186`; `core/cache/find-changed-files.ts:20-33`; `core/run-mutants.ts:442-459`; для сравнения `core/cache/save-run-cache.ts:79-93` | `test/repros/BUG-404.test.ts`; сценарии `future_mtime`, `future_mtime_dependency`, `write_back_package_json` |
| BUG-405 | `--since`: расхождения поведения и документации. (1) `mv a.ts b.ts` без `git add` выбирает **весь** `b.ts` (неотслеживаемый файл), а тот же `git mv` — ни одной строки; (2) неотслеживаемые файлы в каталогах из `.gitignore` не выбираются, а `cli.mdx` говорит просто «untracked files»; (3) изменения внутри submodule не выбираются никогда (`--ignore-submodules`), хотя `mootant run src` мутирует файлы submodule; в документации об этом нет | low | подтверждён | `core/git/read-changed-lines.ts:24-25`, `:78-93`; `docs/content/guide/cli.mdx:98` | сценарии `rename_unstaged`, `staged_unstaged_untracked`, `submodule` в `s-since.sh` |
| BUG-406 | `--since HEAD~1` в shallow-клоне (`--depth 1`, обычный `actions/checkout`) даёт `unknown git revision "HEAD~1"` без подсказки про shallow, хотя для ветки без общего коммита подсказка (`git fetch --deepen`) есть | low | подтверждён | `core/git/get-merge-base.ts:29-35` | сценарий `shallow_clone` |
| BUG-407 | «Штамп сборки» в ключе окружения — `mtimeMs` файла `dist/core/cache/prepare-run-cache.js`. npm 10 при установке ставит файлам текущее время, поэтому **любая переустановка той же версии** (`rm -rf node_modules && npm ci` в CI с восстановленным `node_modules/.cache/mootant`, другая машина, коллега) делает весь кэш недействительным. Это обесценивает переносимые пути ключей (`get-portable-path.ts`), задуманные именно для переноса кэша. С тем же `mtime` (через `touch -r`) тот же кэш переиспользуется полностью | medium | подтверждён | `core/cache/prepare-run-cache.ts:164`; `core/cache/get-environment-key.ts:47-51`, `:76`; замысел — `core/cache/get-portable-path.ts:4-7` | `test/repros/BUG-407/run.sh`; сценарий `reinstall_stamp` (0 из 4 после переустановки, 4 из 4 после `touch -r`) |
| BUG-408 | Одна error-диагностика в любом файле (например, ошибка разбора в несвязанном `src/broken.ts`) отменяет сохранение **всех** вердиктов прогона; пока файл не исправлен, каждый прогон холодный. Предупреждение `cache-skipped` есть, прогон и так завершается с кодом 1 | low | подтверждён | `core/run-mutants.ts:516-520`; `core/cache/save-run-cache.ts:64-69` | сценарий `error_diagnostic` |
| BUG-409 | Настройки Vitest вне фиксированного списка (`expect.requireAssertions`, `restoreMocks`/`mockReset`/`clearMocks`, `unstubEnvs`/`unstubGlobals`, `fakeTimers`, `globals`, `sequence.setupFiles`, `execArgv`, `resolve.conditions`, `chaiConfig`, `diff` и др.) не входят в ключ. Пока они заданы текстом конфига, ключ меняется через хэш файла; если конфиг вычисляет их из переменной окружения или внешнего файла, вердикт устаревает | low | подтверждён | `adapters/vitest/get-cache-inputs.ts:76-114` | сценарий `env_config_setting` (`requireAssertions` из `STRICT_TESTS`) |
| BUG-410 | **Устаревший вердикт** при изменении кода в `node_modules` без изменения lockfile: `patch-package`, ручной патч, проект без lockfile (`package-lock=false`, `.gitignore` для lockfile), рассинхрон `node_modules` и lockfile после смены ветки. Допущение «the lockfile stands for them» нигде не проверяется и не описано в документации | medium | подтверждён | `adapters/vitest/get-module-file.ts:17-20`; `adapters/shared/track-inputs.ts:33`; `adapters/node-test/collect-node-dependencies.ts:49-55`; `core/cache/find-lockfile.ts:23-38` | `test/repros/BUG-410.test.ts`; сценарии `node_modules_patch`, `nt_node_modules_patch` |
| BUG-411 | С нестандартным test environment Vitest (путь к своему окружению, `vitest-environment-nuxt` и т. п.) кэш молча не работает никогда: зависимости таких тестов — `null`, ключей нет, `prepareRunCache` возвращает `null`, отчёт не сообщает причину | low | подтверждён | `adapters/vitest/runner.ts:1066-1073`; `core/cache/prepare-run-cache.ts:184-186` | сценарий `custom_environment` |
| BUG-412 | **Кэш никогда не срабатывает**, если `globalSetup` передаёт через `provide()` значение, меняющееся от прогона к прогону (сервер на случайном порту, URL контейнера testcontainers, временный каталог): весь `getProvidedContext()` входит в ключ окружения через `describeProjectSettings`. Молча | medium | подтверждён | `adapters/vitest/get-cache-inputs.ts:82-92` | `test/repros/BUG-412.test.ts`; сценарий `volatile_provide` (0 из 4 повторно) |
| BUG-413 | Тест, запускающий дочерний процесс без явного `env` (или делающий `{ ...process.env }`), зависит от `*` — хэша всех переменных, кроме 7 «летучих». Любое различие окружения сбрасывает его вердикты: другой `GITHUB_RUN_ID` (каждый прогон CI), `npm_*` при `npm run mutate` вместо `npx mootant`, `SSH_AUTH_SOCK`, `VSCODE_*`. Это консервативно и корректно, но делает кэш бесполезным в CI для таких тестов, и об этом нигде не сказано | low | подтверждён | `adapters/shared/track-environment.ts:184-196`; `adapters/shared/index-environment-hashes.ts:9-17`; `core/cache/get-test-file-keys.ts:52-56` | сценарий `spawn_star` (4/4 при том же окружении, 0/4 при другом `GITHUB_RUN_ID` и через `npm run`) |
| BUG-414 | В слоте `(мутант, тест)` хранится одна запись независимо от ключа окружения, поэтому чередование окружений (Node 22 ↔ 24, ветки с разными lockfile, два конфига mootant) полностью вытесняет кэш: после возврата к прежнему окружению — 0 переиспользованных | low | подтверждён | `core/cache/create-run-cache.ts:216-222`; `core/cache/write-run-cache.ts:37-39` | сценарий `node_major` (22 → 24 → 24: 4/4 → 22: 0/4) |
| BUG-415 | Файлы, которые читает не JS-обёртка `node:fs`, не отслеживаются: `process.loadEnvFile(path)` (читает C++), а также `--env-file` у дочерних процессов. Переменная, которую задал такой файл, при старте процесса не была задана, её хэш — «не задана» в обоих прогонах; вердикт устаревает | low | подтверждён (node:test) | `adapters/shared/track-file-reads.ts:15-26`; `adapters/node-test/get-node-cache-inputs.ts:63-75` | сценарий `nt_load_env_file` |
| BUG-416 | Смена настройки пресета, которая не может изменить вердикт уже перечисленного мутанта (`settings.loggers`, опции мутатора, пресет), сбрасывает **все** вердикты: мутаторы и настройки целиком входят в ключ окружения, хотя id мутанта уже содержит мутатор, исходный текст и замену | low | подтверждён | `core/cache/prepare-run-cache.ts:153-158`; `core/cache/get-environment-key.ts:83` | сценарий `mootant_setting` |
| BUG-417 | `--incremental`: регион мутанта следует только за записью **имён** верхнего уровня. Оператор того же файла, который меняет свойство объекта (`config.boundary = 30`), в регион не входит, хотя документация говорит «what that uses in its file». Вердикт устаревает; предупреждение `incremental-reuse` при этом выводится | low | подтверждён | `core/generate/get-mutant-regions.ts:128-186`; `docs/content/guide/configuration.mdx:363-366` | сценарий `property_write_elsewhere` в `s-incremental.sh` |
| BUG-418 | Прерванный прогон (Ctrl+C) не сохраняет ни одного вердикта: кэш пишется только в конце. Долгий прогон, прерванный на 90 %, начнётся с нуля. Попутно: после SIGINT остаётся рабочий каталог `/tmp/mootant-*` (тема раздела про процессы) | low | подтверждён | `core/run-mutants.ts:515-530` | сценарий `interrupted` в `s-corrupt.sh` |
| BUG-419 | **Устаревший вердикт**: `tsconfig`, на который ссылается `references` (solution-style, как в шаблонах `create-vite`), учитывается только в корне проекта. В пакете монорепозитория (`packages/web/tsconfig.json` → `tsconfig.app.json`) смена `useDefineForClassFields`/`target`/`jsx*`/`experimentalDecorators`, по которой Vite трансформирует код, не меняет ключ | medium | подтверждён | `adapters/shared/list-tsconfig-files.ts:17-42` (только `extends`); `adapters/shared/read-tsconfig-extends.ts:24-47`; `core/cache/prepare-run-cache.ts:125-127` (только корень) | `test/repros/BUG-419.test.ts`; сценарий `tsconfig_reference` |
| BUG-420 | Для Vitest в ключ входит только мажорная версия Node, для `node:test` — полная. Минорные версии Node меняют поведение (например, `--experimental-strip-types` по умолчанию с 22.18, правки `URL`, `fetch`, `Intl`) | low | гипотеза | `core/cache/get-environment-key.ts:84`; ср. `adapters/node-test/get-node-cache-inputs.ts:70` | проверить двумя минорными версиями Node 22 (на машине только 22.23 и 24) |

## Матрица сценариев

Скрипты: `analysis/tools/cache/s-inputs.sh`, `s-incremental.sh`,
`s-corrupt.sh` (общие функции — `lib.sh`, шаблоны — `make-templates.sh`, всё
разом — `run-all.sh`). Логи: `analysis/data/cache/inputs-g{1..7}.log`,
`incremental.log`, `corrupt.log`; отчёты каждого прогона —
`analysis/data/cache/<сценарий>.<прогон>.json`. Схема: r1 — холодный прогон
(пишет кэш) → изменение → r2 с кэшем → r3 `--no-cache` (эталон). «Устарел» —
вердикт r2 из кэша отличается от r3. В каждом сценарии изменение действительно
меняет вердикт хотя бы одного мутанта (проверено сравнением r1 и r3).

| Изменение | Должен пересчитаться | Пересчитался | Итог |
| --------- | -------------------- | ------------ | ---- |
| Файл данных виртуального модуля (плагин с `addWatchFile`) | да | **нет**, 2 вердикта устарели (в т. ч. ложный `Killed`) | BUG-402 |
| Тот же файл данных, плагин трансформирует реальный модуль | да | да | ок |
| Фикстура, прочитанная через `fs` вне root (Vitest) | да | **нет**, 2 устарели | BUG-403 |
| То же, `node:test` | да | **нет**, 2 устарели | BUG-403 |
| Фикстура через `fs` внутри root | да | да | ок |
| Код пакета в `node_modules` без смены lockfile (Vitest / node:test) | да | **нет**, 2 устарели | BUG-410 |
| Настройка Vitest вне списка (`expect.requireAssertions`) из переменной окружения | да | **нет**, 1 устарел | BUG-409 |
| `useDefineForClassFields` в `tsconfig.app.json` пакета (через `references`) | да | **нет**, 2 устарели | BUG-419 |
| `tsconfig.json` в корне | да | да | ок |
| Env-файл, загруженный `process.loadEnvFile()` (node:test) | да | **нет**, 2 устарели | BUG-415 |
| Snapshot-файл | да | да | ок |
| Setup-файл | да | да | ок |
| Появился `__mocks__/limits.ts` для `vi.mock` без фабрики | да | да | ок |
| `.env` с `VITE_*`, прочитанный через `import.meta.env` | да | да | ок |
| Переменная окружения, прочитанная тестом по имени | да | да | ок |
| Новый файл, подхваченный `import.meta.glob` | да | да (свежий dry run меняет список) | ок |
| Монорепозиторий (npm workspaces): тест пакета `app` импортирует `lib` через symlink, меняется хелпер `app` | да | да | ок |
| Node 22 → 24 | да | да | ок; обратно на 22 — 0 переиспользованных (BUG-414) |
| Переименован тестовый файл | нет (содержимое то же) | да, 0/4 из кэша | консервативно, не баг |
| Переименован исходник | да (новые id) | да | ок |
| Проект перемещён в другой каталог | нет | нет, 4/4 из кэша | ок, пути переносимы |
| Переустановка той же версии mootant | нет | **да, 0/4** | BUG-407 |
| `mtime` конфига Vitest в будущем | нет | **кэш выключен навсегда, молча** | BUG-404 |
| `mtime` исходника в будущем | нет | **тест без ключа навсегда, молча** | BUG-404 |
| Тест перезаписывает `package.json` тем же содержимым | нет | **кэш выключен, молча** | BUG-404 |
| `globalSetup` с `provide()` случайного порта | нет | **0/4 каждый раз** | BUG-412 |
| Тест запускает дочерний процесс; другой `GITHUB_RUN_ID` / `npm run` | спорно (консервативно) | 0/4 | BUG-413 |
| `settings.loggers` в конфиге mootant | нет | 0/4 | BUG-416 |
| Ошибка разбора в несвязанном файле | — | кэш не сохраняется вовсе | BUG-408 |
| Кастомный test environment | — | кэш не работает никогда, молча | BUG-411 |
| `--incremental`: изменён тест | да | да | ок |
| `--incremental`: изменена зависимость вне мутируемых путей | да | да | ок |
| `--incremental`: изменён другой мутируемый файл | по документации может устареть | устарел, предупреждение есть | ок по документации |
| `--incremental`: изменён вызывающий код в том же файле | по документации может устареть | устарел, предупреждение есть | ок по документации |
| `--incremental`: запись свойства (`config.x = …`) в другом операторе | «what that uses in its file» | устарел, предупреждение есть | BUG-417 |
| Обрезанный JSON кэша | без падения | всё прогнано заново, файл снова валиден | ок |
| Кэш-файл — каталог | без падения | предупреждение `cache-write-failed` | ок |
| Два прогона одновременно | без порчи | файл валиден, 4 записи, следующий прогон 4/4 | ок |
| Записи с подменённым статусом | — | принимаются как есть (score 100) | нет проверки целостности, см. ниже |
| Ctrl+C после dry run | — | ничего не сохранено; остался `/tmp/mootant-*` | BUG-418 |

## Отрицательные результаты

Проверено и **работает правильно** (не баги):

- Свежий dry run на каждом прогоне — сильная сторона дизайна: новый модуль из
  `import.meta.glob`, новый `__mocks__`-файл, новый setup-файл, другой резолв
  alias'а меняют список зависимостей и, значит, ключ теста. Сценарии
  `glob_new_file`, `mocks_appear`, `setup_file_change`.
- Snapshot-файлы, `.env` из `envDir` с `import.meta.env`, переменные,
  прочитанные по имени, `tsconfig.json` в корне, setup-файлы — инвалидируют
  кэш.
- Монорепозиторий с npm workspaces и symlink-пакетом в `node_modules`: Vite
  разворачивает ссылку в real path вне `node_modules`, файл учитывается.
- Ключи переносимы между каталогами (`get-portable-path.ts`): перемещённый
  проект переиспользует 4/4.
- Повреждённый JSON, кэш-каталог вместо файла, одновременные прогоны — без
  падений и без порчи файла (атомарный `rename`, слияние при записи —
  `core/cache/write-run-cache.ts:36-56`).
- `--incremental`: изменения теста и зависимостей вне мутируемых путей
  инвалидируют, предупреждение `incremental-reuse` выводится всякий раз, когда
  запись найдена только по региону (`core/cache/create-run-cache.ts:282-284`,
  `core/run-mutants.ts:501-514`); случаев «устарел без предупреждения» в
  инкрементальном режиме не найдено (кроме общих для обоих режимов BUG-402,
  403, 410, 419).
- Коллизия id при сдвиге `occurrence` (удалили одного из двух одинаковых
  мутантов одного scope): в обычном режиме безопасна (ключ содержит хэш всего
  файла), в инкрементальном нужен ещё и совпадающий текст региона — то есть
  идентичный код; реалистичного примера с неверным вердиктом построить не
  удалось.
- `--since`: переименования, удалённые строки, merge base, CI-shallow с
  подсказкой, необычные символы в путях, бинарные файлы, detached HEAD,
  worktree, незавершённый merge, пользовательские настройки `git diff` —
  см. таблицу ниже.

## Отсутствующие гарантии

Что входит в ключ и что нет — и почему это опасно.

1. **Входы главного процесса Vitest.** Отслеживаются только модули, которые
   главный процесс вычислил для `globalSetup`, зависимости конфига, `.env` из
   `envDir` и значения `provide`. Не отслеживаются: файлы, которые читают
   плагины Vite (`.babelrc` для `@vitejs/plugin-react` с Babel, `.swcrc` для
   `unplugin-swc` в NestJS, `postcss.config.*`, `browserslist`), файлы,
   которые конфиг читает через `fs`, а не `import`, переменные окружения,
   которые читает конфиг. Опасность: вердикт устаревает при смене трансформации
   кода. Частично это BUG-402 (виртуальные модули) и BUG-409.
2. **`node_modules`.** Целиком заменены хэшем lockfile (BUG-410). Без
   lockfile — вообще ничем. Опасность: `patch-package`, локальные патчи,
   рассинхрон после смены ветки.
3. **Чтения вне root и не через `node:fs`** (BUG-403, BUG-415), дочерние
   процессы и `worker_threads` (в документации есть: «After changes that only
   child processes, workers or the network see, delete that directory» —
   `docs/content/guide/configuration.mdx:357-359`).
4. **Целостность кэш-файла.** Статус записи принимается на веру: подменённый
   `Killed` даёт score 100 (сценарий `tampered`). Для локального кэша это
   допустимо, но в CI кэш восстанавливается из общего хранилища — тема раздела
   безопасности.
5. **Версия Node.** Только мажорная для Vitest (BUG-420, гипотеза).
6. **Стабильность ключа.** В ключ окружения попадают летучие значения:
   `mtime` пакета (BUG-407), значения `provide` (BUG-412), все переменные
   окружения для тестов с `*` (BUG-413). Опасность обратная — кэш молча не
   работает, и пользователь не узнаёт почему: `totalCached: null` или 0 без
   диагностики. Нужна диагностика «почему кэш не использован» (по аналогии с
   `cache-skipped` в `saveRunCache`).
7. **Изменения во время прогона** определяются по `mtime >= start`
   (`core/cache/find-changed-files.ts:20-33`). Помимо BUG-404 (часы впереди)
   есть обратный риск: на ФС с грубой гранулярностью `mtime` (1–2 с: FAT/exFAT,
   часть SMB, HFS+) правка в первую секунду после старта может получить `mtime`
   меньше `start` и не считаться изменением (гипотеза, на ext4 не
   воспроизводится). Файл, изменённый и возвращённый к прежнему содержимому во
   время прогона, считается неизменным (`core/cache/save-run-cache.ts:79-86`),
   хотя часть прогонов мутантов видела другое содержимое.
8. **Тесты, изменённые без изменения исходников, и `--since`.** По
   документации `--since` выбирает только мутантов на изменённых строках, так
   что PR, который лишь добавляет тесты, не перепроверяет ни одного мутанта
   (`docs/content/guide/cli.mdx:98`). Это не баг, но стоит описать в
   документации рядом с CI-рецептом.

## `--since`: результаты сценариев

Скрипт: `analysis/tools/cache/s-since.sh` (использует `mootant list --since`,
который выбирает мутантов тем же кодом, что `run`: `core/list-mutants.ts` →
`readChangedLines` → `selectChangedMutants`). Логи:
`analysis/data/cache/since-part{1,2,3}.log`, `since-shallow.log`. Исходник
фикстуры — 6 строк вида `export const a = (x: number) => x > 1`, по мутанту
на строку, поэтому выбранные строки читаются напрямую.

| Сценарий | Ожидание | Факт | Итог |
| -------- | -------- | ---- | ---- |
| `git mv` без правок, закоммичено | ничего (строки не менялись) | ничего | ок, по правилу «изменённые строки» |
| `git mv` + правка строки 3 | строка 3 | 3 | ок |
| `mv` без `git add` | как у `git mv` | **весь файл** (новый путь — неотслеживаемый) | несогласованность, см. BUG-405 |
| staged строка 2 + unstaged строка 5 + новый неотслеживаемый файл | 2, 5; новый файл целиком | 2, 5; целиком | ок |
| неотслеживаемый файл в каталоге из `.gitignore` | документация: «untracked files» | не выбран | расхождение с документацией (в коде описано верно), BUG-405 |
| удалена строка 3 из 6 | строки 2 и 3 (вокруг разрыва) | 2, 3 | ок |
| удалена последняя строка | строка 5 | 5 | ок |
| ветка с merge из main, main ушёл вперёд | только изменения ветки (строка 2) | 2 | ок |
| shallow clone `--depth 1`, `--since HEAD~1` | подсказка про shallow | `unknown git revision "HEAD~1"` без подсказки | low, BUG-406 |
| CI: PR-ветка `--depth 1` + `fetch --depth 1 origin main` | ошибка с подсказкой | `no common commit; ... "git fetch --deepen"` | ок |
| то же после `--deepen` | строка 5 | 5 | ок |
| несуществующий ref | понятная ошибка, exit 1 | `unknown git revision`, exit 1; c `--json` stdout пуст | ок (JSON при ошибке — тема CLI) |
| пробел, кириллица, `"`, `\`, TAB, ведущий `-` в имени | строка 4 во всех файлах | 4 во всех | ок |
| файл с NUL (git считает бинарным) | весь файл | весь файл | ок |
| изменены только тесты | ничего (по документации) | ничего | ок по документации (но см. «Отсутствующие гарантии») |
| detached HEAD | изменения после merge base | ок | ок |
| `git worktree` | строка 6 | 6 | ок |
| незавершённый merge (UU), конфликт разрешён в рабочем дереве | строка 3 | 3 | ок |
| изменён файл-цель символьной ссылки | строка 5 цели | 5 | ок |
| ссылка перенаправлена на файл, в котором изменена строка 4 | строка 4 | **строка 1, строка 4 потеряна** | **BUG-401** |
| `diff.noprefix`, `diff.mnemonicPrefix`, `diff.algorithm=patience`, `color.diff=always`, `diff.relative`, `diff.external`, `core.quotePath=true` | строка 2 | 2 при каждой настройке | ок |
| изменения внутри submodule | ? | не выбраны никогда (`--ignore-submodules`), хотя файлы submodule входят в `src` | по коду намеренно; в документации не сказано (BUG-405) |
