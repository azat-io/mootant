# Раздел 2 (часть): процессы и ресурсы, окружения, CLI, документация ↔ поведение

> Черновик, заполняется по ходу работы (коммит 170ec52, 2026-11-04).
> Диапазон ID: BUG-500…BUG-599. Фикстуры: `/home/user/projects/cli/*`
> (создаются скриптами из `analysis/tools/cli/`), сырые данные —
> `analysis/data/cli/`. Пакет: `mootant-0.1.0-170ec52.tgz`, Vitest 5.0.5,
> Vite 8.3.5. Node 22.23.4 (основной), 20.19.0, 22.12.0, 24.22.2, 26.13.0.
> Linux x64, 4 vCPU, процесс от root, `TERM=linux`.

## Находки (по ходу работы)

- BUG-500 (medium, подтверждён): `mootant.config.ts` из документации не грузится
  в пакете с `"type": "commonjs"` на Node ≥ 22.18 (и на 24, 26), даже если стоит
  jiti; на Node 22.12 с jiti тот же проект работает.
- BUG-501 (low, подтверждён): `.cts`-конфиг с `require('mootant')` падает на
  Node 22.23.4 (`request for './instrument/resolve-switched-text.js' is from a
  module not been linked`) — баг Node 22, обходится загрузкой `.cts` через
  `require`.

### Черновые заметки по CLI (battery: `tools/cli/cli-battery.sh`, данные `data/cli/cli-battery-*.txt`)

- Разбор аргументов (`cli/parse-arguments.ts`) устойчив: неизвестные флаги,
  отсутствующие значения, `--since --json`, `--threshold 101/abc/''`,
  `--concurrency 0/1.5`, `--all` без `--json`, `--incremental --no-cache`,
  run-only флаги у `list` — всё даёт `Error: …` в stderr, пустой stdout, код 1.
- `--threshold 0x10` и `1e1` принимаются как 16 и 10 (`Number()`), low.
- `list src --no-cache` → «--cache applies to the run command only» (имя без
  `no-`), `run --no-skipped` → ошибка; косметика.
- `--json` при ошибке: stdout пуст, ошибка текстом в stderr (как в доке).
- `CI=true` или `FORCE_COLOR=0` включают ANSI в перенаправленном stdout
  (`cli/terminal/colors.ts:116-127`, правила picocolors).

### Черновые заметки: документация мутаторов

- `tools/cli/check-kill-examples.mjs`: пример из «Kill a surviving mutant»
  каждой из 20 страниц `docs/content/mutators/*.md` даёт заявленный мутант
  (21/21 утверждений «`a` → `b`», пресет recommended). Данные:
  `data/cli/mutator-kill-examples.json`.
- `tools/cli/check-mutator-docs.mjs`: строки таблиц «Changes» в изоляции —
  90/126 совпали; остальные 36 зависят от контекста (типы операндов, позиция
  `return`, несколько мутантов в ячейке), который оговорён в тексте рядом;
  противоречий при ручном разборе не найдено. Данные:
  `data/cli/mutator-docs-check.json`.

### Черновые заметки: окружения

- Node 18.20.8 (вне `engines`): `run` падает со стеком `toSorted is not a
  function` (`cli/create-run-progress.ts`), `--no-cache` → «Unknown option»
  (у `util.parseArgs` Node 18 нет `allowNegative`). Дружелюбной проверки версии
  в CLI нет. low.
- Node 20.18 / 22.11 + node:test: понятная ошибка версии
  (`adapters/node-test/start-node-test-session.ts:73-77`). Vitest 5.0.5 на Node
  20.18 фактически работает (mootant версию Node для Vitest не проверяет).
- Windows-скрипты (логика проверена на Linux вызовом функций из dist,
  `tools/cli/win-script-parse.mjs`): `node --test test\unit\math.test.js` →
  файл `testunitmath.test.js`; `node_modules\.bin\tsx.cmd --test` → null
  (обработка `\` и `.cmd` в `resolve-command.ts:82-85` недостижима после
  POSIX-разбора `parse-command.ts:54-58`); `set NODE_ENV=test&& node --test`
  теряет переменную.
- npm 10/11: `npm i -D vitest@5.0.5` падает внутри npm (`Cannot read
  properties of null (reading 'edgesOut')`) и без mootant — не баг mootant;
  фикстуры ставились с `--legacy-peer-deps` + явный `vite`.

### Черновые заметки: сигналы и процессы (харнесс `tools/cli/signal-test.sh`, данные `data/cli/sig-*.txt`, `e1*.txt`)

Фикстуры `vt-hang-long`/`nt-hang-long`: мутант `9 -> 10` делает шаг цикла 0,
синхронный бесконечный цикл в теле теста; `run.timeout.constant: 30000`, чтобы
зависание длилось ~30 с. Сигнал через 3–4 с (изолированная фаза), `vt-slow`/
`nt-slow` — через 2 с (dry run, тест ждёт 4 с).

| Сценарий | Vitest | node:test |
| --- | --- | --- |
| Ctrl+C: SIGINT группе, TTY | 130, процессов нет, workdir + temp Vite остались | 130, процессов нет, workdir остался |
| SIGINT только pid, без TTY | 130, **зависший воркер-сирота (ppid 1, 100% CPU)** | 130, группа убита, workdir остался |
| SIGTERM только pid, без TTY | 143, **воркер-сирота** | 143, ок, workdir остался |
| SIGTERM pid, TTY, сессию ведёт shell | 143, **воркер-сирота** | 143, ок, workdir остался |
| SIGHUP pid, без TTY | 129, **воркер-сирота** | 129, **тестовый процесс-сирота** |
| SIGQUIT pid, без TTY | — | 131, **тестовый процесс-сирота** |
| SIGTERM pid в dry run | 143, воркер-сирота до конца своего теста | 143, ок |
| нет `ps` в PATH, без сигнала | **прогон висит бесконечно** (75 с до внешнего KILL, воркер 99% CPU; с `ps` — 5,2 с, вердикт Timeout) | не затронут |

Workdir `mootant-XXXXXX` (beat/claim/done/env/out/plan/worker) остаётся при
любом сигнале; у Vitest ещё каталог `<random>/ssr/...` в TMPDIR. Улика
координатора: `/tmp/mootant-4WyyZs` после SIGTERM внешнего лимита.

### Черновые заметки: ещё находки (подтверждены)

- `vt-handle`: `globalSetup` открывает HTTP-сервер и не закрывает. `npx vitest
  --run` печатает «close timed out after 10000ms» и выходит (16,6 с); `mootant
  run src` печатает весь отчёт и **не завершается** (убит `timeout 90`, код 124).
- `vt-require`, `vt-cjs-chain`: под Vitest модуль, загруженный через
  `require()` (из CJS-исходника `a.cjs` или `createRequire` в тесте), не
  переключается: мутанты `b.cjs` — NoCoverage (+ предупреждение
  `never-served`), а физически применённые убиваются тестами (4/5 и 6/7
  расхождений, `data/cli/physical-vt-cjs-chain.json`,
  `physical-vt-require.json`). node:test тот же код обрабатывает верно.
- `mono`: любой проект Vitest (`test.projects`) с `root`, отличным от корня
  mootant (`projects: ['packages/*']`, inline `{ test: { root } }`,
  `extends: true`, конфиги пакетов) → «Tests fail without mutants … fails to
  load: The test runner did not report this file», хотя `npx vitest --run`
  зелёный. Из каталога пакета работает; проекты с общим `root` работают.
- `--json`: stdout не чистый JSON, если что-то в процессе mootant пишет в
  stdout: `vite-plugin-svelte` без `svelte.config.js` («no Svelte config
  found…» и предупреждения компилятора) или `console.log` в
  `vitest.config.js` (как баннер dotenv@17). `JSON.parse` падает.
- Vue/Svelte/алиасы: вердикты совпали с физическим применением мутантов
  (11/11, 13/13, 4/4). Память: мутант, раздувающий массив, при
  `--max-old-space-size=256` получает Timeout (cause `hang`) в обоих раннерах.
- Дочерние процессы теста: Vitest оставляет и detached-, и обычный `sleep`
  (как и `npx vitest --run`), node:test убивает обычный, оставляет detached.
