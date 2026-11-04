# Бенчмарк Mootant против StrykerJS (раздел 4)

Воспроизводимый стенд: скрипты, конфигурации и патчи, из которых стенд
собирается с нуля одной командой. Сами результаты сюда не входят: они пишутся
в `$BENCH_RESULTS` (по умолчанию `/home/user/projects/bench/results`), сводка —
`summarize.mjs`.

> **Статус на 2026-11-04, 13:45 UTC.** Окно замеров закрыто в 13:43 UTC.
> Данные лежат в `/home/user/projects/bench/results`, прототипы — в
> `/home/user/projects/bench/results-proto`:
>
> - ярусы 1–3 сняты полностью, ярусы 4–6 в окно не вошли;
> - прототип P1 — на четырёх проектах, P3 — на cheerio и fast-json-stringify;
> - CPU-профили — perfectionist и path-to-regexp.
>
> Результаты и их разбор — в `analysis/04-performance.md`, 4.5–4.6. Цифры
> смоука (`smoke/*.md`) годятся только для отладки стенда.

## Быстрый старт

```sh
cd /home/user/mootant
analysis/bench/setup.sh                 # клон, установка, патчи, проверка тест-сьютов (~10 мин)
analysis/bench/run.sh --dry             # что будет запущено и в каком порядке
analysis/bench/run.sh --tier 1          # главное сравнение; затем --tier 2, 3 ...
analysis/bench/run.sh                   # весь план; прерванный план продолжится с места остановки
node analysis/bench/summarize.mjs > analysis/bench/results.md
analysis/bench/profile.sh cheerio       # CPU-профили и разбивка по фазам (не в режиме замера)
# сквозная проверка стенда на маленьком подмножестве (~10–20 мин на проект):
BENCH_RESULTS=/home/user/projects/bench/results/smoke-x BENCH_SUBSET=1 BENCH_CONCURRENCY=2 \
  BENCH_RUNS=1 BENCH_TEST_RUNS=1 analysis/bench/run.sh cheerio
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
| `lib/memtree.mjs` | сумма RSS (каждую 1 с) и PSS (каждые 2 с) всего дерева процессов, число процессов во времени |
| `lib/trace-units.mjs` | пассивная трасса рабочего каталога Mootant (`$TMPDIR/mootant-*`): claim/start/done каждого юнита каждого запуска раннера |
| `lib/units-report.mjs` | по трассе: занятость слотов, ожидание очереди тест-файла, хвост, самая длинная последовательная цепочка, загрузка против тестов на юнит |
| `summarize.mjs [dir]` | таблицы Markdown из всего сохранённого |
| `profile.sh <project> [list run vitest]` | CPU-профили главного процесса, всех процессов (воркеры Vitest, процессы node:test), `mootant list` (текст и JSON) и разбивка самого Vitest |
| `lib/cpuprofile-top.mjs` | топ функций по self time, агрегация по пакетам/модулям (группы `mootant/core/hints` и т.д.), инклюзивное время выбранных функций |
| `lib/cpuprofile-categories.mjs <каталог>` | CPU группы профилей (главный процесс или все воркеры) по категориям self time: загрузка модулей, раннер Vitest, снятие мест тестов, код тестов и проекта, GC, Mootant, IPC; инклюзивное время ключевых функций. Таблицы 4.5.6 раздела 4 |
| `baseline-tests.sh` | (не часть стенда) базовая линия тестов самого Mootant, этап 0 |

## Проекты

Критерии: живые TS/JS-библиотеки с хорошими зелёными тестами и разумным
временем тест-сьюта, разный размер, Vitest 5 (Mootant поддерживает только его;
у всех трёх Vitest-проектов он уже в lockfile — обновлять не пришлось), для
node:test — проект, где `node --test` — штатный раннер.

| проект | раннер | размер | SHA (дата) | `MUTATE` | мутантов Mootant / Stryker | тест-сьют (смоук, под нагрузкой) |
|---|---|---|---|---|---|---|
| [pillarjs/path-to-regexp](https://github.com/pillarjs/path-to-regexp) | Vitest 5.0.5 | маленький: `src/index.ts` 696 строк | `32292b9d13239c7fa3ed23e89c59c10264f9fe20` (2026-10-22) | `src/index.ts` | 342 / 509 | 1 тест-файл, 425 тестов; Vitest Duration 1,9 с |
| [cheeriojs/cheerio](https://github.com/cheeriojs/cheerio) | Vitest 5 | средний: ~5 тыс. строк `src`, 15 тест-файлов | `40d4365fc025ebc053e6c886c1dac3cf29a4bc61` (2026-11-04) | `src/api/attributes.ts`, `src/api/css.ts`, `src/api/forms.ts` | 496 / 828 | 836 тестов; 19,4 с (вместе с type-check, который в копии выключен) |
| [azat-io/eslint-plugin-perfectionist](https://github.com/azat-io/eslint-plugin-perfectionist) | Vitest 5.0.5 | большой: `rules` 4 тыс. + `utils` 7,7 тыс. строк, 87 тест-файлов (RuleTester, 170 тыс. строк) | `486c3c85239e78a24aba2ade212cdef6acba1829` (2026-11-04) | `rules/sort-switch-case.ts`, `rules/sort-switch-case/`, `utils/compare/` | 314 / 380 | 5 830 тестов; 460 с wall, 163 с CPU при load average ~30 |
| [fastify/fast-json-stringify](https://github.com/fastify/fast-json-stringify) | `node --test` | средний: CJS, `index.js` 1,8 тыс. + `lib` 1,5 тыс. строк, 58 тест-файлов | `ac1723c7073ab4e0ceca074ad214af742fa439fa` (2026-11-01) | `lib/serializer.js`, `lib/validator.js`, `lib/standalone.js`, `lib/location.js`, `lib/merge-schemas.js` (без сгенерированного ajv `lib/schema-validator.js`: 1 739 мутантов, его исключает и покрытие проекта) | 308 / 394 | ~600 тестов; 39 с wall, 18,6 с CPU |
| (догфудинг, только Mootant) mootant-self | Vitest 5 | сам Mootant `170ec52`, 637 тест-файлов | `170ec52a8cc4e4551ca5d689caf4418b4edb4291` | `core/text` (16 файлов, почти все тесты их импортируют) | 544 / — | `test:unit` 251,8 с (`00-baseline.md`) |

Мутанты: Mootant — `mootant list $MUTATE` (пресет `recommended`), Stryker —
строка `Instrumented N source file(s) with M mutant(s)` (`lib/stryker-count.sh`
останавливает Stryker сразу после неё). Тест-сьюты — смоук при load average
20–40 от чужих задач; настоящие значения снимет точка `test`.

Подмножества выбраны так, чтобы полный прогон Mootant в обычном режиме шёл
5–20 минут при `--concurrency 3`, и чтобы были оба крайних случая
планировщика Mootant: в path-to-regexp **все юниты одного тест-файла** (они
идут строго по очереди, `types/adapter/adapter-session.d.ts:14-20`), в
perfectionist — правило со своим тест-файлом плюс общие компараторы, которые
достаёт почти каждый из 87 тест-файлов. Для смоук-прогонов и профилей у
каждого проекта есть меньшее `PROFILE_MUTATE` (`BENCH_SUBSET=1`).

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
| `m-one` | Mootant | `clean` | то же `--no-cache --mutant <id первого мутанта>` — перепроверка одного мутанта, как в цикле агента: старт + dry run тестов, связанных с файлом этого мутанта (переключаются только файлы с выбранными мутантами, `core/run-mutants.ts:633-664`, `:379-393`) + один мутант; для `MUTATE` из одного файла это старт + полный dry run |
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
  процессов дерева по `/proc/<pid>/smaps_rollup` раз в 2 с
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
- **Фазы Stryker** — по журналу (Stryker 10.1.1 не заполняет поле
  `performance` отчёта): setup = от старта процесса до «Starting initial test
  run» (чтение проекта, инструментирование, песочница, запуск test runner-ов),
  initialRun = dry run, mutation = до «Done in», «вне фаз» = после.
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

Порядок — по важности (`run.sh` идёт по ярусам, внутри яруса — сверху вниз;
`--tier N` ограничивает план ярусами ≤ N; уже снятая точка пропускается,
поэтому план можно прерывать и продолжать). Оценки — для свободной машины,
по смоук-прогонам (см. ниже) с поправкой на нагрузку: CPU-время смоука
(user+sys дерева процессов меньше зависит от чужой нагрузки, чем wall),
делённое на эффективный параллелизм (до 3,2 для Stryker; для Mootant — с
учётом того, что юниты одного тест-файла идут по очереди, см. трассу), и
масштабированное от подмножества смоука к `MUTATE`. Точность — в пределах
×0,5–×2; при первом реальном прогоне ярус 1 уточнит остальное.

| ярус | точки | зачем | оценка одного прогона | всего (×3, тест-сьюты и `list` ×5) |
|---|---|---|---|---|
| 1 | perfectionist `test`, `m-cold`, `s-cold` | главное сравнение на обязательном и самом большом проекте | test ~1,2 мин; m-cold 8–14 мин (dry run ≈ весь сьют 1,5–2 мин + цепочка ~230 юнитов правила по ~1,5–1,9 с на одном тест-файле); s-cold 5–10 мин | ~60 мин |
| 1 | path-to-regexp `test`, `m-cold`, `s-cold` | маленький проект с одним тест-файлом — крайний случай сериализации юнитов Mootant | test ~2 с; m-cold 2,5–4 мин (339 юнитов подряд); s-cold 1–2 мин | ~15 мин |
| 1 | cheerio `test`, `m-cold`, `s-cold` | средний проект | test ~6 с; m-cold 3–6 мин; s-cold 3–6 мин | ~30 мин |
| 1 | fast-json-stringify `test`, `m-cold`, `s-cold` | node:test (процесс на юнит) против tap-runner Stryker | test ~10 с; m-cold 3–6 мин; s-cold 3–6 мин | ~30 мин |
| 2 | все четыре `m-warm` | тёплый кэш без изменений — **нижняя граница прогона = старт + полный dry run** (гипотеза координатора); доля dry run в обычном прогоне — из фаз `m-cold` | ≈ старт + dry run: 0,1–1,5 мин | ~7 мин |
| 2 | все четыре `m-one` | цена перепроверки одного мутанта (`--mutant`, цикл агента) | 0,1–1,5 мин | ~7 мин |
| 2 | три Vitest-проекта `m-fast` | batch-режим | 30–80 % `m-cold` | ~30 мин |
| 3 | все четыре `m-edit-inc`, `m-since` | `--incremental` после правки, `--since` на синтетическом коммите | ≈ `m-one` + несколько мутантов | ~15 мин |
| 4 | все четыре `m-edit` | обычный кэш после той же правки (сколько вердиктов он теряет без `--incremental`) | ≈ `m-cold` | ~65 мин |
| 4 | все `m-list-text`, `m-list-json` | текстовый отчёт `list` против JSON | 1–3 с | ~2 мин |
| 5 | cheerio, perfectionist `s-tsc` | Stryker с typescript-checker | ×3 к `s-cold` (смоук cheerio: 256 против 86 с) | ~2 ч |
| 5 | path-to-regexp, cheerio `s-edit-inc` | инкрементальный Stryker после той же правки | праймер (полный прогон) + 3 коротких | ~10 мин |
| 5 | path-to-regexp, cheerio `m-nocache` | цена записи кэша (`--no-cache` против `m-cold`) | ≈ `m-cold` | ~25 мин |
| 6 | fast-json-stringify `s-command` (×1) | command runner Stryker: весь `node --test` на мутанта | ~1 ч | ~1 ч |
| 6 | mootant-self `m-one` (×3), `m-cold` (×1), `m-warm` (×3) на `core/text` (догфудинг) | dry run на 8 393 тестах самого Mootant | m-one ~5 мин; m-cold > 42 мин (в догфудинге не завершился) | 1,5–2,5 ч |
| — | `profile.sh <project>` для четырёх проектов | CPU-профили и разбивка (не замеры) | 5–15 мин на проект | ~40 мин |

Итого машинного времени: **ярусы 1–3 и профили — около 4 ч** (диапазон
3–6 ч); с ярусом 4 — ~5 ч; весь план — 9–12 ч. Если окно меньше 4 ч,
запускать `run.sh --tier 2`, затем `profile.sh perfectionist` и
`profile.sh path-to-regexp`.

**Факт окна 2026-11-04** (по `point.log` точек):

- **Ярус 1 — 2 ч 24 мин** (08:35–10:59 UTC).
  - perfectionist: `m-cold` ×3 — 47,6 мин, `s-cold` ×3 — 33 мин. Один прогон
    `m-cold` занял 15,9 мин против оценки 8–14.
  - path-to-regexp: 4,7 и 3,8 мин.
  - cheerio: 8,2 и 7,9 мин.
  - fast-json-stringify: 20,1 и 12,4 мин. Прогон `m-cold` — 6,7 мин против
    оценки 3–6.
- **Ярус 2 — 59 мин**. Из них 48 мин — `perfectionist:m-fast`: на этом
  проекте `--fast` не быстрее обычного режима.
- **Ярус 3 — 25 мин** (11:58–12:23 UTC). perfectionist `m-edit-inc` ×3 —
  14 мин, fast-json-stringify `m-edit-inc` ×3 — 6 мин, остальные точки — по
  0,5–2 мин.
- **Прототипы — 2 ч 13 мин** в две части (`results/window.log`):
  - пара off/on P1 на path-to-regexp — 55 мин (07:40–08:35 UTC);
  - режим on — 78 мин (12:23–13:40 UTC): P1 на perfectionist — 36 мин,
    cheerio — 6 мин, fast-json-stringify — 13 мин; P3 на cheerio — 16 мин,
    на fast-json-stringify — 7 мин, из них 6 мин — незамеряемый прогон,
    записавший снимок кэша.
  - P3 на perfectionist не снят: подготовка `m-warm` упала за секунду. Лог
    незамеряемого прогона шёл в ещё не созданный каталог `snapshots/`;
    исправлено после окна в `prepare/state.sh`.
- **Профили — 3 мин 21 с** (13:40–13:43 UTC): perfectionist (подмножество
  `PROFILE_MUTATE`) и path-to-regexp. cheerio и fast-json-stringify в окно не
  вошли.

Перед стартом: `setup.sh` (если стенд ещё не собран; ~10 мин), затем
`uptime` (load average должен быть < 0,5), `df -h /` (нужно ≥ 3 ГБ: отчёты
`--verbose` по 1–5 МБ на прогон, снимки кэша, профили — до ~100 МБ на прогон
node:test; на 2026-11-04 06:10 свободно было 5 ГБ). Команда полного плана:

```sh
cd /home/user/mootant && export PATH=/home/user/tools/bin:$PATH
analysis/bench/run.sh --tier 3 2>&1 | tee -a /home/user/projects/bench/results/run.log
for p in perfectionist path-to-regexp cheerio fast-json-stringify; do analysis/bench/profile.sh $p; done
analysis/bench/run.sh 2>&1 | tee -a /home/user/projects/bench/results/run.log   # ярусы 4–6, если есть время
node analysis/bench/summarize.mjs > analysis/bench/results.md
```

## Профилирование

`profile.sh <project> [list run vitest]` — отдельно от замеров
(профилировщик замедляет процессы на 5–15 %), на подмножестве `PROFILE_MUTATE`
из `project.sh` (или на `MUTATE`, если подмножества нет). Результат —
`$BENCH_RESULTS/profiles/<project>/<mode>/` и сводка `summary.md` рядом.

| режим | как снимается | что даёт |
|---|---|---|
| `list` | `node --cpu-prof mootant list ...` и `... --json` | поиск файлов (`core/files/expand-paths.js`), парсинг (oxc-parser), генерация мутантов и эвристики (`core/generate/collect-candidates.js`; self-время групп `mootant/core/mutators`, `mootant/core/hints`, `mootant/core/skips`, `mootant/core/syntax` …), дедупликация, id, построение и форматирование отчёта |
| `run` | `mootant run --no-cache` под `node --cpu-prof` и с тем же флагом в `NODE_OPTIONS` | профиль главного процесса (по pid) и профили всех форков Vitest / процессов node:test. Главный: self-время по пакетам (`vite`/`rolldown` — трансформации Vite в главном процессе, `node:internal/child_process` — запуск воркеров, `mootant/*`, `(idle)` — ожидание воркеров) и инклюзивное время модулей фаз; воркеры (слитно): `node:internal/modules` и `(native)` (загрузка модулей), `vitest` (раннер), `mootant/adapters` (раннер Mootant: учёт попыток, out-файлы), код проекта и его зависимостей, `(garbage collector)` |
| `vitest` | обычный `vitest run --reporter=default` / `node --test --test-reporter=spec` | собственная разбивка Vitest: `Duration … (transform, setup, import, tests, environment)` — сколько в обычном прогоне уходит на трансформации и импорт против тестов |

Как это работает и что проверено смоуком:

- `--cpu-prof` у главного процесса доходит до форков Vitest через `execArgv`
  (cheerio, `src/api/forms.ts`: 1 профиль главного + 36 воркеров за прогон), а
  один `NODE_OPTIONS` до них не дошёл (0 профилей воркеров) — поэтому заданы
  оба; процессы node:test наследуют `NODE_OPTIONS` (fast-json-stringify: 297
  профилей тест-процессов за прогон).
- Dist Mootant минифицирован: имена функций в профиле — `o`, `i`, …, но
  модульная структура сохранена и в каждом файле одна экспортируемая функция,
  поэтому `cpuprofile-top.mjs --focus` принимает пути модулей
  (`core/run/run-dry-phase.js` = `runDryPhase`), а таблицы показывают файл и
  строку.
- Инклюзивное время асинхронных функций (`runMutants`, `runDryPhase`,
  `runIsolatedRounds`) профиль V8 не связывает через `await`: оно считается
  только по синхронным участкам. Для фаз это даёт CPU главного процесса, а
  длительности фаз — из `summary.duration` и трассы.

Доля запуска раннера и трансформаций против тестов в прогоне Mootant
считается из трёх источников: (1) Vitest-разбивка обычного прогона (`vitest`);
(2) по каждому юниту из трассы — старт процесса (`summary.staticCost` минус
`mutants[].duration`, это spawn → `onBeforeCollect`), `loadDuration` (импорт
тест-файла и всего, что он тянет, вместе с запросами трансформаций к Vite
главного процесса) и Σ `tries[].duration` (тесты); (3) CPU-профили воркеров
(режим `run`), где видно, что внутри загрузки: модульный загрузчик node, runner
Vitest, сами модули проекта, `node_modules`.

Отдельный вопрос — простой воркеров (наблюдение из догфудинга: 85 юнитов одного
тест-файла шли по очереди ~15 минут). Его даёт трасса рабочего каталога
(`lib/trace-units.mjs` → `lib/units-report.mjs`): по каждому раунду занятость
слотов, ожидание очереди тест-файла (claim → start), хвост и самая длинная
последовательная цепочка; пример — `node lib/units-report.mjs run-1.units.json
--workers 3`.


## Смоук-проверка (что проверено, 2026-11-04)

Под нагрузкой, `--concurrency 2`, один прогон, подмножества `PROFILE_MUTATE`
(path-to-regexp — целиком). Таблицы — `smoke/smoke*.md`, профили —
`smoke/profile-*.md`.

| что | как проверено | итог |
|---|---|---|
| `setup.sh` с нуля | все пять проектов (четыре + mootant-self) | клон, установка, патчи, ветки `bench/base`/`bench/since`; тест-сьюты зелёные (path-to-regexp, cheerio, perfectionist, fast-json-stringify) после правок копий из «Известных ограничений» |
| точки `run.sh` | cheerio — все точки ярусов 1–5 (`test`, `m-cold`, `s-cold`, `m-one`, `m-warm`, `m-fast`, `m-edit-inc`, `m-edit`, `m-since`, `m-list-text`, `m-list-json`, `s-tsc`, `m-nocache`, `s-edit-inc`); perfectionist — `test`, `m-cold`, `s-cold`, `m-warm`, `m-one`; fast-json-stringify — `test`, `m-cold`, `s-cold`, `m-one`, `m-warm`, `m-edit-inc`, `m-since`, `s-command`; path-to-regexp — `m-cold` и `s-cold` через `lib/measure-one.sh` напрямую | hyperfine, `--prepare`, снимки кэша, правка, ветка `--since`, incremental-файл Stryker, typescript-checker работают; найден и исправлен баг стенда (переменная hyperfine в окружении ломала кэш Mootant — BUG-701) |
| Stryker + Vitest 5 | path-to-regexp, cheerio, perfectionist | `@stryker-mutator/vitest-runner@10.1.1` работает с Vitest 5.0.x без обходных путей; на TypeScript 7 нужен `tsconfigFile`-обход (path-to-regexp) |
| Stryker + node:test | fast-json-stringify | tap-runner работает после удаления `test/property-names.test.js` (без этого Stryker считает его упавшим в начальном прогоне); command runner работает |
| отчёты | все прогоны | Mootant `--json --all --verbose` и JSON Stryker сохраняются по прогону; у Stryker нет поля `performance` — фазы из журнала |
| трасса юнитов | path-to-regexp, cheerio, perfectionist | раунды, занятость, ожидание, хвост, цепочки; CPU трассировщика ~0,1–0,8 % ядра |
| CPU-профили | `profile.sh cheerio`, `profile.sh fast-json-stringify run`, `mootant list core` | профили главного процесса, 36 форков Vitest, 297 процессов node:test; сводки по функциям, пакетам, модулям |
| `summarize.mjs` | все каталоги смоука | таблицы собираются |

Чего смоук **не** проверил: прогоны на полных `MUTATE` у cheerio,
perfectionist и fast-json-stringify (только счётчики мутантов и подмножества),
точки `m-fast`/`m-edit*`/`m-since` на полных `MUTATE`, ярус 6 (`mootant-self`
только собран и проверен `mootant list core/text`).

## Известные ограничения стенда

1. **Шум облачной машины.** Замерять только в эксклюзивном окне; `point.log`
   каждой точки пишет load average в начале и в конце — точку с load average
   выше ~1,5 в начале стоит перезапустить (`run.sh --redo <project>:<point>`).
   Хелперы замера сами потребляют ~0,5–1 % одного ядра (смоук: трассировщик
   0,8 %, сэмплер памяти ~1 % ядра при прежних интервалах 0,1 и 0,5 с; сейчас
   0,25 и 1 с).
2. **Кэш страниц ОС не сбрасывается**: «холодный» = нет кэша Mootant/песочницы
   Stryker. Первая точка проекта (`test`) с `--setup` прогревает кэш страниц.
3. **`%M` GNU time** — пик одного процесса, поэтому рядом пик PSS дерева
   (`memtree.mjs`, выборка раз в 1–2 с: короткие пики между выборками не видны).
4. **Фазы Stryker** берутся из журнала с точностью до секунды: Stryker 10.1.1
   не заполняет поле `performance` отчёта (проверено смоуком).
5. **Трассировщик юнитов опирается на внутреннее устройство рабочего каталога
   `170ec52`** (`plan/`, `claim/`, `done/`, `out/` и формат записей, см.
   комментарий в `lib/trace-units.mjs`) — это не публичный контракт; для другой
   версии Mootant его надо сверить. Для node:test трассы юнитов нет (другой
   рабочий каталог); грубый профиль параллельности даёт число процессов во
   времени из `run-k.mem.json` (`samples[][1..2]`).
6. **CPU-профили** пишутся только при нормальном завершении процесса; форк,
   убитый за зависание, профиля не оставит.
7. **Отличия от upstream в копиях проектов** (все — в `projects/<name>/patch.sh`
   и `*.patch`, одинаковые для обоих инструментов):
   - path-to-regexp: из тестов исключены `src/cases.spec.ts` (модуль данных без
     тестов: «No test suite found») и `src/redos.spec.ts` (нативный `recheck`,
     здесь 9 падений из 9 и 34 из 35 с тест-сьюта); у Stryker отключена
     переписывающая `tsconfig` предобработка песочницы (`"tsconfigFile":
     "tsconfig.stryker-skip.json"`): проект на TypeScript 7 (нативный, без JS
     API), и `TSConfigPreprocessor` Stryker падает с
     `ts.parseConfigFileTextToJson is not a function` (смоук). Переписывать
     там нечего (`extends` указывает на пакет), на время это не влияет;
   - cheerio: выключен `typecheck` в `vitest.config.ts` (tsc при каждом старте
     Vitest, 44 % обычного тест-сьюта; type-тесты не убивают мутантов);
   - fast-json-stringify: удалены `test/webpack.test.js` (сборка библиотеки
     webpack-ом, 16,6 из 56 с тест-сьюта на смоуке, одна проверка без своей
     логики) и `test/property-names.test.js` (проходит под `node --test`, но
     tap-runner Stryker считает его упавшим в начальном прогоне и не
     стартует); lockfile-а нет — `npm install --before=2026-11-03`.
8. **Одновременные прогоны одного тест-файла у Stryker.** Три test runner
   Stryker работают в одной песочнице и могут одновременно гонять один
   тест-файл с разными мутантами. Тест, пишущий фиксированный файл
   (fast-json-stringify `test/standalone-mode.test.js` пишет
   `test/fixtures/standalone.js` и делает `require`), может увидеть чужого
   мутанта. Mootant такие юниты сериализует (`types/adapter/adapter-session.d.ts:14-20`),
   за что и платит простоем. Колонка «одинаковые счётчики» ловит
   недетерминизм; в разделе 3 при сравнении наборов это надо учитывать.
9. **Окружение одинаково во всех прогонах проекта.** Тесты, которые
   перечисляют `process.env`, кладут в ключ кэша Mootant хэш всех переменных
   (BUG-701), поэтому `lib/measure-one.sh` и `prepare/state.sh` снимают
   `HYPERFINE_RANDOMIZED_ENVIRONMENT_OFFSET` (hyperfine задаёт её каждому
   прогону) и держат один `TMPDIR` на проект (`$BENCH_RESULTS/tmp/<project>`).
   Без этого `perfectionist:m-warm` не брал из кэша ничего.
10. **Подмножества файлов** выбраны так, чтобы полный прогон Mootant шёл
   минуты, а не часы; на целых проектах соотношения могут быть другими (у
   Mootant время сильно зависит от числа тест-файлов, покрывающих мутанты, —
   см. сериализацию юнитов одного файла).
