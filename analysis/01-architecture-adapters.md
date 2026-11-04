# Архитектура адаптеров тестовых раннеров

> Подраздел раздела 1 (`analysis/01-architecture.md`). Коммит 170ec52.
> Граф модулей, папки хелперов и общие слои разобраны в основном документе;
> здесь — только граница «ядро ↔ адаптер», жизненный цикл, ответственность,
> изоляция, производительность и расширение до Rstest и Jest.
>
> Пути без префикса — относительно корня репозитория. Ссылки `path:строка` —
> на 170ec52. Пометки: **[подтверждено]** — есть запуск/трасса/тест;
> **[по коду]** — вывод из чтения кода; **[гипотеза]** — не проверено.

## Резюме

* **Граница проведена правильно по смыслу**: ядро планирует и решает,
  адаптер исполняет и сообщает сырые факты (`types/adapter/test-adapter.d.ts:4-9`);
  ядро перепроверяет лимит вычислений, контрольные попытки batch,
  подтверждает таймауты и проверяет настоящие провалы без инструментирования.
  Это главное достоинство, его нужно сохранить.
* **Технически контракт — «внутренний API, который случайно экспортирован»**:
  нет версии, результаты не проверяются (BUG-605), четыре возможности сжаты в
  один `batch: boolean`, `runBatch` обязателен даже без batch, отмены нет,
  встроенные адаптеры берут `core/*` по внутренним путям, ядро знает
  раскладку папок адаптеров (`core/run/select-run-files.ts:27-28`).
* Ядро **не знает**, умеет ли раннер выбирать тест: isolated всегда гоняет
  весь файл (сознательно, ради состояния, оставленного мутантом), batch
  требует выбора по id, повторов и смены мутанта между попытками.
* Путь одного мутанта прослежен в обоих адаптерах декоратором поверх
  публичного контракта и V8-покрытием: вердикты 10 мутантов совпали, рабочая
  часть обоих адаптеров использует один и тот же набор из 5 модулей `shared`.
* **Изоляция isolated-пути держится** (по коду и по данным оракула
  `data/isolation.md`): процесс на юнит, вердикты не зависят от соседей,
  порядка и параллелизма; утечки возможны только в `--fast` (по замыслу) и
  через внешнее состояние. Контрактная дыра рядом: подсказку `related`
  Vitest-адаптер трактует как точный фильтр, и набор тестов dry run зависит
  от выбранных мутантов (BUG-201).
* **Отмена не имеет владельца**: каталог `mootant-*` остаётся при любом
  прерывании (BUG-600), а SIGTERM/SIGHUP оставляют бесконечно крутящиеся
  сироты зависших юнитов (BUG-601, Vitest — SIGTERM и SIGHUP, node:test —
  SIGHUP).
* **Смерть процесса юнита = Killed** без повтора: внешний SIGKILL превращает
  выжившего мутанта в убитого в обоих адаптерах (BUG-602).
* **Одно правило — два кода** с разным поведением: бюджет сторожа dry run
  (node:test обрывает прогон на честно долгом тесте, BUG-603), таймаут хука
  (`Timeout` против `Killed`, BUG-604). Остальные пары (dry run, кэш,
  детект, чтение попыток) различаются по делу и переносить их не нужно.
* Производительность: главное переиспользование уже есть (рантайм-
  переключение + общий кэш трансформаций Vite); на каждый юнит заново
  создаётся процесс и инициализируется раннер, и на маленьких файлах это
  доминирует (индикативно 454/91 мс у Vitest). Контракт мешает потоковому
  исполнению и префорку — места для цифр раздела 4 отмечены.
* Rstest 0.12.6 подключается через текущий контракт за **L** (проверено на
  фикстуре: путь теста в setup-файле, активация мутанта, свежий процесс; но
  `run()` пересобирает движок и не запускает файл дважды), Jest 30.5.2 — за
  **XL** (переиспользуемые воркеры, обёртки окружения и трансформеров). С
  целевым контрактом и `mootant/adapter-kit` — **M** и **L**.


## 0. Методика

1. **Фикстура** `analysis/tools/adapters/fixture/{vitest,node-test}` (рабочая
   копия с `node_modules` — `/home/user/projects/adapters/fixture`): один и
   тот же `src/price.js` (две функции, 3 теста) и эквивалентные тесты на
   Vitest 5.0.5 и `node:test`. Mootant поставлен из
   `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`.
2. **Трассировка границы ядро ↔ адаптер без пересборки mootant.** Контракт
   позволяет передать в `run.runner` объект-адаптер, поэтому я написал
   декоратор `analysis/tools/adapters/tools/trace-adapter.js`,
   который оборачивает `vitestAdapter()` / `nodeTestAdapter()` и пишет каждый
   вызов сессии (запрос, результат, `onUnitEnd`, `onOutput`), снимок рабочего
   каталога после каждого вызова и аргументы каждого `spawn` (для `node:test`
   — с содержимым `MOOTANT_UNIT`). То, что такой декоратор пишется за 100 строк
   и работает, — само по себе свидетельство, что контракт хорошо отделён.
3. **Какие модули реально участвуют.** Тот же прогон под `NODE_V8_COVERAGE`:
   V8 пишет покрытие функций для главного процесса и для каждого дочернего
   (воркеры Vitest и процессы `node:test` наследуют переменную). Сборка
   mootant сохраняет структуру «файл на модуль» (`dist/core/run/*.js` и т. д.),
   поэтому из покрытия напрямую видно, какие модули `core/*`,
   `adapters/shared/*` и адаптера выполнялись в каком процессе
   (`analysis/tools/adapters/tools/v8-functions.py`; для воркера Vitest —
   `import-closure.py`).
4. **Статический анализ импортов** адаптеров в `core/*` и `adapters/shared/*`
   (раздел 2) и чтение мест вызова в ядре.
5. **Эксперименты с отказами**: прерывание сигналами, зависший юнит,
   внешнее убийство процесса юнита, долгий тест, таймаут хука, пустые
   `tries` в результате адаптера (разделы 4.4, 5, 7.1, `bugs/adapters.md`) и
   проба Rstest 0.12.6 (8.2).

**Воспроизведение.** Скрипты и исходники всех фикстур (без `node_modules`)
скопированы в `analysis/tools/adapters/` (`tools/` — декоратор, разбор
покрытия, сигналы; `fixture*/` — варианты проекта), сырые результаты — в
`analysis/data/adapters/`. Установка в каждом варианте:
`npm i -D --legacy-peer-deps <mootant.tgz> vitest@5.0.5 vite@8.3.5`
(npm 10.9 без `--legacy-peer-deps` падает на `Cannot read properties of
null (reading 'edgesOut')`; у Vitest 5 `vite` — обязательный peer). Трасса:
`TRACE_DIR=<каталог> npx mootant run --config mootant.trace.config.js
--mutant <id> --json --all`; неисправности — `TRACE_KILL_AFTER=<мс>`
(SIGKILL процессам юнита) и `TRACE_BREAK=empty-tries`.

## 1. Путь одного мутанта от ядра до вердикта

Мутант `qm8g8eqrtwnn` (`src/price.js:5`, `price - (price * percent) / 100` →
`price + …`), `mootant run --mutant qm8g8eqrtwnn`. Идентификаторы мутантов
у двух вариантов фикстуры **совпадают** (все 10), то есть идентичность не
зависит от раннера. Время `t` — от `start()` по журналу декоратора
(`analysis/data/adapters/trace-{vitest,node-test}-one-mutant.jsonl`), один
прогон на нагруженной машине (load ≈ 6 на 4 vCPU) — **индикативно**, не
замер производительности.

| # | Шаг | Где | Vitest | node:test |
|---|---|---|---|---|
| 1 | список мутантов, выбор `--mutant` | `core/run-mutants.ts:192-214` | 10 → 1 | 10 → 1 |
| 2 | выбор адаптера (объект из конфига → `validateAdapter`; имя → `builtIns[name].load()`) | `core/run/resolve-adapter.ts:38-75` | — | — |
| 3 | рабочий каталог | `core/run-mutants.ts:271` | `/tmp/mootant-ZggIot` | `/tmp/mootant-pd5dRY` |
| 4 | `start(context)`; `context.files` ещё **пуст** | `core/run-mutants.ts:275-300` | t=53 → 1121 мс: `detectVitest`, `checkVitestCopy`, `createVitest`, `globTestSpecifications`, рантайм в главном процессе | t=25 → 284 мс: команда из `package.json`, `execFile(node -p …)` за версией (`adapters/node-test/read-node-runtime.ts:22`), список файлов, `checkTypeScript`, входы кэша |
| 5 | `listTestFiles()` | `core/run-mutants.ts:378` | `[test/price.test.js]` | `[test/price.test.js]` |
| 6 | переключаемые файлы — **все 10** ожидающих мутантов файла, а не только выбранный | `core/run-mutants.ts:340-342, 390-394` | — | — |
| 7 | `dryRun({files:null, related:[src/price.js], repeat:false, instrumented:true, timeouts:{60000,60000}})` | `core/run/run-dry-phase.ts:195-199, 482` | 620 мс; 1 fork; покрытие попыток: тест 1 → 7 мутантов, тест 2 → 3, тест 3 → 3; `served:[src/price.js]` | 380 мс; 1 spawn с `MOOTANT_UNIT={mode:'dry', plan, out}`; то же покрытие; `line: null` у тестов (у node:test строки нет) |
| 8 | анализ dry run → isolated (не `--fast`) → файлы мутанта | `core/run/read-dry-run.ts`, `core/run/classify-mutants.ts:55-61`, `core/run/rank-mutant-files.ts` | `[test/price.test.js]` | то же |
| 9 | план раунда 0: юнит `{mutant, file, project:'', limits}` | `core/run/plan-isolated.ts:16-45` | `timeout: 1217, hitLimit: 400000` | `timeout: 1166, hitLimit: 400000` |
| 10 | `runIsolated(plan)` | `core/run/run-isolated-rounds.ts:101` | 584 мс: `plan/<hash>.json` → fork → `claim/<hash>-0` (pid) → `runtime.active` до загрузки (`adapters/vitest/runner.ts:550`) → тест 1 падает «expected 250 to be 150» с `reached` → bail → `end` → `done/<hash>-0`; **startup 454 мс, duration 91 мс** | 199 мс: spawn с `MOOTANT_UNIT={mode:'isolated', mutant, hitLimit, bail:true, expected:[]}` → тест 1 падает → bail; **startup 94 мс, duration 86 мс** |
| 11 | `onUnitEnd({unit, facts})` до конца прогона | `core/run-mutants.ts:276-288` | да (`adapters/vitest/run-plan.ts:94-103`) | да (`adapters/node-test/run-isolated.ts:93`) |
| 12 | факты → вердикт: `classifyTry` (failed + reached → killed, `assertion`) → `decideEvidence` | `core/run/read-isolated-unit.ts:46-62`, `core/run/decide-evidence.ts` | Killed | Killed |
| 13 | `close()`, удаление каталога | `core/run-mutants.ts:321, 324` | `vitest.close()` 32 мс | `stopLiveProcessGroups()` 0 мс |

Сквозная проверка на всех 10 мутантах фикстуры: **вердикты двух адаптеров
совпали** (7 Killed, 3 Survived, score 70), полное время 5,6 с (Vitest)
против 2,5 с (node:test). На 10 юнитах одного тестового файла: медиана
`startup` 1423 мс [562…1918] у Vitest против 170 мс [101…286] у node:test,
медиана `duration` 303 против 85 мс; юниты одного файла идут строго
последовательно, поэтому интервал между концами юнитов — 580 мс (Vitest) и
272 мс (node:test). Это **индикативные** числа одного прогона; методичные
замеры — **[ДАННЫЕ РАЗДЕЛА 4]**. Качественный вывод устойчив: на маленьком
проекте стоимость юнита определяется не тестами, а запуском и
сворачиванием процесса раннера (у Vitest старт следующего юнита того же
файла уже перекрывается с текущим за счёт claim + ожидания очереди —
`adapters/vitest/worker/wait-for-turn.ts:32-49`; у node:test процесс
следующего юнита запускается только после конца предыдущего —
`adapters/node-test/run-in-pool.ts:46-54`).

## 2. Где адаптеры обращаются к `adapters/shared` и внутренностям ядра

Сводка по V8-покрытию прогона (модули, в которых выполнилась хотя бы одна
именованная функция; `analysis/data/adapters/v8-functions-*.txt`,
`vitest-worker-import-closure.txt`) и,
для воркера Vitest, по статическому замыканию импортов `runner.js`: в этом
прогоне fork-воркеры Vitest файлов покрытия не оставили (вероятно, Vitest
завершает их не обычным выходом — не проверял).

| Процесс | `adapters/shared` | `core/*` (не `types`) | Шаги |
|---|---|---|---|
| главный, Vitest | `list-tsconfig-files` (входы кэша/зависимости, шаг 7, 10) | `core/instrument/resolve-switched-text` (Vite-плагин, шаг 7), `core/runtime/install-mutant-runtime` (шаг 4), `core/run/compare-dry-entries` (шаг 7), `core/compare-code-units` | 34 модуля `adapters/vitest` |
| воркер Vitest (`runner.js` + 18 `worker/*`) | `capture-clock`, `get-error-message`, `track-environment`, `track-file-reads`, `track-inputs` | `core/runtime/*` (4 модуля) | шаги 7, 10 |
| главный, node:test | `read-test-scripts` (шаг 4, `findTestCommand`), `index-environment-hashes` (шаг 4, входы кэша считаются даже при `cache: false`) | `core/cache/create-digest` (id тестов, хеши окружения), `core/compare-code-units` | 43 модуля `adapters/node-test` |
| процесс теста node:test (13 `preload/*`) | `capture-clock`, `track-environment`, `track-file-reads`, `track-inputs`, `get-error-message` (только в isolated: сообщение провала) | `core/runtime/install-mutant-runtime`, **`core/instrument/resolve-switched-text`** (переключение идёт в процессе теста) | шаги 7, 10 |

Наблюдения:

* **Рабочая часть обоих адаптеров использует один и тот же набор из пяти
  модулей `shared`** (часы, сообщение ошибки, учёт чтений `fs` и `env`).
  Это и есть настоящее общее ядро «кода в рабочем процессе»; оно уже
  вынесено правильно.
* **Протечки в `core/*`** по внутренним путям: `resolve-switched-text`
  (оба), `install-mutant-runtime` (оба), `compare-code-units` (оба),
  `create-digest` (node-test, shared), `compare-dry-entries` (vitest).
  Первые два — по сути публичный API адаптера (они и экспортируются:
  `core/index.ts:11`, `core/runtime/index.ts`), остальные три — нет.
* `select-run-files` исключает из мутации `adapters/*/worker/` и
  `adapters/*/runner.*` (`core/run/select-run-files.ts:27-28`), но **не**
  пять модулей `shared`, которые исполняются в рабочих процессах, и не
  `adapters/node-test/preload/` (BUG-607).


## 3. Фактический контракт

### 3.1. Операции

Контракт — 19 файлов `types/adapter/*.d.ts` (887 строк, почти всё —
JSDoc-описание семантики). Ядро вызывает адаптер ровно в этих местах:

| Операция | Обязательна | Кто вызывает | Сколько раз | Комментарий |
|---|---|---|---|---|
| `TestAdapter.start(context)` | да | `core/run-mutants.ts:275` | 1 | контекст: `files` (живой массив, ядро дописывает его после старта: `core/run-mutants.ts:394`), `workDirectory`, `concurrency`, `root`, колбэки |
| `TestAdapter.batch` | да | `core/run-mutants.ts:234, 468` (→ `classifyMutants`) | — | единственный флаг возможностей |
| `TestAdapter.name` / `version` | `name` да | отчёты, ключ кэша `core/cache/prepare-run-cache.ts:159-163` | — | |
| `AdapterSession.listTestFiles()` | да | `core/run-mutants.ts:378` | 1 | тестовые и setup-файлы: их не мутируют (`core/run/select-run-files.ts:55-59`) |
| `AdapterSession.dryRun(request)` | да | `core/run/run-dry-phase.ts:482` | 1–5 | повтор при `--fast`, проверка без инструментирования, повтор без сломанных файлов |
| `AdapterSession.cacheInputs()` | нет | `core/cache/prepare-run-cache.ts:116-119` | 1 | без неё кэш выключен |
| `AdapterSession.runIsolated(plan)` | да | `core/run/run-isolated-rounds.ts:101` | по раунду | раунды 1, 1, 2, 4, … файлов на мутанта (`core/run/run-isolated-rounds.ts:69`) |
| `AdapterSession.runBatch(plan)` | **да по типу**, по смыслу — только при `batch: true` | `core/run/run-batch-phases.ts:82, 166` | фазы 1–2, ≤2 восстановления, подтверждение | `node-test` вынужден реализовать заглушку-исключение: `adapters/node-test/start-node-test-session.ts:206-207` |
| `AdapterSession.close()` | да | `core/run-mutants.ts:321` (finally) | 1 | «Safe to call twice» (`types/adapter/adapter-session.d.ts:54-57`) |
| `diagnostics`, `workers`, `version` | нет | `core/run-mutants.ts:382, 462, 544` | — | `diagnostics` читается один раз, сразу после `listTestFiles` |
| `context.onUnitEnd(end?)` | нет | `core/run-mutants.ts:276-288` | на юнит | только прогресс/живые счётчики (`core/run/preview-isolated-unit.ts`) |
| `context.onOutput(text, file)` | нет | `core/run-mutants.ts:289-295` | — | вывод тестов |
| `globalThis.__mootant` (`MutantRuntime`) | да | переключённый код | на каждое вычисление сайта | рантайм ставят **адаптеры** в своих процессах: `adapters/vitest/runner.ts:256`, `adapters/node-test/preload/preload.ts:44`, главный процесс Vitest — `adapters/vitest/start-vitest-session.ts:134-136` |

Модель «ядро решает, адаптер сообщает факты» выдержана последовательно:
`TestAdapter` прямо требует «It never decides a status»
(`types/adapter/test-adapter.d.ts:4-9`), и ни один адаптер не вычисляет
статусы — только `TryFacts`/`IsolatedFacts`/`DryRunResult`. Классификация
(`core/run/classify-try.ts:21-45`, `core/run/read-isolated-unit.ts:22-107`,
`core/run/apply-batch-result.ts:305-320`) целиком в ядре. **Это хорошее
решение, и его надо сохранить**: благодаря ему правила вердикта одинаковы для
всех раннеров, а новый адаптер не может «придумать» свой Killed.

### 3.2. Идентификаторы

| Что | Формат | Кто создаёт | Где используется | Замечание |
|---|---|---|---|---|
| id мутанта | строка ядра | `core/identity/*` | `IsolatedUnit.mutant`, `BatchTest.mutants`, `TryFacts.mutant`, `covers`, `runtime.active` | адаптер передаёт его в рабочий процесс непрозрачно |
| id теста | **определяет адаптер** | Vitest — `RunnerTestCase.id` (позиционный хеш Vitest), `adapters/vitest/run-dry.ts:158`; node:test — дайджест `(root, file, fullName, occurrence)`, `adapters/node-test/get-test-id.ts` (через `core/cache/create-digest`) | `BatchTest.id`, `TryFacts.test`, кэш (`recordBatch`) | контракт требует лишь «stable across runs while the file is unchanged» (`types/adapter/dry-test.d.ts:32-35`); уникальность внутри файла не оговорена, но `core/run/read-dry-run.ts:57` молча перезапишет дубликат |
| ключ тестового файла | `file` или `file\0project` | ядро, `core/run/get-test-file-key.ts:12-17` | весь планировщик | понятие «проект» — из Vitest; `node-test` всегда `''` (`adapters/node-test/build-dry-file.ts:98`) |
| индекс юнита | позиция в `plan.units` | ядро | `IsolatedFacts.unit`, `BatchResult.*.unit`, `UnitEnd.unit` | диапазон не проверяется (3.4) |

### 3.3. Покрытие, результаты, ошибки

* **Покрытие** собирается только в dry run: на каждую попытку теста
  (`TryFacts.covers`, `types/adapter/try-facts.d.ts:6-10`) и вне попыток на
  файл (`DryFile.covers` — загрузка, setup, хуки набора). В batch/isolated
  `covers: null`. Механизм у обоих адаптеров одинаковый по сути: адаптер
  ставит в `runtime.coverage` множество текущей попытки
  (`adapters/vitest/runner.ts:1135-1146`,
  `adapters/node-test/preload/create-try-tracker.ts:153-165`).
* **Выбор тестов для мутанта** — целиком в ядре: покрывающие тесты →
  их файлы → ранжирование (`core/run/rank-mutant-files.ts:28-59`); в
  isolated-режиме гранулярность — **весь файл** (3.5).
* **Результаты** — сырые факты: `TryFacts` (провал, таймаут, `reached`, `hits`,
  `strays`, `skipped`), `IsolatedFacts` (`incomplete: crash|hang`,
  `loadError`, `hookError`, `timedOut`, `strays`), `BatchResult`
  (`tries`, `incomplete`, `hookErrors`, `late`).
* **Ошибки сессии** — исключением из `start()` с готовым предложением
  (`types/adapter/test-adapter.d.ts:12-17`); ошибки прогона — фактами
  (`hung`, `incomplete`, `loadFailed`); исключение из `dryRun`/`runIsolated`
  обрушивает весь `mootant run` (нет «юнит не смог стартовать» как факта).

### 3.4. Что ядро проверяет, а что принимает на веру

**Проверяет (и это сильная сторона дизайна):**

| Гарантия | Как проверяется | Где |
|---|---|---|
| Лимит вычислений сайтов | ядро само сравнивает `hits > hitLimit`, не доверяя флагу адаптера | `core/run/classify-try.ts:26-28`, `core/run/read-isolated-unit.ts:31-38` |
| Kill в batch не вызван грязным состоянием | позиционные контрольные попытки до и после; нет контроля — `doubtful` → isolated | `core/run/apply-batch-result.ts:305-320, 351-358` |
| Провал dry run — от инструментирования, а не настоящий | повтор без переключённых файлов (`instrumented: false`) | `core/run/run-dry-phase.ts:385-421` |
| Загружен тот же текст, что был размечен | `resolveSwitchedText` в адаптере → `mismatched` → `instrument-error` | `core/run/run-dry-phase.ts:345-359` |
| Таймаут — не шум | подтверждение с удвоенными границами | `core/run/get-unit-evidence.ts:22-28`, `core/run/apply-batch-result.ts:163-177` |
| Потерянный юнит | повтор 1 раз, затем `Error` | `core/run/apply-isolated-result.ts:93-113` |
| Потерянные batch-попытки | до 2 восстановительных прогонов, затем isolated | `core/run/run-batch-phases.ts:109-138` |
| Посторонние ошибки (strays) | игнорируются для тестов/файлов, у которых они были в dry run | `core/run/read-isolated-unit.ts:48, 93-97` |
| Форма адаптера из конфига | `name` kebab-case, `batch` boolean, `start` function, `version` string | `core/run/validate-adapter.ts:32-49` |

**Принимает на веру (нигде не проверяется):**

| Предположение | Что будет при нарушении | Где опирается |
|---|---|---|
| Форма `AdapterSession` и результатов | `TypeError` в глубине ядра вместо ясной ошибки адаптера; `validateAdapter` проверяет только объект адаптера, не сессию | `core/run/validate-adapter.ts:32-49` |
| `DryTest.tries` не пуст | `TypeError: Cannot read properties of undefined (reading 'failed')` | `core/run/run-dry-phase.ts:589`, `core/run/read-dry-run.ts:66-77` |
| Индексы юнитов в диапазоне | `TypeError` в `run-batch-phases` / `apply-batch-result`; в `onUnitEnd` — исключение внутри колбэка адаптера | `core/run/run-batch-phases.ts:168`, `core/run/apply-batch-result.ts:86, 279`, `core/run/preview-isolated-unit.ts:25-27` |
| Дубликаты `IsolatedFacts.unit` | последний молча побеждает | `core/run/apply-isolated-result.ts:52` |
| `reached`, `failed`, `timedOut`, `skipped` честны | неверный вердикт; «expected to fail» уже перевёрнут адаптером | `types/adapter/try-facts.d.ts:22-52` |
| Юнит isolated — свежий граф модулей с самой загрузки | ложные вердикты от общего состояния | `types/adapter/isolated-plan.d.ts:3-11` |
| Два юнита одного файла не идут одновременно | ложные вердикты от общих файлов/портов | `types/adapter/adapter-session.d.ts:14-19` |
| `incomplete: 'crash'` вызван мутантом | **`Killed` без проверки `reached`**, даже если процесс убит извне (OOM, `kill`) — см. BUG-602 | `core/run/read-isolated-unit.ts:42-44` |
| `DryFile.dependencies` полны | устаревший кэш | `core/cache/prepare-run-cache.ts:129-135` |
| Покрытие полно | мутант без покрытия или не тот файл первым | `core/run/read-dry-run.ts:82-95` |
| `dryRun({files: null, related})` находит **все** тестовые файлы, которые могут загрузить мутируемые | ложный `NoCoverage`; у Vitest набор зависит даже от выбора мутантов (BUG-201, `data/isolation.md`) | `types/adapter/dry-run-request.d.ts:26-32`, `adapters/vitest/run-dry.ts:231-236`; ср. node-test: `adapters/node-test/run-dry.ts:75-80` |
| `DryRunRequest.repeat` поддержан, если `batch: true` | исключение из адаптера и падение `--fast` | `core/run-mutants.ts:234`, `core/run/run-dry-phase.ts:197`; `node-test` бросает: `adapters/node-test/run-dry.ts:58-62` |

### 3.5. Как ядро узнаёт, умеет ли раннер выбирать тест или только файл

Никак, кроме одного булева `TestAdapter.batch`
(`types/adapter/test-adapter.d.ts:25-29`). Фактически контракт содержит **две
разные модели гранулярности**, и флаг `batch` неявно включает целый набор
возможностей:

| Путь | Гранулярность | Что адаптер обязан уметь |
|---|---|---|
| dry run | файл (`DryRunRequest.files`: путь+проект) или «связанные с `related`» | запустить файлы; собрать покрытие по попыткам; при `repeat` — дважды подряд каждый тест |
| isolated | **весь файл** на мутанта (`IsolatedUnit = {mutant, file, project, limits}`) | активировать мутант до загрузки файла; свежий граф модулей; останов после первого провала разрешён, но не обязателен (`types/adapter/isolated-plan.d.ts:6-8`) |
| batch | тест (по id) внутри файла | выполнить тесты до последнего запланированного, пропустить остальные; повторить тест N раз с переключением мутанта между попытками и контролями (`types/adapter/batch-plan.d.ts:3-8, 51-56`); `repeat` в dry run |

То есть `batch: true` = «умею выборочный запуск тестов по id» + «умею
повторять тест в одном процессе» + «умею переключать мутант между попытками»
+ «умею `repeat` в dry run». Возможности «выбрать отдельный тест в isolated»
контракт не предусматривает вовсе — и это сознательно: тест, не достигающий
мутанта, может увидеть оставленное им состояние
(`types/adapter/isolated-plan.d.ts:3-8`), поэтому isolated-юнит гоняет весь
файл. `--testNamePattern`-подобной операции нет ни в одном адаптере.

### 3.6. Где детали Vitest и `node:test` известны вне адаптера

| Место | Что знает | Чем мешает |
|---|---|---|
| `core/run/select-run-files.ts:27-28` (`SELF_RUNTIME_PATTERN`) | раскладку папок адаптеров: `adapters/<имя>/worker/`, `adapters/<имя>/runner.` — раскладку **Vitest**; не покрывает `adapters/node-test/preload/` и `adapters/shared/*`, которые тоже исполняются в рабочих процессах | новый адаптер с другой раскладкой должен править ядро; запуск из исходников может переключить код самого mootant |
| `core/run/run-dry-phase.ts:489` | текст «did not finish within 60 s plus its own timeout and the timeouts of its hooks» — верно для Vitest (`adapters/vitest/runner.ts:989-998`), неверно для `node:test`, где к бюджету добавляется только `--test-timeout` (`adapters/node-test/get-dry-deadline.ts:17-28`) | сообщение вводит в заблуждение, а честно долгий тест обрывает прогон: BUG-603 |
| `types/adapter/*.d.ts` | словарь Vitest: «project», «worker-scoped fixtures», `aroundAll`; `DryFile.project` | терпимо: это документация семантики; `project` полезен и Jest/Rstest |
| `types/mutant/diagnostic.d.ts:10-33` | закрытый union кодов диагностик (`config-overridden`, `worker-hang`, …) | адаптер третьей стороны не может завести свой код без правки ядра |
| `cli/built-in-adapters.ts:3-4` | импортирует `adapters/*/score-*.ts` напрямую, мимо `index.ts` адаптера | CLI знает внутренние файлы адаптеров |
| `cli/parse-arguments.ts:40-41` | справка «default: Vitest's maxWorkers, CPU cores - 1 for node:test» | каждое новое имя раннера — правка CLI |
| `core/run-mutants.ts:237` | `fast` без `batch` → «runs every mutant isolated» | норм: формулировка общая |
| Внутренности ядра, которые импортируют адаптеры (протечки) | `core/instrument/resolve-switched-text` (`adapters/vitest/create-mootant-plugin.ts:7`, `adapters/node-test/preload/create-source-switcher.ts:8`); `core/runtime/install-mutant-runtime` (`adapters/vitest/runner.ts:23`, `adapters/vitest/start-vitest-session.ts:18`, `adapters/node-test/preload/preload.ts:9`); `core/compare-code-units` (5 файлов); `core/cache/create-digest` (`adapters/node-test/get-test-id.ts:3`, `adapters/shared/index-environment-hashes.ts:2`); `core/run/compare-dry-entries` (`adapters/vitest/run-dry.ts:10`) | `resolveSwitchedText` и `installMutantRuntime` публичны (`core/index.ts:11`, `core/runtime/index.ts`), но встроенные адаптеры берут их по внутренним путям; `compareCodeUnits`, `createDigest`, `compareDryEntries` вообще не экспортируются — адаптер третьей стороны должен их копировать |

Вывод по контракту: **граница проведена правильно по смыслу** (факты против
решений, план против исполнения), но **технически она — «внутренний API,
который случайно экспортирован»**: нет версии контракта, нет проверки
результатов, возможности сжаты в один флаг, обязательный `runBatch` у
адаптера без batch, протечки в `core/*` по внутренним путям.

## 4. Жизненный цикл

### 4.1. Vitest: последовательность

```mermaid
sequenceDiagram
  autonumber
  participant Core as core (главный процесс)
  participant A as vitest-адаптер (главный процесс)
  participant V as Vitest + Vite (главный процесс)
  participant WD as workDirectory /tmp/mootant-*
  participant W as fork-воркер (runner.ts), 1 на юнит
  Core->>WD: createWorkDirectory() [run-mutants.ts:271]
  Core->>A: start(context) [run-mutants.ts:275]
  A->>V: createVitest(plugins:[mootant], reporters, cache:false) [start-vitest-session.ts:91-117]
  V-->>A: configureVitest → configureProject: pool, isolate:true, runner [configure-project.ts:46-55]
  A->>A: installMutantRuntime(); coverage = outside [start-vitest-session.ts:134-136]
  Core->>A: listTestFiles() [run-mutants.ts:378]
  Core->>Core: createSwitchedFiles → context.files.push [run-mutants.ts:390-394]
  Core->>A: dryRun({files:null, related, repeat, timeouts}) [run-dry-phase.ts:482]
  A->>V: config.related = related; getRelevantTestSpecifications() [run-dry.ts:231-236]
  A->>WD: resetRunDirectory; provide('mootant',{mode:'dry'}) [run-dry.ts:67, run-specifications.ts:35-39]
  V->>W: fork на тестовый файл
  W->>W: onBeforeCollect: coverage = loadCovers, beat [runner.ts:511-529]
  W->>V: fetchModule → transform → plugin: переключённый текст [create-mootant-plugin.ts:33-50]
  W->>WD: out/*.jsonl (попытки + covers), end, done/* [runner.ts:1116, 924, 943]
  A->>WD: waitForWorkers; readOutFiles [run-specifications.ts:42, run-dry.ts:146]
  A->>V: collectDependencies по графу модулей Vite [collect-dependencies.ts:76-155]
  A-->>Core: DryRunResult
  Core->>Core: readDryRun, classifyMutants, rankMutantFiles
  loop раунды 1,1,2,4… [run-isolated-rounds.ts:69]
    Core->>A: runIsolated({units}) [run-isolated-rounds.ts:101]
    A->>WD: plan/<hash>.json; createSpecification на юнит [run-plan.ts:62-65]
    V->>W: fork на юнит (isolate:true)
    W->>WD: claim/<hash>-<n> (O_EXCL), waitForTurn [claim-unit.ts:19-42, wait-for-turn.ts:32-49]
    W->>W: runtime.active = mutant ДО загрузки файла [runner.ts:550]
    W->>WD: beat/<pid>.json (бюджет юнита) [runner.ts:570]
    A->>A: watchHeartbeats(250 мс) → stopHungWorker(SIGKILL) [watch-heartbeats.ts:19, stop-hung-worker.ts:13-34]
    W->>WD: out (попытки), end после teardown, done [runner.ts:913-955]
    A->>WD: waitForWorkers (10 мс опрос, ≤70 с) [wait-for-workers.ts:13, 20]
    A-->>Core: IsolatedResult (+ inputs через граф модулей)
    Core->>Core: applyIsolatedResult → decideEvidence → вердикт
  end
  Core->>A: close() → vitest.close() [run-mutants.ts:321, start-vitest-session.ts:149-157]
  Core->>WD: work.remove() [run-mutants.ts:324]
```

### 4.2. `node:test`: последовательность

```mermaid
sequenceDiagram
  autonumber
  participant Core as core (главный процесс)
  participant A as node-test-адаптер (главный процесс)
  participant WD as workDirectory /tmp/mootant-*
  participant P as процесс node, 1 на файл/юнит (detached, своя группа)
  participant H as preload + module hooks (в P)
  Core->>A: start(context) [run-mutants.ts:275]
  A->>A: findTestCommand, readNodeRuntime (execFile node -p), filterExecArgv, listNodeTestFiles, checkTypeScript [start-node-test-session.ts:71-151]
  Core->>A: listTestFiles() → files + setup [start-node-test-session.ts:212]
  Core->>A: dryRun({files:null, related, repeat:false}) [run-dry-phase.ts:482]
  A->>WD: switched/plan.json + switched/<i>.json [run-dry.ts:212-227, write-switch-plan.ts:16-31]
  Note over A: первый dry run запускает ВСЕ тестовые файлы: графа импортов ещё нет [run-dry.ts:75-80]
  A->>P: spawn(node, preload, флаги, reporters, file), env MOOTANT_UNIT={mode:'dry'} [run-test-file.ts:42-54, run-test-process.ts:117-123]
  H->>H: readUnit, installMutantRuntime, registerHooks/register, patch _compile [preload.ts:40-70]
  H->>WD: out/<n>.jsonl: start, load/served, open/close, try (covers), error, end [create-record-writer.ts]
  A->>WD: опрос out-файла каждые 50 мс; дедлайн → SIGKILL группы [run-test-process.ts:16, 133-139]
  A-->>Core: DryRunResult (только файлы, загрузившие related) [run-dry.ts:127-129]
  loop раунды
    Core->>A: runIsolated({units}) [run-isolated-rounds.ts:101]
    A->>P: spawn на юнит, MOOTANT_UNIT={mode:'isolated', mutant, hitLimit, bail, expected} [run-isolated.ts:57-68]
    H->>H: runtime.active = mutant с самого старта процесса [create-try-tracker.ts:149-152]
    H->>H: root beforeEach: bail → createBailError для следующих тестов [create-try-tracker.ts:245-247]
    P-->>A: exit → stopProcessGroup, 300 мс на закрытие вывода [run-test-process.ts:162-171]
    A->>A: buildIsolatedFacts из записей и кода выхода [build-isolated-facts.ts:34-98]
    A-->>Core: IsolatedResult
  end
  Core->>A: close() → stopLiveProcessGroups() [start-node-test-session.ts:208-211]
  Core->>WD: work.remove() [run-mutants.ts:324]
```

### 4.3. Границы процессов, владельцы ресурсов, время жизни

| Ресурс | Владелец | Живёт | Освобождает |
|---|---|---|---|
| `workDirectory` (`/tmp/mootant-XXXX`) | ядро | весь `run` | `finally` в `core/run-mutants.ts:323-325` |
| экземпляр Vitest: Vite-сервер, конфиг, **граф модулей с кэшем трансформаций в памяти** | vitest-адаптер | `start` → `close` | `vitest.close()` (`adapters/vitest/start-vitest-session.ts:149-157`) |
| рантайм мутанта в главном процессе (для `globalSetup`) | vitest-адаптер | сессия | возвращает прежнее `coverage` при `close` (`adapters/vitest/start-vitest-session.ts:153-155`) |
| fork-воркеры Vitest | пул Vitest, обёрнутый `createForksPool` (`adapters/vitest/create-forks-pool.ts:44-104`) | один юнит/тестовый файл (`isolate: true` навязан: `adapters/vitest/configure-project.ts:48`) | Vitest после прогона; затем `waitForWorkers` добивает живых через 70 с без пульса (`adapters/vitest/wait-for-workers.ts:20, 113`) |
| подкаталоги прогона `beat/claim/done/env/out/plan/worker` | vitest-адаптер | один прогон | очищаются в начале **следующего** (`adapters/vitest/reset-run-directory.ts:17-23`), в конце — вместе с `workDirectory` |
| процессы `node` (лидеры своих групп) | node-test-адаптер, модульный глобал `LIVE_PROCESS_GROUPS` (`adapters/node-test/live-process-groups.ts:5`) | юнит или файл dry run | группа убивается при выходе процесса (`adapters/node-test/run-test-process.ts:162-165`), по дедлайну (`:133-139`), на `close` (`adapters/node-test/stop-live-process-groups.ts:8-13`), на `exit`/`SIGINT`/`SIGTERM` главного процесса (`adapters/node-test/track-process-group.ts:17-46`) |
| out-файлы `node:test` | node-test-адаптер | юнит | удаляются сразу после чтения (`adapters/node-test/run-test-file.ts:55-57`) |
| план переключения `switched/`, `plain/` | node-test-адаптер | сессия | вместе с `workDirectory` |
| обработчики сигналов | node-test (пока живы процессы); CLI-спиннер (только в TTY: `cli/terminal/create-spinner.ts:143-163`) | — | снимаются (`adapters/node-test/track-process-group.ts:51-56`) |

Заметное различие во владении: у Vitest процессами владеет **пул Vitest**
(адаптер видит их только через pid в `worker/<pid>` и пульс), у `node:test` —
**сам адаптер**, через модульный глобальный `Set`. Последнее означает, что
`close()` одной сессии убьёт процессы любой другой сессии в том же процессе
(`adapters/node-test/stop-live-process-groups.ts:8-13` не знает сессий) —
сейчас две сессии в одном процессе не создаются, но для программного API это
скрытое ограничение **[по коду]**.

### 4.4. Кто и что очищает: успех, таймаут, падение воркера, отмена

Прогоны отмены — `analysis/tools/adapters/tools/signal-case.sh` на `fixture-slow` (в dry run идут
синхронный цикл 5 с и `await` 3 с; сигнал через 1 с после `dryRun:call`),
приватный `TMPDIR`; живые процессы ищутся по `cwd` фикстуры; выводы —
`analysis/data/adapters/signals.txt`, `hang-signals.txt`. Сценарий
«зависший юнит + SIGTERM/SIGHUP» — `analysis/tools/adapters/tools/hang-signal.sh` на
`fixture-hang/{vitest,node-test}`: мутант
`if (fast)` → `if (false)` даёт шаг 0 и бесконечный цикл в немутируемом
модуле `lib/walk.js`, где нет сайтов, поэтому лимит вычислений не
срабатывает и останавливает только сторож.

| Событие | Vitest | node:test | Ядро/CLI |
|---|---|---|---|
| Успешный прогон | Vitest гасит воркеры после каждого прогона; `waitForWorkers` дожидается их смерти (`adapters/vitest/run-specifications.ts:41-42`); `close()` → `vitest.close()` | процесс завершён к моменту результата; группа добита при выходе (`adapters/node-test/run-test-process.ts:162-165`); out-файл удалён (`adapters/node-test/run-test-file.ts:55-57`) | `session.close()` и `work.remove()` в `finally` (`core/run-mutants.ts:320-325`) — **[подтверждено]**: каталоги удалены |
| Таймаут попытки/юнита | сторож: пульс просрочен → `stopHungWorker` (SIGKILL, только если родитель — мы: `adapters/vitest/stop-hung-worker.ts:19-24`); в batch — `abandoned`, остаток юнита пропускается (`adapters/vitest/runner.ts:886-888`) | дедлайн → SIGKILL всей группы (`adapters/node-test/run-test-process.ts:133-139`) | `hang` → Timeout с подтверждением (`core/run/get-unit-evidence.ts:22-28`) |
| Падение воркера | нет записи `end` → `crash`; Vitest запускает новый воркер для следующего юнита | нет `end` → `crash`; группа убита при выходе | **Killed без повтора** (`core/run/read-isolated-unit.ts:42-44`) — BUG-602 **[подтверждено]** |
| Зависание при сворачивании воркера | пульс покрывает teardown; без пульса — убийство через 70 с (`adapters/vitest/wait-for-workers.ts:20, 113`) | неприменимо (процесс на юнит) | — |
| Ctrl+C в терминале (TTY) | воркеры в той же группе получают SIGINT и умирают | процессы-лидеры своих групп убиты обработчиком адаптера (`adapters/node-test/track-process-group.ts:40-46`) | спиннер делает `process.exit(130)` (`cli/terminal/create-spinner.ts:147-160`) → `finally` не выполняется → **каталог `mootant-*` остаётся** (оба адаптера) **[подтверждено]** |
| SIGINT группе без TTY (CI, `kill -INT -pgid`) | воркеры умирают | убиты обработчиком | обработчиков нет → смерть по сигналу, код 130 → **каталог остаётся** (оба) **[подтверждено]** |
| SIGTERM только главному процессу (`kill`, `timeout`, отмена задачи CI) | **обработчика нет**: воркер в синхронном цикле осиротел (ppid 1, R) и жил до конца цикла (через 0,5 с жив, через 6,5 с нет); **зависший юнит** (`fixture-hang`) осиротел и крутился >75 с при ~30–37 % CPU, пока я не убил его вручную — бесконечно (BUG-601) **[подтверждено]** | процессы убиты обработчиком, код 143 | каталог остаётся (оба) **[подтверждено]** |
| SIGHUP главному процессу (закрыли терминал, оборвался SSH) | обработчика нет → зависший воркер — сирота | **обработчики только на SIGINT/SIGTERM** (`adapters/node-test/track-process-group.ts:7`), а процессы `detached` (`adapters/node-test/run-test-process.ts:117-123`) в своих сессиях SIGHUP не получают → зависший процесс юнита — сирота (R, 30–40 % CPU через 11 с) **[подтверждено]**, BUG-601 | каталог остаётся |

Итог: **отмена — единственная часть жизненного цикла, у которой нет
владельца.** У node-test есть локальная защита процессов (хорошая, но без
SIGHUP), у Vitest — никакой, а рабочий каталог не удаляется ни в одном из шести
вариантов прерывания (BUG-600). Утечка невелика (28–64 КБ на фикстуре; у
node-test план переключения содержит полный переключённый текст каждого
мутируемого файла), но накапливается в `/tmp` при каждом Ctrl+C.
Предложение (раздел 9): `AdapterContext.signal` + единый обработчик
SIGINT/SIGTERM/SIGHUP в CLI, который прерывает прогон, вызывает `session.close()`
и `work.remove()` и только потом выходит с 130/143/129; `close()` vitest-
адаптера обязан убить все воркеры (pid уже известны: `worker/<pid>`).
Проверка: интеграционный тест, который запускает `mootant run` на
фикстуре с зависающим мутантом, посылает SIGINT/SIGTERM/SIGHUP и проверяет, что нет
ни каталога, ни живых процессов с `cwd` фикстуры — для обоих адаптеров.


## 5. Изоляция

Эксперимент с эталоном (физически применённые мутации, оба порядка, batch,
параллельно) проводит агент-оракул: **[данные эксперимента:
data/isolation.md]**. Его разбор механизмов по коду независимо приходит к тем же выводам, что и
этот раздел, а результаты для Vitest (на 05:10 UTC) их подтверждают:

* isolated-вердикты **не зависят** от соседних мутантов, порядка (`AB` = `BA`)
  и `--concurrency` и совпадают с эталоном для модульного кэша, моков
  (`vi.mock`, `vi.doMock`, `{ spy: true }`), `globalThis`, `process.env`,
  прототипов и фейковых таймеров;
* batch (`--fast`) даёт ожидаемые ложные Killed из-за состояния,
  оставленного **контрольной** попыткой (пары counter и seen), а не вторым
  мутантом; ложных Survived batch дать не может — выжившие перепроверяются
  isolated (`core/run/run-batch-phases.ts:91-97`);
* два отклонения касаются контракта, а не изоляции: (1) **набор тестовых
  файлов dry run зависит от выбранных мутантов** — Vitest-адаптер трактует
  подсказку `related` как точный фильтр статического графа
  (`adapters/vitest/run-dry.ts:231-236`), и тест, достающий модуль через
  `vi.importActual` в хелпере, выпадает (`NoCoverage` вместо `Killed`,
  BUG-201 в `data/isolation.md`), хотя контракт обещает «those that may
  import them run» (`types/adapter/dry-run-request.d.ts:26-32`); node-test в
  первом dry run гоняет все файлы и этой проблемы не имеет; (2) лимит
  вычислений сайтов превращает медленного, но проходящего мутанта (мемо
  выключено → экспонента) в `Timeout (hit-limit)`, тогда как эталон
  выживает — это вопрос классификации (`core/run/classify-try.ts:26-28`), а не
  адаптера.

Ниже — механизмы по коду и то, что из них следует.

### 5.1. Механизмы

| Канал утечки между мутантами | Vitest, isolated | Vitest, batch (`--fast`) | node:test, isolated |
|---|---|---|---|
| Кэш модулей (граф, модульное состояние) | новый fork-процесс на юнит, `isolate: true` навязан (`adapters/vitest/configure-project.ts:46-48`) — граф и модульное состояние не переживают юнит | **один процесс на файл**, мутанты сменяются между попытками (`adapters/vitest/runner.ts:846, 892-899`) — модульное состояние переживает попытку; от ложного kill защищают контрольные попытки (`core/run/apply-batch-result.ts:305-320`), но kill остаётся эвристическим (так и задокументировано: `core/run/apply-batch-result.ts:44-50`) | новый процесс на юнит (`adapters/node-test/run-test-process.ts:117-123`) |
| Кэш трансформаций в главном процессе | общий, но содержит текст со **всеми** мутантами; активный выбирается в рантайме → утечки нет | то же | нет кэша |
| Моки (`vi.mock`, `mock.module`) | живут в графе воркера → гибнут с ним | живут весь юнит (все попытки) | гибнут с процессом |
| Глобальное состояние (`globalThis`, `process.env`, слушатели) | гибнет с процессом | переживает попытки | гибнет с процессом |
| Таймеры/фейковые таймеры | сторож работает на часах, захваченных до тестов (`adapters/shared/capture-clock.ts:12-29`, `adapters/vitest/runner.ts:193`) | то же | то же (`adapters/node-test/preload/preload.ts:37-39`) |
| Внешнее состояние (файлы, порты, БД) | юниты одного файла строго последовательно и только после смерти воркера предыдущего (`adapters/vitest/worker/wait-for-turn.ts:14-22`); разные файлы — параллельно, как в обычном прогоне | то же | ключ файла в пуле (`adapters/node-test/run-in-pool.ts:21-26`) |
| Код вне воркеров (`globalSetup`, конфиг) | исполняется в главном процессе с `active = null`; такие мутанты получают `Error`, если тест их не убил (`core/run/mark-outside-mutants.ts`) | то же | `outside` всегда пуст (`adapters/node-test/run-dry.ts:104`) |

Вывод по коду: в isolated-режиме **оба адаптера не дают каналов утечки
внутри процессов** — цена этого и есть процесс на юнит (раздел 6).
Остаточные каналы — только внешние (диск, сеть), они такие же, как в
обычном прогоне раннера, с одной разницей: мутант может испортить файл,
который тест сам записал и который следующий юнит (другой мутант) прочтёт до
перезаписи. Mootant отслеживает такие файлы для кэша (`DryFile.modified`,
`types/adapter/dry-file.d.ts:34-41`), но не восстанавливает их между
юнитами **[гипотеза; проверяется оракулом]**.

### 5.2. Как адаптер отличает падение теста от сбоя раннера

| Ситуация | Vitest | node:test | Вердикт ядра |
|---|---|---|---|
| Тест упал (assert, исключение) | `TryFacts.failed` из ошибок результата Vitest (`adapters/vitest/worker/read-try-facts.ts:51-53`) | `try`-запись с `failed` (`adapters/node-test/preload/create-try-tracker.ts:180-203`) | Killed, если попытка достигла мутанта (`core/run/classify-try.ts:39-43`) |
| Файл не загрузился | `loadError` (`adapters/vitest/runner.ts:599-601`) | ошибка до `loaded`-маркера (`adapters/node-test/list-file-errors.ts:16-30`) | Killed `load-error` (`core/run/read-isolated-unit.ts:75-83`) |
| Упал хук набора / teardown | `hookError` (`adapters/vitest/worker/find-hook-error.ts`, teardown — `adapters/vitest/runner.ts:1200-1211`) | ненулевой код выхода без провалившихся тестов (`adapters/node-test/build-isolated-facts.ts:65-82`) | Killed `hook-error`, если мутант достигнут (`core/run/read-isolated-unit.ts:84-92`) |
| Необработанная ошибка | `strays` (`adapters/vitest/runner.ts:665-689`) | `error`-записи (`adapters/node-test/preload/create-try-tracker.ts:320-330`) | Killed `stray-error`, если её не было в dry run (`core/run/read-isolated-unit.ts:93-105`) |
| Процесс завис | пульс просрочен → SIGKILL → `hang` (`adapters/vitest/build-isolated-facts.ts:36`) | дедлайн → SIGKILL группы → `hang` (`adapters/node-test/build-isolated-facts.ts:59-61`) | Timeout, с подтверждением (`core/run/read-isolated-unit.ts:39-41`) |
| **Процесс умер** (нет записи `end`) | `crash` (`adapters/vitest/build-isolated-facts.ts:32-45`) | `crash` (`adapters/node-test/build-isolated-facts.ts:62-64`) | **Killed без проверки `reached`** (`core/run/read-isolated-unit.ts:42-44`) |
| Сбой самого раннера (ошибка Vitest вне тестов) | первая `unhandledErrors` прогона (`adapters/vitest/run-specifications.ts:43-44`) → сообщение для непришедших файлов dry run и для `crash` в batch (`adapters/vitest/run-batch.ts:79`) | код выхода/сигнал (`adapters/node-test/describe-exit.ts:9-18`) | dry run → ошибка запуска; isolated → `crash` или юнит без фактов (повтор → `Error`) |

Отсутствующая гарантия: **смерть процесса, не вызванная мутантом,
неотличима от kill.** Внешний SIGKILL (OOM killer, ограничение CI, `kill`)
во время юнита даёт `Killed`. Проверка `reached` (адаптер его передаёт:
`adapters/vitest/build-isolated-facts.ts:37`, ядро не смотрит) не спасла бы:
в эксперименте мутант был достигнут и выжил бы — процесс убит во время
следующего, ожидающего теста. Нужен повтор юнита, как для таймаутов
(BUG-602, 4.4).

## 6. Производительность: что переиспользуется, а что нет

Цифры — из раздела 4 (`analysis/04-performance.md`); здесь разбор по коду и
места для данных, помеченные **[ДАННЫЕ РАЗДЕЛА 4]**.

### 6.1. Что живёт всю сессию (переиспользуется между мутантами)

| Что | Vitest | node:test |
|---|---|---|
| Разбор конфигурации раннера | 1 раз: `createVitest` (`adapters/vitest/start-vitest-session.ts:91-117`) | 1 раз: команда, флаги, файлы (`adapters/node-test/start-node-test-session.ts:71-151`) |
| Обнаружение тестов | в каждом `dryRun` (`getRelevantTestSpecifications`, `adapters/vitest/run-dry.ts:233`); batch/isolated — без поиска, `createSpecification` (`adapters/vitest/run-plan.ts:63-65`) | список файлов 1 раз; модули каждого файла из последнего dry run (`adapters/node-test/run-dry.ts:119-120`) |
| **Трансформации** | граф модулей Vite в памяти главного процесса: каждый модуль трансформируется один раз на сессию и раздаётся всем воркерам (диск выключен: `fsModuleCache: false`, `adapters/vitest/start-vitest-session.ts:104`, `adapters/vitest/configure-project.ts:54`) | **нет**: каждый процесс заново читает план переключения и заново компилирует/«снимает типы» с каждого модуля (`adapters/node-test/preload/create-source-switcher.ts:41, 51-53`) |
| Переключаемый текст | один на файл, все мутанты сразу; мутант выбирается в рантайме → кэш трансформаций **не устаревает при смене мутанта** | то же; план — JSON-файлы, по одному на переключённый файл (`adapters/node-test/write-switch-plan.ts:16-31`) |

Главное архитектурное достоинство, которое и делает Mootant быстрее
Stryker на Vitest: **переключение мутантов в рантайме + общий кэш
трансформаций Vite**. Между мутантами ничего не перекомпилируется.

### 6.2. Что создаётся заново на каждый юнит (мутант × тестовый файл)

| Цена | Vitest | node:test | Данные |
|---|---|---|---|
| Запуск процесса | fork воркера Vitest на каждый юнит (`isolate: true` навязан, `adapters/vitest/configure-project.ts:46-48`) | spawn `node` на каждый юнит (`adapters/node-test/run-test-process.ts:117-123`) | [ДАННЫЕ РАЗДЕЛА 4]: медиана `startup` из `IsolatedFacts` |
| Инициализация раннера в процессе | воркер Vitest, окружение (`node`/`jsdom`/`happy-dom` — на каждый юнит!), `runner.ts` | preload: рантайм, module hooks, патч `fs` для `trackInputs`, репортёр | [ДАННЫЕ РАЗДЕЛА 4] |
| Загрузка графа модулей теста | RPC `fetchModule` для каждого модуля (трансформ из кэша, но сериализация на каждый юнит) | чтение с диска + strip types / tsx на каждый модуль | [ДАННЫЕ РАЗДЕЛА 4] |
| setup-файлы, `beforeAll` | на каждый юнит | на каждый юнит | — |
| IPC | файлы: план на прогон, claim/out/done на юнит, пульс на тест; опросы 250/200/20/10 мс (`watch-heartbeats.ts:19`, `watch-unit-ends.ts:18`, `worker/wait-for-turn.ts:11`, `wait-for-workers.ts:13`) | `MOOTANT_UNIT` в env, out-файл на юнит, опрос 50 мс (`run-test-process.ts:16`) | [ДАННЫЕ РАЗДЕЛА 4] |
| Входы для кэша | обход графа Vite, иногда с `transformRequest` недотрансформированных модулей (`adapters/vitest/collect-dependencies.ts:116-120`) — в главном процессе на каждый юнит | список загруженных модулей + `package.json`/`tsconfig` (`adapters/node-test/collect-node-dependencies.ts:56-72`) | [ДАННЫЕ РАЗДЕЛА 4] |
| Барьер раунда | `runTestSpecifications` + ожидание смерти **всех** воркеров (`adapters/vitest/run-specifications.ts:41-42`) | `runInPool` до последнего юнита (`adapters/node-test/run-in-pool.ts:55-62`) | [ДАННЫЕ РАЗДЕЛА 4]: доля простоя воркеров в хвосте раунда |
| Юниты одного тестового файла — строго по очереди (`types/adapter/adapter-session.d.ts:14-19`) | следующий юнит ждёт **смерти** воркера предыдущего (`adapters/vitest/worker/wait-for-turn.ts:32-49`) | следующий процесс стартует после конца предыдущего | индикативно: раунд из 10 юнитов одного файла при 3 воркерах — 6,6 с у Vitest и 2,7 с у node:test, то есть параллелизм = 1 (раздел 1); [ДАННЫЕ РАЗДЕЛА 4]: доля юнитов, у которых тестовый файл совпадает |

### 6.3. Какие решения контракта мешают переиспользованию

1. **`IsolatedUnit` = «свежий граф модулей с начала загрузки»**
   (`types/adapter/isolated-plan.d.ts:3-11`). Формально это не требует
   свежего процесса, но оба адаптера выполняют его свежим процессом — потому
   что глобальное состояние, слушатели `process.on`, таймеры и нативные модули
   переживают сброс графа. Это правильная цена за корректность; ускорять надо
   не отменой изоляции, а подготовкой процессов заранее (6.4, п. 2).
2. **`runIsolated(plan): Promise<IsolatedResult>` — пакетный вызов с
   барьером.** Ядро не может досылать юниты по мере освобождения воркеров;
   удвоение размера раунда (`core/run/run-isolated-rounds.ts:69`) это лишь
   смягчает. Автор отмечает, что добор файлов простаивающими воркерами «не
   дал выигрыша» (`core/run/run-isolated-rounds.ts:18-21`) — но это было в
   рамках барьерной модели.
3. **Один флаг `batch`** — `node:test` не может участвовать в `--fast` даже
   частично, `--fast` для него = обычный режим (`core/run-mutants.ts:234-240`).
4. **Нет подсказки «какие тестовые файлы импортируют мутируемые файлы»**:
   у ядра есть статический граф (`core/run/read-test-imports.ts:29-73`), но он
   используется только для ранжирования; node-test-адаптер без него гоняет в
   первом dry run **все** тестовые файлы (`adapters/node-test/run-dry.ts:75-80`).
5. **Покрытие только в dry run, по попытке целиком.** Нет покрытия
   «по юниту» в isolated — значит, ядро не может по факту isolated-прогона
   уточнить, какие файлы мутанту вообще нужны.

### 6.4. Предлагаемые ускорения и как проверить сохранение изоляции

| # | Идея | Ожидаемый выигрыш | Риск для вердикта | Проверка эквивалентности и изоляции |
|---|---|---|---|---|
| 1 | **Потоковое isolated-исполнение**: `runIsolated` принимает асинхронный поток юнитов (или адаптер даёт `submit(unit)`), ядро досылает следующий файл мутанта, как только пришли факты предыдущего | убирает простой в хвостах раундов [ДАННЫЕ РАЗДЕЛА 4] | нет: вердикт не зависит от того, какие файлы шли вместе (`core/run/decide-evidence.ts:4-12`) | побайтное сравнение `--json --all` с базовой версией на проектах бенчмарка; модель «процесс на юнит» не меняется |
| 2 | **Заранее запущенные процессы** (префорк): node-test держит N процессов с загруженным preload, юнит передаётся через IPC вместо `MOOTANT_UNIT`; для Vitest — собственный пул mootant (`adapters/vitest/create-forks-pool.ts`) заранее стартует воркеры | цена старта процесса и инициализации раннера уходит с критического пути [ДАННЫЕ РАЗДЕЛА 4] | средний: процесс не должен загрузить ни строки пользовательского кода до получения юнита; env/cwd/argv тестов должны совпасть с обычным запуском | оракул физически применённых мутантов (`analysis/data/isolation.md`) + тест «то, что видят тесты (`process.env`, `argv`, `cwd`, `execArgv`), совпадает с обычным запуском» |
| 3 | **Кэш компиляции V8 для node:test** (`NODE_COMPILE_CACHE`/`module.enableCompileCache`) в тестовых процессах | повторная компиляция модулей между юнитами [ДАННЫЕ РАЗДЕЛА 4] | низкий (кэш по содержимому) | сравнение вердиктов; проверить, что переключённые тексты не берутся из кэша оригинала |
| 4 | **Статический отбор тестовых файлов для первого dry run node:test** по графу `readTestImports` — только как надмножество: файлы с нелитеральными `import()`/`require` остаются | первый dry run на больших репозиториях и с `--since` [ДАННЫЕ РАЗДЕЛА 4] | средний: потерянный тест → ложный `NoCoverage` | сравнить `served` и покрытие dry run с фильтром и без на всех проектах бенчмарка; любое расхождение — отказ от фильтра для файла |
| 5 | Частичный batch для node:test (повтор теста в одном процессе через `t.test`-обёртку) | `--fast` для node:test | высокий: эвристические kill'ы, как у Vitest | только за флагом, со сравнением с isolated |
| 6 | **Параллельные юниты одного файла по разрешению** (`run.parallelUnits` или признак файла): правило «один файл — по очереди» защищает тесты с фиксированными файлами/портами/БД, но для типичного `foo.ts ↔ foo.test.ts` оно сводит параллелизм к 1 | до ×(число воркеров) там, где мутанты сосредоточены в одном тестовом файле: целевые прогоны (`--since` на PR, один модуль, цикл агента `--mutant`); на полном прогоне проекта параллелизм даёт множество разных файлов [ДАННЫЕ РАЗДЕЛА 4] | средне-высокий для тестов с общими ресурсами — поэтому только по явному разрешению пользователя; `DryFile.modified` помогает предупредить о файлах, но порты и БД не видны | контрактный тест с файлом-замком (должен оставаться последовательным без разрешения); сравнение `--json --all` с разрешением и без на проектах бенчмарка |

Отвергнуто: «юнит = только покрывающие тесты» и «переиспользовать воркер
со сбросом графа модулей». Первое нарушает требование видеть состояние,
оставленное мутантом для следующих тестов (`types/adapter/isolated-plan.d.ts:3-8`),
второе — изоляцию глобального состояния; оба меняют вердикты, а ускорение,
ухудшающее корректность, задание не считает успешным.

## 7. Матрица ответственности

Обозначения: **●** — владеет, **○** — участвует, пусто — не касается.
Последняя колонка — предлагаемый владелец и требование к поведению, ради
которого перенос нужен. «Оставить» — граница правильная.

| Функция | core | shared | vitest | node-test | Предложение |
|---|---|---|---|---|---|
| Оркестрация фаз (dry → batch → isolated), раунды, повторы, подтверждения | ● `core/run-mutants.ts:410-498`, `core/run/run-isolated-rounds.ts:34-129`, `core/run/run-batch-phases.ts:44-98` | | | | оставить |
| Отбор тестовых файлов для dry run | ○ даёт `related` (`core/run/run-dry-phase.ts:156`) | | ● граф Vite: `config.related` + `getRelevantTestSpecifications` (`adapters/vitest/run-dry.ts:225-247`) | ● все файлы в первом прогоне, затем фильтр по загруженным модулям (`adapters/node-test/run-dry.ts:75-80, 127-129`) | оставить в адаптерах (раннер-специфично); ядро могло бы передавать свой статический граф `readTestImports` как подсказку — см. 6.4 |
| Выбор и порядок тестовых файлов на мутанта | ● `core/run/rank-mutant-files.ts:28-59` | | | | оставить |
| Выбор тестов и контролей в batch | ● план `core/run/plan-batch.ts:40-110` | | ● исполнение `[null, m1, null, …]` `adapters/vitest/runner.ts:640-647` | — | оставить |
| Переключаемый текст | ● `createSwitchedFiles` | | ○ подача через Vite-плагин `adapters/vitest/create-mootant-plugin.ts:33-50` | ○ подача через module hooks + `_compile` `adapters/node-test/preload/install-module-hooks.ts:71-86` | оставить; `resolveSwitchedText` брать из публичного входа (`core/index.ts:11`) |
| Активация мутанта в процессе | ○ рантайм `core/runtime/install-mutant-runtime.ts:18-31` | | ● `adapters/vitest/runner.ts:550, 846` | ● `adapters/node-test/preload/create-try-tracker.ts:149-152` | оставить |
| Расписание юнитов: «никогда два юнита одного файла одновременно, в порядке плана» | ○ формулирует (`types/adapter/adapter-session.d.ts:14-19`) | | ● claim + waitForTurn + чередующий sequencer (`adapters/vitest/worker/claim-unit.ts:19-42`, `adapters/vitest/worker/wait-for-turn.ts:32-49`, `adapters/vitest/create-interleaved-sequencer.ts:18-76`) | ● ключ в пуле (`adapters/node-test/run-in-pool.ts:33-82`, `adapters/node-test/run-isolated.ts:96`) | оставить в адаптерах (у Vitest пулом владеет Vitest), но вынести claim/turn/пульс в `adapters/shared` для раннеров с собственным пулом (Rstest, Jest) и покрыть одним контрактным тестом |
| Сторожевой таймер (hang) | | | ● пульс-файлы + опрос 250 мс + SIGKILL (`adapters/vitest/runner.ts:1087-1110`, `adapters/vitest/watch-heartbeats.ts:32-72`, `adapters/vitest/stop-hung-worker.ts:13-34`) | ● опрос out-файла 50 мс + функции дедлайна (`adapters/node-test/run-test-process.ts:133-139`, `adapters/node-test/get-dry-deadline.ts:17-28`, `adapters/node-test/get-unit-deadline.ts:20-25`) | исполнение — в адаптере; **правило бюджета** — одно (см. 7.1, п. 2) |
| Лимиты (timeout, hitLimit) юнитов и попыток | ● `core/run/get-try-limits.ts:16-28`, `core/run/plan-isolated.ts:16-45` | | ○ режет `hookTimeout` до бюджета (`adapters/vitest/runner.ts:553, 562-569`) | | оставить |
| Бюджеты dry run | ● константы 60 с (`core/run/run-dry-phase.ts:114`) | | ○ + таймаут теста + таймауты хуков (`adapters/vitest/runner.ts:989-998`, `adapters/vitest/worker/get-hook-budget.ts`) | ○ + только `--test-timeout` (`adapters/node-test/get-dry-deadline.ts:22-27`) | расхождение → BUG-603 |
| Отмена (Ctrl+C, SIGTERM, SIGHUP) | ✗ нет | | ✗ нет | ○ свои обработчики SIGINT/SIGTERM, пока живы процессы (`adapters/node-test/track-process-group.ts:7, 17-46`) | **ядро/CLI**: один обработчик, `AbortSignal` в контексте, `close()` + `work.remove()` — см. 4.4, BUG-600, BUG-601 |
| Ключ и хранение кэша | ● `core/cache/*` | | | | оставить |
| Входы кэша: настройки, конфиги, окружение | | ○ `index-environment-hashes`, `verdict-variable-pattern` | ● `adapters/vitest/get-cache-inputs.ts:43-60` | ● `adapters/node-test/get-node-cache-inputs.ts:41-77` | оставить (источники разные) |
| Зависимости тестового файла | | ○ `track-inputs` (чтения fs, env), `list-tsconfig-files` | ● граф модулей Vite (`adapters/vitest/collect-dependencies.ts:76-155`) | ● загруженные модули + чтения (`adapters/node-test/collect-node-dependencies.ts:30-74`) | оставить; общий фильтр «файл проекта вне `node_modules`» — в `shared` (сейчас три копии: `adapters/vitest/get-module-file.ts:19`, `adapters/node-test/collect-node-dependencies.ts:52`, `adapters/shared/track-inputs.ts:33`) |
| Сырые факты попытки | | ○ `get-error-message` | ● в воркере (`adapters/vitest/worker/read-try-facts.ts:45-68`) | ● в главном процессе из записей (`adapters/node-test/read-tries.ts:48-89`) | оставить |
| Факты юнита (crash/hang/load/hook) | | | ● `adapters/vitest/build-isolated-facts.ts:22-60` | ● `adapters/node-test/build-isolated-facts.ts:34-98` | **общий нормализатор** в `shared` (7.1, п. 1) |
| Классификация и вердикт | ● `core/run/classify-try.ts`, `read-isolated-unit.ts`, `apply-*-result.ts`, `decide-evidence.ts` | | | | оставить (это лучшая часть дизайна) |
| Детект раннера | ○ выбор по очкам `core/run/resolve-adapter.ts:38-75` | ○ `read-test-scripts` | ● `adapters/vitest/score-vitest.ts:22-28` | ● `adapters/node-test/score-node-test.ts:31-48` | оставить; CLI должен брать `detect` из входа адаптера, а не из `score-*.ts` (`cli/built-in-adapters.ts:3-4`) |
| Собственный рантайм-код mootant не мутируется | ● `core/run/select-run-files.ts:27-28` (знает раскладку адаптеров) | | | | **адаптер** объявляет свои файлы (`TestAdapter.runtimeFiles`) — ядро перестаёт знать раскладку |

### 7.1. Одно правило — два разных кода

Сравнение попарно; для каждой пары — общее требование к поведению и
предлагаемое действие.

1. **`build-isolated-facts.ts` (vitest ↔ node-test)** — «что оставил процесс
   юнита → `IsolatedFacts`».
   * Нет записи `end` → `crash`, если не убит сторожем (тогда `hang`):
     `adapters/vitest/build-isolated-facts.ts:31-45` ↔
     `adapters/node-test/build-isolated-facts.ts:58-64` (у node-test
     дополнительно: ошибка загрузки без `end` — не crash).
   * **Таймаут хука набора**: Vitest ставит `timedOut` по тексту сообщения
     (`adapters/vitest/build-isolated-facts.ts:49`) → ядро даёт `Timeout`
     (`core/run/read-isolated-unit.ts:64-74`); node-test **всегда**
     `timedOut: false` (`adapters/node-test/build-isolated-facts.ts:91`) → тот
     же сценарий даёт `Killed` с причиной `hook-error`
     (`core/run/read-isolated-unit.ts:84-92`). Требование: одинаковое
     наблюдаемое поведение мутанта → одинаковый статус независимо от раннера.
     На score не влияет (оба «detected», `core/run/compute-score.ts:13`), но
     влияет на отчёт, на кэш причин и на дедупликацию «таймаутных» мутантов.
     **[подтверждено]** на `fixture-hook` (хук с таймаутом 200 мс, мутант
     делает ожидание 450 мс): Vitest — `Timeout` «Hook timed out in 200ms.»,
     node:test — `Killed` «The test file failed outside its tests (exit code
     1).», BUG-604. Ещё одна неочевидная развилка: если оставшееся ожидание
     хука держит цикл событий дольше бюджета юнита (в первом варианте
     фикстуры — 3 с), node:test-процесс не завершается сам, его убивает
     сторож, и тот же мутант становится `Timeout (hang)` (наблюдалось;
     объяснение — по коду); статус зависит от длины «хвоста», а не от
     поведения мутанта.
   * `startup` и `hits` при crash считаются по-разному
     (`adapters/vitest/build-isolated-facts.ts:35, 46-48` ↔
     `adapters/node-test/build-isolated-facts.ts:52-57, 86-87`).
   * Предложение: `adapters/shared/to-isolated-facts.ts`, принимающий
     нормализованный исход `{tries, end?, hung, loadError, hookError,
     hookTimedOut, strays, startup}`; раннер-специфика (todo, коды выхода,
     `fails`) остаётся в нормализации адаптера. Польза: правила crash/hang/
     hook-timeout пишутся один раз и сразу верны для Rstest/Jest. Риск: низкий.
     Проверка: существующие `test/adapters/*/build-isolated-facts.test.ts`
     прогоняются против общего модуля + новый табличный тест «один и тот же
     исход → одинаковые факты».
2. **Сторожевые таймеры и бюджеты** (vitest `runner.ts` + `watch-heartbeats`
   ↔ node-test `get-dry-deadline`/`get-unit-deadline` + `run-test-process`).
   Общее требование одно: «процесс, не подающий признаков жизни дольше
   бюджета (+ собственные таймауты раннера), убивается и сообщается как
   `hang`». Расхождения: (а) Vitest добавляет к бюджету dry run таймаут
   самого теста и хуков (`adapters/vitest/runner.ts:989-998`), node-test —
   только `--test-timeout` (`adapters/node-test/get-dry-deadline.ts:22-27`);
   (б) у Vitest запас `HANG_GRACE = 1000` мс на каждый пульс
   (`adapters/vitest/runner.ts:176, 1093`), у node-test запаса нет, а до записи
   `start` даётся `STARTUP_ALLOWANCE = 10 000` мс
   (`adapters/node-test/get-unit-deadline.ts:7`); (в) разные периоды опроса
   (250 мс ↔ 50 мс). Предложение: оставить механизмы (файл пульса и
   опрос out-файла — оба оправданы моделью процессов), но вынести **правило
   бюджета** в одну функцию `shared/get-watch-budget.ts`, а в `DryTest`
   добавить «собственный таймаут теста», который адаптер знает или нет.
3. **«Никогда два юнита одного файла одновременно»** — три механизма Vitest
   (claim с `O_EXCL`, ожидание смерти предыдущего воркера, чередующий
   sequencer) против ключа в пуле node-test. Требование общее
   (`types/adapter/adapter-session.d.ts:14-19`), механизмы обоснованно
   разные: у Vitest расписанием владеет пул Vitest. Оставить; общий у них
   должен быть только **контрактный тест** (6 юнитов одного файла с общим
   файлом-замком — ни одного пересечения), а claim/turn — переехать в
   `shared` к моменту, когда появится второй раннер с собственным пулом.
4. **`run-dry.ts`** (vitest ↔ node-test): сборка `DryRunResult`, сортировка
   (`compareDryEntries` ↔ сортировка только по файлу,
   `adapters/vitest/run-dry.ts:209-210` ↔ `adapters/node-test/run-dry.ts:145-148`
   — эквивалентно, так как у node-test проект всегда пуст), «файл без `end` →
   провал загрузки» (`adapters/vitest/run-dry.ts:194-206, 258-273` ↔
   `adapters/node-test/build-dry-file.ts:76-86`). Совпадает мало, переносить
   **не стоит**: сортировку ядро может делать само (оно и так пересортирует,
   `core/run/run-dry-phase.ts:230-237`).
5. **`run-isolated.ts`**: общее только правило «входы — лишь у юнита с
   записью `end`» (`adapters/vitest/run-isolated.ts:48-58` ↔
   `adapters/node-test/run-isolated.ts:79-92`). Оставить.
6. **`get-*-cache-inputs.ts`**: общий каркас (файлы конфигурации, `.env`,
   setup-файлы, настройки, фильтр `VERDICT_VARIABLE_PATTERN`, хеши
   окружения) уже вынесен в `shared` в той мере, в какой он общий; источники
   данных разные. Оставить.
7. **`collect-*-dependencies.ts`**: общий фильтр «файл проекта вне
   `node_modules`» записан трижды разными способами (`/node_modules/` против
   `path.sep`), см. матрицу. Вынести только фильтр; обход графа — раннер-
   специфичен.
8. **`score-*.ts`**: общий только `readTestScripts` (уже в `shared`). Оставить.
9. **`read-tries.ts` ↔ `worker/read-try-facts.ts`**: оба реализуют
   «"expected to fail" уже перевёрнут, сообщение — первая строка ≤200 знаков»
   (`adapters/shared/get-error-message.ts` общий). Различия — это различия
   раннеров (todo/подтесты у `node:test`, `fails`/повторы у Vitest). Оставить.
10. **Перехват посторонних ошибок**: Vitest — `uncaughtException` +
    `unhandledRejection` (`adapters/vitest/runner.ts:1261-1262`), node-test —
    `uncaughtExceptionMonitor` + `unhandledRejection`
    (`adapters/node-test/preload/preload.ts:77-82`). Разница оправдана (в
    Vitest ошибки воркера уже перехватывает сам Vitest). Оставить.

Различия, которые **проще держать внутри адаптера**: обнаружение тестов
(граф Vite против шаблонов/команды `node --test`), перехват загрузки (Vite-
плагин против module hooks + патча `_compile` для tsx), встраивание в
исполнение (подкласс `TestRunner` против корневого `beforeEach` + репортёра),
семантика todo и подтестов `node:test`, проекты и снапшоты Vitest, Vue/Svelte,
семантика кодов выхода. Переносить их в общий код означало бы ввести
абстракцию с одним реальным пользователем на каждую ветку.

## 8. Расширение до Rstest и Jest

Версии, по которым сверялось API: **`@rstest/core` 0.12.6** (последняя на npm,
опубликована 2026-11-03; репозиторий `web-infra-dev/rstest` на коммите
`21898a1`, `packages/core/package.json` — 0.12.6) и **Jest 30.5.2**
(`jest`, `@jest/core`, `jest-circus`, `jest-runner`, `jest-runtime`,
`jest-environment-node` — 30.5.2, опубликованы 2026-09-18; `jest-worker`
30.5.1). Для Jest сверка шла по `.d.ts` опубликованных пакетов, для Rstest —
по `.d.ts` пакета, документации и исходникам репозитория.

### 8.1. Что требует текущий контракт от любого раннера

| # | Операция контракта | Нужная возможность раннера |
|---|---|---|
| R1 | `start` | программный запуск с конфигом пользователя + свои добавки (перехват загрузки, свой код в воркере) |
| R2 | `listTestFiles` | список тестовых и setup-файлов без запуска |
| R3 | подача переключённого текста | хук трансформации **до** трансформаций пользователя; проверка, что текст совпадает с размеченным (`resolveSwitchedText`) |
| R4 | `dryRun` | запуск «связанных» файлов; покрытие **на попытку** (хуки до/после каждого теста в том же процессе) и вне попыток |
| R5 | `runIsolated` | мутант активен с начала загрузки файла; свежий процесс/граф на юнит; несколько юнитов одного файла — по очереди |
| R6 | сторож | знать pid процесса юнита, убивать зависший; не доверять таймерам теста (фейковые таймеры) |
| R7 | факты | провал/пропуск/таймаут теста; ошибки хуков набора и teardown; необработанные ошибки; «expected to fail» |
| R8 | `runBatch` (необязательно) | выбор тестов по id, повтор теста в одном процессе, переключение мутанта между попытками |
| R9 | `cacheInputs`, `DryFile.dependencies` (необязательно) | граф модулей / список загруженного |

### 8.2. Rstest 0.12.6 через текущий контракт

Пути `dist/*` — в опубликованном пакете `@rstest/core@0.12.6`,
`packages/*` и `website/*` — в репозитории на `21898a1`.

| # | Чем закрывается | Источник |
|---|---|---|
| R1 | `createRstest({ cwd, config })` из `@rstest/core/api`; `loadConfig` из `@rstest/core`; всё помечено `@experimental` «may change before Rstest 1.0.0» | [instance.mdx](https://github.com/web-infra-dev/rstest/blob/21898a134cccf60e61aaa9bb2200fdd1659bfeab/website/docs/en/api/javascript-api/instance.mdx), `dist/api/index.d.ts:406, 1358-1367` |
| R2 | `rstest.listTests({ filesOnly: true })` + `context.config.setupFiles/globalSetup` | там же, `dist/api/index.d.ts:634-646, 802-813` |
| R3 | Rsbuild-плагин в `plugins` (`api.transform` с ранним порядком); тесты исполняются **бандлами Rspack** (`packages/core/src/runtime/worker/runInPool.ts:646-697` грузит `codeContent` из `assetFiles`) — переключение один раз на сборку, мутант по-прежнему в рантайме | `RstestConfig.plugins` (`dist/api/index.d.ts:1343`) |
| R4 | `rstest.run({ filters, related: true })` — `--related` «resolves related tests from the build module graph» (аналог Vitest); покрытие на попытку — через **свой setup-файл** первым в `setupFiles`: `beforeEach`/`afterEach`/`onTestFinished` переключают `runtime.coverage`, как `create-try-tracker.ts` у node-test | [cli.mdx](https://github.com/web-infra-dev/rstest/blob/21898a134cccf60e61aaa9bb2200fdd1659bfeab/website/docs/en/guide/basic/cli.mdx) (раздел «Run related tests»), `dist/index.d.ts:24-28, 271-275, 2765-2769` |
| R5 | `isolate: true` (по умолчанию) + пул `forks`: воркер утилизируется после каждого файла (`packages/core/src/pool` — `disposeRunnerInBackground` при `isolate !== false`); setup-файлы исполняются до файла теста (`runInPool.ts:646-685`) — значит, мутант можно активировать из setup-файла. **Но** `filters` выбирают файлы, один файл дважды за `run()` не запустить → юниты одного файла придётся раскладывать по «волнам», по одному `run()` на волну, а каждый `run()` строит движок заново (`packages/core/src/api/createRstest.ts:200-238`, `withEngine` → `build`) | [isolate.mdx](https://github.com/web-infra-dev/rstest/blob/21898a134cccf60e61aaa9bb2200fdd1659bfeab/website/docs/en/config/test/isolate.mdx) |
| R6 | pid есть в воркере (`process.pid`), пульс — из того же setup-файла; убийство — как у vitest-адаптера (`stop-hung-worker.ts`) | — |
| R7 | репортёр в главном процессе: `onTestCaseResult`, `onTestSuiteResult` («`result.errors` contains only suite hooks errors»), `onTestFileResult`, `onTestRunEnd({ unhandledErrors })`; `TestContext.task.id` — «A stable, unique identifier for the test» | [reporter.mdx](https://github.com/web-infra-dev/rstest/blob/21898a134cccf60e61aaa9bb2200fdd1659bfeab/website/docs/en/api/javascript-api/reporter.mdx), `dist/api/index.d.ts:1008-1048`, `dist/index.d.ts:4019-4036` |
| R8 | **нет**: своего `TestRunner`, как у Vitest (`config.runner`), Rstest не даёт; `repeats` задаётся в объявлении теста. → `batch: false` | `dist/index.d.ts:4122-4126` |
| R9 | граф модулей сборки (статистика Rspack в плагине) | — |

**Что скопировать:** из vitest-адаптера — файловый IPC (план, claim, out,
done), пульс и сторож (`write-plan-files`, `worker/claim-unit`,
`worker/wait-for-turn`, `worker/write-heartbeat`, `watch-heartbeats`,
`stop-hung-worker`, `wait-for-workers`, `read-out-file(s)`,
`reset-run-directory`, `build-isolated-facts`, `run-plan`) ≈ 700 строк; из
node-test — трекер попыток на хуках (`preload/create-try-tracker.ts`, 352
строки) и запись записей. **Какие модули ядра/CLI изменить:**
`cli/built-in-adapters.ts` (новая запись), `core/run/select-run-files.ts:27-28`
(своя раскладка рантайма), `package.json#exports` (`./rstest`),
`cli/parse-arguments.ts:40-41` (справка), `knip`/доки; при новых кодах
диагностик — `types/mutant/diagnostic.d.ts`.
**Если возможности нет:** без пути теста в setup-файле до загрузки файла
(в 0.12.6 он есть — `expect.getState().testPath`, `dist/index.d.ts:2012`,
проверено ниже) пришлось бы делать по одному `run()` на юнит с `env: { MOOTANT_UNIT }` (конфиг `env`), то есть
полная сборка на каждый юнит — неприемлемо медленно; без pid — нет сторожа,
и зависший мутант вешает прогон (остаются только таймауты самого Rstest,
которые не прерывают синхронный цикл).

**Оценка через текущий контракт: L (3–5 дней)** — допущения: экспериментальный
API не меняется в 0.12.x (версию придётся пинить); путь теста в
setup-файле (проверено) остаётся доступным; пересборка движка на каждую волну isolated-юнитов
терпима при `performance.buildCache: true`; без batch и без кэша на первой
итерации (`cacheInputs` необязателен).

**Проверка на фикстуре [подтверждено].** `analysis/tools/adapters/fixture-rstest`
(`@rstest/core` 0.12.6, тот же `src/price.js` и эквивалентные тесты;
скрипт `probe.mjs`, вывод — `analysis/data/adapters/rstest-probe.txt`): `createRstest` + Rsbuild-плагин с `api.transform`,
подающий переключённый текст с `globalThis.__mootant.hit('m1')`, и
setup-файл, который читает план по `expect.getState().testPath` и ставит
`runtime.active` до загрузки файла теста, отслеживая попытки через
`beforeEach`/`afterEach`.

| Проверка | Результат |
|---|---|
| путь теста виден в setup-файле до загрузки теста | да (`expect.getState().testPath`; в исходниках — геттер над состоянием воркера, `packages/core/src/runtime/api/expect.ts:158-162`) |
| мутант из плана активен с загрузки, `reached` по попыткам | да: при `active: 'm1'` тест 1 падает «expected 250 to be 150», `reached: true` только у него |
| свежий процесс на каждый `run()` | да: pid 761, 804, 861, 932, 968 |
| переиспользование сборки между `run()` | **нет**: трансформация переключённого файла на каждом `run()`; 1258 мс первый, 480–660 мс последующие на 3 тестах |
| один файл дважды в `filters` | запускается **один раз** → нужны волны |
| `related: true` с `filters: ['src/price.js']` | находит `test/price.test.js` |
| id тестов стабильны между запусками | да, позиционные (`22268940b0_0_0`), как у Vitest |

Значит, оценка L держится, а главный риск производительности Rstest —
пересборка на каждую волну isolated-юнитов (у Vitest её нет вовсе).


### 8.3. Jest 30.5.2 через текущий контракт

| # | Чем закрывается | Источник |
|---|---|---|
| R1 | `runCLI(argv, projects)` из `@jest/core` — **одноразовый**: каждый вызов заново строит конфиги, haste map и контексты; долгоживущая сессия возможна только на полу-публичных `SearchSource`, `createTestScheduler` (экспортированы в `@jest/core/build/index.d.ts:16-19, 49-85`) и `Runtime.createContext` из `jest-runtime` | [runCLI](https://github.com/jestjs/jest/blob/v30.5.2/packages/jest-core/src/cli/index.ts#L38), [CLI](https://jestjs.io/docs/cli) |
| R2 | `SearchSource.getTestPaths` / `findMatchingTests` + `setupFiles`/`setupFilesAfterEnv` из `ProjectConfig` | `@jest/core/build/index.d.ts:49-85` |
| R3 | обёртка над **каждым** трансформером из `transform` пользователя (babel-jest, ts-jest, @swc/jest): переключённый текст до `process()`, `getCacheKey` с хешем переключённого текста; без этого кэш трансформаций Jest вернёт оригинал | [Code Transformation](https://jestjs.io/docs/code-transformation) |
| R4 | `findRelatedTests` (`SearchSource.findRelatedTests`, граф `jest-haste-map`) ≈ `related`; покрытие на попытку — своя `testEnvironment`, оборачивающая окружение пользователя, с `handleTestEvent` (события jest-circus `test_start`, `test_fn_start`, `test_done`, `hook_failure`, `run_finish`) | [testEnvironment](https://jestjs.io/docs/configuration#testenvironment-string), `@jest/environment/build/index.d.ts:445-455` (`handleTestEvent?: Circus.EventHandler`), [Circus.ts](https://github.com/jestjs/jest/blob/v30.5.2/packages/jest-types/src/Circus.ts) |
| R5 | `EnvironmentContext.testPath` есть в конструкторе окружения (`@jest/environment/build/index.d.ts:18-22`) → мутант активируется до загрузки файла. **Но** Jest гоняет файлы в **переиспользуемых** процессах `jest-worker` (свежий только module registry и vm-контекст): процессное состояние (`process.env`, слушатели `process.on`, нативные модули) одного мутанта может дойти до юнита другого. Нужен перезапуск воркера после каждого файла: `workerIdleMemoryLimit` с минимальным значением (проверить) или свой `runner` (`EmittingTestRunner`, `jest-runner/build/index.d.ts:60-90`), форкающий процесс на юнит. Один путь дважды за прогон — нет (дедупликация путей) → claim/волны, как у Rstest | [runner](https://jestjs.io/docs/configuration#runner-string), [workerIdleMemoryLimit](https://jestjs.io/docs/configuration#workeridlememorylimit-numberstring) |
| R6 | синхронный цикл таймаутом Jest не прерывается; нужен свой сторож с pid воркера (из окружения) и SIGKILL; Jest переживёт смерть воркера и отметит файл упавшим — отличить `hang` от `crash` можно только своими пульсами | [jest-worker](https://github.com/jestjs/jest/tree/v30.5.2/packages/jest-worker) |
| R7 | `handleTestEvent` + `TestResult` (`@jest/test-result`); «expected to fail» — `test.failing` | — |
| R8 | выбор теста — `testNamePattern` (по имени, не по id) (`@jest/types` `Config.GlobalConfig.testNamePattern`); повторов теста в одном процессе нет (`jest.retryTimes` — это ретраи) → `batch: false` | [--testNamePattern](https://jestjs.io/docs/cli#--testnamepatternregex) |
| R9 | `jest-haste-map`/`Runtime` знают граф; зависимости файла — из `Runtime`-контекста | — |

**Что скопировать:** то же, что для Rstest, плюс обёртку окружения (аналог
`runner.ts`: попытки, покрытие, bail, хуки, teardown) и обёртку
трансформеров. **Изменить:** те же модули ядра/CLI, что для Rstest. **Если
возможности нет:** без перезапуска воркеров — нарушена изоляция между
мутантами (только оракул поймает); без ESM — Jest требует
`--experimental-vm-modules` для ESM-проектов, это отдельная ветка поддержки.

**Оценка через текущий контракт: XL (больше недели, 7–10 дней)** —
допущения: только CJS и `jest-circus`; долгоживущая сессия на полу-публичном
API `@jest/core`; перезапуск воркера после каждого файла достижим без своего
`runner`; без batch и кэша на первой итерации.

### 8.4. Те же два раннера через предлагаемый контракт (раздел 9)

| Что меняется | Rstest | Jest |
|---|---|---|
| `runBatch` необязателен, возможности явные (`capabilities`) | нет заглушки | нет заглушки |
| `sameFileInOneRun: false` → волны строит **ядро** | минус своя раскладка по волнам | то же |
| общий набор `mootant/adapter-kit`: claim/turn/пульс/сторож, `toIsolatedFacts`, трекер попыток на хуках, `trackInputs`, `captureClock`, `getErrorMessage`, `compareCodeUnits`, `createDigest`, `resolveSwitchedText` | копировать ≈1000 строк не нужно | то же |
| `runtimeFiles` объявляет адаптер | `core/run/select-run-files.ts` не трогать | то же |
| отмена через `AbortSignal` | адаптер лишь реагирует | то же |
| свободные коды диагностик `adapter/<name>/…` | без правки ядра | то же |
| **Оценка** | **M (до дня)** для isolated-only; +M на кэш | **L (несколько дней)**: окружение-обёртка, трансформеры и перезапуск воркеров остаются |

Общий вывод: стоимость нового адаптера сейчас определяется не
раннер-специфичной частью (у Rstest она невелика — плагин, setup-файл,
репортёр), а **инфраструктурой, которую каждый адаптер обязан повторить**:
расписание юнитов одного файла, сторож, нормализация фактов, отмена. Это и
есть то, что стоит вынести до появления третьего адаптера.

## 9. Минимальный целевой контракт (эскиз)

Принципы: (1) сохранить разделение «факты против решений» и планы — это
лучшая часть текущего дизайна; (2) возможности — явные, а необязательные
операции — необязательные по типу; (3) ядро проверяет то, что сейчас берёт
на веру, и владеет отменой; (4) всё, что каждый адаптер обязан повторить,
— в публичном наборе `mootant/adapter-kit`. Изменения аддитивны: старые
адаптеры работают через совместимый слой (`batch` → `capabilities.batch`).

```ts
// types/adapter/test-adapter.d.ts
export interface TestAdapter {
  /** Версия контракта, которую реализует адаптер; ядро отказывает при несовпадении мажорной. */
  contract: 2
  name: string
  version?: string
  capabilities: AdapterCapabilities
  /**
   * Файлы, которые адаптер исполняет в рабочих процессах (для исключения из
   * мутации вместо SELF_RUNTIME_PATTERN в ядре).
   */
  runtimeFiles?: readonly string[]
  start(context: AdapterContext): Promise<AdapterSession>
}

export interface AdapterCapabilities {
  /** runBatch: выбор тестов по id, повтор теста в процессе, смена мутанта между попытками. */
  batch: boolean
  /** dryRun({ repeat: true }); сейчас неявно = batch. */
  repeat: boolean
  /**
   * Может ли один вызов runIsolated содержать несколько юнитов одного файла
   * (Vitest — да, через claim; Rstest/Jest — нет). При false ядро само
   * раскладывает юниты по волнам: в каждой ≤1 юнита на файл.
   */
  sameFileInOneRun: boolean
  /** Потоковое исполнение isolated (runIsolatedStream). */
  stream: boolean
}

// types/adapter/adapter-context.d.ts
export interface AdapterContext {
  root: string
  workDirectory: string
  concurrency: number | null
  files: readonly SwitchedFile[]
  /** Отмена прогона (SIGINT, SIGTERM, SIGHUP, ошибка ядра): адаптер останавливает все процессы. */
  signal: AbortSignal
  onUnitEnd?(end: UnitEnd): void
  onOutput?(text: string, file: string | null): void
}

// types/adapter/adapter-session.d.ts
export interface AdapterSession {
  listTestFiles(): Promise<string[]>
  dryRun(request: DryRunRequest): Promise<DryRunResult>
  runIsolated(plan: IsolatedPlan): Promise<IsolatedResult>
  /** Только при capabilities.batch. */
  runBatch?(plan: BatchPlan): Promise<BatchResult>
  /** Только при capabilities.stream: юниты приходят по мере решений ядра. */
  runIsolatedStream?(
    units: AsyncIterable<{ index: number; unit: IsolatedUnit }>,
  ): AsyncIterable<IsolatedFacts>
  cacheInputs?(): Promise<CacheInputs>
  /** Должен убить все процессы сессии; повторный вызов безопасен. */
  close(): Promise<void>
  diagnostics?: readonly AdapterDiagnostic[]
  version?: string
  workers?: number
}

// Коды диагностик адаптера — открытое пространство имён.
export interface AdapterDiagnostic extends Omit<Diagnostic, 'code'> {
  code: Diagnostic['code'] | `adapter/${string}`
}

// types/adapter/dry-test.d.ts — одно поле в помощь сторожу
export interface DryTest {
  // …как сейчас…
  /** Собственный таймаут теста и его хуков, если адаптер его знает; ядро добавит его к бюджету. */
  ownTimeout?: number | null
}

// types/adapter/isolated-result.d.ts — чем закончился процесс юнита
export interface IsolatedFacts {
  // …как сейчас…
  /**
   * Код выхода или сигнал процесса юнита, когда адаптер их знает. Ядро
   * подтверждает `incomplete: 'crash'` повтором юнита (как таймаут) и сразу
   * считает сбоем инфраструктуры SIGKILL/SIGTERM, которых не посылал сторож.
   */
  exit?: { code: number | null; signal: string | null } | null
}
```

```ts
// mootant/adapter-kit — публичный набор для адаптеров (то, что сейчас берут из core/* по внутренним путям)
export { resolveSwitchedText } from './core/instrument/resolve-switched-text'
export { installMutantRuntime } from './core/runtime/install-mutant-runtime'
export { compareCodeUnits } from './core/compare-code-units'
export { createDigest } from './core/cache/create-digest'
export { getErrorMessage } from './adapters/shared/get-error-message'
export { captureClock } from './adapters/shared/capture-clock'
export { trackInputs } from './adapters/shared/track-inputs'
export { toIsolatedFacts } from './adapters/shared/to-isolated-facts'     // новый, 7.1 п. 1
export { createUnitClaims } from './adapters/shared/unit-claims'          // claim + turn, из vitest/worker
export { createWatchdog, getWatchBudget } from './adapters/shared/watchdog' // пульс + бюджет, 7.1 п. 2
export { createTryTracker } from './adapters/shared/try-tracker'          // трекер попыток на хуках, из node-test
```

Что ядро начинает **проверять** (новый `core/run/check-adapter-result.ts`):
непустые `tries`, индексы юнитов в диапазоне и без повторов, `test` из плана,
`mutant` из плана, `capabilities` согласованы с наличием методов. Нарушение —
одна понятная ошибка: «The test runner adapter "x" broke the contract: …».

## 10. План миграции небольшими PR

Каждый шаг оставляет `pnpm test` зелёным и не меняет вердикты. Страховочная
сетка всех шагов — **шаг 0**; без него остальные не начинать.

| # | PR | Трудоёмкость | Чем подтверждается сохранение поведения обоих адаптеров |
|---|---|---|---|
| 0 | **Контрактные тесты**: `test/adapters/contract/*.test.ts` на общей фикстуре `test/fixtures/contract/{vitest,node-test}` (один `src`, эквивалентные тесты), прогоняемые для обоих адаптеров одной таблицей сценариев: покрытие dry run по именам тестов; вердикты = физически применённые мутанты (обобщить `test/helpers/apply-mutant.ts`, `run-reference-mutants.ts`, `run-node-test-reference.ts` из существующих тестов эквивалентности `test/adapters/vitest/index.test.ts:801`, `test/adapters/node-test/index.test.ts:332`); юниты одного файла не пересекаются (файл-замок); `hang`/`crash`/`loadError`/`hookError`; `listTestFiles` с setup-файлами; очистка при прерывании | M | сам является тестом; сценарии BUG-600…604 вначале помечены `it.fails` и становятся обычными по мере исправления |
| 1 | Проверка результатов адаптера в ядре (`core/run/check-adapter-result.ts`): непустые `tries`, индексы юнитов в диапазоне и без повторов, тесты и мутанты из плана | S | новые unit-тесты с испорченными результатами (ожидается ошибка «adapter "x" broke the contract …»); все `test/core/run/*` и оба `index.test.ts` без изменений; BUG-605 |
| 2 | Владелец отмены: обработчики SIGINT/SIGTERM/SIGHUP в CLI, `AbortSignal` в `AdapterContext`, `close()` vitest-адаптера убивает воркеры, node-test добавляет SIGHUP | M | контрактный сценарий «прерывание» (нет процессов с `cwd` фикстуры, нет `mootant-*`) для обоих адаптеров; `test/adapters/*/start-*-session.test.ts`; BUG-600/601 |
| 3 | Явные возможности: `capabilities` (`batch`, `repeat`, `sameFileInOneRun`, `stream`), `runBatch` необязателен; `batch: boolean` принимается и нормализуется в `resolve-adapter` | S | `test/core/run/validate-adapter.test.ts`, `resolve-adapter.test.ts` (нормализация старой формы); `test/core/run-mutants.test.ts` с фейковым адаптером без `runBatch`; тест node-test «нет `runBatch`» |
| 4 | Адаптер объявляет `runtimeFiles`; `select-run-files` берёт их вместо `SELF_RUNTIME_PATTERN` | S | `test/core/run/select-run-files.test.ts`; тест в каждом адаптере: статическое замыкание импортов `runner`/`preload` ⊆ `runtimeFiles`; BUG-607 |
| 5 | Общий нормализатор фактов юнита `adapters/shared/to-isolated-facts.ts`; единая семантика таймаута хука | M | существующие `test/adapters/*/build-isolated-facts.test.ts` проходят без изменений ожиданий (кроме сценария BUG-604); табличный тест общего модуля; контрактный сценарий «таймаут хука → `Timeout` в обоих» |
| 6 | Подтверждение `crash` повтором (+ необязательный `exit` в фактах) | S | новый `test/core/run/read-isolated-unit.test.ts` и `test/core/run/apply-isolated-result.test.ts`; контрактный сценарий «процесс юнита убит один раз → `Survived` + `worker-crash`»; BUG-602 |
| 7 | Общее правило бюджета сторожа + `DryTest.ownTimeout` | S | `test/adapters/node-test/get-dry-deadline.test.ts`, тесты пульса Vitest; контрактный сценарий с уменьшенными `DRY_TIMEOUTS`: тест со своим большим таймаутом не «висит» ни в одном адаптере; BUG-603 |
| 8 | Публичный `mootant/adapter-kit` (+ поле `contract`), встроенные адаптеры импортируют только его и `types/adapter` | M | `test:types`, `test:usage` (knip); снапшот имён экспорта набора; все тесты адаптеров без изменений; правило ESLint/dependency-cruiser «`adapters/*` не импортирует `core/*`, кроме набора» |
| 9 | (скорость) `runIsolatedStream` за возможностью `stream`, сначала Vitest | M | `--json --all` с потоком и без совпадают побайтно на контрактной фикстуре и проектах бенчмарка; `test/core/run/run-isolated-rounds.test.ts`; замеры раздела 4 |
| 10 | Адаптер Rstest (isolated-only) на наборе | M–L | контрактный набор с третьим вариантом фикстуры `test/fixtures/contract/rstest` |

Шаги 1, 3, 4, 6, 7 независимы и могут идти в любом порядке после шага 0;
шаг 8 удобнее после 5 и 7 (в набор уходят уже общие модули).


## 11. Что сделано хорошо (оставить как есть)

* **Разделение «факты против решений».** Адаптеры не решают статусы
  (`types/adapter/test-adapter.d.ts:4-9`), классификация и вердикт целиком в
  ядре. Благодаря этому правила одинаковы для любого раннера, а новый адаптер
  не может испортить семантику score. Это главное, что стоит сохранить в
  любой реорганизации.
* **Ядро перепроверяет то, что может:** лимит вычислений сайтов
  (`core/run/classify-try.ts:26-28`), контроли batch-kill'ов
  (`core/run/apply-batch-result.ts:305-320`), подтверждение таймаутов,
  повтор потерянных юнитов, проверку настоящих провалов без инструментирования
  (`core/run/run-dry-phase.ts:385-421`).
* **Переключение мутантов в рантайме + общий кэш трансформаций Vite**
  (раздел 6.1) — архитектурная основа скорости.
* **Аккуратная работа с процессами в node:test:** процесс-лидер группы,
  убийство всей группы (включая порождённые тестами серверы), обработчики
  сигналов только пока процессы живы, повторный подъём сигнала
  (`adapters/node-test/stop-process-group.ts:9-19`,
  `adapters/node-test/track-process-group.ts:17-56`).
* **Собственный пул Vitest** только ради одной вещи — не ждать 60 с
  ответа `stopped` от убитого воркера (`adapters/vitest/create-forks-pool.ts:25-38`),
  с деградацией к поведению Vitest, если тот изменит протокол.
* **Сторож не зависит от фейковых таймеров** (`adapters/shared/capture-clock.ts`).
* **Тесты эквивалентности с вручную применёнными мутантами** для обоих
  адаптеров (`test/adapters/vitest/index.test.ts:801-...`,
  `test/adapters/node-test/index.test.ts:332-...`) — это уже почти
  контрактные тесты; их не хватает только в общем виде (раздел 10, шаг 0).
* **Контракт компонуем**: декоратор-трассировщик (раздел 0) — 100 строк на
  публичных типах, без доступа к внутренностям.

## 12. Существенные рекомендации (после критического пересмотра)

| # | Рекомендация | Проблема | Чем подтверждена | Польза | Риски/компромиссы | Как проверить |
|---|---|---|---|---|---|---|
| 1 | Контрактный набор тестов для всех адаптеров на общей фикстуре (шаг 0) | правила одного контракта реализованы дважды, и расхождения не ловятся: тесты адаптеров в основном на моках следующего слоя (`test/adapters/vitest/start-vitest-session.test.ts:29-55`), сквозные тесты — на разных фикстурах | BUG-603 и BUG-604 найдены только сравнением двух адаптеров на эквивалентных фикстурах | безопасный рефакторинг, критерий готовности для Rstest/Jest | +время `test:unit` (настоящие раннеры) — держать 10–15 сценариев | набор ловит возврат BUG-604, если откатить шаг 5 |
| 2 | Единый владелец отмены (шаг 2) | при SIGTERM/SIGHUP — бесконечные сироты; каталог не удаляется никогда | BUG-600, BUG-601: 6/6 и 3/4 сценариев | CI-отмена и закрытый терминал не оставляют процессов, жгущих CPU | обработчики сигналов в CLI должны корректно сниматься (тесты, программный API) | контрактный сценарий «прерывание» |
| 3 | Подтверждать `crash` повтором (шаг 6) | смерть процесса от инфраструктуры = ложный `Killed`, молча | BUG-602 в обоих адаптерах | score не завышается из-за OOM в CI | +1 юнит на редкий настоящий crash | `Survived` после разового SIGKILL; без повтора — `Killed` |
| 4 | Явные возможности, необязательный `runBatch`, `repeat` отдельно от `batch` (шаг 3) | один флаг кодирует 4 возможности; заглушка `runBatch` в node-test; неявная связь `repeat`↔`batch` | `types/adapter/test-adapter.d.ts:25-29`, `adapters/node-test/start-node-test-session.ts:206-207`, `adapters/node-test/run-dry.ts:58-62` | Rstest/Jest подключаются без заглушек; ядро само раскладывает волны для раннеров без «одного файла дважды» | ещё одно поле контракта; старая форма поддерживается | тесты `validate-adapter`/`resolve-adapter`, фейковый адаптер без `runBatch` |
| 5 | `mootant/adapter-kit` + общий нормализатор фактов + общее правило бюджета (шаги 5, 7, 8) | новый адаптер копирует ≈1000 строк инфраструктуры; протечки в `core/*` по внутренним путям | разделы 2, 7.1, 8.2–8.4 | Rstest: L → M; Jest: XL → L | набор становится публичным API (semver) — включать только устоявшееся | `test:types`, knip, снапшот экспорта; тесты адаптеров без изменений |
| 6 | Проверять результаты адаптера (шаг 1) | нарушение контракта → `TypeError` без имени адаптера | BUG-605 | диагностируемость сторонних адаптеров | микроскопическая цена на прогон | unit-тесты с испорченными результатами |
| 7 | Потоковое isolated-исполнение и префорк процессов (6.4, п. 1–2) | барьер раунда и старт процесса на критическом пути | индикативно: startup юнита 454 мс при duration 91 мс (Vitest), 94 при 86 мс (node:test), раздел 1 | ожидается кратный выигрыш на маленьких тестовых файлах — **решать после [ДАННЫЕ РАЗДЕЛА 4]** | сложность расписания; префорк не должен грузить код пользователя заранее | побайтное совпадение `--json --all`; оракул `data/isolation.md` |

**Отклонено после пересмотра** (перенос ради переноса): объединять
`run-dry.ts`, `run-isolated.ts`, `get-*-cache-inputs.ts`, `score-*.ts`,
`read-tries.ts`/`read-try-facts.ts` — совпадает в них мало, различия
определяются раннером (7.1, п. 4–9); переводить node:test на переключение
мутантов в одном процессе или переиспользовать воркеры — ломает изоляцию
(6.4); делать «юнит = только покрывающие тесты» — меняет вердикты.
