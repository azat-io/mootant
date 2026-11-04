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
