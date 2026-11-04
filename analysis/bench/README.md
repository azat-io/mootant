# Бенчмарк Mootant против StrykerJS (раздел 4)

Воспроизводимый стенд: скрипты, конфигурации и патчи, из которых стенд
собирается с нуля одной командой. Сами результаты сюда не входят: они пишутся
в `$BENCH_RESULTS` (по умолчанию `/home/user/projects/bench/results`), сводка —
`summarize.mjs`.

> **Статус на 2026-11-04 04:30 UTC:** стенд собран и отлажен смоук-прогонами
> на подмножествах при занятой машине. Цифры в разделе «Оценка длительности» —
> оценки для планирования (один прогон, load average 3–6 от чужих задач), а не
> результаты. Полный план запускает координатор в эксклюзивном окне.

## Быстрый старт

```sh
cd /home/user/mootant
analysis/bench/setup.sh                 # клон, установка, патчи, проверка тест-сьютов (~10 мин)
analysis/bench/run.sh --dry             # что будет запущено и в каком порядке
analysis/bench/run.sh --tier 1          # главное сравнение; затем --tier 2, 3 ...
analysis/bench/run.sh                   # весь план; прерванный план продолжится с места остановки
node analysis/bench/summarize.mjs > analysis/bench/results.md
analysis/bench/profile.sh cheerio       # CPU-профили и разбивка по фазам (не в режиме замера)
```

Предпосылки: Node 22.23.4, `export PATH=/home/user/tools/bin:$PATH` (pnpm 12;
системный pnpm 10 не читает lockfile-ы этих проектов), hyperfine 1.18,
`/usr/bin/time`, доступ к GitHub и npm. Tarball Mootant:
`/home/user/artifacts/mootant-0.1.0-170ec52.tgz` (`MOOTANT_TGZ`), версия
Stryker — `STRYKER_VERSION=10.1.1`. Все пути переопределяются переменными
окружения (`lib/env.sh`).

## Состав

| файл | что делает |
|---|---|
| `setup.sh [--force] [--no-verify] [project...]` | клон в `$BENCH_PROJECTS/<name>` на зафиксированный SHA, установка зависимостей по lockfile, установка tarball Mootant и Stryker как devDependencies, коммит всего этого в локальную ветку `bench/base`, синтетический коммит `edit.patch` в ветку `bench/since`, проверочный прогон тест-сьюта, версии в `$BENCH_RESULTS/setup/<name>.txt` |
| `projects/<name>/project.sh` | репозиторий, SHA, менеджер пакетов, раннер, `MUTATE` (пути `mootant run` = `mutate` Stryker), команда тест-сьюта, функции `install_deps` и `add_tools` |
| `projects/<name>/stryker.json` | шаблон конфига Stryker (раннер и его опции); итоговые `stryker.bench.json` и `stryker.bench.tsc.json` пишет `lib/make-stryker-config.mjs` из шаблона и `MUTATE` перед каждым прогоном |
| `projects/<name>/stryker.command.json` | (fast-json-stringify) вариант с command runner |
| `projects/<name>/edit.patch` | небольшая правка одного мутируемого исходника, не меняющая поведение (переименование локальной переменной и т.п.): для `--incremental` — в рабочем дереве, для `--since` — закоммичена в `bench/since` |
| `prepare/state.sh <project> <state>` | состояние перед прогоном (`--prepare` hyperfine): `clean`, `warm`, `edit`, `since`, `stryker-inc-edit`, `snapshot`, `restore` |
| `run.sh` | точки замера по плану, hyperfine с `--prepare`/`--setup`/`--cleanup`; каждый прогон — через `lib/measure-one.sh` |
| `lib/measure-one.sh` | один прогон: GNU time, JSON-отчёт, stdout/stderr, сэмплер памяти, трассировщик юнитов; файлы `run-k.*` |
| `lib/memtree.mjs` | сумма RSS (каждые 0,5 с) и PSS (каждую 1 с) всего дерева процессов, число процессов во времени |
| `lib/trace-units.mjs` | пассивная трасса рабочего каталога Mootant (`$TMPDIR/mootant-*`): claim/start/done каждого юнита каждого запуска раннера |
| `lib/units-report.mjs` | по трассе: занятость слотов, ожидание очереди тест-файла, хвост, самая длинная последовательная цепочка, загрузка против тестов на юнит |
| `summarize.mjs [dir]` | таблицы Markdown из всего сохранённого |
| `profile.sh <project> [list main workers vitest]` | CPU-профили главного процесса, всех процессов (воркеры Vitest, процессы node:test), `mootant list` (текст и JSON) и разбивка самого Vitest |
| `lib/cpuprofile-top.mjs` | топ функций по self time, агрегация по пакетам/модулям (группы `mootant/core/hints` и т.д.), инклюзивное время выбранных функций |
| `baseline-tests.sh` | (не часть стенда) базовая линия тестов самого Mootant, этап 0 |

## Проекты

Критерии: живые TS/JS-библиотеки с хорошими зелёными тестами и разумным
временем тест-сьюта, разный размер, Vitest 5 (Mootant поддерживает только его;
у всех трёх Vitest-проектов он уже в lockfile — обновлять не пришлось), для
node:test — проект, где `node --test` — штатный раннер.

| проект | раннер | размер | SHA (дата) | `MUTATE` | тест-сьют |
|---|---|---|---|---|---|
| [pillarjs/path-to-regexp](https://github.com/pillarjs/path-to-regexp) | Vitest 5.0.5 | маленький: `src/index.ts` 696 строк, 3 spec-файла (~3,2 тыс. строк, таблица кейсов) | `32292b9d13239c7fa3ed23e89c59c10264f9fe20` (2026-10-22) | TBD | TBD |
| [cheeriojs/cheerio](https://github.com/cheeriojs/cheerio) | Vitest 5 | средний: ~5 тыс. строк `src`, 22 spec-файла (~8 тыс. строк) | `40d4365fc025ebc053e6c886c1dac3cf29a4bc61` (2026-11-04) | TBD | TBD |
| [azat-io/eslint-plugin-perfectionist](https://github.com/azat-io/eslint-plugin-perfectionist) | Vitest 5.0.5 | большой: `rules` 4 тыс. + `utils` 7,7 тыс. строк, 24 тест-файла правил на RuleTester (170 тыс. строк) | `486c3c85239e78a24aba2ade212cdef6acba1829` (2026-11-04) | TBD | TBD |
| [fastify/fast-json-stringify](https://github.com/fastify/fast-json-stringify) | `node --test` | средний: CJS, `index.js` 1,8 тыс. + `lib` 1,5 тыс. строк, 60 тест-файлов | `ac1723c7073ab4e0ceca074ad214af742fa439fa` (2026-11-01) | TBD | TBD |

Запасные (склонированы, не настроены): fb55/htmlparser2 `dcafeac3` (Vitest 5),
squirrelchat/smol-toml `bba6a4bb` (Vitest 5).

## Честность сравнения со Stryker

- **Одни и те же файлы.** `mutate` Stryker генерируется из `MUTATE` того же
  `project.sh`, что передаётся `mootant run` (каталоги разворачиваются в
  исходники без тестов и `.d.ts`).
- **Одинаковая конкурентность**: `--concurrency 3` у Mootant (это `maxWorkers`
  Vitest — число одновременных тест-файлов) и `"concurrency": 3` у Stryker (три
  процесса test runner, у каждого свой Vitest с `maxWorkers: 1`). Четвёртое ядро
  остаётся главному процессу.
- **Stryker в лучшей «честной» конфигурации**: `coverageAnalysis: "perTest"`
  (мутант гоняет только покрывающие его тесты), `incremental: false` в холодных
  прогонах, без `typescript-checker` в основной точке (с ним — `s-tsc`),
  остальные опции по умолчанию (`vitest.related: true`, `vitest.pool: "threads"`
  — пул по умолчанию у vitest-runner 10.1.1, `ignoreStatic: false`,
  `timeoutMS: 5000`, `timeoutFactor: 1.5`, песочница `.stryker-tmp` с копией
  проекта). Mootant — по умолчанию (`recommended`, пул форков и `isolate: true`
  он ставит сам: `adapters/vitest/configure-project.ts:46-48`).
- **Vitest 5 у Stryker**: `@stryker-mutator/vitest-runner@10.1.1` объявляет
  `peerDependencies.vitest: ">=2.0.0"` и в коде различает Vitest ≥ 5
  (разделитель имён тестов, `isGreaterThanVitest4Point1`), т.е. поддержка
  нативная, обходной путь не нужен (подтверждено смоук-прогоном, см. ниже).
- **node:test**: нативного раннера у Stryker нет. Основная точка — `tap-runner`
  (каждый тест-файл — отдельный процесс `node <file>`, вывод TAP; покрытие
  perTest на уровне тест-файла, `forceBail`), дополнительная — `command` runner
  (`node --test` целиком на каждого мутанта, `coverageAnalysis: "off"`) —
  нижняя граница возможностей Stryker. Ограничение: гранулярность Stryker здесь
  — тест-файл (как у юнитов Mootant), а не тест.
- **Отчёты**: оба пишут полный JSON (Mootant `--json --all --verbose`, Stryker
  `reporters: ["json"]`); их время входит в замер. Отчёты каждого прогона
  сохраняются (`run-k.json`) — они нужны разделу 3 для сравнения наборов
  мутантов.
- **Чего не выровнять**: наборы мутантов разные (поэтому есть время на
  мутанта и на полезного мутанта); у Stryker песочница — копия проекта, у
  Mootant — подмена текста модулей плагином Vite; у Stryker пул `threads`, у
  Mootant — форки (выбор каждого инструмента, а не настройка стенда).

## Точки замера

`run.sh` знает точки по именам (`define_point`); `<project>:<point>`:

| точка | инструмент | состояние перед прогоном | команда |
|---|---|---|---|
| `test` | — | `clean` | обычный тест-сьют (`vitest run` / `node --test`), 5 прогонов, `--setup` прогревает кэш страниц |
| `m-cold` | Mootant | `clean` (нет `node_modules/.cache/mootant`) | `mootant run $MUTATE --concurrency 3 --json --all --verbose` — обычный режим, холодный кэш; после точки кэш сохраняется как снимок |
| `m-warm` | Mootant | `warm` (снимок кэша полного прогона на `bench/base`) | то же — повтор без изменений |
| `m-fast` | Mootant | `clean` | то же `--fast` |
| `m-nocache` | Mootant | `clean` | то же `--no-cache` (без чтения и записи кэша) |
| `m-edit` | Mootant | `edit` (снимок кэша + `edit.patch` в рабочем дереве) | то же — обычный кэш после правки |
| `m-edit-inc` | Mootant | `edit` | то же `--incremental` |
| `m-since` | Mootant | `since` (ветка `bench/since`, без кэша) | то же `--since bench/base` |
| `m-list-text`, `m-list-json` | Mootant | `clean` | `mootant list $MUTATE` и `... --json` (5 прогонов) |
| `s-cold` | Stryker | `clean` (нет `.stryker-tmp`, отчётов, incremental-файла) | `stryker run stryker.bench.json` |
| `s-tsc` | Stryker | `clean` | `stryker run stryker.bench.tsc.json` (+ typescript-checker) |
| `s-edit-inc` | Stryker | `stryker-inc-edit` (incremental-файл полного прогона на `bench/base` + `edit.patch`) | `stryker run stryker.bench.json --incremental --incrementalFile reports/bench-incremental.json` |
| `s-command` | Stryker | `clean` | command runner (`node --test` целиком) |

Снимки для `warm`/`edit` (`$BENCH_RESULTS/snapshots/<project>/`) берутся в
конце точки `m-cold`; если их нет, `state.sh` делает один незамеряемый
прогон-«праймер». Снимок incremental-файла Stryker — так же, отдельным
незамеряемым прогоном.

## Метрики

Для каждой точки (`summarize.mjs`):

- **wall** — время hyperfine каждого прогона: медиана, min–max, σ.
- **CPU** — user + sys из GNU time; включает всех дочерних, кого дождались
  (воркеры Vitest, процессы node:test, test runner-ы Stryker).
- **Память**: `RSS max проц.` — `%M` GNU time, это пик *одного самого большого
  процесса* дерева, дочерние не суммируются; `PSS дерева` — пик суммы PSS всех
  процессов дерева по `/proc/<pid>/smaps_rollup` раз в секунду
  (`lib/memtree.mjs`; разделяемые страницы делятся между процессами, поэтому
  сумма не завышена бинарником node в каждом воркере).
- **Мутанты**: всего; с вердиктом = всего − Ignored; **запущено** = Killed +
  Survived + Timeout + Error − взятые из кэша (у Stryker Error = RuntimeError +
  CompileError); по статусам.
- **Полезный мутант** = Survived + NoCoverage — то, что пользователь будет
  чинить (дописывать тест). Killed/Timeout/Error/Ignored считаются отдельно.
- **с/мутант** = медиана wall / мутантов с вердиктом; **с/запущенный** = медиана
  wall / запущенных; **с/полезный** = медиана wall / полезных.
- **Фазы Mootant** — `summary.duration` (startup, dryRun, batch, isolated,
  total; что в каждой — `analysis/04-performance.md`, 4.1), «вне total» = wall −
  total, доля dry run = dryRun / total; число запусков раннера по видам
  (`summary.runs`), число юнитов и средняя стоимость юнита вместе со стартом
  процесса (`summary.staticCost`), старт процесса на юнит = (Σ
  staticCost.duration − Σ mutants.duration) / юнитов.
- **Фазы Stryker** — поле `performance` отчёта (setup — песочница и
  инструментирование, initialRun — dry run, mutation) и «вне фаз».
- **Загрузка воркеров** (Mootant + Vitest, по трассе): занятость слотов =
  Σ(done − start) / (3 · wall раундов); ожидание очереди тест-файла =
  Σ(start − claim) / (3 · wall) — время, когда воркер уже занял слот, но ждёт,
  пока закончится юнит того же файла (`adapters/vitest/worker/wait-for-turn.ts`);
  хвост = доля wall раундов после последнего момента, когда работали все 3
  слота; самая длинная цепочка юнитов одного тест-файла (нижняя граница длины
  раунда); на юнит: загрузка (`loadDuration`: импорт теста и его зависимостей с
  трансформациями) и тесты (Σ `tries[].duration`); для dry run — доля загрузки
  в суммарном времени тест-файлов.
- **Одинаковые счётчики** — совпадают ли счётчики статусов во всех прогонах
  точки (недетерминизм вердиктов — сигнал бага, не шум).

Что сознательно не входит: время установки, прогрев кэша страниц, сборка
Mootant.

## План и оценка длительности

TBD (после смоук-прогонов).

## Профилирование

TBD (после смоук-прогонов).

## Известные ограничения стенда

TBD.
