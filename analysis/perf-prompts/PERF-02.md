# PERF-02: полный кэш без запуска раннера (снимок dry run, хэш дерева проекта) и кэш подтверждённых `hit-limit`-тайм-аутов

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 2 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: измерен на 170ec52: тёплый прогон без изменений
> ×10,1 на cheerio (5,40 → 0,54 с) и ×9,3 на fast-json-stringify (6,83 →
> 0,73 с), GNU elapsed, 3 прогона; холодный прогон не дороже; после правки
> мутируемого файла выигрыша нет. Риск для вердиктов: средний. Трудоёмкость: L.
> Прототип: diff `analysis/experiments/perf-dry-snapshot.diff`. Тип: реализация.
> Замерено на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

Тёплый прогон (кэш есть, ничего не менялось) на `main` всегда стартует раннер и
делает полный dry run. Сессия адаптера создаётся до чтения кэша
(`core/run-mutants.ts:282-307`), dry run (`:435-446`) идёт раньше подготовки
кэша (`:467-487`) и применения вердиктов (`reuseCachedVerdicts`, `:517`,
`:723-740`). Кэш (`node_modules/.cache/mootant/run-v3.json`,
`core/cache/cache-version.ts:6`) хранит только улики «мутант × тест-файл» и
«мутант × тест». Покрытие, тесты и их длительности, список тест-файлов и
`cacheInputs` сессии берутся из живой сессии и свежего dry run и нигде не
сохраняются. Тайм-ауты в кэш не попадают никогда: запись берёт только `Killed`
без `crash` и проходы (`core/cache/create-run-cache.ts:313-319`), чтение всегда
отдаёт `Killed` (`:287-296`), тип записи — `'Survived' | 'Killed'`
(`types/cache/cache-entry.d.ts:13`), статусы файла — `core/cache/read-run-cache.ts:13`,
«The cache never holds a timeout or an error» (`core/cache/apply-cached-units.ts:10-13`).
Значит, каждый тёплый прогон снова гоняет юниты всех Timeout-мутантов
(BUG-752 в `analysis/02-bugs.md`).

Прототип P3 закрывает обе потери. После прогона он сохраняет итог dry-фазы и то,
от чего тот зависел:

- ключ: версии, штамп сборки, адаптер, Node, лимиты, мутаторы, тексты
  переключаемых файлов;
- хэши переменных главного процесса, снятых до старта адаптера: тех, что читал
  код тестов, и `NODE_ENV`, `LANG`, `LC_*`, `TZ`, `NODE_OPTIONS`;
- хэши всех файлов, по которым строились ключи кэша;
- хэш **всего дерева проекта** с содержимым, кроме `node_modules`, `.git` и
  `.mootant`.

Следующий прогон проверяет снимок до старта адаптера и проигрывает фазы с
сохранённым dry run и сессией-заглушкой, которая ничего не запускает. Если снимок
устарел или хоть одному мутанту нужен раннер, бросается `DryReuseMiss`, и прогон
идёт обычным путём; до этого ничего не запускалось и не писалось. С той же
переменной прототип кэширует тайм-ауты `hit-limit`, но не `time-limit` и `hang`.
Ускорять сам dry run бессмысленно (отрицательный результат §4.4): он стоит как
обычный прогон тест-сьюта, ×1,0–1,2. Беда в том, что он идёт всегда, и это
закрывает ранг 2.

**Актуальность на `main` (bd7af11, 37 коммитов после 170ec52).** Задача не
сделана: в `core/` нет ни снимка dry run, ни Timeout-записей кэша.
`core/cache/create-run-cache.ts`, `apply-cached-units.ts`, `read-run-cache.ts` и
`cache-version.ts` с 170ec52 не менялись. Изменилось окружение задачи, и без
учёта этого прототип на `main` даст неверные вердикты:

- **Подтверждение `hit-limit` (d3a61a5).** Первый юнит сверх лимита срабатываний
  теперь не вердикт, а `'confirming'`. Подтверждение получает удвоенное время и
  `factor × floor` срабатываний сверху (`core/run/get-unit-evidence.ts:25-29`,
  `core/run/apply-isolated-result.ts:87-94`, `core/run/plan-isolated.ts:24-32`,
  `types/run/run-state.d.ts:94-98`), запрос живёт до шести раундов
  (`core/run/run-isolated-rounds.ts:25-27`). Мутант, который лишь делает код
  горячее, получает вердикт своих тестов (`docs/content/guide/configuration.mdx:486-499`,
  тест `test/adapters/vitest/index.equivalence.test.ts:302-336` на фикстуре
  `test/fixtures/equivalence/hot`), если поднятого лимита ему хватает.
  Окончательный `Timeout(hit-limit)` даёт только юнит с `raised: true`. Но
  `recordUnit` вызывается с сырым вердиктом **каждого** юнита до решения
  `getUnitEvidence` (`core/run/apply-isolated-result.ts:78-86`) и о `raised` не
  знает (`core/cache/create-run-cache.ts:393-399`). Правило прототипа «isolated
  + `Timeout` + `hit-limit`» сохранит неподтверждённый тайм-аут. Если
  подтверждение даст `Killed` без `crash` или проход, запись того же слота
  перезапишется. Если оно даст `crash`, ничего не решит или потеряется, в кэше
  останется неподтверждённый `Timeout`. Следующий прогон вернёт его вместо
  `Killed`, `Error` или вердикта другого файла, а при `time-limit` в
  подтверждении — с чужой причиной. Фикстура `hot` этого не ловит: там
  подтверждение проходит и перезаписывает слот.
- **Хостинг всех файлов (312ff7b).** `createSwitchedFiles` теперь строится по
  всем файлам путей (`runnable`, `core/run-mutants.ts:399-412`). Адаптеру
  отдаются только файлы выбранных мутантов (`:417-419`), а dry run получает ещё
  `related` — все файлы полного прогона (`:440`, `core/run/run-dry-phase.ts:42-48`).
  Ключ прототипа считается по `built.switched`, поэтому у `--mutant`/`--since`
  он совпадёт с полным прогоном. В снимке `--mutant`-прогона нет покрытия
  мутантов других файлов. Если у мутантов выбранного файла есть вердикты в кэше,
  полный прогон проиграет этот снимок, и остальные мутанты станут `NoCoverage`.
- **Jest-адаптер (bc6adec).** `close()` может вернуть диагностику, которая
  добавляется к результату после `execute` (`types/adapter/adapter-session.d.ts:35-40`,
  `core/run-mutants.ts:332-338`). У Jest это `teardown-failed` с
  `severity: 'error'`: упал global teardown или есть устаревшие файлы снимков
  (`adapters/jest/read-teardown.ts:27-80`). Прототип пишет снимок внутри
  `execute`, до `close()`, и повтор вернёт код 0 там, где обычный прогон даёт 1.
  `cacheInputs` Jest собирается из прочитанных трансформов
  (`adapters/jest/start-jest-session.ts:267-285`), а контракт — «Called once
  after the last dry run» (`types/adapter/adapter-session.d.ts:42-47`).
  Прототип же вызывает `session.cacheInputs()` второй раз, после isolated-раундов.
- **`UNKNOWN_HASH` (996431f).** Устройство, канал или сокет больше не читаются,
  а получают `'unknown'` (`core/cache/hash-files.ts:47-57`, `core/cache/unknown-hash.ts:1-7`).
  Кэш считает такой файл ненадёжным (`core/cache/prepare-run-cache.ts:182-184`).
  Проверка прототипа сравнит `'unknown' === 'unknown'` и сочтёт его
  неизменным. На 170ec52 `hashFiles` читал любой путь, и FIFO в дереве повесил
  бы хэш дерева; на `main` этого нет.
- **Предупреждение о времени файлов (bd7af11).** `prepareRunCache` теперь
  возвращает `{ warning, cache }` с `cache-skipped`, когда файл с `mtime` не
  раньше начала прогона или с `UNKNOWN_HASH` оставляет прогон без кэша
  (`core/cache/prepare-run-cache.ts:94-108`, `:192-213`). Само правило по
  `mtime` было и на 170ec52 (`:164`). В повторе без кэша `hasWorkLeft` даст
  `DryReuseMiss`, и предупреждение уйдёт в обычный прогон.
- **`--fast` по времени файла (26656f8)** меняет только batch-путь. Прототип в
  `--fast` выключен, Timeout-записи пишет только с isolated-пути. У Jest и
  node:test batch-режима нет, `fast` для них ложно (`core/run-mutants.ts:241`).

Адаптеры: у Vitest, node:test и Jest есть `cacheInputs` и
`DryFile.dependencies`, так что снимок годится для всех трёх. В анализе он
проверен только на Vitest и node:test (на 170ec52), на Jest — никак. Кэш
трансформов Jest лежит в `node_modules/.cache/mootant/jest`
(`adapters/jest/get-jest-cache-directory.ts:11-13`), вне хэша дерева.

## Доказательства

Условия (`analysis/04-performance.md` §4.1, §4.5.1): 4 vCPU Intel Xeon 2.1 GHz,
15 GB RAM, ext4; Node 22.23.4, npm 10.9.9, pnpm 12.16.1, hyperfine 1.18.0, GNU
time; Mootant 170ec52; Vitest 5.0.5 (path-to-regexp, perfectionist), Vitest 5 из
lockfile (cheerio), `node --test` (fast-json-stringify); `--concurrency 3`;
3 прогона на точку. Эксклюзивное окно 2026-11-04 07:35–13:43 UTC, P3 —
12:23–13:40; load average 2–6 давали сами замеряемые процессы. Счётчик —
**elapsed GNU time**, mean ± σ. hyperfine в окне мерил обвязку и давал
≈ ceil(elapsed) + 0,05 с: P3 cheerio `m-warm` — 1,06 с по hyperfine против
0,54 с по GNU. Обвязку исправили после окна (`analysis/bench/README.md`, п. 11).

Тёплый прогон базы (точка `m-warm`, §4.5.4):

| проект | wall, с | dry run / wall | из кэша | что прогнано заново |
|---|---|---|---|---|
| perfectionist | 80,4 ± 1,2 | 58 % | 306 из 314 | 2 Timeout `time-limit` (юниты 31–33 и 16–17 с) — ещё 41 % wall |
| path-to-regexp | 10,3 ± 0,5 | 7 % | 336 из 342 | 3 Timeout `hit-limit` — 86 % wall |
| cheerio | 5,40 ± 0,56 | 45 % | 490 из 496 | 4 Timeout `hit-limit` по 0,4–0,6 с |
| fast-json-stringify | 6,83 ± 0,31 | 92 % | 308 из 308 | — |

P3 (`MOOTANT_REUSE_DRY_RUN=1`, §4.5.5; hyperfine JSON —
`analysis/data/bench/results-proto_dry-snapshot_on_*`):

| проект | точка | база, с | P3, с | что произошло | вердикты |
|---|---|---|---|---|---|
| cheerio | `m-cold` | 164,1 ± 1,7 | 163,2 ± 4,1 | обычный прогон плюс запись снимка | 496 из 496 × 3 |
| cheerio | `m-warm` | 5,40 ± 0,56 | **0,54 ± 0,05 (×10,1)** | раннер не стартовал, `summary.runs = {}`, из кэша 494 из 496 (4 `hit-limit` тоже), 2 NoCoverage решены сохранённым dry run | 496 из 496 × 3 |
| cheerio | `m-edit` | точки нет | 160,6 ± 5,8 | снимок устарел по ключу (правка `attributes.ts`), обычный кэш потерял все 496 | не сравнивались |
| fast-json-stringify | `m-warm` | 6,83 ± 0,31 | **0,73 ± 0,13 (×9,3)** | раннер не стартовал, из кэша 308 из 308 | 308 из 308 × 3 |

Разброс тёплых точек P3 — 8,8 % и 17,4 % (0,1 с при 0,5–0,7 с — это 15 %).
Фазы прогона 1 (`analysis/data/bench/run-1-summaries.json`, `summary.duration`,
мс): P3 cheerio — total 291 (startup 193, dryRun 86 — сюда входит проверка
снимка с хэшем дерева, isolated 12), fast-json-stringify — 350 (132 / 193 / 25).
У базы — 5693 (638 / 2932 / 2123) и 6833 (199 / 6594 / 39).

Эквивалентность прототипа (`analysis/experiments/prototypes.md`, P3): 16
сценариев Vitest и 6 node:test. A — с повтором, B — обычный тёплый прогон той же
сборки из того же состояния кэша. Вердикты A и B совпали с `--strict`. Раннер не
стартовал ровно в 4 + 2 сценариях «ничего не изменилось», в остальных шёл обычный
путь с верной причиной. Отрицательный контроль: в снимке подделан `tree`, тест-
файл вне dry run через хелпер начал покрывать `src`. Повтор дал **2 устаревших
вердикта из 76** (`Killed → Survived`, `Killed → NoCoverage`). Значит, хэш всего
дерева обязателен.

**Не измерено:** P3 на perfectionist (ошибка стенда в окне) и path-to-regexp,
`m-edit` базы, Jest, всё на `main`. **Прогнозы** (по коду, не замер):

- perfectionist: повтора не будет. 2 Timeout по `time-limit` не кэшируются,
  отсюда `DryReuseMiss` и ≈ 80,4 с плюс проверка снимка.
- path-to-regexp: если его 3 Timeout на `main` подтверждаются как `hit-limit`,
  повтор займёт < 1 с против 10,3 с. Основание: dry run 0,8 с плюс 86 % wall
  на тайм-ауты; повтор на cheerio и fast-json-stringify занял 0,54–0,73 с.
- На `main` каждый некэшированный `hit-limit`-мутант стоит в тёплом прогоне не
  меньше двух юнитов, поэтому база `main` на path-to-regexp и cheerio, вероятно,
  медленнее, чем на 170ec52. Часть тайм-аутов 170ec52 могла стать `Killed` или
  `Survived` после подтверждения: например, cheerio `2pagajpamh39` был
  `Timeout(hit-limit)` в обычном режиме и `Killed` в 2 из 3 прогонов `--fast`.
  Базу нужно снять заново.
- Кэш `hit-limit` поможет и прогонам, где раннер всё равно стартует. На 170ec52
  `--incremental` после правки снова гонял 3 Timeout на path-to-regexp и 4 на
  cheerio (§4.5.4).

## Что сделать

**Шаг 0. Материалы анализа.** Сессия на `main` не видит `analysis/`; всё
ниже есть в опубликованной ветке (пути проверены `git cat-file -e`). Ветка
прототипа `experiment/perf-dry-snapshot` не опубликована, есть только diff.

```bash
git fetch origin main analysis/2026-11
A=$HOME/perf-02 && mkdir -p "$A"          # вне клона
git show origin/analysis/2026-11:analysis/experiments/perf-dry-snapshot.diff > "$A/perf-dry-snapshot.diff"
git show origin/analysis/2026-11:analysis/experiments/prototypes.md > "$A/prototypes.md"     # раздел «P3», строки 362–669
git show origin/analysis/2026-11:analysis/04-performance.md > "$A/04-performance.md"         # §4.4, §4.5.4, §4.5.5
git archive origin/analysis/2026-11 analysis/bench analysis/tools analysis/experiments/perf-fixtures | tar -x -C "$A"
```

**Шаг 1. Применить прототип.**

```bash
git switch -c perf/dry-snapshot origin/main
git apply --3way "$A/perf-dry-snapshot.diff"
```

Diff — 24 файла, +1090/−24. `git apply --check` на bd7af11 по файлам: 23
ложатся чисто, конфликт только в `core/run-mutants.ts`. Из 15 его хунков по
отдельности ложатся 12, конфликтуют 3 (номера строк 170ec52):

- `@@ -302` — вызов `execute`: на `main` это `result = await execute(...)` с
  поздней диагностикой `close()` (`core/run-mutants.ts:308-338`);
- `@@ -408` — dry-фаза: на `main` `runDryPhase` получает `related` (`:435-446`);
- `@@ -446` — вызов `prepareRunCache`: на `main` он возвращает
  `{ warning, cache }`, а `files: runnable.files` (`:467-487`).

Можно и без `--3way`: `git apply --exclude=core/run-mutants.ts` (проверено,
ложится) и перенос `core/run-mutants.ts` руками. Что файлы легли чисто, ещё не
значит, что они верны: дальше шаг 2.

**Шаг 2. Обязательные правки под `main`.** Каждой нужен свой тест (см.
«Критерий готовности»).

1. **Ключ по тому, что реально отдано dry run.** Считайте ключ по
   `context.switched` после `push` (`core/run-mutants.ts:417-419`), то есть по
   текстам переключённых файлов, и по списку `related` (`:440`), а не по
   `built.switched`. Тест: холодный `--mutant <id>` с кэшем, затем полный прогон.
   Второй не проигрывает снимок первого или даёт ровно вердикты обычного
   тёплого прогона. То же для `--since`.
2. **Кэшировать только подтверждённый `hit-limit`.** Записывайте вердикт юнита
   после `getUnitEvidence` и пропускайте `'confirming'`
   (`core/run/apply-isolated-result.ts:78-86`). В `write` пропускайте только
   isolated `Timeout` с `cause: 'hit-limit'` (`core/cache/create-run-cache.ts:313-319`),
   `read` пусть отдаёт сохранённый статус (`:287-296`). `time-limit`, `hang`,
   `crash` и `Error` не кэшируются: `time-limit` у границы бюджета
   недетерминирован (BUG-204, `docs/content/guide/configuration.mdx:481`).
   Обновите JSDoc: `core/cache/create-run-cache.ts:129-145`,
   `types/cache/run-cache.d.ts:43-49` и `:110-113`,
   `core/cache/apply-cached-units.ts:5-15`. Кэш `hit-limit` не привязывайте к
   повтору (в прототипе — `hitLimits: context.reuse`): он полезен и обычному
   тёплому прогону. В `--fast` Timeout-записи, как в прототипе, не читайте,
   разве что докажете эквивалентность и там.
3. **`cacheInputs` один раз.** Сохраняйте в снимок тот объект, который получил
   `prepareRunCache` (`core/cache/prepare-run-cache.ts:142-145`, его можно
   вернуть в `PreparedCache`, `:94-108`), а не результат второго вызова после
   isolated-раундов.
4. **Поздняя диагностика `close()`.** Пишите снимок после `session.close()` и
   только если тот ничего не вернул (`core/run-mutants.ts:332-338`); иначе
   удаляйте старый. Тест: копия `test/fixtures/jest/global`, где
   `global-teardown.js` бросает исключение. Второй прогон стартует Jest и снова
   даёт ошибку и код 1.
5. **Переменные главного процесса.** Обычный тёплый прогон видит смену
   переменной, которую читает только конфиг или global setup, через
   `CacheInputs.settings`: `testTimeout`, `retry`, `env`, `define`, `provide`
   (`adapters/vitest/get-cache-inputs.ts:62-77`, `:78-120`). Повтор берёт старые
   `cacheInputs` из снимка, а сверяет только имена, прочитанные кодом тестов
   (`DryFile.environment`, `types/adapter/dry-file.d.ts:16-21`), и
   `NODE_ENV|LANG|LC_*|TZ|NODE_OPTIONS` (прототип,
   `core/cache/list-variable-hashes.ts`). Эту дыру нашли по чтению кода, в
   анализе её не проверяли. Варианты: (а) отслеживать чтения `process.env` в
   главном процессе от старта адаптера до конца dry run (образец — прокси из
   `adapters/shared/create-environment-proxy.ts:15`) и класть эти имена в снимок;
   (б) если отследить нельзя, класть `*` (все переменные, кроме `VOLATILE`,
   `adapters/shared/index-environment-hashes.ts:9-17`). Тест: `vitest.config`
   с `testTimeout: Number(process.env.X ?? 5000)`, смена `X` — повтора нет.
   Окружение снимайте до старта адаптера, как прототип, перед `prepareRun`
   (`core/run-mutants.ts:180`): Vite ставит в главном процессе
   `NODE_ENV=development` (BUG-753).
6. **`UNKNOWN_HASH` = устарел.** Если хоть один хэш в `files` снимка —
   `UNKNOWN_HASH`, снимок не пишется и не проигрывается.
7. **Изменения дерева во время холодного прогона.** Прототип считает `tree` при
   записи, после прогона. Тест-файл, созданный вне зависимостей dry run, пока
   шли мутанты, войдёт в хэш, и повтор отдаст dry run, который его не видел.
   Это тоже найдено по чтению кода. Считайте хэш дерева до старта адаптера и
   при записи, а при расхождении снимок не пишите. Правило «не писать, если у
   файла дерева `mtime` не раньше начала прогона» (как `findChangedFiles`,
   `core/cache/find-changed-files.ts:11-20`) дешевле, но строже. На
   `test/fixtures/jest/global` global teardown каждый прогон пишет в корень
   `store-closed` (`test/fixtures/jest/global/global-teardown.js:8`), и с этим
   правилом снимок не появится никогда.
8. **Версия формата.** `CACHE_VERSION` 3 → 4 (`core/cache/cache-version.ts:1-6`):
   в файле кэша появился новый статус. Обновите
   `test/core/cache/cache-version.test.ts:8-9` и
   `test/core/cache/get-cache-path.test.ts:9`. Ключ снимка уже включает
   `CACHE_VERSION`.

**Шаг 3. До продакшна** (`prototypes.md`, «Трудоёмкость до продакшна: L»):

- Включение. Рекомендация анализа — по умолчанию вместе с кэшем (не в
  `--fast`). Если какую-то дыру шага 2 закрыть не удалось, делайте явный
  opt-in, аддитивно в конфиге, и опишите компромисс в PR. Уберите имена
  прототипа: `MOOTANT_REUSE_DRY_RUN`, `core/cache/read-reuse-dry-run.ts`,
  «prototype» в JSDoc `types/cache/cache-entry.d.ts` и
  `types/cache/dry-snapshot.d.ts`.
- Несколько снимков по ключу (имя файла по хэшу ключа и чистка старых, как
  `core/cache/prune-cache-entries.ts`) или вовсе без записи для
  `--mutant`/`--since`. В прототипе снимок один, и `--mutant` его вытеснял
  (сценарий s8).
- Документация: раздел `cache` (`docs/content/guide/configuration.mdx:353-375`)
  — что переиспользуется, когда раннер всё же стартует, остаточные риски (см.
  «Риски и границы»), как получить полный прогон (удалить
  `node_modules/.cache/mootant`; `--no-cache` сохранённое не обновляет,
  `:370-372`). Раздел `hitLimit` (`:486-499`) — подтверждённый тайм-аут
  кэшируется.
- По желанию, если замер покажет цену: заголовок снимка (ключ, переменные,
  файлы, дерево) отдельно от тела с dry run и быстрый путь хэша дерева по
  `mtime` + размеру. Содержимое изменившихся файлов при этом сравнивается
  всегда.

## Инвариант: вердикты не меняются

Повтор по построению обязан дать ровно вердикты обычного тёплого прогона той же
сборки. Что проверять:

1. **Сценарии на фикстурах, A против B из одного состояния кэша.** Это
   `analysis/tools/perf-proto/check-dry-snapshot.sh` (16 сценариев Vitest, 6 —
   node:test). Ставится через
   `setup-fixture.sh vitest-units|node-units <каталог> <tgz>`, фикстуры
   `analysis/experiments/perf-fixtures/`. Если повтор включён по умолчанию,
   поправьте копию скрипта. Для A запускайте без `MOOTANT_REUSE_DRY_RUN=1`. Для
   B после `restore_state` удаляйте файл снимка (`rm -f "$CACHE"/dry-v*.json`):
   B — обычный тёплый прогон той же сборки. Строку `grep 'Reused the dry run'`
   замените на свою заметку. Добавьте сценарии `main`:
   - `--mutant` → полный прогон (шаг 2.1);
   - для шага 2.2: `test/fixtures/equivalence/hot` и бесконечный цикл. В
     `vitest-units` это `fill = ' '` → `''` в `pad`
     (`analysis/experiments/perf-fixtures/vitest-units/src/text.js:16`, на
     170ec52 — мутант `67sz`, BUG-752). Ожидается подтверждённый
     `Timeout(hit-limit)`. Если подтверждение кончится по таймеру, это тоже
     вердикт, но не кэшируемый: возьмите мутант с более быстрым циклом;
   - переменная конфига (2.5);
   - файл, созданный во время холодного прогона (2.7);
   - Jest — `test/fixtures/jest/cache` (трансформ) и `test/fixtures/jest/global`
     (teardown): без изменений, правка теста, новый тест, падающий teardown
     (2.4).

   Критерий: 0 расхождений `--strict`, и повтор случается ровно в сценариях
   «ничего не изменилось».
2. **Отрицательный контроль.** Это `analysis/tools/perf-proto/p3-negative-control.sh`
   (поправьте имя файла снимка и путь модуля хэша дерева в `dist/`). С
   подделанным `tree` повтор обязан дать устаревшие вердикты, без подделки —
   уйти на обычный путь. Оформите это и как тест в сьюте.
3. **Стенд.** Для каждого проекта и каждого прогона нового `m-cold`, `m-warm`,
   `m-edit-inc` (и `m-edit` cheerio) сравните его с `run-1.json` базового
   `m-cold`: 0 расхождений по статусу и убивающему файлу. Расхождения
   `--strict` допустимы только в `cause` Timeout-мутантов, и только если у самой
   базы `cause` различается между её прогонами (проверьте базу run-1 против
   run-2/3).
4. **Тест-сьют Mootant** — `pnpm test`.

Скрипт сравнения — аналог `analysis/tools/compare-verdicts.mjs`, формат сверен
с `cli/report/build-run-report.ts:87-121`, `:185` (поле `listed`) и проверен на
синтетических отчётах:

```js
// compare-verdicts.mjs <base.json> <new.json> [--strict]; отчёты `mootant run --json --all --verbose`
import { readFileSync } from 'node:fs'
let [baseFile, nextFile, flag] = process.argv.slice(2)
let strict = flag === '--strict'
function read(file) {
  let text = readFileSync(file, 'utf8')
  let report = JSON.parse(text.slice(text.indexOf('{')))
  if (!Array.isArray(report.mutants) || report.listed !== 'all') {
    throw new Error(`${file}: run mootant with --json --all --verbose`)
  }
  return new Map(report.mutants.map(mutant => [mutant.id, mutant]))
}
function verdict(mutant) {
  let by = mutant.killedBy ?? null
  let fields = [mutant.status, mutant.killedIn ?? by?.file ?? null]
  if (strict) fields.push(by === null ? null : `${by.name}:${by.line}`, mutant.cause ?? null)
  return JSON.stringify(fields)
}
let base = read(baseFile)
let next = read(nextFile)
let differences = 0
for (let id of new Set([...base.keys(), ...next.keys()])) {
  let left = base.has(id) ? verdict(base.get(id)) : 'missing'
  let right = next.has(id) ? verdict(next.get(id)) : 'missing'
  if (left !== right) {
    differences += 1
    let mutant = base.get(id) ?? next.get(id)
    console.log(`${id} ${mutant.file}:${mutant.line} ${left} -> ${right}`)
  }
}
console.log(`${base.size} / ${next.size} mutants, ${differences} differences`)
process.exitCode = differences === 0 ? 0 : 1
```

## Как измерить выигрыш

База — тот же `main` без изменения (точка ветвления), сборки — `pnpm pack`
обеих. Машина тихая: `uptime` < 0,5 перед стартом, никаких других тяжёлых
задач. Нужны Node.js 22.12+ (анализ: 22.23.4), pnpm 12 (pnpm 10 с этим
репозиторием не работает), hyperfine ≥ 1.18, `/usr/bin/time`, git, сеть до
GitHub и npm, ≥ 10 ГБ на диске.

Проекты стенда (`analysis/bench/projects/*/project.sh`; патчи копий —
`analysis/bench/README.md`, «Известные ограничения», п. 7):

| проект | SHA | раннер | `MUTATE` |
|---|---|---|---|
| cheeriojs/cheerio | `40d4365fc025ebc053e6c886c1dac3cf29a4bc61` | Vitest 5 (`npm ci`), выключен `typecheck` | `src/api/attributes.ts src/api/css.ts src/api/forms.ts` |
| fastify/fast-json-stringify | `ac1723c7073ab4e0ceca074ad214af742fa439fa` | `node --test` (`npm install --before=2026-11-03`), удалены 2 тест-файла | `lib/serializer.js lib/validator.js lib/standalone.js lib/location.js lib/merge-schemas.js` |
| pillarjs/path-to-regexp | `32292b9d13239c7fa3ed23e89c59c10264f9fe20` | Vitest 5.0.5 (`npm ci`), исключены 2 spec | `src/index.ts` |
| azat-io/eslint-plugin-perfectionist | `486c3c85239e78a24aba2ade212cdef6acba1829` | Vitest 5.0.5 (pnpm) | `rules/sort-switch-case.ts rules/sort-switch-case utils/compare` |

```bash
W=$HOME/perf-02 && mkdir -p "$W/tgz/base" "$W/tgz/new"      # $A из шага 0 подходит
git archive origin/analysis/2026-11 analysis/bench analysis/tools | tar -x -C "$W"
git worktree add --detach "$W/main" "$(git merge-base HEAD origin/main)"
(cd "$W/main" && pnpm install --frozen-lockfile && pnpm build && pnpm pack && mv mootant-*.tgz "$W/tgz/base/mootant.tgz")
git worktree remove --force "$W/main"
pnpm build && pnpm pack && mv mootant-*.tgz "$W/tgz/new/mootant.tgz" && rm -rf dist
export BENCH_PROJECTS=$W/bench MOOTANT_TGZ=$W/tgz/base/mootant.tgz
bash "$W/analysis/bench/setup.sh" cheerio fast-json-stringify path-to-regexp perfectionist
for build in base new; do              # 3 прогона на точку (BENCH_RUNS=3 по умолчанию)
  for p in cheerio fast-json-stringify path-to-regexp perfectionist; do
    # подменяет сборку, ставит mtime по хэшу tarball'а (штамп сборки в ключе кэша), сбрасывает кэш
    bash "$W/analysis/tools/perf-proto/use-mootant.sh" "$BENCH_PROJECTS/$p" "$W/tgz/$build/mootant.tgz"
    points=("$p:m-cold" "$p:m-warm" "$p:m-edit-inc"); [ "$p" = cheerio ] && points+=("$p:m-edit")
    MOOTANT_SHA=$build BENCH_RESULTS=$W/results/$build bash "$W/analysis/bench/run.sh" "${points[@]}"
  done
done
node "$W/analysis/bench/summarize.mjs" "$W/results/base" > "$W/results/base.md"   # wall из run-k.time
node "$W/analysis/bench/summarize.mjs" "$W/results/new" > "$W/results/new.md"
for f in "$W"/results/new/*/m-warm/run-*.json; do echo "$f $(node -p "JSON.stringify(require('$f').summary.runs)")"; done
```

Точки (`analysis/bench/run.sh`, `prepare/state.sh`). `m-cold` — пустой кэш,
`mootant run $MUTATE --concurrency 3 --json --all --verbose`; после точки кэш
вместе со снимком копируется в `$BENCH_RESULTS/snapshots`. `m-warm` — тот же
запуск на восстановленном кэше. `m-edit-inc` — тот же кэш плюс `edit.patch`
(правка одной функции без смены поведения) и `--incremental`. `m-edit` — то же
без `--incremental`. Стенд снимает `HYPERFINE_RANDOMIZED_ENVIRONMENT_OFFSET` и
держит один `TMPDIR` на проект (BUG-701). `m-one` не нужен: он идёт с
`--no-cache`. По длительностям окна выходит около 2 ч на сборку, из них
`m-cold` perfectionist ×3 — 48 мин; итого ~4 ч (оценка).

Что записать по каждой точке и сборке: GNU elapsed mean ± σ, медиану и min–max
(из `run-k.time`; ниже — короткий скрипт), CPU (user + sys), пик PSS (из
`summarize.mjs`), `summary.duration`, `summary.runs`, `summary.totalCached`,
заметку о повторе или причину отказа в `run-k.err`, размер файла снимка после
`m-cold`. Отдельно — цену хэша дерева на крупном дереве: 5 вызовов
`hashProjectTree` (или вашей функции) из собранного `dist/` на корне
perfectionist и на клоне Mootant.

```js
// time-summary.mjs <каталог точки>...: run-k.time из lib/measure-one.sh
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
for (let directory of process.argv.slice(2)) {
  let runs = readdirSync(directory).filter(name => /^run-\d+\.time$/u.test(name)).map(name =>
    Object.fromEntries(readFileSync(path.join(directory, name), 'utf8').trim().split('\n')
      .map(line => line.split('=')).map(([key, value]) => [key, Number(value)])))
  let elapsed = runs.map(run => run.elapsed).toSorted((a, b) => a - b)
  let n = elapsed.length
  let mean = elapsed.reduce((sum, value) => sum + value, 0) / n
  let sd = n > 1 ? Math.sqrt(elapsed.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0
  let median = n % 2 ? elapsed[(n - 1) / 2] : (elapsed[n / 2 - 1] + elapsed[n / 2]) / 2
  let cpu = runs.reduce((sum, run) => sum + run.user + run.sys, 0) / n
  console.log(`${directory}: n=${n} elapsed ${mean.toFixed(2)} ± ${sd.toFixed(2)} s (median ${median.toFixed(2)}, ${elapsed[0]}–${elapsed[n - 1]}), CPU ${cpu.toFixed(1)} s`)
}
```

Успех (медианы GNU elapsed, по 3 прогона):

- `m-warm`, cheerio и fast-json-stringify: новая сборка не меньше чем в 5 раз
  быстрее базы (на 170ec52 было ×9,3–10,1), и во всех 3 прогонах
  `summary.runs` = `{}` с заметкой о повторе. path-to-regexp — то же, если все
  его Timeout подтверждены как `hit-limit`; иначе запишите причину отказа.
  perfectionist — повтора не ждём (`time-limit`), но новая сборка не медленнее
  базы больше чем на max(1 с, 2 %).
- `m-cold` на всех четырёх: |Δ медианы| ≤ max(2 %, 2σ базы).
- `m-edit-inc` на всех четырёх и `m-edit` cheerio: не медленнее базы больше чем
  на max(1 с, 2 %). Это цена проверки устаревшего снимка.

## Риски и границы

- **Остаточные риски прототипа** (запишите в документацию):
  - недетерминированные тесты: время, случайность, сеть. Вне `--fast` dry run
    оставляет результаты повторного прогона упавшего тест-файла с
    предупреждением `unrepeatable-test` (`core/run/run-dry-phase.ts:153-156`),
    и повтор воспроизведёт и его, и покрытие того прогона. Решите, писать ли
    снимок после такого dry run;
  - файлы вне корня, которых не читал ни один тест-файл dry run (соседний пакет
    монорепо);
  - правка внутри `node_modules` без смены lockfile;
  - символические ссылки — по строке цели, без перехода;
  - global setup и teardown в повторе не запускаются.

  Их класс риска тот же, что уже принят для вердиктов кэша. Ослаблять хэш
  дерева нельзя: отрицательный контроль показывает устаревшие вердикты.
- **Новые для `main`** (шаг 2): ключ `--mutant`, неподтверждённый `hit-limit`,
  поздняя диагностика Jest, `cacheInputs` после isolated-раундов, переменные
  главного процесса, `UNKNOWN_HASH`, правки дерева во время прогона. Пункты 2.5
  и 2.7 — гипотезы по коду: сначала напишите падающий тест.
- **Цена.** Хэш дерева проекта с содержимым считается на каждом прогоне с кэшем,
  у которого совпали ключ, переменные и файлы. Монорепо, `dist/` и `coverage/`
  в корне могут съесть выигрыш. Снимок размером с dry run (покрытие каждой
  попытки) читается при каждом прогоне с кэшем. Меряйте на perfectionist.
- **BUG-701.** Тест, перечисляющий `process.env` (так делают ESLint RuleTester
  и запуск процессов), даёт `*`, и снимок устаревает от любой новой переменной.
  В CI у таких проектов повтора не будет, пока не исправлен BUG-701. Исправление
  должно попасть и в список переменных снимка.
- **Граница применимости.** Работает только сценарий «ничего не изменилось»:
  повторный прогон, CI с восстановленным кэшем, перепроверка без правок. После
  правки работает `--incremental` (×3,4–8,4 на 170ec52). Цикл агента
  (`--mutant` после нового теста) не ускоряется. Частичный повтор (dry run
  только изменившихся тест-файлов) — следующая задача, XL, здесь не делать.
- **Откат.** `--no-cache`, удаление `node_modules/.cache/mootant`, opt-in, если
  риск остаётся. После подъёма `CACHE_VERSION` первый прогон у пользователей
  холодный.

## Связанные промпты

- **PERF-08** (кэш и калибровка тайм-аутов, BUG-752) пересекается напрямую.
  Кэш подтверждённого `hit-limit` делается здесь, калибровка и `time-limit` —
  там. Если PERF-08 влит раньше, не дублируйте, а переиспользуйте его запись
  Timeout. `time-limit` не кэшировать нигде (BUG-204).
- **PERF-01** (`run.parallelUnits`). Если режим попадёт в ключ окружения кэша,
  повтор в другом режиме получит промах и уйдёт на обычный путь. dry run P1 не
  меняет.
- **PERF-03** (места тестов только в dry run, BUG-703): снимок хранит
  `tests[].line` из dry run, совместимо.
- **PERF-05** (кэш компиляции V8): каталог кэша держать вне хэшируемого дерева
  (под `node_modules/.cache`), иначе повтор не сработает никогда.
- **PERF-09** (порядок тест-файлов): если порядок начнёт зависеть от данных
  прошлых прогонов, это состояние должно входить в ключ снимка.
- **PERF-11** (отсев некомпилирующихся) и **PERF-12** (выборка) меняют набор
  хостящихся мутантов и через тексты переключённых файлов — ключ. У выборки
  нужен фиксированный seed, иначе повтор не совпадёт ни разу.
- **PERF-04, PERF-06, PERF-07, PERF-10** — без прямого пересечения: повтор
  ничего не запускает.
- Баги: BUG-752 (этот промпт его закрывает), BUG-753 (окружение до старта
  адаптера), BUG-701 и BUG-413 (`*`), BUG-204 (`time-limit`) — `analysis/02-bugs.md`,
  `analysis/bugs/perf-proto.md`, `analysis/bug-prompts/BUG-701.md`,
  `analysis/bug-prompts/BUG-204.md`.

## Критерий готовности

- **Тесты.**
  - Unit: `check-dry-snapshot` (каждая причина устаревания, `UNKNOWN_HASH`
    тоже); хэш дерева; список переменных или трекер главного процесса;
    чтение снимка (битый файл, другая версия → нет снимка); запись снимка —
    каждая причина «не сохранять» (нет зависимостей, нет `cacheInputs`, файл
    изменился во время прогона, файл дерева изменён во время прогона, ошибки,
    поздняя диагностика `close()`, `*`).
  - `create-run-cache`: `Timeout` только isolated и только `hit-limit`, batch не
    хранит. `apply-isolated-result`: `'confirming'` не записывается; если
    подтверждение дало `crash`, `time-limit`, ничего или юнит потерялся, слот
    пуст. `apply-cached-units`: кэшированный `Timeout` решает, как свежий.
  - `test/core/run-mutants.test.ts` (`describe('with the cache')`, `:1104`):
    повтор без старта адаптера (`fake.context` — null, `runs` — `{}`); новый
    файл в дереве → обычный путь; снимок `--mutant` полный прогон не
    проигрывает.
  - Интеграционные: `test/adapters/vitest/index.cache.test.ts` — без изменений
    раннер не стартует; `hot`; бесконечный цикл берётся из кэша; переменная
    конфига. `test/adapters/node-test/index.test.ts`;
    `test/adapters/jest/index.cache.test.ts` — без изменений раннер не
    стартует; ошибка teardown → снимка нет.
  - Отрицательный контроль (подделанное дерево → устаревший вердикт) — тест в
    сьюте.
- **Эквивалентность:** 0 расхождений вердиктов на фикстурах (все сценарии
  «Инварианта», `--strict`) и на стенде: 4 проекта × 3 прогона × (`m-cold`,
  `m-warm`, `m-edit-inc`) и `m-edit` cheerio против базового `m-cold`
  `run-1.json`.
- **Выигрыш:** пороги из «Как измерить выигрыш», не меньше 3 прогонов,
  mean ± σ и медиана GNU elapsed. Таблица база/новая сборка — в PR.
- `CACHE_VERSION` поднят, документация `cache` и `hitLimit` обновлена, имён
  прототипа в коде нет.
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`). Порог покрытия 100 % для
  `adapters/**`, `cli/**`, `core/**` (`vitest.config.ts:30-39`).

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс. Не ослабляй хэш дерева. Не кэшируй `time-limit`,
  `hang`, `crash`, `Error` и неподтверждённые тайм-ауты.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Форму `CacheInputs` (`types/adapter/cache-inputs.d.ts:5-29`) не меняй; опция
  `cache` остаётся `boolean` (`types/config/run-config.d.ts:73`). Новая
  настройка допустима только аддитивно, с типами, документацией и тестами.
- Скрипты из `analysis/` в репозиторий не копируй. Фикстуры клади только в
  `test/fixtures/**`.
- Падения тестов, не связанные с задачей: Unicode-тесты CLI при `TERM=linux`
  (`cli/terminal/is-unicode-supported.ts:13`; запускай с
  `TERM=xterm-256color`), «skips test files it cannot read» под root
  (`test/adapters/node-test/score-node-test.test.ts:98`), покрытие ветвей при
  заданном `NODE_OPTIONS` (`adapters/node-test/start-node-test-session.ts:119`,
  `:167`; запускай `env -u NODE_OPTIONS`).
- После `pnpm build` удаляй `dist/` перед `pnpm test`: `tsconfig.json:2-4` его
  не исключает, и на 170ec52 это давало ложные ошибки `test:astro`.
- Сообщения коммитов — Conventional Commits (commitlint).
