# Эксперимент «Изоляция» (раздел 1, «Архитектура адаптеров»)

> Коммит 170ec52, Node 22.23.4, Vitest 5.0.5, машина 4 vCPU / 15 GB (общая,
> параллельно работали другие агенты; load average во время прогонов 4–32).
> Сырые отчёты — `/home/user/projects/oracle/results{,-nt}/<фикстура>/iso-*.json`,
> скрипт — `analysis/tools/oracle/isolation.sh`, сводка —
> `analysis/tools/oracle/verdicts.mjs`.

## Как адаптеры изолируют мутантов (по коду)

### Vitest (isolated path, режим по умолчанию)

- Единица (unit) = мутант × целый тест-файл (`core/run/plan-isolated.ts:16-44`).
  Все единицы раунда идут одним `vitest.runTestSpecifications`: на каждую
  единицу — своя спецификация того же файла (`adapters/vitest/run-plan.ts:63-65`).
- Каждый проект Vitest принудительно получает `isolate: true` и собственный пул
  `mootant-forks` (`adapters/vitest/configure-project.ts:46-49`), а Vitest 5
  при `isolate: true` создаёт для каждой задачи новый `PoolRunner`, то есть
  новый процесс (`node_modules/vitest/dist/chunks/index.1TqnEahn.js:5932`, `:5974-5995`). Значит, у каждой единицы свой процесс, свой граф модулей,
  свой `globalThis`, `process.env`, прототипы и таймеры. Переиспользования
  воркера между мутантами в isolated-режиме нет.
- Воркер забирает номер единицы файлом-заявкой `claim/<hash>-<i>` (`O_EXCL`,
  `adapters/vitest/worker/claim-unit.ts:19-42`) и ждёт, пока процесс
  предыдущей единицы того же файла умрёт (`worker/wait-for-turn.ts:32-49`), так
  что один тест-файл никогда не исполняется дважды одновременно; разные файлы
  идут параллельно (как в обычном `vitest run`).
- Мутант активен с `onBeforeCollect` (до загрузки setup-файлов и самого
  тест-файла) до конца teardown воркера (`adapters/vitest/runner.ts:548-552`);
  переключатель — глобальный `globalThis.__mootant.active`
  (`core/runtime/install-mutant-runtime.ts:18-61`).
- Общее между мутантами в isolated-режиме остаётся только вне процесса
  воркера: файловая система (тесты, пишущие файлы), главный процесс Vitest
  (`globalSetup`, кэш трансформаций Vite — для мутантов он одинаков, т. к.
  переключаемый текст один на все мутанты), и рабочий каталог Mootant.

### Vitest (batch path, `--fast`)

- Одна единица = тест-файл; в одном процессе подряд идут попытки
  `control, m1, control, m2, control…` каждого теста с переключением
  `runtime.active` между попытками (`adapters/vitest/runner.ts:642-645`,
  `:846`). Модульное состояние, кэши, моки и глобалы *общие* для всех
  попыток процесса. Убийство принимается, если контрольные попытки до и после
  прошли (`core/run/apply-batch-result.ts:305-320`) — это эвристика, о
  ложных убийствах сказано прямо в комментарии (`apply-batch-result.ts:46-52`)
  и в документации (`docs/content/guide/configuration.mdx`, `fast`).
- Batch решает только Killed/Timeout; выжившие и сомнительные уходят на
  isolated-перепроверку (`core/run/run-batch-phases.ts:91-97`), поэтому
  ложных Survived batch дать не может — только ложные Killed/Timeout.

### node:test

- Каждая единица — отдельный процесс `node <preload> <флаги> <файл>`
  (`adapters/node-test/run-isolated.ts:57-68`, `run-test-file.ts:25-58`),
  мутант активен с загрузки preload (`preload/create-try-tracker.ts:149`).
  Batch-режима нет (`start-node-test-session.ts:206-207`).
- Дочерние процессы и worker_threads, которые запускают тесты, получают
  `MOOTANT_UNIT` удалённым из окружения и остаются инертными
  (`preload/read-unit.ts:14-24`) — исполняется исходный код (документировано).

## Как адаптер отличает падение теста от сбоя раннера

| Что произошло в единице | Vitest | node:test | Вердикт ядра (`core/run/read-isolated-unit.ts`) |
|---|---|---|---|
| ни один воркер не взял единицу | нет claim (`run-isolated.ts:43-45`) | — | повтор в следующем раунде, затем `Error` (`apply-isolated-result.ts:93-112`) |
| сторож убил зависший воркер | `hang` (`build-isolated-facts.ts:36`) | `hang` (`build-isolated-facts.ts:59-61`) | `Timeout(hang)`, подтверждение с удвоенными границами (`get-unit-evidence.ts:15-30`) |
| процесс умер без end-записи | `crash` | `crash` (нет end и нет load error) | **`Killed(crash)` без проверки reached** (`read-isolated-unit.ts:42-44`) |
| счётчик сайтов > hitLimit | `hits` | `hits` | `Timeout(hit-limit)`, без подтверждения (`read-isolated-unit.ts:31-38`) |
| тест упал/таймаут/stray после reached | try facts | try records | `Killed(assertion/stray-error)` / `Timeout(time-limit)` |
| то же, но до reached | | | «doubtful», игнорируется (`classify-try.ts:29-43`) |
| ошибка загрузки файла | `loadError` | uncaught до `loaded` | **`Killed(load-error)` без проверки reached** (`read-isolated-unit.ts:75-83`) |
| ошибка suite-хука / teardown | `hookError` | exit ≠ 0 без упавших тестов | `Killed(hook-error)` только при reached (`:84-92`) |

(результаты экспериментов — ниже)

## Пары мутантов и режимы (Vitest)

Для каждой пары: `--mutant A`, `--mutant B`, `--mutant A --mutant B`,
`--mutant B --mutant A`, то же с `--fast`, с `--concurrency 1` и
`--fast --concurrency 1`, плюс полный прогон `src` (по умолчанию и `--fast`) и
эталон (физическая мутация + обычный `vitest run` всего набора). Все прогоны —
`--no-cache`, `--concurrency` по умолчанию = `maxWorkers` Vitest = 3.

| Пара | Что общее | Мутант | полный | `--fast` полный | A | B | AB | BA | AB `--fast` | AB c1 | AB `--fast` c1 | эталон |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| counter | модульное `count`, один тест-файл | A `09w15scc` `count = 0` → `;` (в `reset`) | Survived | **Killed [batch]** | Survived | — | Survived | Survived | **Killed [batch]** | Survived | **Killed [batch]** | survived |
| | | B `x9ahzmww` `count += step` → `count -= step` | Killed | Killed [batch] | — | Killed | Killed | Killed | Killed [batch] | Killed | Killed [batch] | killed |
| memo | модульный `Map`-кэш, один тест | A `prd6tx8n` `memo.has(n)` → `false` | **Timeout (hit-limit)** | **Timeout (hit-limit) [batch]** | **Timeout** | — | **Timeout** | **Timeout** | **Timeout [batch]** | **Timeout** | **Timeout [batch]** | survived |
| | | B `twzenj03` `n < 2` → `n <= 2` | Killed | Killed [batch-survivor] | — | Killed | Killed | Killed | Killed [batch-survivor] | Killed | Killed [batch-survivor] | killed |
| seen | модульный `Set`, один тест-файл | A `7kq6qzrd` `seen.clear()` → `;` | Survived | **Killed [batch]** | Survived | — | Survived | Survived | **Killed [batch]** | Survived | **Killed [batch]** | survived |
| | | B `2nde6pq8` `seen.has(id)` → `true` | Killed | Killed [batch] | — | Killed | Killed | Killed | Killed [batch] | Killed | Killed [batch] | killed |
| mocks | два файла: `api.js` (A) мокается фабрикой с `vi.importActual` через хелпер, `service.js` (B) | A `jnhjhh9w` `` `user${id}` `` → `''` | Killed | Killed [batch] | **NoCoverage** | — | Killed | Killed | Killed [batch] | Killed | Killed [batch] | killed |
| | | B `2hmxc740` `isAdmin(user)` → `false` | Killed | Killed [batch] | — | Killed | Killed | Killed | Killed [batch] | Killed | Killed [batch] | killed |

Дополнительно для пары mocks: `mootant run src/api.js` даёт A — `NoCoverage`,
а `18v42cm0` (`{ id, name }` → `{ name }`) — тоже `NoCoverage` (в полном прогоне
оба `Killed`). Это BUG-201.

### Выводы по Vitest

1. **Isolated-путь от соседних мутантов не зависит.** Ни одна пара не
   поменяла вердикт от порядка (`AB` = `BA`), от совместного запуска и от
   `--concurrency 1` против 3: у каждой единицы свой процесс (см. выше), а
   решение о вердикте берётся из первого по рангу файла с уликой
   (`core/run/decide-evidence.ts:17-35`) и от группировки по раундам не
   зависит. Модульный кэш, моки (`vi.mock` с фабрикой, `vi.doMock`, `vi.mock(…, { spy: true })`),
   `globalThis`, `process.env`, прототипы (`vt/state/src/registry.js`) и fake
   timers (`vt/modes/test/timers.test.js`) в isolated-режиме дали вердикты,
   совпавшие с эталоном.
2. **Но от *файлов* прогона isolated-путь зависит** (пара mocks): выбор
   тест-файлов dry run — статический анализ Vitest по множеству переключаемых
   файлов, а это множество зависит от выбранных мутантов (BUG-201).
3. **Batch (`--fast`) делит состояние между попытками.** Ложные убийства
   (counter A, seen A) происходят не из-за второго мутанта, а из-за
   контрольной попытки перед мутантом: она оставляет `count = 1` / `seen = {x}`,
   мутант перестаёт их сбрасывать, тест падает, контроль после снова проходит
   (он сбрасывает) — убийство принято (`core/run/apply-batch-result.ts:305-320`).
   Обратный эффект — кэш, заполненный контрольной попыткой, прячет мутанта
   (memo B: в batch выжил, потому что `fib(25)` взят из мемо) — безопасен:
   выжившие batch всегда перепроверяются isolated
   (`core/run/run-batch-phases.ts:91-97`), вердикт B верный.
4. `--fast` с `--concurrency 1` не убирает ложные убийства: это не гонка, а
   общий модульный граф в одном процессе.

### Static-мутанты (код при загрузке модуля), Vitest

| Пара | Мутант | полный | `--fast` | A | B | AB | BA | AB `--fast` | AB c1 | AB `--fast` c1 | эталон |
|---|---|---|---|---|---|---|---|---|---|---|---|
| load (`src/constants.js`, top-level) | A `hj0yd0hb` `3 * 2` → `3 / 2` | Killed [static] | Killed [static] | Killed | — | Killed | Killed | Killed [static] | Killed | Killed [static] | killed |
| | B `e7cxkzve` `LIMIT > 5` → `LIMIT >= 5` | Survived [static] | Survived [static] | — | Survived | Survived | Survived | Survived [static] | Survived | Survived [static] | survived |

Static-мутанты всегда идут isolated, в том числе в `--fast`
(`core/run/classify-mutants.ts:94-115`, причина `static`), поэтому batch на
них не влияет.

### node:test

| Пара | Мутант | полный | A | B | AB | BA | AB `--fast` | AB c1 | AB `--fast` c1 | эталон |
|---|---|---|---|---|---|---|---|---|---|---|
| counter (`nt/state`) | A `09w15scc` `count = 0` → `;` | Survived | Survived | — | Survived | Survived | Survived | Survived | Survived | survived |
| | B `x9ahzmww` `count += step` → `count -= step` | Killed | — | Killed | Killed | Killed | Killed | Killed | Killed | killed |

`--fast` у node:test ничего не меняет (заметка «node-test has no batch mode, so
fast mode runs every mutant isolated»): тот же мутант, что в Vitest `--fast`
даёт ложный Killed, здесь `Survived`, как у эталона.

### `--since` (тот же механизм, что BUG-201)

Копия `vt/mocks` как git-репозиторий, изменена только строка 2 `src/api.js`,
`mootant run src --since HEAD`: оба мутанта строки (`18v42cm0`, `jnhjhh9w`) —
`NoCoverage`, в полном прогоне и у эталона — `Killed`/`killed`. В CI с
`--since` это ложные непокрытые мутанты на изменённых строках.
Отчёт: `/home/user/projects/oracle/results/mocks/since.json`.

### Файловая система — общий ресурс между единицами

Фикстура `vt/fscache`: тест кэширует результат в `.cache/21.json` внутри
проекта. Dry run (кэша нет) вычисляет и пишет файл, а каждая isolated-единица
уже читает его и до мутантов `compute` не доходит. Итог (эталон — свежая копия
на каждого мутанта, `git clean -x`):

| Мутант | Mootant | эталон |
|---|---|---|
| `43bfzptb` `value * 2` → `value / 2` (`compute.js`) | **NoCoverage**, при этом `tests: 1`, `coveredBy: [doubles through the on-disk cache]` | killed |
| `ch4kze59` `2` → `3` | **NoCoverage** (то же) | killed |
| `3hbdt5q6` `result` → `undefined` | **NoCoverage** (то же) | killed |
| `7dtdwjsz` `existsSync(file)` → `true` | **Survived** | killed |

Процессы единиц изолированы, а диск — нет: результат единицы зависит от того,
что оставили dry run и предыдущие единицы того же сеанса. Обычный `vitest run`
на «грязной» копии повёл бы себя так же, поэтому ошибка не в изоляции как
таковой, а в том, что противоречие «покрыт в dry run, но ни одна единица не
достигла» Mootant превращает в `NoCoverage` без диагностики (BUG-206;
`core/run/decide-results.ts:50`, `core/run/get-final-status.ts:36`).

## Итог эксперимента

- **Isolated-путь (по умолчанию)**: вердикт мутанта не зависит от других
  мутантов, их порядка, `--concurrency` и переиспользования воркеров — у каждой
  единицы свой процесс в обоих адаптерах. Зависимость есть от *множества
  файлов* прогона (BUG-201: `--mutant`, узкие пути, `--since`) и от
  состояния диска, которое оставили предыдущие запуски тестов (BUG-206).
- **Batch-путь (`--fast`, только Vitest)**: состояние модулей общее для всех
  попыток процесса. Защита контрольными попытками (до и после мутанта)
  работает для состояния, которое читает исходный код, но не для состояния,
  которое мутант перестал сбрасывать (ложные Killed, документировано), и не
  для «горячих» конечных циклов (BUG-202). Выжившие и сомнительные
  перепроверяются isolated, поэтому ложных Survived batch не даёт — в пару
  memo B кэш, заполненный контрольной попыткой, спрятал мутанта в batch, но
  isolated-перепроверка дала верный Killed.
- Влияние одного мутанта batch на другого (A оставляет состояние, которое
  ломает попытку B при здоровых контролях) отдельной фикстурой не проверял.
  По коду: если порча ломает контрольную попытку между A и B, оба мутанта
  становятся сомнительными и уходят на isolated
  (`apply-batch-result.ts:305-320`); ложное убийство B возможно, только если
  испорченное состояние читает лишь мутированный путь B, — **гипотеза**, не
  подтверждена. В парах выше (counter, memo, seen, mocks) влияния не было.
