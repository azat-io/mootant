# Раздел 2 (часть): процессы и ресурсы, окружения, CLI, документация ↔ поведение

> Исследуемый коммит 170ec52, 2026-11-04. Диапазон ID: BUG-500…BUG-599.
> Пакет `mootant-0.1.0-170ec52.tgz`, Vitest 5.0.5, Vite 8.3.5. Node 22.23.4
> (основной), 20.19.0, 22.12.0, 24.22.2, 26.13.0; для проверок вне `engines` —
> 18.20.8, 20.18.0, 22.11.0. Linux x64, 4 vCPU (общая машина, load average
> 2–27 во время замеров), процесс от root, `TERM=linux`, `CI` не задан.
>
> Фикстуры — `/home/user/projects/cli/*`, их создают скрипты
> `analysis/tools/cli/make-fixture.sh` и `make-hang-fixtures.sh` (node_modules
> базовой фикстуры `base-vt` копируются жёсткими ссылками). Сырые данные —
> `analysis/data/cli/`. Воспроизведения — ветка `experiment/bug-repros`,
> `test/repros/BUG-5xx*` (тесты Vitest или фикстура с `run.sh`; `run.sh`
> собирает `dist`, если его нет).

## Сводная таблица

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-502 | Зависший воркер Vitest не останавливается, если нет `ps` (Debian slim, distroless) или `ps` без `-p` (BusyBox/Alpine — гипотеза): прогон висит бесконечно вместо вердикта Timeout | high | подтверждён (нет `ps`), гипотеза (BusyBox) | `adapters/vitest/stop-hung-worker.ts:20-21,42-46`; вызовы `run-plan.ts:74-75`, `run-dry.ts:69-70`, `wait-for-workers.ts:113` | `test/repros/BUG-502.test.ts`; `data/cli/e1a-vt-hang-no-ps.txt` vs `e1b-vt-hang-with-ps.txt` |
| BUG-507 | Под Vitest модуль, загруженный через `require()` (CJS-исходник требует другой, `createRequire` в тесте), не переключается: его мутанты — NoCoverage, хотя тесты их убивают | high | подтверждён | переключение только в Vite-хуке `adapters/vitest/create-mootant-plugin.ts:32`; у node:test есть `adapters/node-test/preload/patch-module-compile.ts:14` | `test/repros/BUG-507.test.ts`; `data/cli/physical-vt-cjs-chain.json` (4 расхождения из 8), `physical-vt-require.json` (6 из 7) |
| BUG-508 | Проект Vitest (`test.projects`) со своим `root` (`projects: ['packages/*']` и т. п.) не настраивается: dry run падает «Tests fail without mutants … The test runner did not report this file», хотя `vitest --run` зелёный | high | подтверждён | плагин передаётся только в корневой Vite-сервер: `adapters/vitest/start-vitest-session.ts:110`, хук `create-mootant-plugin.ts:53`; Vitest берёт `configureVitest` из `project.vite.config` (`vitest/dist/chunks/cli-api.De07GUeT.js:12410-12411`) | `test/repros/BUG-508.test.ts` |
| BUG-500 | `mootant.config.ts` из документации не грузится в пакете с `"type": "commonjs"` (так пишет `npm init -y` у npm 11) на Node ≥ 22.18, 24, 26 — даже с jiti; на 22.12 с jiti тот же файл работает | medium | подтверждён | `core/config/load-typescript-config.ts:16-17` | `test/repros/BUG-500/run.sh` |
| BUG-503 | SIGINT/SIGTERM/SIGHUP только процессу mootant (`kill <pid>`, IDE, `child.kill()` харнесса агента) оставляет воркер Vitest с зависшим мутантом сиротой (ppid 1, 100% CPU, навсегда) | medium | подтверждён | нет обработчика сигналов для сессии Vitest; есть только `cli/terminal/create-spinner.ts:144-161` (TTY) и `adapters/node-test/track-process-group.ts:7,18-22` (node:test) | `test/repros/BUG-503/run.sh`; `data/cli/sig-vt-hang-*.txt` |
| BUG-504 | node:test: SIGHUP (закрыли терминал/SSH) или SIGQUIT (Ctrl+\\) завершают mootant, а тестовый процесс зависшего мутанта (своя сессия, `detached`) живёт дальше | medium | подтверждён | `adapters/node-test/track-process-group.ts:7`, `run-test-process.ts:117-123` | `test/repros/BUG-504/run.sh HUP` / `QUIT` |
| BUG-506 | Если в процессе mootant что-то держит event loop (сервер из `globalSetup`), `mootant run` печатает отчёт и не завершается; `vitest --run` выходит после teardown timeout | medium | подтверждён | `bin/mootant.js:5` (нет принудительного выхода), `adapters/vitest/start-vitest-session.ts:149-157` | `test/repros/BUG-506/run.sh` |
| BUG-509 | `--json`: в stdout попадает всё, что печатает код в процессе mootant (`console.log` в `vitest.config`, `vite-plugin-svelte`; вероятно, баннер dotenv@17), — stdout не парсится как JSON | medium | подтверждён | `cli/run-mutation.ts:63-72`; перехвачен только логгер Vitest — `adapters/vitest/start-vitest-session.ts:111-116` | `test/repros/BUG-509/run.sh`; `data/cli/svelte-json-stdout.txt` |
| BUG-510 | node:test: если `NODE_OPTIONS` подгружает модуль, печатающий в stdout (свой preload; вероятно, `-r dotenv/config` у dotenv@17), `JSON.parse` пробы в колбэке `execFile` бросает неперехваченное исключение — mootant падает со стеком | medium | подтверждён | `adapters/node-test/read-node-runtime.ts:22-24` | `test/repros/BUG-510.test.ts` |
| BUG-511 | Windows: `stopProcessGroup` не убивает тестовый процесс: `process.kill(-pid)` даёт `ESRCH` (libuv `uv_kill` → `OpenProcess` → `ERROR_INVALID_PARAMETER` → `UV_ESRCH`), а код считает это «группа уже завершилась»; зависший мутант node:test вешает прогон | high | гипотеза | `adapters/node-test/stop-process-group.ts:11-16`; тест предполагает `EINVAL`: `test/adapters/node-test/stop-process-group.test.ts:36-48` | на Windows: `node -e "try{process.kill(-process.pid,'SIGKILL')}catch(e){console.log(e.code)}"`, затем `nt-hang` |
| BUG-505 | Любое прерывание оставляет в TMPDIR рабочий каталог `mootant-XXXXXX` (plan, out, …) и у Vitest ещё `<random>/ssr/…` | low | подтверждён | `core/run/create-work-directory.ts:26-31`, удаление только в `finally` `core/run-mutants.ts:271,323-325` | `test/repros/BUG-505/run.sh INT`/`TERM`; улика координатора `/tmp/mootant-4WyyZs` |
| BUG-501 | `.cts`-конфиг с `require('mootant')` падает на Node 22.18+ (22.x): «request for './instrument/resolve-switched-text.js' is from a module not been linked» — баг Node 22 в `import()` CJS-TypeScript-модуля с require(esm); `require()` того же файла работает, Node 24/26 — тоже | low | подтверждён | `core/config/load-config.ts:52` → `load-typescript-config.ts:16-17` → `import-config.ts:12` | `test/repros/BUG-501/run.sh` |
| BUG-512 | Windows: после остановки воркера его PID проверяется без проверки родителя (`process.platform !== 'win32'`), а `waitForWorkers` через 70 с убивает «живые» PID из `worker/` — на Windows PID переиспользуются быстро, можно убить чужой процесс | low | гипотеза | `adapters/vitest/stop-hung-worker.ts:20`, `wait-for-workers.ts:73,113` | на Windows: держать PID умершего воркера занятым другим процессом до конца ожидания |
| BUG-513 | Скрипты `package.json` разбираются по правилам POSIX-shell: `node --test test\unit\a.test.js` → файл `testunita.test.js`; обработка `\` и `.cmd` в `resolve-command.ts` недостижима; `set X=1&& node --test` теряет переменную; команда перепроверки кавычит одинарными кавычками (не работает в cmd.exe) | low | подтверждён (логика, функции из dist); эффект на Windows — гипотеза | `adapters/node-test/parse-command.ts:54-58`, `resolve-command.ts:82-85`, `cli/report/format-command.ts:117-121` | `node analysis/tools/cli/win-script-parse.mjs <фикстура>` |
| BUG-514 | Цвета: `FORCE_COLOR=0` включает ANSI (Node и chalk трактуют как «выключить»), `CI=true` и Windows включают ANSI в перенаправленном в файл stdout | low | подтверждён | `cli/terminal/colors.ts:116-127` | `data/cli/cli-battery-run.txt` (`run-force-color-0`, `run-color-ci-pipe`); вызов `isColorSupported` из dist |
| BUG-515 | Node < 20.19 (вне `engines`): CLI не проверяет версию — на 18.20.8 `run` падает со стеком `toSorted is not a function`, а любой `--no-*` — «Unknown option» (нет `allowNegative` в `util.parseArgs`) | low | подтверждён | `cli/index.ts:13`, `cli/create-run-progress.ts` | `npx -y node@18.20.8 node_modules/mootant/bin/mootant.js run src --no-cache` |
| BUG-516 | Мелочи сообщений CLI: `list src --no-cache` → «--cache applies to the run command only», `run --no-skipped` — ошибка; `--threshold 0x10`/`1e1` принимаются как 16/10; в сообщениях node:test процесс называется «worker» | low | подтверждён | `cli/parse-arguments.ts:312-317,318-330,389-395`; `core/run/apply-isolated-result.ts:127` | `data/cli/cli-battery-args.txt`, `cli-battery-run.txt` |

Bug-prompts (medium и выше, подтверждённые): `analysis/bug-prompts/BUG-500.md`,
`BUG-502.md`, `BUG-503.md`, `BUG-504.md`, `BUG-506.md`, `BUG-507.md`,
`BUG-508.md`, `BUG-509.md`, `BUG-510.md`.

## Подробности

### BUG-502: без рабочего `ps` прогон Vitest висит вечно

`stopHungWorker` (`adapters/vitest/stop-hung-worker.ts:13-34`) перед
`SIGKILL` проверяет, что процесс — потомок mootant, через
`execFile('ps', ['-o', 'ppid=', '-p', pid])` (`:42-46`). При любой ошибке
`ps` (`ENOENT`, неизвестная опция) `getParentPid` даёт `null`, проверка
`null !== process.pid` (`:21`) возвращает `false`, и воркер не трогают.
Сторож пульса (`watch-heartbeats.ts:60-62`) срабатывает один раз на пульс
(`fired = true`), повтора нет; `waitForWorkers` в конце (`:113`) снова зовёт
тот же `stopHungWorker`. Vitest сам синхронный цикл не прервёт (таймер теста в
воркере не срабатывает).

Замер (`vt-hang`, мутант `9 -> 10` даёт шаг цикла 0 в тесте, лимит попаданий
не срабатывает, т. к. мутированный код вычисляется один раз):
с `ps` — 5,2 с, вердикт Timeout, `worker-hang` (`data/cli/e1b-vt-hang-with-ps.txt`);
с `PATH` без `ps` — 75 с до внешнего `timeout -s KILL`, после «+ dry run» ничего,
воркер 99% CPU (`data/cli/e1a-vt-hang-no-ps.txt`). Существующий тест
`test/adapters/vitest/stop-hung-worker.test.ts` («leaves processes that are gone
or not its children», `mockParent(null)`) закрепляет это поведение как
ожидаемое.

Где встречается: образы `node:<версия>-slim` (Debian slim без `procps`),
distroless, минимальные CI-контейнеры — `ps` отсутствует (общеизвестно, здесь
не проверялось запуском образа). Alpine (`node:<версия>-alpine`) — BusyBox
`ps` без опции `-p` (по исходникам BusyBox `procps/ps.c`, гипотеза; проверка:
`docker run --rm node:22-alpine ps -o ppid= -p 1` → ожидается
«unrecognized option: p» и код 1). Исправление без внешних утилит: пул уже
записывает PID своих воркеров (`create-forks-pool.ts:66-68`, `state.spawns`),
достаточно проверять принадлежность PID этому множеству (это же закрывает
BUG-512 на Windows).

### BUG-507: `require()` под Vitest — мутанты молча становятся NoCoverage

Vitest-адаптер переключает модули только в `transform`-хуке Vite-плагина
(`adapters/vitest/create-mootant-plugin.ts:32-50`). Модуль, который Node
загружает сам через `require()` (из CJS-исходника, обслуженного Vite, или
через `createRequire` в тесте), Vite не видит — mootant выдаёт предупреждение
`never-served` и вердикт NoCoverage всем его мутантам. Физическое применение
мутантов (`analysis/tools/cli/physical-check.mjs`) показывает, что тесты их
убивают:

- `vt-cjs-chain` (`a.cjs` требует `b.cjs`, тест импортирует `a.cjs`): 4 из 5
  мутантов `b.cjs` убиваются физически, у mootant все 5 — NoCoverage; score
  37,5% вместо 87,5%.
- `vt-require` (тест грузит `src/math.js` пакета `"type": "commonjs"` через
  `createRequire`): 6 из 7 — расхождение; тест-файл к тому же не выбирается
  («dry run 0 tests»).

Документация обещает `.cjs` в «List and run mutants»
(`docs/content/guide/compatibility.mdx:34`) и упоминает только вычисляемый
`import()` (`:56-57`). node:test тот же код обрабатывает верно (патч
`Module.prototype._compile`, `adapters/node-test/preload/patch-module-compile.ts:14`);
этот же механизм можно поставить в воркер Vitest (раннер
`adapters/vitest/runner.ts`).

### BUG-508: проекты Vitest со своим `root`

Плагин mootant передаётся в `createVitest` третьим аргументом (`viteOverrides`,
`adapters/vitest/start-vitest-session.ts:110`) и попадает только в корневой
Vite-сервер. Для проекта с другим `root` Vitest создаёт отдельный сервер и
вызывает `configureVitest` по его плагинам
(`node_modules/vitest/dist/chunks/cli-api.De07GUeT.js:12410-12411`), поэтому
`configureProject` (`adapters/vitest/configure-project.ts`) для него не
вызывается: остаются собственный раннер и пул Vitest, нет `transform`-хука,
нет out-файлов — dry run видит «did not report this file». Проверено
пробником (`configureVitest called for: [ 'b' ]` при проектах `a` с
`root: 'packages/a'` и `b` без `root`). Не работает ни один вариант: глоб
каталогов `projects: ['packages/*']`, inline `{ test: { root } }`,
`extends: true`, конфиги в пакетах; работает только общий `root`
(`include` по пакетам) или запуск из каталога пакета. Заодно для таких
проектов не выполняется `checkProjectConfig` (неподдерживаемые пулы не
отлавливаются).

### BUG-500: TS-конфиг в CommonJS-пакете

`loadTypescriptConfig` (`core/config/load-typescript-config.ts:15-31`) при
`process.features.typescript` всегда делает нативный `import()`, а Node читает
`.ts` в пакете `"type": "commonjs"` как CommonJS: «Cannot load
mootant.config.ts: Cannot use import statement outside a module» (+ предупреждение
Node). Пакет без поля `type` грузится, но каждый запуск печатает
`MODULE_TYPELESS_PACKAGE_JSON`. jiti, даже установленный, не пробуется. На Node
22.12 с jiti тот же проект работает — обновление Node ломает конфиг. npm 11
(Node 24) пишет `"type": "commonjs"` в `npm init -y` (проверено:
`npx npm@11 init -y`). Не-стираемый TS (`enum`) нативно тоже не грузится
(«TypeScript enum is not supported in strip-only mode»), хотя jiti справился
бы.

### BUG-503, BUG-504, BUG-505: сигналы

Харнесс `analysis/tools/cli/signal-test.sh` (режимы `plain`, `tty` через
`script(1)`, `tty-shell` — pty, сессию ведёт shell, как в реальном терминале);
фикстуры `vt-hang-long`/`nt-hang-long` (синхронный бесконечный цикл, лимит
30 с), `vt-slow`/`nt-slow` (тест ждёт 4 с, сигнал в dry run).

| Сценарий | Vitest | node:test |
| --- | --- | --- |
| Ctrl+C (SIGINT всей группе), TTY | 130; процессов нет; workdir + `<random>/ssr` остались | 130; процессов нет; workdir остался |
| SIGINT только pid, без TTY | 130; **воркер-сирота** (ppid 1, R, 100% CPU) | 130; группа убита; workdir остался |
| SIGTERM только pid, без TTY | 143; **воркер-сирота** | 143; ок; workdir остался |
| SIGTERM pid, pty с shell (`tty-shell`) | 143; **воркер-сирота** | 143; ок; workdir остался |
| SIGHUP только pid | 129; **воркер-сирота** | 129; **тестовый процесс-сирота** |
| SIGQUIT только pid | — | 131; **тестовый процесс-сирота** |
| SIGTERM pid в dry run (тест ждёт 4 с) | 143; воркер живёт, пока не кончится его тест | 143; ок |

Данные: `data/cli/sig-*.txt`. Почему так. CLI ставит обработчики только у
спиннера в интерактивном терминале (`cli/terminal/create-spinner.ts:144-161`:
`process.exit(130/143)`, `finally` не выполняется) и в node:test на время жизни
тестовых процессов (`adapters/node-test/track-process-group.ts:7,18-22,40-46`:
SIGINT/SIGTERM, убить группы и переподнять сигнал). Для Vitest убийство
воркеров при сигнале не предусмотрено; без TTY срабатывает обработчик логгера
Vitest (`setTimeout(() => process.exit(), 1)`), воркер в синхронном цикле не
видит закрытия IPC. Тестовые процессы node:test стартуют `detached`
(`run-test-process.ts:122`) — собственная сессия, SIGHUP терминала до них не
доходит, а SIGHUP/SIGQUIT mootant не обрабатывает. Рабочий каталог создаётся в
TMPDIR (`core/run/create-work-directory.ts:27`) и удаляется только в `finally`
(`core/run-mutants.ts:323-325`), до которого сигнал не доходит. Кэш
(`node_modules/.cache/mootant`) при прерывании не повреждается: запись через
временный файл и `rename` (`core/cache/write-run-cache.ts:52-60`); после
SIGKILL посреди записи может остаться `run-v3.json.<pid>.tmp` (не наблюдалось).

Наблюдение координатора совпадает: `/tmp/mootant-4WyyZs` (beat/claim/done/env/
out/plan/worker) остался после внешнего SIGTERM; не удалён — улика.

### BUG-506: процесс не завершается

`bin/mootant.js:5` вызывает `run()` и ждёт естественного завершения event loop.
Код, выполняемый в процессе mootant (`globalSetup`, `vitest.config`,
плагины), может держать его вечно. `vitest --run` в той же фикстуре выходит
через 12–16 с с «close timed out after 10000ms» (Vitest CLI принудительно
вызывает `process.exit` после `teardownTimeout`); mootant печатает весь отчёт
и висит до внешнего таймаута (`timeout 40` → 124; `data/cli/vt-handle.txt`).
В CI это зависание джоба до его лимита, у агента — бесконечное ожидание
`--json`.

### BUG-509: stdout `--json` не чистый JSON

`runMutation` печатает отчёт `console.info` в конце (`cli/run-mutation.ts:63-72`);
поток stdout всё время открыт для любого кода в процессе: перехвачены только
потоки логгера Vitest (`start-vitest-session.ts:111-116`). Подтверждено на
`console.log` в `vitest.config.js` (имитация баннера dotenv@17; сам dotenv не проверялся) и на
`vite-plugin-svelte` без `svelte.config.js` (три строки до JSON,
`data/cli/svelte-json-stdout.txt`). Обещание «stdout holds only the report, pure
JSON with --json» (JSDoc `cli/run-mutation.ts:22-25`, «Progress goes to
stderr» в `docs/content/guide/cli.mdx:125`) нарушается.

### BUG-510: проба Node в node:test падает со стеком

`readNodeRuntime` (`adapters/node-test/read-node-runtime.ts:18-33`) запускает
`node -p PROBE` с окружением mootant и делает `JSON.parse(stdout)` прямо в
колбэке `execFile` (`:24`). Если `NODE_OPTIONS` подгружает модуль, печатающий
в stdout, разбор бросает исключение вне промиса: процесс падает с
`SyntaxError` и стеком (код 1), промис не завершается
(`test/repros/BUG-510.test.ts`: таймаут теста + unhandled error).

### BUG-511 (гипотеза): node:test на Windows не может остановить процесс

`stopProcessGroup` (`adapters/node-test/stop-process-group.ts:9-17`) сначала
шлёт `process.kill(-pid, 'SIGKILL')`; при `ESRCH` ничего не делает. На Windows
у libuv `uv_kill` (`src/win/process.c`) открывает процесс через `OpenProcess`
по PID; для отрицательного PID (огромный `DWORD`) это `ERROR_INVALID_PARAMETER`,
который libuv переводит в `UV_ESRCH`. Тогда ни сторож (`run-test-process.ts:133-139`),
ни остановка при сигнале не убивают процесс, и зависший мутант вешает прогон.
Единственный тест ветки «где группы нельзя сигналить» подставляет `EINVAL`
(`test/adapters/node-test/stop-process-group.test.ts:36-48`). Та же гипотеза
записана в `analysis/07-compat-and-release.md`. Проверка: на Windows вызвать
`process.kill(-process.pid, 'SIGKILL')` и посмотреть `code`; прогнать
`nt-hang`. Исправление: на `win32` сразу `process.kill(pid)` (или
`taskkill /T /F /PID`, чтобы убить и потомков).

## Документация ↔ поведение

| Утверждение (где) | Поведение | Вердикт / где править |
| --- | --- | --- |
| «TypeScript files need Node.js 22.18 or later, … or jiti» (`configuration.mdx:121-122`, `compatibility.mdx:26-28`) | ещё нужен ESM-тип пакета (или `.mts`), не-стираемый TS не грузится, `.cts` с `require('mootant')` падает на Node 22 | код (BUG-500, BUG-501), до исправления — доку |
| `.cjs` — «List and run mutants» (`compatibility.mdx:34`) | под Vitest модули из `require()` не переключаются | код (BUG-507), доку — до исправления |
| «Tests that load a mutated file only through a computed import() may not be selected» (`compatibility.mdx:56-57`) | то же для `require()`/`createRequire` | доку (и BUG-507) |
| Монорепо и `test.projects` — не упомянуты | проекты со своим `root` не работают | код (BUG-508) |
| «Progress goes to stderr» (`cli.mdx:125`), JSDoc «pure JSON» | stdout засоряется чужим выводом | код (BUG-509) |
| «A run that stops early … prints its error to stderr and no JSON» (`cli.mdx:125-126`) | так и есть: stdout пуст, код 1, текст в stderr | верно; для агентов неудобно (см. «Отсутствующие гарантии») |
| «--no-color … NO_COLOR=1 does the same; --color turns colors on unless NO_COLOR is set» (`cli.mdx:100`) | верно; не описано, что `CI` и `FORCE_COLOR` (в т. ч. `=0`) включают цвета даже в файле | доку или код (BUG-514) |
| «--concurrency … Defaults to Vitest's maxWorkers, or CPU cores minus one for node:test» (`cli.mdx:45`, `configuration.mdx:317,339-341`) | `start-vitest-session.ts:96,182`, `start-node-test-session.ts:195`, `run-mutants.ts:461-464` | верно |
| «--fast … changes nothing with node:test» (`cli.mdx:49`, `compatibility.mdx:68`) | печатается заметка, вердикты те же (`nt-basic`), в команде перепроверки остаётся `--fast` | верно |
| «--no-cache … saves no new ones» (`cli.mdx:47`) | после прогонов с `--no-cache` каталога кэша нет | верно |
| Порог, score, covered score, код выхода (`cli.mdx:59-68`) | 3/9 = 33,33%, covered 3/8 = 37,5%; ниже порога, Error-мутанты и error-диагностики → 1; без мутантов любой порог проходит | верно |
| «In a terminal … five files with the lowest scores… Piped output and JSON leave this list out» (`cli.mdx:35-37`) | под pty есть блок «files 1 below 100%», в пайпе нет | верно |
| `--html` → `.mootant/report.html`, путь в stderr; `--mutant` без `--html` не пишет отчёт; ошибка записи → код 1 (`cli.mdx:50,55-57`, `report.mdx`) | всё так; при `--json` stdout остаётся валидным | верно |
| Пулы `forks`/`threads`, предупреждение об `isolate`, ошибка для прочих пулов (`compatibility.mdx:45-54`) | `threads`, `isolate: false` → `config-overridden`; `vmThreads`, `vmForks` → ошибка | верно (кроме проектов со своим `root`, BUG-508) |
| Обнаружение node:test, ничья → Vitest с заметкой (`compatibility.mdx:63-67`) | `score-node-test.ts`, `resolve-adapter.ts:53-60` | верно (по коду) |
| tsx с `.ts` без `"type": "module"` → ошибка (`compatibility.mdx:70-72`) | понятная ошибка; tsx + `type: module` работает на 20.19 и 22.23 | верно |
| Node `^20.19.0 \|\| >=22.12.0`, «Node.js 20 works only with node:test» (`compatibility.mdx:22-24`) | node:test: 20.18/22.11 — понятная ошибка; 20.19, 22.12, 22.23, 24, 26 — одинаковые вердикты (`data/cli/node-matrix-nt.txt`); Vitest 5.0.5 фактически запускается и на Node 20.18 | верно (ограничение — от Vitest) |
| Astro: list — frontmatter и `<script>`, run пропускает с предупреждением (`compatibility.mdx:103-107`) | так и есть (`unsupported-file`) | верно |
| Vue/Svelte: шаблоны мутируются, нужен Vite-плагин (`compatibility.mdx:82-101`) | вердикты совпали с физическим применением: Vue 11/11, Svelte 13/13 | верно |
| «Paths in the configuration are relative to the root … ids … stay the same wherever in the project you run Mootant» (`configuration.mdx:124-130`) | с конфигом в корне `list src` из корня и `list .` из `src/` дают те же id и пути | верно |
| Пример JSON-конфига (`configuration.mdx:112-119`) в `.mootantrc` и `.mootantrc.json` | работает (strict, 11 мутантов) | верно |
| `timeout`: «factor × duration + constant» (`configuration.mdx:429-434`) | плюс подтверждение таймаута с удвоенным лимитом (`core/run/get-try-limits.ts:22-26`, `scale`) | неполно, доку |
| «Snapshots are never written» (`cli.mdx:37-38`) | `configure-project.ts:51-53`, `filter-exec-argv.ts` (`--test-update-snapshots` с предупреждением) | верно (по коду) |
| Kill-примеры 20 страниц мутаторов (`docs/content/mutators/*.md`) | 21/21 заявленных мутантов «`a` → `b`» генерируются (recommended), `data/cli/mutator-kill-examples.json` | верно |
| Таблицы «Changes» мутаторов | 90/126 строк совпадают в изоляции; остальные 36 зависят от контекста (типы операндов, позиция `return`, несколько мутантов в ячейке), оговорённого в тексте рядом; противоречий при ручном разборе нет (`data/cli/mutator-docs-check.json`) | верно |
| JSDoc `core/cache/get-cache-path.ts:10-11` «run-v2.json» | файл — `run-v3.json` (`CACHE_VERSION = 3`) | устаревший комментарий |

## Отрицательные результаты (проверено, работает)

- Разбор аргументов (`cli/parse-arguments.ts`): неизвестные флаги и короткие
  опции, отсутствующее значение, `--since --json` (неоднозначность),
  `--since ''`, `--threshold 101/abc/''`, `--concurrency 0/1.5`, `--all` без
  `--json`, `--incremental --no-cache`, run-only флаги у `list`, `--skipped` у
  `run`, `--verbose` у `list` без `--json`, `--no-config`/`--no-mutant`
  (неизвестны), повтор `--threshold` (побеждает последний), команда после
  флагов — везде `Error: …` в stderr, пустой stdout, код 1 или корректная
  работа (`data/cli/cli-battery-args.txt`).
- Ошибки окружения: несуществующий путь, пустой каталог, тест-файл как путь
  (предупреждение `test-file-excluded`, код 0), путь с пробелами, неизвестный id
  и слишком короткий префикс `--mutant`, `--since` вне git, нет конфига по
  `--config`, неизвестный пресет, файл с синтаксической ошибкой (`list` и `run`
  → код 1, диагностика `parse-error` в JSON) — понятные сообщения
  (`data/cli/cli-battery-run.txt`).
- Падающие без мутантов тесты (Vitest и node:test): код 1, без JSON, причина
  и вывод тестов в stderr.
- Зависания с рабочим `ps`: синхронный цикл в теле теста, цикл на микрозадачах
  (`await Promise.resolve()`), цикл в `afterAll`/`after` — вердикт Timeout за
  4–10 с в обоих раннерах (`data/cli/hang-variants.txt`); бесконечный рост
  массива при `--max-old-space-size=256` — Timeout (cause `hang`)
  (`data/cli/memory.txt`).
- node:test убивает всю группу тестового процесса после его выхода и при
  SIGINT/SIGTERM; обычный дочерний процесс теста не переживает прогон
  (`data/cli/child-processes.txt`).
- Вердикты одинаковы на Node 20.19 / 22.12 / 22.23 / 24.22 / 26.13 для
  node:test (ESM, CJS) и на 22.12 / 22.23 / 24 / 26 для Vitest (ESM, `.cjs`,
  `type: commonjs`, алиасы `resolve.alias` и `tsconfigPaths`)
  (`data/cli/node-matrix-*.txt`). Путь асинхронных хуков `register()` (Node 20,
  22.12) и синхронных `registerHooks` дал одинаковые вердикты.
- CJS под node:test (`require` в тестах и исходниках) — верно.
- `.cjs`-конфиг с `require('mootant')`, `.mts` в CJS-пакете, ESM-конфиг с
  `createRequire` — грузятся.
- Кэш при прерывании не портится (атомарная запись), `--no-cache` не пишет кэш.
- `npm i -D vitest@5.0.5` в npm 10/11 падает с «Cannot read properties of null
  (reading 'edgesOut')» и без mootant — это баг npm/arborist, не mootant
  (фикстуры ставились с `--legacy-peer-deps` и явным `vite`).

## Отсутствующие гарантии

1. **Нет общего обработчика прерывания.** Ни для одного раннера нет единой
   точки, которая на SIGINT/SIGTERM/SIGHUP останавливает все процессы сессии,
   удаляет рабочий каталог и выходит с 130/143/129. Сейчас поведение зависит от
   того, есть ли TTY (спиннер) и какой раннер (BUG-503–505).
2. **Нет защиты от смерти родителя.** При SIGKILL или OOM-killer'е mootant все
   воркеры Vitest и тестовые процессы node:test становятся сиротами; зависшие
   крутятся вечно. Нужен сторож в дочернем процессе (например, проверка
   `process.ppid` по таймеру — не спасает синхронный цикл) или внешний
   «надзиратель»; хотя бы уборка устаревших `mootant-*` из TMPDIR при старте.
3. **Процессы, запущенные тестами, не убираются под Vitest.** Каждый
   мутант-прогон, который запускает сервер (`spawn`), оставляет его; Vitest без
   mootant ведёт себя так же, но mootant умножает утечку на число мутантов.
   В node:test группа убирается, а `detached`-потомки остаются — в
   пользовательской документации это не сказано.
4. **Зависимость от внешней утилиты `ps` не задокументирована** (BUG-502).
5. **JSON-контракт ошибок.** При ошибке stdout пуст, причина — только текстом
   в stderr, код 1 у всех неуспехов (ниже порога, падающие тесты, ошибка
   конфига, неверный флаг). Агенту приходится разбирать английский текст.
   Предложение: при `--json` печатать `{"schemaVersion":3,"error":{"code":…,
   "message":…}}` и/или различать коды выхода (2 — ошибка использования,
   3 — тесты падают без мутантов).
6. **Чистота stdout не обеспечена** (BUG-509): при `--json` стоит
   перенаправлять `console.*`/`process.stdout.write` процесса mootant в stderr
   на время прогона или поддержать запись отчёта в файл.
7. **CLI не проверяет версию Node** (BUG-515); node:test проверяет свою.
8. **CI проекта — только Ubuntu, одна версия Node** (`.github/workflows/test.yml`):
   Windows/macOS и Node 20/24/26 не проверяются, отсюда гипотезы BUG-511–513.
9. **Команды перепроверки** (`re-check one:`, `recheck` в JSON) начинаются с
   `mootant`, а не `npx mootant` (`cli/report/format-command.ts:77`): при
   локальной установке бинаря нет в `PATH`, команду нельзя скопировать как есть
   (документация везде пишет `npx mootant`).

## Что не удалось проверить

- Windows и macOS (нет машин): BUG-511–513 — по коду и функциям из dist.
- BusyBox `ps` (Alpine): скачивание и запуск внешнего бинаря отклонены
  политикой окружения; вывод по исходникам BusyBox.
- yarn PnP, bun как runtime, pnpm-симлинки — матрицу менеджеров пакетов ведёт
  агент раздела 7 (`/home/user/projects/release/vt-*`), здесь не дублировалось.
- Время прогонов на перегруженной машине (load average до 27) не
  использовалось как метрика; выводы о сигналах и зависаниях качественные и
  устойчивы к нагрузке (повторены 2–3 раза в разных режимах).
