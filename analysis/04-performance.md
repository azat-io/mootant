# 4. Производительность (черновик: методика, стенд, план, гипотезы)

> Статус: **стенд и скрипты готовы и отлажены на смоук-прогонах, замеры ещё не
> проводились.** Все цифры ниже с пометкой «смоук» получены на занятой машине
> (load average 3–6 от других агентов), одним прогоном, на подмножествах — это
> оценки длительности для плана, а не результаты бенчмарка. Результаты появятся
> после запуска `analysis/bench/run.sh` в эксклюзивном окне.

Исследуемый коммит Mootant: `170ec52` (пакет
`/home/user/artifacts/mootant-0.1.0-170ec52.tgz`). Стенд: `analysis/bench/`
(README там же — подробная методика и команды).

## 4.1. Методика

Кратко (подробно — `analysis/bench/README.md`):

- **Машина**: 4 vCPU Intel Xeon 2.1 GHz, 15 GB RAM, без swap, ext4; Node
  v22.23.4, npm 10.9.9, pnpm 12.16.1, hyperfine 1.18.0, GNU time.
- **Инструменты**: Mootant `170ec52` (devDependency проекта из tarball, как
  требует `adapters/vitest/check-vitest-copy.ts:16-26`) и StrykerJS 10.1.1
  (`@stryker-mutator/core`, `vitest-runner`, `tap-runner`,
  `typescript-checker`).
- **Честность сравнения**: одинаковые файлы (конфиг Stryker генерируется из того
  же списка путей, что получает `mootant run`:
  `analysis/bench/lib/make-stryker-config.mjs`), одинаковая конкурентность
  (`--concurrency 3` / `"concurrency": 3`), Stryker с
  `coverageAnalysis: "perTest"`, `incremental: false`, без checker в основном
  сравнении (с `typescript-checker` — отдельная точка `s-tsc`), оба пишут полный
  JSON-отчёт (`mootant run --json --all --verbose`, Stryker `reporters: ["json"]`).
  Остальные настройки — по умолчанию у обоих (в том числе таймауты:
  Mootant `factor 3 × duration + 250 мс`, Stryker `timeoutFactor 1.5 ×
  + timeoutMS 5000`; у Stryker `ignoreStatic: false` и песочница с копией
  проекта, у Mootant — подмена текста модулей через Vite-плагин без копии).
- **Повторы**: hyperfine, ≥ 3 прогона на точку (тест-сьюты и `list` — 5), перед
  каждым прогоном `--prepare` приводит проект в известное состояние
  (`analysis/bench/prepare/state.sh`). Кэш страниц ОС не сбрасывается («холодный»
  относится только к кэшу Mootant и песочнице Stryker); первой точкой каждого
  проекта идёт обычный тест-сьют, который заодно прогревает кэш страниц.
- **Метрики** (определения — README стенда, «Метрики»): wall (медиана, min–max,
  σ), CPU (user+sys всего дерева процессов из GNU time), пиковая память двумя
  способами (`%M` GNU time — пик самого большого процесса, а не дерева; сумма
  PSS дерева процессов по `/proc` раз в секунду — `lib/memtree.mjs`), число
  мутантов по статусам, время на мутанта с вердиктом, на запущенного мутанта и
  на «полезного» (Survived + NoCoverage), фазы (Mootant: `summary.duration`
  startup/dryRun/batch/isolated/total, `cli/report/build-run-report.ts:143-150`,
  `core/run-mutants.ts:533-540`; Stryker: поле `performance` отчёта —
  setup/initialRun/mutation), загрузка воркеров по трассе рабочего каталога
  (`lib/trace-units.mjs`, `lib/units-report.mjs`).

### Что именно меряют фазы Mootant (по коду)

`core/run-mutants.ts:533-540`:

| поле | интервал | что внутри |
|---|---|---|
| `startup` | `started` (`:171`) → `dryStarted` (`:410`) | загрузка конфига, поиск файлов, парсинг, генерация мутантов, эвристики (`listFileMutants`, `:192`), чтение изменённых строк git (`--since`), выбор адаптера, **запуск Vitest** (`adapter.start`, `:275`), список тест-файлов, инструментирование (`createSwitchedFiles`, `:390`) |
| `dryRun` | `dryStarted` → `batchStarted` (`:491`) | dry run (`runDryPhase`, `:411`), разбор (`readDryRun`), **подготовка кэша** (`prepareRunCache`, `:442-459`: хэши входов), `createRunState`, `readTestImports`, применение кэша (`reuseCachedVerdicts`, `:489`) |
| `batch` | `batchStarted` → `isolatedStarted` | только в `--fast` |
| `isolated` | `isolatedStarted` → `finished` (`:531`) | раунды isolated, **сохранение кэша** (`saveRunCache`, `:516`) |
| `total` | `started` → `finished` | не включает закрытие Vitest (`session.close`, `:321`), удаление рабочего каталога (`:324`), построение и печать отчёта (`cli/run-mutation.ts:59-72`), запуск самого node и загрузку модулей CLI |

Поэтому в сводке есть колонка «вне total» = wall − total. Поиск файлов,
парсинг, генерация, эвристики и инструментирование внутри `startup` отдельных
полей не имеют; их делит CPU-профиль главного процесса (`analysis/bench/profile.sh
<project> list main`: инклюзивное время `expandPaths`, `prepareFilePrograms`
(парсинг oxc), `collectFileCandidates` (мутаторы и эвристики),
`deduplicateCandidates`, `getMutantRegions`, `createSwitchedFiles`,
`startVitestSession`; self-время по группам `mootant/core/hints`,
`mootant/core/skips`, `oxc-parser` и т.д.).

### Что видно о стоимости юнита (по коду)

Юнит isolated = (мутант, тест-файл) в свежем форк-процессе: Mootant
принудительно ставит `isolate: true` и свой пул форков
(`adapters/vitest/configure-project.ts:46-48`), отключает кэш трансформаций на
диске (`:54`, `adapters/vitest/start-vitest-session.ts:104`). В записях воркера
есть всё для разбивки (`adapters/vitest/runner.ts:922-938`):

- `startup` юнита = `booted − spawned`: от `fork` до `onBeforeCollect` — старт
  node, инициализация воркера Vitest и окружения
  (`adapters/vitest/build-isolated-facts.ts:48`, время spawn пишет пул:
  `adapters/vitest/create-forks-pool.ts:63-69`); в отчёт попадает только в сумме
  `summary.staticCost[].duration` (`core/run/compute-static-cost.ts:32`,
  `core/run/apply-isolated-result.ts:67`), а `mutants[].duration` — без него
  (`:66`), так что Σ startup = Σ staticCost.duration − Σ mutants.duration;
- ожидание очереди = от `claim` до открытия out-файла: юнит ждёт, пока процесс
  предыдущего юнита того же тест-файла не завершится
  (`adapters/vitest/worker/wait-for-turn.ts`, опрос раз в 20 мс;
  `adapters/vitest/runner.ts:534-541`);
- `loadDuration` = сбор тест-файла (импорт теста и всего, что он тянет, вместе с
  запросами трансформаций к Vite главного процесса; `runner.ts:585`);
- время тестов = сумма `tries[].duration`; остальное в `duration` — хуки и
  teardown.

Скрипт `lib/units-report.mjs` собирает эти величины по трассе и даёт по
каждому раунду занятость слотов, долю ожидания очереди файла, хвост и самую
длинную последовательную цепочку одного тест-файла.

## 4.2. Проекты

| проект | раннер | размер | SHA | что мутируем | тест-сьют (смоук) | мутантов Mootant / Stryker (смоук) |
|---|---|---|---|---|---|---|
| pillarjs/path-to-regexp | Vitest 5 | маленький: 1 модуль 700 строк, ~1000 табличных кейсов | `32292b9d` | TBD | TBD | TBD |
| cheeriojs/cheerio | Vitest 5 | средний: ~5 тыс. строк, 22 spec-файла | `40d4365f` | TBD | TBD | TBD |
| azat-io/eslint-plugin-perfectionist | Vitest 5 | большой: 12 тыс. строк, 170 тыс. строк тестов RuleTester | `486c3c85` | TBD | TBD | TBD |
| fastify/fast-json-stringify | `node --test` | средний: 3,4 тыс. строк CJS, 60 тест-файлов | `ac1723c7` | TBD | TBD | TBD |

## 4.3. План замеров

TBD после смоук-прогонов (оценки длительности по точкам).

## 4.4. Гипотезы и идеи ускорений (первичная оценка по коду)

TBD

## 4.5. Результаты

Будут добавлены после замеров.
