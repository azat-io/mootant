# Эксперимент «Изоляция» (раздел 1, «Архитектура адаптеров»)

> Коммит 170ec52, Node 22.23.4, Vitest 5.0.5, машина 4 vCPU / 15 GB (общая,
> параллельно работали другие агенты; load average во время прогонов 4–9).
> Сырые отчёты — `/home/user/projects/oracle/results/<проект>/iso-*.json`,
> скрипт — `analysis/tools/oracle/isolation.sh`, сводка —
> `analysis/tools/oracle/verdicts.mjs`.

## Как адаптеры изолируют мутантов (по коду)

### Vitest (isolated path, режим по умолчанию)

- Единица (unit) = мутант × целый тест-файл (`core/run/plan-isolated.ts:16-44`).
  Все единицы раунда идут одним `vitest.runTestSpecifications`: на каждую
  единицу — своя спецификация того же файла (`adapters/vitest/run-plan.ts:63-65`).
- Ядро проекта принудительно получает `isolate: true` и собственный пул
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
   зависит. Модульный кэш, моки (`vi.mock`, `vi.doMock`, `{ spy: true }`),
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
