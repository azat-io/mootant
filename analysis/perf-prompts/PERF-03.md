# PERF-03: места тестов только в dry run (`includeTaskLocation`, BUG-703)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 3 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз — −15…−20 % CPU воркеров на файлах с
> большими таблицами тестов (path-to-regexp: снятие мест — 22,9 % CPU воркеров в
> профиле окна), там, где слоты не простаивают, — столько же wall; около нуля
> на perfectionist (1,5 %); не прототипировано и не измерено. Риск для
> вердиктов: низкий — id и порядок тестов от мест не зависят, строки отчёта
> берутся из dry run; оговорки — тесты, которые читают `task.location`, и запас
> бюджета `time-limit` (см. «Риски и границы»). Трудоёмкость: S–M. Прототип:
> нет; набросок правки — в «Что сделать» (к `main` применяется без конфликтов,
> не запускался). Тип: реализация. Замерено на коммите 170ec52; код сверен с
> `main` на bd7af11.

## Контекст

Адаптер Vitest гоняет тест-файл в трёх видах запусков: dry run (без мутанта,
снимает покрытие и сведения о тестах), batch (`--fast`) и isolated (один
мутант на юнит). Каждый юнит — свежий форк со своим графом модулей
(`adapters/vitest/configure-project.ts:46-48`). Юнит собирает тест-файл
целиком, то есть выполняет все определения `describe`/`it`, даже если потом
пропускает сами тесты после убийства мутанта
(`adapters/vitest/runner.ts:614-641`).

Mootant всегда включает места тестов: на уровне проекта —
`config.includeTaskLocation = true` (`adapters/vitest/configure-project.ts:55`,
вызов из хука плагина `adapters/vitest/create-mootant-plugin.ts:53-54`) и
опцией корня в `createVitest` (`adapters/vitest/start-vitest-session.ts:102`).
Оба места с 170ec52 не менялись (`git diff 170ec52 origin/main` по этим файлам
пуст). Vitest кладёт значение в конфиг воркера при старте каждого воркера.
Сначала берётся значение проекта, потом корня:
`node_modules/vitest/dist/chunks/index.Di8au7q4.js:4110`; сообщение старта
воркера — `:5287`.

Что Vitest с ним делает (сверено на Vitest 5.1.0 из `node_modules` `main`;
строки те же, что в `run.BPv-BBRv.js` Vitest 5.0.5, на котором сняты замеры):

- на каждое определение теста Vitest и так создаёт `Error` с
  `stackTraceLimit = 10` (для сообщения о тайм-ауте,
  `node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2698-2702`). С
  `runner.config.includeTaskLocation` он ещё читает `stack` этой ошибки и
  разбирает его (`findTestFileStackTrace`, `:2186-2197`; вызов — `:2703-2709`).
  Чтение `stack` запускает `Error.prepareStackTrace` модульного раннера Vite,
  а тот проводит каждый кадр через source map;
- на каждый `describe` ошибка создаётся и разбирается только при включённом
  флаге (`:2762-2771`, `stackTraceLimit = 15`);
- флаг читается из `runner.config` в момент сбора. Это тот же объект, что
  `this.config` раннера Mootant (`TestRunner`:
  `node_modules/vitest/dist/chunks/index.CZzC1gGg.js:8307-8308`; раннер для
  сбора — `run.CjdgFZiW.js:2577-2585`). Раннер создаётся до сбора: сначала
  `resolveTestRunner` (`base.Cof-UHJf.js:67-100`, `index.w_oBZ9N8.js:114-115`),
  потом `onBeforeCollect` и `collectTests` (`run.CjdgFZiW.js:4186-4211`).

Значит, цена платится в каждом юните и растёт с числом тестов и сьютов в файле
(`describe.each`/`it.each`). Нужна же она только dry run:

- раннер пишет строку теста во всех режимах
  (`adapters/vitest/runner.ts:1132-1141`, `line: test.location?.line ?? null` —
  `:1137`; на 170ec52 было `:1117`);
- читает её только dry run (`adapters/vitest/run-dry.ts:161`, на 170ec52 —
  `:160`) → `DryTest.line` (`types/adapter/dry-test.d.ts:7-10`) →
  `RunResult.tests` (`core/run-mutants.ts:578`). Из `DryTest` строятся
  `killedBy`, `test` и `coveredBy` отчёта (`cli/report/build-run-report.ts:84-86`,
  `:93`, `:107-109`, `:243-249`), порядок покрывающих тестов
  (`core/run/order-covering-tests.ts:29`, `:38`) и строки диагностик
  (`core/run-mutants.ts:637`, `core/run/run-dry-phase.ts:681`);
- batch и isolated берут из записи теста только `tries`
  (`adapters/vitest/build-isolated-facts.ts:28-30`,
  `adapters/vitest/run-batch.ts:41-42`);
- юниты выбирают тесты не по строкам: спецификация юнита — файл без строк
  (`adapters/vitest/run-plan.ts:66-68`, на 170ec52 — `:63-65`), тесты batch-юнита
  — по id (`adapters/vitest/runner.ts:561`, `:606-611`);
- id задачи Vitest от места не зависит: хэш пути файла, проекта и метки плюс
  индексы в дереве сьютов (`node_modules/vitest/dist/task-utils.js:130-153`,
  `:160-167`, `:179-184` на 5.1.0; на 5.0.5 — `:175-180`).

**Актуальность на `main` (bd7af11).** Задача не сделана: `includeTaskLocation`
включён так же, а в коде нет ни P1, ни P3 (`run.parallelUnits` и переменные
прототипов grep не находит). С 170ec52 сдвинулись только строки
(`runner.ts`, `run-dry.ts`, `run-plan.ts`; у `readOutFiles` новая сигнатура с
`StrayDecisions`), механизм тот же. Vitest в `main` — 5.1.0 (`package.json`
`^5.1.0`, peer `^5.0.0`), проекты стенда — на своих версиях из lockfile
(path-to-regexp и perfectionist — 5.0.5).

**Jest и node:test.** У Jest-адаптера (появился после 170ec52, bc6adec) есть
аналог: `testLocationInResults: true` всегда
(`adapters/jest/worker/wrap-project-config.ts:67`). По JSDoc одна копия конфига
служит и dry run, и юнитам (`:17-18`), копия кэшируется на план, и от неё
зависят трансформации Jest в памяти (`adapters/jest/worker/run-unit.ts:296-317`).
jest-circus 30.5.2 из `node_modules/.pnpm` `main` при этом флаге читает
`stack` ошибки каждого теста при сборке результата
(`jest-circus/build/jestAdapterInit.js:1890-1914`, включение — `:2187-2191`).
Строку теста Mootant читает только в dry run
(`adapters/jest/build-dry-file.ts:136`). Цена у Jest не мерилась: Jest-проекта
на стенде нет. Здесь его не трогать, это отдельная задача после профиля на
Jest-проекте. У node:test мест нет совсем (`line: null`,
`adapters/node-test/build-dry-file.ts:108`), его ускорение не касается.

## Доказательства

Условия окна (`analysis/04-performance.md` §4.1, §4.5.1): 4 vCPU Intel Xeon
2,1 GHz, 15 GB RAM, Node 22.23.4, Mootant 170ec52, Vitest 5.0.5 у
path-to-regexp и perfectionist, `--concurrency 3`, 3 прогона на точку,
эксклюзивное окно 2026-11-04 07:35–13:43 UTC. Wall у точек короче ~30 с —
elapsed GNU time, у длинных — hyperfine; CPU — user + sys дерева процессов из
GNU time.

**Измерено, профиль** (`analysis/bench/profile.sh <проект> run`, 13:40–13:43 UTC,
доли — от не-idle CPU, разбивка `analysis/bench/lib/cpuprofile-categories.mjs`;
§4.5.6):

| проект | что профилировалось | CPU воркеров (не-idle) | `findTestFileStackTrace`, инклюзивно | код тестов и проекта |
|---|---|---|---|---|
| path-to-regexp `32292b9d` | все 342 мутанта; 1 главный процесс и 326 профилей воркеров из 340; прогон под профилем 107 с против 93,3 с без него | 135,45 с | 31,01 с — **22,9 %** | 7,6 % self (в §4.5.6 — «8 %») |
| perfectionist `486c3c85` | `rules/sort-switch-case/`, 21 мутант, один тест-файл, 21 профиль воркера, 41 с | 39,38 с | 0,59 с — 1,5 % | 47,6 % self (в §4.5.6 — «48 %») |

Добавлено при подготовке промпта по тем же профилям окна (они остались на машине
анализа, в ветку не вошли), скриптом в духе `cpuprofile-categories.mjs`:

- 31,01 с на path-to-regexp делятся почти поровну: тесты (`task`) — 16,40 с,
  сьюты (`initSuite`, `describe.each` файла) — 14,61 с. На один профиль
  воркера — медиана 90,1 мс (min 58,0, max 219,8 мс). У perfectionist —
  медиана 26,4 мс на воркер;
- `collect` (сбор файла) на path-to-regexp — 40,51 с инклюзивно, из них
  28,56 с — снятие мест; ещё 2,44 с мест снимается при импорте файла, вне
  `collect` (сьюты верхнего уровня). И то и другое — внутри загрузки юнита;
- в топе self-времени воркеров path-to-regexp — `parseSingleV8Stack`
  (`source-map` Vitest) 4,06 с, `prepareStackTrace` и `wrapCallSite`
  (`vite/dist/node/module-runner.js`) 3,32 и 2,90 с, `task` 2,27 с,
  `extractLocation` и `tryDecode` по 1,20 с, `findTestFileStackTrace` 1,18 с
  self. Это стек и source map, а не код тестов.

**Измерено, стоимость юнита** (§4.5.3, медианы 3 прогонов). path-to-regexp: 339
юнитов одного тест-файла, 425 тестов. На юнит: 0,38 с со стартом процесса,
старт — 143 мс, загрузка — 151 мс, тесты — 71 мс. Раунд 1 — одна цепочка из
339 юнитов, 89,1–92,5 с; занятость слотов — 31 %, ожидание очереди файла — 51 %.
Обычный `vitest run` path-to-regexp — Duration 0,36 с: tests 58 %, import 23 %,
transform 15 % (§4.5.6). Места там выключены: конфиг проекта их не включает, а
репортёр — `default`.

**Измерено, база для сравнения** (GNU elapsed, mean ± σ, §4.5.4; CPU ± σ —
посчитано при подготовке промпта по сырым `run-k.time` окна, в ветку они не
вошли):

| проект | `m-cold`, с | CPU `m-cold`, с | `m-fast`, с | CPU `m-fast`, с |
|---|---|---|---|---|
| path-to-regexp | 93,3 ± 1,6 (hyperfine 93,9 ± 1,5, медиана 94,2) | 177,6 ± 3,4 | 24,8 ± 0,9 | 38,0 ± 1,4 |
| cheerio `40d4365f` | 164,1 ± 1,7 | 362,8 ± 3,9 | 65,7 ± 0,1 | 164,4 ± 1,0 |
| perfectionist | 952,0 ± 40,5 | 2437 ± 99 | 953,1 ± 10,0 | 2525 ± 25 |

С P1 (`analysis/experiments/perf-parallel-units.diff`, не в `main`) у
path-to-regexp wall 53,5 ± 1,2 с (hyperfine), CPU 178 → 172 с, занятость
слотов 31 → 67 % (§4.5.5).

**Прогноз анализа** (§4.4, ранг 3): −15…−20 % CPU воркеров на файлах с
большими таблицами тестов (path-to-regexp). Там, где слоты не простаивают
(после P1), — столько же wall. Около нуля на perfectionist. Почему прогноз ниже
доли 22,9 %, в источниках не расписано. Возможная причина (не проверялась):
разовая часть цены — декодирование source map при первом форматировании стека
(`tryDecode`, `decode`) — останется у юнитов, где падает проверка и Vitest
форматирует стек ошибки.

**Оценка этого промпта** (не замер; анализ её не делал). Без P1 на
path-to-regexp юнит начинает загрузку только после конца предыдущего юнита
файла (`adapters/vitest/worker/wait-for-turn.ts:32-49`, вызов —
`adapters/vitest/runner.ts:544-545`). Места снимаются при сборе, внутри
`loadDuration` (от `:545` до `onCollected`, `:588`). Значит, они лежат на
критическом пути цепочки. Медиана 90 мс на воркер снята под профилировщиком,
который замедлил прогон в 1,15 раза (107 с против 93,3 с). Без него это около
78 мс на юнит × 339 юнитов ≈ 26 с из 93 с, то есть до −28 % wall уже без P1.
С этим согласуется разница загрузки юнита под Mootant (151 мс) и импорта в
обычном прогоне без мест (23 % от 0,36 с ≈ 83 мс). Это верхняя граница, а не
порог успеха.

**Не измерено:** профиль cheerio (в окно не вошёл; у cheerio 836 тестов на 15
тест-файлов, по §4.2 — в среднем ~56 на файл против 425 в одном файле у
path-to-regexp); всё после изменения; Jest.

## Что сделать

1. Возьмите материалы анализа: в `main` каталога `analysis/` нет. Пути ниже
   проверены `git cat-file -e` на `origin/analysis/2026-11`.

   ```bash
   W=$HOME/perf03; A=$W/analysis; REPO=$(git rev-parse --show-toplevel); mkdir -p "$W"
   git -C "$REPO" fetch origin analysis/2026-11
   git -C "$REPO" archive origin/analysis/2026-11 analysis/bench analysis/tools | tar -x -C "$W"
   git -C "$REPO" show origin/analysis/2026-11:analysis/04-performance.md >"$W/04-performance.md"
   git -C "$REPO" show origin/analysis/2026-11:analysis/bugs/perf.md >"$W/bugs-perf.md"
   ```

   В `$A/bench/README.md` — стенд (проекты, SHA, патчи, точки). В
   `$A/bench/lib/cpuprofile-categories.mjs` — разбивка профиля. В
   `$A/tools/perf-proto/use-mootant.sh` — подмена сборки в проекте стенда. В
   `$A/tools/compare-verdicts.mjs` — сравнение вердиктов.

2. Базовый tarball собирается из нетронутого `main` в отдельном worktree (см.
   «Как измерить выигрыш», шаг 1), так что правки в клоне ему не мешают.

3. Правка (рекомендуется вариант «места — в dry run всегда, в юнитах — как
   настроил пользователь»):
   - в конструкторе раннера (`adapters/vitest/runner.ts:475-479`, режим уже
     известен из `injectValue('mootant')`) при `mode === 'dry'` ставить
     `this.config.includeTaskLocation = true`. Прецедент правки конфига воркера —
     `this.config.hookTimeout` (`:556`, `:565`);
   - убрать принудительное включение в главном процессе:
     `adapters/vitest/configure-project.ts:55` и
     `adapters/vitest/start-vitest-session.ts:102`. Тогда batch- и
     isolated-юниты видят собственную настройку проекта, как обычный прогон
     (по умолчанию она выключена). А если пользователь сам включил
     `includeTaskLocation`, юниты по-прежнему его получают, и его тесты, если
     они читают `task.location`, ведут себя как раньше;
   - обновить JSDoc конструктора и `configureProject` (`:15`, «test locations
     are recorded»).

Набросок правки (не запускался; `git apply --check` на bd7af11 проходит, в том
числе с обрезанными пробелами в конце строк). Сохраните блок `diff` как есть в
`$W/perf-03.diff` и примените:

```diff
--- a/adapters/vitest/configure-project.ts
+++ b/adapters/vitest/configure-project.ts
@@ -12,9 +12,10 @@
  * no shuffled tests, so runs follow the dry run's order (concurrency, retries
  * and repeats stay; the runner makes tests sequential where it switches mutants
  * between tries); snapshots are never written; transformed modules are not
- * cached on disk; test locations are recorded. Changing the pool or isolation
- * adds a `config-overridden` warning. An unsupported setting is recorded as the
- * session error instead. Typecheck-only projects are left alone.
+ * cached on disk. Test locations keep the project's setting: the runner records
+ * them in dry runs. Changing the pool or isolation adds a `config-overridden`
+ * warning. An unsupported setting is recorded as the session error instead.
+ * Typecheck-only projects are left alone.
  *
  * @param project - Vitest project as resolved from the user's configuration.
  * @param state - Session state that receives warnings and errors.
@@ -52,7 +53,6 @@
   project.globalConfig.snapshotOptions.updateSnapshot = 'none'
   project.vitest.snapshot.options.updateSnapshot = 'none'
   config.fsModuleCache = false
-  config.includeTaskLocation = true
 }
 
 /**
--- a/adapters/vitest/runner.ts
+++ b/adapters/vitest/runner.ts
@@ -468,7 +468,10 @@
    * records the worker's process id, so the main process waits until the worker
    * is gone, and moves the end of the unit to the end of the worker's teardown,
    * after the test environment's teardown, whose error fails the unit like a
-   * failed suite hook.
+   * failed suite hook. A dry run records the location of every test before the
+   * file is collected, as the report gives the line of each test; batch and
+   * isolated runs keep the project's own setting, as a plain run does, since
+   * Vitest finds each location in a stack trace mapped through source maps.
    *
    * @param config - Serialized configuration of the project.
    */
@@ -477,6 +480,9 @@
     this.options = this.injectValue('mootant') as VitestWorkerOptions
     let { directory, repeat, mode } = this.options
     this.sequential = mode === 'batch' || (mode === 'dry' && repeat)
+    if (mode === 'dry') {
+      this.config.includeTaskLocation = true
+    }
     this.beatFile = path.join(directory, 'beat', `${process.pid}.json`)
     closeSync(
       openSync(path.join(directory, 'worker', String(process.pid)), 'w'),
--- a/adapters/vitest/start-vitest-session.ts
+++ b/adapters/vitest/start-vitest-session.ts
@@ -99,7 +99,6 @@
           []
         : [createOutputReporter(onOutput, () => instance)],
       coverage: { enabled: false },
-      includeTaskLocation: true,
       passWithNoTests: true,
       fsModuleCache: false,
       watch: false,
--- a/test/adapters/vitest/configure-project.test.ts
+++ b/test/adapters/vitest/configure-project.test.ts
@@ -42,7 +42,7 @@
       sequence: { concurrent: true, shuffle: false },
       snapshotOptions: { updateSnapshot: 'none' },
       runner: '/mootant/runner.ts',
-      includeTaskLocation: true,
+      includeTaskLocation: false,
       poolRunner: state.pool,
       pool: 'mootant-forks',
       fsModuleCache: false,
--- a/test/adapters/vitest/runner.test.ts
+++ b/test/adapters/vitest/runner.test.ts
@@ -969,6 +969,19 @@
     expect(tests[1]!.mode).toBe('skip')
   })
 
+  it('records test locations in a dry run and keeps the setting elsewhere', () => {
+    let modes = (['dry', 'batch', 'isolated'] as const).map(mode => {
+      setOptions(mode)
+      return [mode, createRunner().config.includeTaskLocation]
+    })
+
+    expect(modes).toStrictEqual([
+      ['dry', true],
+      ['batch', undefined],
+      ['isolated', undefined],
+    ])
+  })
+
   it('claims the unit planned for the project of the file', async () => {
     setOptions('batch')
     writeBatchPlan(
--- a/test/adapters/vitest/start-vitest-session.test.ts
+++ b/test/adapters/vitest/start-vitest-session.test.ts
@@ -138,7 +138,6 @@
 
     expect(options).toStrictEqual({
       coverage: { enabled: false },
-      includeTaskLocation: true,
       passWithNoTests: true,
       fsModuleCache: false,
       root: '/project',
```

```bash
git apply --check "$W/perf-03.diff" && git apply "$W/perf-03.diff"
```

В `test/adapters/vitest/runner.test.ts` помощники `createRunner` (`:241-261`;
фейковый конфиг без `includeTaskLocation`) и `setOptions` (`:548-556`) уже
есть. ESLint, prettier и cspell на наброске не запускались.

4. Тест на настройку пользователя (желательно: без него тесты не отличат
   рекомендуемый вариант от варианта «выключать в юнитах всегда»). Фикстура
   `test/fixtures/task-location/` с `vitest.config.ts`
   (`include: ['test/**/*.test.ts']`, `includeTaskLocation: true`),
   `src/sum.ts` (`return left + right`) и тестом, который доходит до мутантов,
   но проверяет только место:

   ```ts
   it('knows where it stands', ({ task }) => {
     sum(1, 2)
     expect(task.location?.line).toBe(5)
   })
   ```

   Тест в `test/adapters/vitest/index.test.ts` по образцу
   «runs every mutant of a project isolated by default» (`:133-182`:
   `runMutants` с `createBuiltIns('vitest', vitestAdapter())`, `cache: false`).
   Ожидание: все мутанты `sum` — `Survived`. Если юниты выключают места
   безусловно, проверка падает после достижения мутанта, и мутанты получают
   ложный `Killed`. Строку 5 сверьте при написании: в анализе это не
   запускалось.

5. Варианты, которые не рекомендуются:
   - **«выключать в юнитах всегда»**: `if (mode !== 'dry')
     this.config.includeTaskLocation = false`, а главный процесс не трогать.
     Это три строки, но тест пользователя, который включил места и читает
     `task.location`, начнёт падать в юнитах (ложный `Killed`, см. п. 4);
   - **переключать флаг проекта в главном процессе на время запуска**
     (`project.config.includeTaskLocation = mode === 'dry'` в
     `adapters/vitest/run-specifications.ts:29-49`). Это держится на том, что
     Vitest 5.1.0 сериализует конфиг заново при каждом старте воркера
     (`index.Di8au7q4.js:6572-6574`, `:6762-6767` — с пометкой «TODO:
     serialize the config _once_»). Кроме того, флаг надо выставлять каждому
     проекту и возвращать перед dry run (`??` с корнем, `:4110`). Хрупко.

## Инвариант: вердикты не меняются

Что должно остаться тем же: у каждого id мутанта — `status`, `killedIn`,
`killedBy` (файл, имя и **строка** убивающего теста), `cause`, `test`,
`coveredBy` (в том же порядке и с теми же строками), `testFiles`; диагностики со
строками; `summary.totalMutants` и `summary.totalTests`. В `--fast` часть этих
полей меняется и между прогонами базы (п. 3). Строки в отчёте берутся из dry
run, так что их пропажа (например, если переопределение в воркере перестало
работать) и есть главный отказ, который надо поймать.

1. **Тесты Mootant.** Без смены ожиданий проходят
   `test/adapters/vitest/index.test.ts:371-388` (dry run настоящего Vitest:
   `line: 9` у теста `spins` — после правки строка приходит только из
   переопределения в воркере) и
   `test/adapters/vitest/index.equivalence.test.ts:195` (вердикты против
   мутантов, применённых руками, в обычном и `--fast` режимах). Плюс новые
   тесты из шагов 3–4.
2. **Стенд, база против изменения на одном `main`.** Точки `m-cold` на
   path-to-regexp, cheerio и perfectionist и `m-fast` (batch-путь тоже меняется)
   на path-to-regexp и cheerio, по 3 прогона на сборку (команды — в «Как
   измерить выигрыш»). Каждый прогон изменения сравните с прогоном 1 базы. Для
   оценки шума сравните и прогоны 2–3 базы с прогоном 1. Скрипт ниже
   самодостаточен. Формат отчёта сверен с `cli/report/build-run-report.ts:69-198`
   и `types/report/run-report.d.ts` на `main`. Скрипт проверен на
   синтетических отчётах (равные → 0, потерянная строка `killedBy` → 1, неполный
   отчёт → 2) и на отчётах окна: у `m-cold` прогоны 2 и 3 против прогона 1
   эквивалентны на всех трёх проектах, у path-to-regexp строки есть у 4574 из
   4574 упомянутых тестов.

```js
// compare-reports.mjs <base.json> <change.json>: two `mootant run --json --all --verbose`
// reports, mutant by mutant. Exit code: 0 equal, 1 different, 2 bad input.
import { readFileSync } from 'node:fs'

let files = process.argv.slice(2)
if (files.length !== 2) {
  console.error('usage: node compare-reports.mjs <base.json> <change.json>')
  process.exit(2)
}
let read = file => {
  let report = JSON.parse(readFileSync(file, 'utf8'))
  let problem =
    report.command !== 'run' || !Array.isArray(report.mutants) ? 'not a run report'
    : report.listed !== 'all' ? 'run with --all'
    : !('killedBy' in (report.mutants[0] ?? { killedBy: null })) ? 'run with --json --verbose'
    : null
  if (problem) {
    console.error(`${file}: ${problem}`)
    process.exit(2)
  }
  return report
}
let test = entry => (entry ? `${entry.file} > ${entry.name} :${entry.line}` : null)
let verdict = mutant => ({
  status: mutant.status,
  killedIn: mutant.killedIn,
  killedBy: test(mutant.killedBy),
  cause: mutant.cause,
  test: test(mutant.test),
  coveredBy: mutant.coveredBy === null ? null : mutant.coveredBy.map(test),
  testFiles: mutant.testFiles,
})
let [base, change] = files.map(read)
let left = new Map(base.mutants.map(mutant => [mutant.id, mutant]))
let right = new Map(change.mutants.map(mutant => [mutant.id, mutant]))
let differences = []
for (let id of new Set([...left.keys(), ...right.keys()])) {
  let [a, b] = [left.get(id), right.get(id)]
  if (!a || !b) {
    differences.push(`${id}: only in ${a ? 'base' : 'change'}`)
    continue
  }
  let [va, vb] = [verdict(a), verdict(b)]
  for (let field of Object.keys(va)) {
    let [x, y] = [JSON.stringify(va[field]), JSON.stringify(vb[field])]
    if (x !== y) differences.push(`${id} ${a.file}:${a.line} ${field}: ${x} -> ${y}`)
  }
}
let diagnostics = report =>
  report.diagnostics.map(d => `${d.code} ${d.file}:${d.line} ${d.message}`).toSorted()
if (JSON.stringify(diagnostics(base)) !== JSON.stringify(diagnostics(change))) {
  differences.push(`diagnostics: ${JSON.stringify(diagnostics(base))} -> ${JSON.stringify(diagnostics(change))}`)
}
for (let key of ['totalMutants', 'totalTests']) {
  if (base.summary[key] !== change.summary[key]) {
    differences.push(`summary.${key}: ${base.summary[key]} -> ${change.summary[key]}`)
  }
}
let lines = report => {
  let named = report.mutants.flatMap(m => [m.killedBy, m.test, ...(m.coveredBy ?? [])]).filter(Boolean)
  return `${named.filter(t => t.line !== null).length} of ${named.length}`
}
console.log(`mutants: base ${base.mutants.length}, change ${change.mutants.length}`)
console.log(`reported tests with a line: base ${lines(base)}, change ${lines(change)}`)
for (let line of differences) console.log(line)
console.log(differences.length === 0 ? 'EQUIVALENT' : `DIFFERENT: ${differences.length}`)
process.exitCode = differences.length === 0 ? 0 : 1
```

```bash
# сохраните скрипт как "$W/compare-reports.mjs" (вне клона)
for t in path-to-regexp/m-cold path-to-regexp/m-fast cheerio/m-cold cheerio/m-fast perfectionist/m-cold; do
  B=$W/results/base/$t X=$W/results/change/$t
  [ -f "$B/run-1.json" ] || continue
  echo "== $t"
  for k in 2 3; do node "$W/compare-reports.mjs" "$B/run-1.json" "$B/run-$k.json" | tail -n 1; done
  for k in 1 2 3; do node "$W/compare-reports.mjs" "$B/run-1.json" "$X/run-$k.json" | sed -n 2p; done
  for k in 1 2 3; do node "$W/compare-reports.mjs" "$B/run-1.json" "$X/run-$k.json" | tail -n 1; done
  for k in 1 2 3; do  # для m-fast: только статусы, см. п. 3
    node "$A/tools/compare-verdicts.mjs" "$B/run-1.json" "$X/run-$k.json" --status-only --label base,change | sed -n 3p
  done
done
```

3. **Как читать.**
   - Строка «reported tests with a line» у изменения должна совпадать с базой и
     быть больше нуля. Если строк стало меньше, dry run потерял места: это
     блокер в любом режиме.
   - `m-cold` (isolated): база сама с собой эквивалентна (так было в окне на
     всех трёх проектах), поэтому любое `DIFFERENT` у изменения — блокер.
   - `m-fast` (batch): `killedBy`, `killedIn` и `test` меняются уже между
     прогонами базы. В окне (170ec52, посчитано при подготовке промпта по сырым
     отчётам, в ветку они не вошли) прогоны 2 и 3 против прогона 1 давали на
     cheerio 117–130 расхождений `killedBy` и 13–33 `killedIn`, на path-to-regexp
     — 114–146 `killedBy` и 41–78 `test`. Здесь сравнивайте статусы
     (`--status-only`). Мутант, который расходится с базой, допустим только если
     он расходится и между прогонами базы. Известный пример 170ec52: на cheerio
     `unary-operator` в `src/api/attributes.ts:1068` (`2pagajpamh39`; на `main`
     id может быть другим) — `Timeout` (`hit-limit`) или `Killed` (§4.5.4).
     Строки тестов в отчёте `m-fast` всё равно проверяйте по первому пункту.
   - Шум базы записывайте и разбирайте, а не списывайте молча.
4. **Тайм-ауты по времени.** Бюджет юнита считается по dry run: загрузка плюс
   попытки тестов (`core/run/read-dry-run.ts:44-47`,
   `core/run/get-test-file-limits.ts:16-40`). Места в dry run остаются, а юнит
   их больше не платит, поэтому запас бюджета чуть растёт (BUG-204: бюджет
   `3 × длительность + 250 мс`). Отдельно выпишите мутанты с `cause`
   `time-limit` и `hang` в базе и в изменении: у них должны быть те же id и
   статусы. На 170ec52 такие были только у perfectionist: два, юниты по 16–33 с
   при обычных ~3 с, то есть далеко от границы.

```bash
node -e 'for (let f of process.argv.slice(1)) { let { mutants } = JSON.parse(require("fs").readFileSync(f, "utf8"));
  console.log(f, mutants.filter(m => m.cause === "time-limit" || m.cause === "hang").map(m => `${m.id}:${m.status}`).join(" ") || "-") }' \
  "$W"/results/*/*/m-cold/run-*.json
```

## Как измерить выигрыш

Тихая машина: ничего тяжёлого параллельно, `uptime` перед точкой меньше ~0,5;
точку с load average выше ~1,5 на старте перезапустите. Запишите `nproc`,
модель CPU, RAM, `node -v`, `pnpm -v`, `hyperfine --version`. Нужны hyperfine,
`/usr/bin/time`, pnpm 12 (`pnpm-workspace.yaml:1-2` — `configDependencies`;
pnpm 10 их не читает), доступ к GitHub и npm. На 4 vCPU держите
`--concurrency 3`, как в анализе (точки `run.sh` его и задают).

```bash
# W, A, REPO — из шага 1 «Что сделать»
# 1. Две сборки одной версии (0.1.0): база — main без изменения, изменение — ваша ветка.
#    dist/ в git нет, prepack нет.
git -C "$REPO" worktree add "$W/base-src" "$(git -C "$REPO" merge-base HEAD origin/main)"
(cd "$W/base-src" && pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination "$W") \
  && mv "$W"/mootant-*.tgz "$W/base.tgz"
(cd "$REPO" && pnpm build && pnpm pack --pack-destination "$W" && rm -rf dist) \
  && mv "$W"/mootant-*.tgz "$W/change.tgz"
# 2. Проекты стенда: те же SHA, патчи и lockfile, что в анализе (ставит и Stryker,
#    он здесь не нужен).
export BENCH_PROJECTS=$W/projects
BENCH_RESULTS=$W/results/setup MOOTANT_TGZ=$W/base.tgz \
  bash "$A/bench/setup.sh" path-to-regexp cheerio perfectionist
# 3. Точки run.sh (холодный кэш через prepare/state.sh clean, отчёт --json --all --verbose,
#    GNU time и PSS через lib/measure-one.sh), база и изменение по очереди.
for target in path-to-regexp:m-cold path-to-regexp:m-fast cheerio:m-cold cheerio:m-fast perfectionist:m-cold; do
  for build in base change; do
    bash "$A/tools/perf-proto/use-mootant.sh" "$BENCH_PROJECTS/${target%%:*}" "$W/$build.tgz"
    uptime
    BENCH_RESULTS=$W/results/$build MOOTANT_TGZ=$W/$build.tgz MOOTANT_SHA=$build \
      bash "$A/bench/run.sh" --runs 3 "$target"
  done
done
for build in base change; do
  node "$A/bench/summarize.mjs" "$W/results/$build" >"$W/results/$build/summary.md"
done
# 4. Профиль до и после (не замер времени: профилировщик замедляет на 5–15 %).
for build in base change; do
  bash "$A/tools/perf-proto/use-mootant.sh" "$BENCH_PROJECTS/path-to-regexp" "$W/$build.tgz"
  BENCH_RESULTS=$W/results/$build bash "$A/bench/profile.sh" path-to-regexp run
  node "$A/bench/lib/cpuprofile-categories.mjs" "$W/results/$build/profiles/path-to-regexp/run/workers" \
    | tee "$W/results/$build/categories.txt"
done
```

- `use-mootant.sh` кладёт tarball поверх `node_modules/mootant` и задаёт файлам
  `mtime` по хэшу tarball. Поэтому две сборки не делят кэш: штамп сборки входит
  в ключ (`core/cache/prepare-run-cache.ts:226`).
- `measure-one.sh` пишет на прогон `run-k.json`, `run-k.time`, `run-k.mem.json`
  и трассу юнитов `run-k.units.json`. Трассировщик сверен с рабочим каталогом
  170ec52. Если на `main` трасса пустая или ломает прогон, запускайте с
  `BENCH_TRACE=0`. Когда трасса работает, столбец «загрузка / юнит» в
  `summary.md` — прямая мера эффекта: на path-to-regexp он должен упасть с ~151
  мс (по оценке выше — на десятки мс).
- Время по 170ec52 (§4.5.4): path-to-regexp — около 10 мин на `m-cold` обеих
  сборок и 3 мин на `m-fast`; cheerio — около 17 и 7 мин; perfectionist — около
  1,6 ч на `m-cold` обеих сборок. Если времени нет, perfectionist снимите по
  одному прогону на сборку (только вердикты) или на подмножестве
  `BENCH_SUBSET=1` (`rules/sort-switch-case`, 21 мутант) и скажите об этом в
  отчёте. Числа мутантов на `main` могут отличаться от 342 / 496 / 314: за 37
  коммитов менялись мутаторы и правила пропуска. Сравнивайте только базу
  `main` с изменением.
- Если P1 (PERF-01) к этому времени уже в `main`, снимите `m-cold`
  path-to-regexp и с ним: там прогноз анализа «столько же wall, сколько CPU»
  проверяется напрямую.

**Что записать:** по каждой точке и сборке — wall (GNU elapsed: mean ± σ и
медиана; hyperfine — из `hyperfine.json`), CPU (user + sys), пик PSS дерева и
RSS и фазы `summary.duration` (медианы — в `summary.md`); из профиля — CPU
воркеров (не-idle) и `findTestFileStackTrace` в секундах и процентах; load
average до и после. `summary.md` даёт по CPU только медиану, mean ± σ по
`run-k.time` считает такой однострочник (на данных окна он воспроизводит
93,31 ± 1,63 с и 177,56 ± 3,44 CPU-с у path-to-regexp `m-cold`):

```bash
node -e 'let fs = require("fs"), path = require("path")
for (let dir of process.argv.slice(1)) {
  let runs = fs.readdirSync(dir).filter(f => /^run-\d+\.time$/.test(f)).map(f => Object.fromEntries(
    fs.readFileSync(path.join(dir, f), "utf8").trim().split("\n").map(l => l.split("=")).map(([k, v]) => [k, Number(v)])))
  let stat = xs => { let m = xs.reduce((a, b) => a + b, 0) / xs.length
    let s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); return `${m.toFixed(2)} ± ${s.toFixed(2)}` }
  console.log(dir, "runs", runs.length, "elapsed", stat(runs.map(r => r.elapsed)), "cpu", stat(runs.map(r => r.user + r.sys)))
}' "$W"/results/{base,change}/*/m-*
```

**Порог успеха** (рекомендация этого промпта):

- профиль path-to-regexp: у изменения `findTestFileStackTrace` в воркерах не
  больше 1 % не-idle CPU (места снимает только воркер dry run). В базе на
  170ec52 было 22,9 %; на `main` запишите своё число;
- path-to-regexp `m-cold`: CPU изменения хотя бы на 10 % ниже базы (среднее
  трёх прогонов; интервалы mean ± σ не пересекаются; на 170ec52 σ CPU — 1,9 %);
  wall не хуже базы по медиане. Падение wall по оценке выше (до −28 %)
  желательно, но порогом не является;
- cheerio `m-cold` и `m-fast`: CPU и wall не хуже базы больше чем на 3 %;
  path-to-regexp `m-fast` и perfectionist `m-cold` — не больше чем на 5 %.
  σ/mean по GNU elapsed на 170ec52 (§4.5.1): `m-cold` — 1,1–2,3 %, у
  perfectionist — 4,3 %; `m-fast` — 0,2 % у cheerio и 3,6 % у path-to-regexp;
- вердикты — 0 расхождений (см. «Инвариант»).

Если CPU path-to-regexp упал меньше чем на 10 %, это не повод подгонять код.
Разберите профиль: снимаются ли места в юнитах, сколько стоит разовое
декодирование source map. Опишите результат как есть.

## Риски и границы

- **Тест читает `task.location`.** Рекомендуемый вариант оставляет юнитам
  настройку пользователя, поэтому тот, кто включил места, получает их, как в
  обычном прогоне. Остаётся граница: Vitest сам включает места в UI-режиме и с
  репортёром `html` (`index.Di8au7q4.js:9165-9168`, `:9182-9186`). Под Mootant
  репортёры заменены (`adapters/vitest/start-vitest-session.ts:97-100`), так
  что такой автоматический случай юниты не увидят. Это важно только тестам,
  которые читают `task.location`; опишите это в JSDoc и в PR.
- **Запас бюджета `time-limit`** (см. «Инвариант», п. 4). `hit-limit` считается
  по срабатываниям сайтов и от скорости не зависит
  (`core/run/get-try-limits.ts:26`).
- **Будущий Vitest.** Если Vitest перестанет читать флаг из `runner.config` в
  момент сбора, переопределение в dry run молча перестанет работать: строки в
  отчёте станут `null`, а порядок `coveredBy` изменится. Ловит это интеграционный
  тест `test/adapters/vitest/index.test.ts:387` (`line: 9`). Поддерживается
  только Vitest 5 (`adapters/vitest/start-vitest-session.ts:57-64`, peer
  `^5.0.0`); механизм сверен на 5.0.5 и 5.1.0.
- **Что не меняется:** аннотации и артефакты Vitest снимают стек сами
  (`recordArtifact`, `run.CjdgFZiW.js:3101-3110`). Ключ кэша `includeTaskLocation`
  не содержит (`adapters/vitest/get-cache-inputs.ts:62-120`), а файл конфига
  проекта и так входит во входы кэша. Поэтому `CACHE_VERSION`
  (`core/cache/cache-version.ts:6`) поднимать не нужно. Формат отчёта (`line`
  из dry run) тот же, публичный API и конфиг не меняются.
- **Откат** — revert одного небольшого коммита. Opt-in не нужен: вердикты по
  коду не меняются, а стенд это проверяет.
- Возможен побочный выигрыш в главном процессе: без `location` у 425 задач на
  юнит меньше данных в IPC с воркерами (2,7 с CPU на path-to-regexp, §4.5.6).
  Это не измерялось.

## Связанные промпты

- **PERF-01** (P1, `run.parallelUnits`). Кода не делят. После P1 слоты заняты на
  67–69 %, и сэкономленный CPU воркеров переходит в wall (прогноз анализа). Без
  P1 на path-to-regexp экономия лежит на критическом пути цепочки (оценка выше).
  Мерить каждую задачу на своей базе; если P1 уже в `main`, снять точку и с ним.
- **PERF-02** (P3, полный кэш без раннера). В тёплом прогоне без правок раннер
  не стартует, и PERF-03 там ни при чём; в холодном прогоне и после правок
  ускорения складываются.
- **PERF-04** (префорк) и **PERF-05** (кэш компиляции V8) тоже режут стоимость
  юнита: старт процесса и компиляцию модулей, а PERF-03 — сбор файла.
  Не мерить в одной паре база/изменение: вклады не разделить.
- **PERF-08** (кэш и калибровка тайм-аутов, BUG-752). Калибровка бюджетов
  должна учитывать, что загрузка в dry run включает снятие мест, а юниты его
  больше не платят.
- **PERF-09** (порядок тест-файлов) может законно менять `killedBy`. Не
  совмещать с PERF-03: здесь `killedBy` обязан остаться тем же.
- **PERF-10** (node:test без процесса на юнит) не пересекается: у node:test мест
  нет. PERF-06, PERF-07, PERF-11 и PERF-12 код этой задачи не затрагивают.
- **BUG-703** (`analysis/bugs/perf.md`, `analysis/02-bugs.md`) — эта находка.
  **BUG-204** (`analysis/bug-prompts/BUG-204.md`) — бюджет времени по dry run.
  **BUG-701** — стенд держит окружение постоянным (`lib/measure-one.sh`); для
  холодных точек это неважно, для тёплых — обязательно.

## Критерий готовности

- **Код.** Места включаются в воркере только для dry run, юниты получают
  настройку проекта. Принудительное включение в главном процессе убрано, JSDoc
  обновлён. Если выбран другой вариант из «Что сделать», п. 5, выбор обоснован в
  PR.
- **Тесты.** Есть новый тест режимов в `test/adapters/vitest/runner.test.ts`
  (dry → `true`, batch и isolated — без изменений). Обновлены ожидания
  `test/adapters/vitest/configure-project.test.ts:45` и
  `test/adapters/vitest/start-vitest-session.test.ts:141`. Желательно —
  интеграционный тест с `includeTaskLocation: true` из п. 4 (все мутанты
  `Survived`). Без смены ожиданий зелёные `test/adapters/vitest/index.test.ts`
  (в том числе `line: 9`, `:387`) и
  `test/adapters/vitest/index.equivalence.test.ts`.
  Новые фикстуры — только в `test/fixtures/**`.
- **Эквивалентность.** `compare-reports.mjs` даёт 0 расхождений в каждом
  прогоне изменения против прогона 1 базы на `m-cold` path-to-regexp и cheerio
  (×3) и perfectionist (×3 или хотя бы ×1, это оговорено). На `m-fast`
  path-to-regexp и cheerio (×3) статусы совпадают с базой, кроме мутантов,
  которые расходятся и между прогонами базы. Число тестов со строкой в отчёте
  совпадает с базой и больше нуля во всех точках. Мутанты с `time-limit` и
  `hang` те же. Шум базы (сравнение её прогонов между собой) записан.
- **Выигрыш.** Пороги из «Как измерить выигрыш» выполнены, не меньше 3 прогонов
  на точку, с mean ± σ, медианой, CPU, PSS и условиями (машина, версии, load
  average). Таблица база/изменение и вывод `cpuprofile-categories.mjs` обеих
  сборок приложены к PR.
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`); оговорки — в «Ограничениях».
- После проверки удалены `$W/base-src` (`git worktree remove`) и tarball-ы; в
  дереве нет `*.tgz` и `dist/`.

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Здесь это не нужно: новых опций нет, `schemaVersion` отчёта прежний.
- Jest-адаптер (`testLocationInResults`) в этой задаче не трогать (см.
  «Контекст»).
- Сообщения коммитов — Conventional Commits (commitlint).
- Для установки нужен pnpm 12 (в CI — `latest-12`,
  `.github/actions/install-tools/action.yml:14`).
- `pnpm test` после `pnpm build` даёт ложные ошибки `test:astro`:
  `tsconfig.json:2-4` включает `**/*.ts` и не исключает `dist/`, а
  `types/html/inline-script.d.ts:1` тянет типы `vite/client`. На 170ec52 это было 14 ошибок `ts(2322)` в
  `docs/components/*.astro`. После сборки удаляй `dist/`.
- Зависят от окружения (к задаче не относятся; сверено с `main`): тесты
  `test/cli/run-list.test.ts` и `test/cli/run-mutation.test.ts` ждут Unicode и
  падают при `TERM=linux` (`cli/terminal/is-unicode-supported.ts:13`), запускай
  с `TERM=xterm-256color`; «skips test files it cannot read»
  (`test/adapters/node-test/score-node-test.test.ts:98`) падает под root; при
  заданном `NODE_OPTIONS` покрытие ветвей ниже 100% в
  `adapters/node-test/start-node-test-session.ts:119`, `:167`, поэтому
  `env -u NODE_OPTIONS pnpm test:unit`.
- Не копируй стенд, скрипт сравнения и tarball-ы в репозиторий: всё это живёт в
  `$W` вне клона.
