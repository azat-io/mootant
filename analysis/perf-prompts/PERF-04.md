# PERF-04: заранее запущенные процессы юнитов (префорк без загрузки кода пользователя)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 4 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз, не замер: поверх P1 (PERF-01)
> ×1,2–1,4 холодного прогона на path-to-regexp и cheerio, около 5 % на
> perfectionist; на машине стенда (4 vCPU) потолок по CPU — около ×1,23–1,24
> (см. «Доказательства»). Риск для вердиктов: средний. Трудоёмкость: L.
> Прототип: нет. Тип: реализация с шагом 0 «делать / не делать» и обязательной
> проверкой изоляции оракулом. Замерено на коммите 170ec52; код сверен с `main`
> на bd7af11.

## Контекст

Юнит isolated-пути — мутант в целом тест-файле со свежим графом модулей
(`types/adapter/isolated-plan.d.ts:3-10`). Юниты одного файла не идут
одновременно (`types/adapter/adapter-session.d.ts:14-20`). Адаптеры Vitest и
node:test дают каждому юниту свежий процесс. Переиспользовать процесс со
сбросом графа анализ отверг: глобалы, слушатели и таймеры переживают юнит, и
вердикты меняются (`analysis/01-architecture.md`, «Архитектура адаптеров», 6.3
п. 1 и абзац после таблицы 6.4). Префорк оставляет процесс на юнит, но
запускает его заранее, чтобы старт ушёл с критического пути.

**Граница задачи.** До выдачи процесса юниту в нём исполняется только код
Node, Vitest и Mootant. Всё, что из проекта, остаётся после выдачи, там же, где
сейчас: флаги `--require`/`--import`, своё окружение теста, setup-файлы,
тест-файл.

**Vitest.** Mootant ставит каждому проекту свой пул и `isolate: true`
(`adapters/vitest/configure-project.ts:46-48`). Пул — обёртка над
`ForksPoolWorker` самого Vitest (`adapters/vitest/create-forks-pool.ts:44-104`):
`createPoolWorker` создаёт воркер (`:49-50`), `start` запоминает время запуска
процесса по pid в `spawns` (`:63-69`). На юнит — одна спецификация
(`adapters/vitest/run-plan.ts:66-68`). При `isolate: true` Vitest 5.1.0 на каждую
задачу создаёт новый `PoolRunner` через `customPool.createPoolWorker`
(`node_modules/vitest/dist/chunks/index.Di8au7q4.js:5985-6010`). Остановку
отработавшего он не ждёт: слот освобождается сразу после `testfileFinished`
(`:5947-5953`). Путь процесса до мутанта:

1. `fork` в `ForksPoolWorker.start` (`index.Di8au7q4.js:5489-5507`,
   `this._fork ||= fork(entrypoint, [], { env, execArgv, … })`): bootstrap Node,
   бандл воркера Vitest (`dist/workers/forks.js`) и то, что грузят `execArgv` и
   `NODE_OPTIONS` проекта;
2. сообщение `start` (`PoolRunner.start`, `:5253-5296`): `VITEST_POOL_ID` и
   `VITEST_WORKER_ID` (`chunks/init.CO4AB7HZ.js:265-267`), `config.env`, загрузка
   и `setup` окружения теста, в том числе своего (`environment: './env.ts'`,
   `chunks/base.Cof-UHJf.js:166-191`);
3. сообщение `run`: `define`, module runner, раннер Mootant
   (`base.Cof-UHJf.js:193-231`). Конструктор раннера пишет `worker/<pid>`
   (`adapters/vitest/runner.ts:475-482`);
4. `onBeforeCollect` (`runner.ts:514-575`). Здесь отмечается `booted` (`:519`),
   юнит берётся claim-файлом (`:535-541`), процесс ждёт `waitForTurn` (`:544`), и
   только потом ставится `runtime.active = unit.mutant` (`:553`). Затем идут
   setup-файлы и тест-файл (`chunks/run.CjdgFZiW.js:4210`, `:3456-3466`).

Шаги 1–3 и сейчас идут до того, как процесс узнаёт свой юнит. «Старт
процесса» стенда — `booted − spawned` (`adapters/vitest/build-isolated-facts.ts:46-48`),
то есть шаги 1–3. Без P1 следующий воркер того же файла стартует в свободном
слоте и ждёт в `waitForTurn`, пока жив процесс предыдущего юнита (опрос раз в
20 мс, `adapters/vitest/worker/wait-for-turn.ts:11`, `:32-49`). Так что в
цепочке его старт уже перекрыт ожиданием очереди (01-architecture, 6.4 п. 2),
и на path-to-regexp без P1 префорк почти ничего не даст. С P1 ожидания нет, и
старт каждого юнита стоит на критическом пути слота. `startup` идёт только в
`summary.staticCost` отчёта (`core/run/apply-isolated-result.ts:68`,
`core/run/compute-static-cost.ts:14-40`), на вердикт не влияет.

**node:test.** Процесс на юнит: `spawn(node, [...handle.args, file])`,
`detached: true`, юнит — в переменной `MOOTANT_UNIT`
(`adapters/node-test/run-test-file.ts:48-61`, `run-test-process.ts:124-130`).
Тест-файл — главный модуль процесса (`adapters/node-test/preload/preload.ts:50`).
Первым грузится preload Mootant: первый `--require` или первый `--import`
(`adapters/node-test/place-preload.ts:20-57`), без top-level `await`
(`preload.ts:25-28`). Он читает и удаляет `MOOTANT_UNIT`
(`adapters/node-test/preload/read-unit.ts:14-24`, вызов — `preload.ts:40`) и
включает мутант с начала процесса
(`adapters/node-test/preload/create-try-tracker.ts:149`). Пул не запускает два
юнита одного файла и стартует процесс следующего только после конца
предыдущего (`adapters/shared/run-in-pool.ts:21-26`, ключ — файл,
`adapters/node-test/run-isolated.ts:96`). Поэтому 58 мс старта стоят на
критическом пути цепочки и без P1. Сторож: до записи `start` срок —
`spawned + timeout + 10 с`, после — `start.time + timeout`
(`get-unit-deadline.ts:20-25`; `spawned` — `run-test-process.ts:100-101`;
`time` — `preload.ts:37`, запись `start` — `:72`). `startup` =
`start.time − spawned` (`build-isolated-facts.ts:86-87`). Раньше preload, по
коду, исполняются только legacy-загрузчики (`--loader`, `--experimental-loader`);
о них Mootant предупреждает (`start-node-test-session.ts:30-33`, `:123-132`).

**Jest** (добавлен после 170ec52, `bc6adec`). Воркеры долгоживущие: слот
держит воркер, пока тот жив (`adapters/jest/create-worker-pool.ts:31-41`).
Юниты файла идут на нём «тёплыми», потом файл перепроверяется без мутантов
(`run-isolated.ts:206-260`), так что по умолчанию старта на юнит нет. Новый
процесс берут только чистые попытки и режим `freshWorkers: true`
(`run-on-worker.ts:65-72`, `adapters/jest/types/jest-adapter-options.d.ts:10-14`).
Ещё пул опустошается в начале каждого плана (`run-isolated.ts:104`). При
загрузке воркер грузит пакеты Jest и `session.json` и шлёт `ready`
(`adapters/jest/worker/boot-worker.ts:86-298`). Код проекта может попасть туда
через флаги Node команды теста (`start-worker.ts:51-64`). Замеров Jest в
анализе нет.

**Что изменилось на main с 170ec52.** `create-forks-pool.ts` и
`configure-project.ts` не менялись (`git diff 170ec52 bd7af11` по ним пуст).
`runner.ts` правился (`interceptStrays` и др.); строки claim и активации
сдвинулись на 1–3, логика та же. У node:test появились `groups` сессии
(`run-test-process.ts:137-141`, закрытие — `start-node-test-session.ts:208-214`),
а `run-in-pool.ts` переехал в `adapters/shared/`. Добавлен Jest-адаптер. В
`node_modules` main — Vitest 5.1.0; `ForksPoolWorker` у 5.0.5 (стенд) и 5.1.0
одинаков (у 5.0.5 —
`node_modules/vitest/dist/chunks/index.1TqnEahn.js:5448-5496` (170ec52)).
Префорка нет ни в одном адаптере. P1 на main тоже нет: `parallelUnits` в коде
не встречается, так что зависимость от PERF-01 открыта. Задача актуальна.

## Доказательства

Условия: эксклюзивное окно 2026-11-04, 07:35–13:43 UTC
(`analysis/04-performance.md` §4.5.1); 4 vCPU Intel Xeon 2.1 GHz, 15 GB, без
swap, Node 22.23.4, hyperfine 1.18.0, GNU time; Mootant 170ec52;
`--concurrency 3`; 3 прогона на точку; обычный режим, холодный кэш (`m-cold`).
Все точки ниже длиннее 30 с, поэтому wall — hyperfine, mean ± σ (в скобках
медиана). CPU — user + sys дерева процессов (GNU time).

| | path-to-regexp | cheerio | perfectionist | fast-json-stringify |
|---|---|---|---|---|
| раннер | Vitest 5.0.5 | Vitest 5 | Vitest 5.0.5 | node:test |
| юнитов | 339 | 662 | 594 | 2088 |
| старт процесса на юнит, мс (§4.5.3) | 143 | 142 | 156 | 58 |
| юнит в воркере после очереди, мс (`duration` записи `end`; `data/bench/summary.md`) | 250 | 289 | 3015 | — |
| wall база, с | 93,9 ± 1,5 (94,2) | 164,3 ± 1,8 (165,3) | 952,5 ± 40,7 (948,8) | 402,3 ± 9,1 (403,7) |
| wall P1, с (§4.5.5) | 53,5 ± 1,2 (54,2) | 111,6 ± 4,2 (110,3) | 712,8 ± 10,0 (715,9) | 264,5 ± 5,3 (266,5) |
| занятость слотов база → P1 | 31 → 67 % | 40 → 68 % | 68 → 93–94 % | — |
| CPU база → P1, с | 178 → 172 | 363 → 364 | 2437 → 2363 | 895 → 853 |

Ещё измерено:

- «Старт процесса на юнит» = (Σ `summary.staticCost[].duration` −
  Σ `mutants[].duration`) / юнитов, медиана 3 прогонов: у Vitest
  spawn → `onBeforeCollect`, у node:test — spawn → запись `start`. Fork,
  сообщения `start` и `run` по отдельности не мерились. В профиле воркеров это
  bootstrap Node и модули самого Vitest внутри «загрузки модулей» (22 % CPU
  воркеров на path-to-regexp, 26 % на perfectionist, §4.5.6).
- После P1 «занятость слотов 67–69 %, остальное — старт и сворачивание форков»
  (§4.5.5). Цена P1: время юнитов выросло на 16–18 % на path-to-regexp и на 12 %
  на cheerio, потому что форки одного файла делят CPU. Стоимость юнита вместе
  со стартом в прогоне 1 P1 — 453 и 476 мс против 379 и 431 мс у базы
  (Σ `staticCost` / юнитов, `analysis/data/bench/run-1-summaries.json`). Старт
  при P1 отдельно не считался: полных отчётов в данных ветки нет.
- Главный процесс простаивает 89–92 % (§4.5.6).

**Прогноз анализа** (§4.4, ранг 4): поверх P1 ×1,2–1,4 на path-to-regexp и
cheerio, около 5 % на perfectionist (юнит там около 3 с). Основание —
занятость слотов 67–69 % после P1. Это прогноз, не замер.

**Оценки из тех же чисел** (выведены для этого промпта, не замер):

- Если бы старт целиком ушёл с критического пути, wall P1 уменьшился бы на
  юниты × старт / 3 слота: path-to-regexp — на 16,2 с (×1,43), cheerio — на
  31,3 с (×1,39), perfectionist — на 30,9 с (4,3 %). Это верх прогноза.
- **Потолок по CPU.** С P1 дерево процессов уже занимает 3,2–3,3 из 4 vCPU:
  172 / 53,5, 364 / 111,6, 2363 / 712,8, 853 / 264,5. Префорк работу не
  убирает, а переносит, так что wall не опустится ниже CPU / 4: ×1,24
  (path-to-regexp), ×1,23 (cheerio), ×1,21 (perfectionist), ×1,24
  (fast-json-stringify). На машине стенда верх прогноза недостижим. ×1,4
  возможен только при запасе ядер; это не проверялось.
- Vitest: без отправки `start` заранее префорк прячет только шаг 1 (fork,
  bootstrap, бандл). Какая это доля от 142–156 мс, неизвестно; её мерит шаг 0.
- node:test: прятать можно почти все 58 мс (bootstrap и импорты preload до
  `readUnit`). Верхняя оценка: 2088 × 58 мс / 3 слота ≈ 40 с, то есть около 10 %
  от 402,3 с без P1 и около 15 % от 264,5 с с P1. Своего прогноза для node:test
  в анализе нет.
- Проверено при подготовке промпта коротким скриптом на Linux и Node 22.23.4,
  не стендом. Ребёнок с каналом `ipc` видит `typeof process.send === 'function'`
  и `process.connected === true`; без канала `process.send` нет. Блокирующий
  `fs.readSync(3, …)` на дополнительном `pipe` ждёт данных без `EAGAIN`, а после
  SIGKILL родителя возвращает 0 (EOF). На macOS и Windows не проверялось.

## Что сделать

Прототипа нет. Делай по шагам; каждый адаптер — отдельным PR со своим A/B.

### Шаг 0. Инструменты, стенд и развилка «делать / не делать»

Сессия на main не видит `analysis/`. Нужное лежит в опубликованной ветке
(каждый путь проверен `git cat-file -e`). Tarball собирается pnpm 12 (CI ставит
`latest-12`, `.github/actions/install-tools/action.yml:14`). Стенду нужны
hyperfine 1.18, `/usr/bin/time`, pnpm 12 в `PATH`, доступ к GitHub и npm;
подробности — `$A/analysis/bench/README.md`.

```bash
git fetch origin analysis/2026-11
A="$HOME/mootant-analysis"; PACK="$HOME/mootant-pack"; mkdir -p "$A" "$PACK"
git archive origin/analysis/2026-11 analysis/bench analysis/tools/compare-verdicts.mjs \
  analysis/tools/oracle analysis/tools/perf-proto analysis/experiments/perf-fixtures \
  analysis/data/bench analysis/data/isolation.md analysis/data/oracle/matrices.md \
  analysis/04-performance.md analysis/01-architecture.md \
  analysis/experiments/prototypes.md analysis/experiments/perf-parallel-units.diff |
  tar -x -C "$A"
# tarball изменения (выключатель — шаг 4) и нетронутой точки ветвления
pnpm install --frozen-lockfile && pnpm build && pnpm pack
mv mootant-*.tgz "$PACK/mootant-prefork.tgz" && rm -rf dist
git worktree add /tmp/mootant-base "$(git merge-base HEAD origin/main)"
(cd /tmp/mootant-base && pnpm install --frozen-lockfile && pnpm build && pnpm pack &&
  mv mootant-*.tgz "$PACK/mootant-base.tgz")
# стенд: клоны на зафиксированных SHA, патчи копий, tarball как devDependency (~10 мин)
export BENCH_PROJECTS="$HOME/bench" MOOTANT_TGZ="$PACK/mootant-prefork.tgz"
"$A/analysis/bench/setup.sh" path-to-regexp cheerio perfectionist fast-json-stringify
```

1. **P1.** Если PERF-01 уже в main, включай его одинаково в обеих сериях A/B.
   Если нет, для замера (не для коммита) возьми прототип
   `$A/analysis/experiments/perf-parallel-units.diff`. На main он целиком не
   ложится: `git apply --check` даёт конфликты в 6 файлах из 17 —
   `adapters/vitest/run-specifications.ts`, `adapters/vitest/types/vitest-worker.d.ts`,
   `core/cache/prepare-run-cache.ts`, `core/run-mutants.ts`,
   `core/run/run-isolated-rounds.ts`, `test/adapters/vitest/runner.test.ts`. Чисто
   ложатся оба места, которые и дают P1: пропуск `waitForTurn` для
   isolated-юнитов (`runner.ts:544`) и ключ пула — индекс вместо файла
   (`adapters/node-test/run-isolated.ts:96`). Флаг для замера можно читать прямо
   из `MOOTANT_PARALLEL_UNITS`.
2. **Развилка для Vitest.** Временно, без коммита, допиши в обёртку
   `createForksPool` журнал по pid: `forked` — время перед `worker.start()`,
   `started` — время сообщения `type === 'started'`, которое приходит после
   окружения. Пиши журнал в файл из своей переменной окружения. Сними один
   `m-cold` path-to-regexp (с P1; без P1 оценка выйдет заниженной: с P1 форки
   делят CPU). Соедини журнал с `pid` и `booted` из трассы стенда
   `run-1.units.json`: `lib/trace-units.mjs` берёт pid из claim-файла, а
   `booted` — из записи `end`. Посчитай медианы Δ1 = `started − forked` и
   Δ2 = `booted − started`. Префорк без раннего `start` прячет не больше Δ1.
   Если спрятать долю f стоимости юнита (Σ `staticCost.duration` / юнитов того
   же прогона), прогон ускорится не больше чем в 1 / (1 − f) раз. Значит, при
   медиане Δ1 меньше 9 % этой стоимости (около 41 мс при 453 мс) порог ×1,10
   недостижим. Тогда
   Vitest-часть не делай, а Δ1, Δ2 и вывод запиши в PR или issue. Для node:test
   развилка не нужна: его старт (58 мс, около 17 % от 0,34 с на юнит) прячется
   почти целиком.

### Шаг 1. Vitest: запас заранее форкнутых воркеров в пуле Mootant

- В `createForksPool` держи запас простаивающих `ForksPoolWorker` с уже
  запущенным процессом (`worker.start()`). Ключ запаса — снимок `options.env`
  (JSON), `options.execArgv`, `distPath` и `process.cwd()` на момент fork.
  Vitest собирает `env` и `execArgv` заново на каждый `runTestSpecifications`
  и делает их общими для задач проекта (`index.Di8au7q4.js:6086-6098`,
  `:6116-6147`; тип — `chunks/plugin.d.LRFSN46m.d.ts:2869-2878`).
- `createPoolWorker(options)` отдаёт воркер из запаса только при совпадении
  ключа и живом процессе (`exitCode` и `signalCode` пусты); иначе форкает
  заново, как сейчас. После выдачи форкни замену. Простаивающих — не больше
  `maxWorkers` и не больше, чем задач осталось в запуске: число спецификаций
  известно в `runPlan` и `runDry`. Число одновременных загрузок ограничь (начни
  с одной) и подбери по замеру: загрузка отнимает CPU у идущих юнитов.
- Пока процесс простаивает, держи на воркере свой слушатель `error` и сними его
  при выдаче. `ForksPoolWorker` шлёт ошибки процесса в свой `EventEmitter`
  (`:5496`, `:5539-5561`), и без слушателя `emit('error')` бросит исключение в
  главном процессе.
- Обёртка, отданная Vitest, у заранее форкнутого воркера `worker.start()`
  повторно не зовёт. `fork` там под `||=`, но каждый вызов заново вешает
  `on('error')` и `pipe` stdout и stderr (`:5489-5507`), и вывод задвоится.
  Логику `exited`/`stopping` (`create-forks-pool.ts:52-88`) сохрани для
  процесса, который мог выйти, пока простаивал.
- В `spawns` пиши время выдачи (вызов `start` обёртки), а не время fork. Иначе
  простой попадёт в `startup` и `staticCost`.
- Сообщения `start` и `run` не трогай: их шлёт `PoolRunner` после выдачи, и
  `VITEST_POOL_ID`, окружение и `define` остаются как сейчас. Ранняя отправка
  `start` не входит в этот PR: `poolId` и `workerId` известны только в
  `schedule()` (`:5899`, `:6162`), а своё окружение — код проекта.
- Добавь пулу `drain()`: остановить простаивающие (`worker.stop()`: SIGTERM,
  через 500 мс SIGKILL, `:5454`, `:5508-5535`) и дождаться выхода. Зови его в
  `finally` после `runTestSpecifications`, до `waitForWorkers`
  (`adapters/vitest/run-specifications.ts:41-48`), и в `close()` сессии
  (`start-vitest-session.ts:149-157`, `:175-178`). Простаивающий процесс не
  пишет `worker/<pid>` (его пишет конструктор раннера), поэтому
  `waitForWorkers` (`wait-for-workers.ts:54-114`) его не ждёт и не добьёт.
  Убрать его должен сам пул.
- Префорк выключай в трёх случаях:
  - `execArgv` или `NODE_OPTIONS` задачи грузят модули (`--require`/`-r`,
    `--import`, `--loader`, `--experimental-loader`), не считая собственного
    `--require …/suppress-warnings.cjs` Vitest (`:6071`, `:6210-6226`);
  - в `execArgv` есть `--inspect*`;
  - у воркера нет ожидаемого API: `Reflect.get(worker, 'fork')` не даёт процесс
    (`create-forks-pool.ts:113-120`).

### Шаг 2. node:test: процесс следующего юнита того же файла заранее

- Тест-файл нужен в `argv` с самого запуска: это главный модуль. Поэтому
  заранее запускается процесс для конкретного файла, с теми же `node`, `args`,
  `cwd`, `env` и `detached: true`. Цель — следующий юнит того же файла в
  порядке плана, а при P1 — любой ждущий юнит этого файла. Таких процессов —
  не больше `handle.workers`.
- Юнит передаётся через дополнительный `pipe` (fd 3), не через IPC: канал
  виден тестам (`process.send`, `process.connected`). Признак «юнит придёт
  через fd 3» — своя переменная вместо `MOOTANT_UNIT`; preload удаляет её, как
  сейчас `MOOTANT_UNIT` (`read-unit.ts:19`), и в потоках и дочерних процессах
  остаётся инертным. Preload синхронно читает JSON юнита до перевода строки
  (`fs.readSync`; на `EAGAIN` — повтор через `Atomics.wait`) и закрывает fd 3.
  Только потом грузятся `--require`/`--import` проекта и тест-файл. `time` и
  `started` (`preload.ts:37-39`) бери после получения юнита; `captureClock()`
  можно и раньше.
- На EOF без юнита (родитель умер или процесс не понадобился) preload сразу
  завершает процесс, до кода проекта. Иначе `readUnit` вернёт `null`, preload
  станет инертным (`read-unit.ts:20-22`), и тест-файл пойдёт без мутанта рядом с
  юнитом того же файла.
- Сторож и `startup` считай от выдачи юнита: перенеси `spawned` в момент
  записи в fd 3 (`run-test-process.ts:100-101`, `get-unit-deadline.ts:20-25`).
  Иначе простой заранее запущенного процесса съест срок юнита, и выйдет ложный
  Timeout.
- Группы заранее запущенных процессов клади в `handle.groups` и
  `trackProcessGroup` (`run-test-process.ts:137-141`). Неиспользованные убивай в
  конце `runIsolated` и в `close()` (`start-node-test-session.ts:208-214`).
- При legacy-загрузчиках префорк выключай: их код исполняется до preload
  (`start-node-test-session.ts:30-33`, `:123-132`). Повторный прогон после
  `checkTodoBail` (`run-isolated.ts:69-72`) запускай обычным путём. Dry run
  (`run-dry.ts:84`) — по желанию, тем же механизмом.

### Шаг 3 (необязательно). Jest

Выигрыш возможен только у новых процессов: в режиме `freshWorkers` и у чистых
попыток. Замену воркера слота можно запускать сразу после `discard`, а не при
следующем `obtain` (`create-worker-pool.ts:31-41`, `:61`; `run-on-worker.ts:65-72`).
Номер слота и есть `JEST_WORKER_ID`. Условия:

- флаги Node команды теста (`start-worker.ts:58-59`) не грузят модулей, иначе
  заранее не запускай;
- лимит кучи мог вырасти после OOM (`run-isolated.ts:188-190`,
  `create-heap-cap.ts:50`), и тогда заранее запущенный воркер со старым лимитом
  выбрасывается; чистой попытке нужен воркер без лимита (`uncapped`);
- правило «каждый план — на опустошённом пуле» (`run-isolated.ts:76-79`,
  `:104`) сохраняется: в конце плана заранее запущенные останавливаются.

Делай это после Vitest и node:test и только с замером: данных по Jest в анализе
нет.

### Шаг 4. Выключатель и документация

- Для A/B нужен выключатель, которого тесты не видят. Подойдёт переменная
  (например, `MOOTANT_PREFORK=0|1`), которую главный процесс читает один раз и
  удаляет из `process.env` до старта сессии. Иначе она попадёт в окружение
  тестов, а у тест-файлов, перечисляющих окружение, — и в ключ кэша (BUG-701).
  Включать ли префорк по умолчанию, реши в PR по результатам; выключатель
  оставь. Ключ кэша не меняй: вердикт от префорка не зависит.
- Документация. В `docs/content/guide/compatibility.mdx:56-58` (Vitest, свой пул
  форков) и `:136-137` (node:test: «Each mutant runs a test file in its own
  process» остаётся верным) добавь, что процесс может стартовать раньше своего
  юнита, но кода проекта до юнита не грузит. В
  `docs/content/guide/configuration.mdx:340-344` (`concurrency`) добавь, что
  сверх него живут до стольких же простаивающих процессов. Обнови JSDoc
  `createForksPool`, `runTestProcess`, `readUnit` и `getUnitDeadline`.

## Инвариант: вердикты не меняются

Префорк не меняет ни статус, ни убивающий файл ни у одного мутанта, ни то, что
видят тесты. Процедура:

1. **Граница кода проекта** (новые тесты в репозитории, фикстуры — в
   `test/fixtures/**`):
   - node:test: `--import ./test/lock.mjs` берёт `tmp/lock` эксклюзивно (`wx`)
     при загрузке и снимает его на выходе; тест-файл пишет в журнал pid и
     время. С префорком нет ни `EEXIST`, ни записи раньше выдачи юнита;
   - Vitest: то же с setup-файлом (`setupFiles`), который грузится после
     `onBeforeCollect`;
   - журналов ровно столько, сколько юнитов: простаивающие и выброшенные
     процессы ничего не пишут.
2. **Что видят тесты.** Тест-файл фикстуры пишет `process.argv.slice(1)`,
   `process.execArgv`, `process.cwd()`, отсортированный `process.env`,
   `typeof process.send`, `process.connected` и `process.umask()`. Он же пробует
   `fs.fstatSync(3)` и должен получить `EBADF`. Прогоны с префорком и без дают
   одинаковые множества записей. Исключение — pid и значения
   `VITEST_WORKER_ID`/`VITEST_POOL_ID`: у них сравнивай число различных значений.
3. **«Один файл — никогда дважды одновременно».** С префорком зелёные
   `test/adapters/vitest/index.equivalence.test.ts:549`,
   `test/adapters/node-test/index.test.ts:584` и, если менялся Jest,
   `test/adapters/jest/index.test.ts:513`.
4. **Встроенный оракул** — наборы, которые сравнивают вердикты с физически
   применёнными мутантами. С включённым префорком зелёные:
   - `test/adapters/vitest/index.equivalence.test.ts` целиком: `:195`, teardown
     и окружение `:362`, `:387`, `:422`; своё окружение — фикстура
     `test/fixtures/equivalence/environment` (`environment: './leaks.ts'`);
   - `describe('verdict equivalence')` в `test/adapters/node-test/index.test.ts:376`;
   - Jest-наборы, если менялся Jest.
5. **Оракул анализа** (`$A/analysis/tools/oracle`, `$A/analysis/data/isolation.md`):
   - скопируй `fixtures/vt` и `fixtures/nt` в `$O/vt` и `$O/nt` и убери из их
     `package.json` `mootant` (`npm pkg delete devDependencies.mootant`): там путь
     к tarball 170ec52. Поставь tarball, как `setup-fixtures.sh`, но с
     `vitest@5.1.0`: `vitest@5.0.5` в npm 10.9.9 падал в arborist (`edgesOut`),
     см. BUG-701;
   - `ORACLE_ROOT=$O ORACLE_RESULTS=$O/off "$A/analysis/tools/oracle/run-suite.sh"
     vt state mocks modes load hooks crash slow dynamic fscache unhandled
     unhandled2` — Mootant (по умолчанию и `--fast`) и эталон; то же для
     `nt state modes load hooks crash slow dynamic`;
   - затем `run-mootant.sh <фикстура> default` (для `vt` ещё `… fast --fast`) с
     префорком, `ORACLE_RESULTS=$O/on`;
   - Mootant off против on — 0 расхождений по скрипту ниже. Матрицы
     `compare.mjs --oracle $O/off/<f>/oracle.jsonl --report $O/off/<f>/default.json
     --report $O/on/<f>/default.json` совпадают: известные несогласия базы с
     эталоном (`data/oracle/matrices.md`) — те же, новых нет;
   - пары из `isolation.md` (counter, memo, seen, mocks, load) через
     `isolation.sh` (A, B, AB, BA, `--fast`, `--concurrency 1`) совпадают с базой.
     Id пар возьми из `mootant list src --json`: в `isolation.md` они сокращены
     и сняты на 170ec52.
6. **Стресс-фикстура общего ресурса** — фиксированный файл и порт
   (`$A/analysis/experiments/perf-fixtures/shared-resource`; установка —
   `perf-proto/setup-fixture.sh shared-resource <каталог> <tgz>`, прогон —
   `perf-proto/run-mootant.sh <каталог> <префикс>`). Без P1 база
   детерминирована: на 170ec52 — 9 Killed, 4 Survived. С префорком — те же
   вердикты в 3 прогонах из 3. Там же `vitest-units` и `node-units` — 0
   расхождений.
7. **Стенд.** Каждый прогон `on` сравни с прогоном 1 `off` той же серии на всех
   четырёх проектах, с P1 и без; прогоны 2–3 `off` с прогоном 1 `off` — для
   оценки шума. Нужно 0 расхождений по статусу и убивающему файлу и 0 с
   `--strict`. Если `--strict`-расхождение есть и в базе, разбери его поимённо.
   Смотри и на число Timeout: префорк отнимает CPU у идущих юнитов.
8. **Отказы** (Linux). SIGKILL главного процесса посреди прогона: через 2 с
   живых процессов (`pgrep -f workers/forks.js` у Vitest, процессы с `cwd`
   фикстуры у node:test) не больше, чем у базы в том же сценарии. SIGINT и
   SIGTERM — не хуже базы (BUG-601).
9. `pnpm test` зелёный.

Скрипт сравнения — `$A/analysis/tools/compare-verdicts.mjs` (`--strict`,
таблицы) или этот, самодостаточный. Формат отчёта сверен с
`cli/report/build-run-report.ts:87-121`: `id`, `status`, `killedIn`,
`killedBy {file, name, line}`, `cause`.

```js
// Usage: node same-verdicts.mjs <base.json> <changed.json> [--strict]
// Reports of `mootant run … --json --all --verbose`. Compares, by mutant id,
// the status and the killing test file (killedIn, else killedBy.file); with
// --strict also the killing test (name:line) and the cause. Exit 1 on any
// difference or on a mutant found in one report only, 2 on bad input.
import { readFileSync } from 'node:fs'

let [baseFile, changedFile, flag] = process.argv.slice(2)
if (!baseFile || !changedFile || (flag && flag !== '--strict')) {
  console.error('usage: same-verdicts.mjs <base.json> <changed.json> [--strict]')
  process.exit(2)
}
let read = file => {
  try {
    let text = readFileSync(file, 'utf8')
    let { mutants } = JSON.parse(text.slice(Math.max(0, text.indexOf('{'))))
    if (Array.isArray(mutants)) return new Map(mutants.map(mutant => [mutant.id, mutant]))
    console.error(`${file}: no mutants array; run mootant with --json --all`)
  } catch (error) {
    console.error(`${file}: ${error.message}`)
  }
  process.exit(2)
}
let verdict = mutant => {
  if (!mutant) return 'missing'
  let parts = [mutant.status, mutant.killedIn ?? mutant.killedBy?.file ?? '-']
  if (flag) parts.push(mutant.killedBy ? `${mutant.killedBy.name}:${mutant.killedBy.line}` : '-', mutant.cause ?? '-')
  return parts.join(' | ')
}
let base = read(baseFile)
let changed = read(changedFile)
let differences = 0
for (let id of [...new Set([...base.keys(), ...changed.keys()])].toSorted()) {
  let left = verdict(base.get(id))
  let right = verdict(changed.get(id))
  if (left !== right) {
    differences += 1
    let mutant = base.get(id) ?? changed.get(id)
    console.log(`${id} ${mutant.file}:${mutant.line} ${mutant.mutator}\n  base:    ${left}\n  changed: ${right}`)
  }
}
console.log(`${base.size} / ${changed.size} mutants, ${differences} differences`)
process.exitCode = differences === 0 ? 0 : 1
```

## Как измерить выигрыш

Проекты стенда (`$A/analysis/bench/projects/*/project.sh`; патчи копий — README
стенда, «Известные ограничения», п. 7):

| проект | SHA | раннер | `MUTATE` | патч копии |
|---|---|---|---|---|
| pillarjs/path-to-regexp | `32292b9d` | Vitest 5.0.5, npm | `src/index.ts` | без `src/cases.spec.ts`, `src/redos.spec.ts` |
| cheeriojs/cheerio | `40d4365f` | Vitest 5, npm | `src/api/attributes.ts`, `css.ts`, `forms.ts` | `typecheck` выключен |
| azat-io/eslint-plugin-perfectionist | `486c3c85` | Vitest 5.0.5, pnpm | `rules/sort-switch-case.ts`, `rules/sort-switch-case/`, `utils/compare/` | — |
| fastify/fast-json-stringify | `ac1723c7` | `node --test`, npm `--before=2026-11-03` | `lib/*.js` без `lib/schema-validator.js` | без `test/webpack.test.js`, `test/property-names.test.js` |

Точка — `m-cold`: `mootant run $MUTATE --concurrency 3 --json --all --verbose`
на холодном кэше (`prepare/state.sh clean`). Перед каждым прогоном `state.sh`
делает `git clean -fdx`, поэтому P1 и префорк включай переменными окружения:
конфиг пришлось бы коммитить в `bench/base` копии.

```bash
R="$HOME/bench/prefork"
for project in path-to-regexp cheerio fast-json-stringify perfectionist; do
  for mode in 0 1; do        # 0 — база (префорк выключен), 1 — префорк
    MOOTANT_PREFORK=$mode MOOTANT_PARALLEL_UNITS=1 BENCH_RUNS=3 \
      BENCH_RESULTS="$R/p1-$mode" "$A/analysis/bench/run.sh" "$project:m-cold"
  done
done
# без P1 — то же без MOOTANT_PARALLEL_UNITS в $R/nop1-$mode
# (path-to-regexp, cheerio, fast-json-stringify)
for mode in 0 1; do node "$A/analysis/bench/summarize.mjs" "$R/p1-$mode" > "$R/p1-$mode.md"; done
node "$A/analysis/bench/lib/units-report.mjs" "$R/p1-1/path-to-regexp/m-cold/run-1.units.json" --workers 3
```

`MOOTANT_PARALLEL_UNITS` — переменная прототипа P1; как включается P1 из
PERF-01, смотри там. Что P1 действительно включён, видно по трассе: ожидание
очереди файла около 0 %.

- **База** — тот же tarball с выключенным префорком, на той же машине, в той же
  сессии и с тем же P1. Контроль выключателя без P1: поставь в стенд
  `mootant-base.tgz` командой `$A/analysis/tools/perf-proto/use-mootant.sh
  "$BENCH_PROJECTS/<проект>" "$PACK/mootant-base.tgz"` (зависимости у обоих
  tarball одни) и сними 3 прогона `m-cold` path-to-regexp и
  fast-json-stringify. «off» не должен отличаться от него больше шума, а
  вердикты — 0 расхождений. Потом верни `mootant-prefork.tgz`. Числа мутантов
  на main могут отличаться от 170ec52: мутаторы менялись (`b6142d3`,
  `aaa4689`, `f018b9a` и др.). Сравнивай только off и on одной сборки.
- **Запиши:**
  - wall hyperfine `mean ± σ (median)` из `hyperfine.json` (все `m-cold` длиннее
    30 с) и медиану [min–max] GNU elapsed из `summarize.mjs`;
  - CPU user+sys, пик PSS дерева и RSS;
  - юнитов и старт на юнит: (Σ `staticCost.duration` − Σ `mutants[].duration`)
    / юнитов из `run-k.json`;
  - для Vitest — занятость слотов и ожидание очереди (`units-report.mjs`).
    Трассировщик опирается на раскладку рабочего каталога 170ec52; на main
    папки те же (`adapters/vitest/reset-run-directory.ts:7`);
  - для node:test — долю юнитов, получивших заранее запущенный процесс.
- **Порог успеха** (медиана wall, 3 прогона, диапазоны min–max не
  пересекаются):
  - Vitest — ×1,10 и больше на path-to-regexp и на cheerio с P1;
    perfectionist не медленнее базы больше чем на 2 %;
  - node:test — ×1,05 и больше на fast-json-stringify, с P1 и без;
  - без P1 ни один проект не медленнее базы больше чем на 2 %.

  Выигрыш, упёршийся в потолок ×1,23–1,24 (path-to-regexp, cheerio), — не
  ошибка замера. Для информации, не как критерий, можно снять path-to-regexp с
  `BENCH_CONCURRENCY=2`: там запас CPU больше. Меньше ×1,05 у адаптера —
  отрицательный результат: его часть не мержится, числа описываются.
- **Условия.** Тихая машина без других тяжёлых задач: перед серией `uptime`
  показывает load average < 0,5, а точку с load average > 1,5 в начале
  переснимай (`run.sh --redo`, README стенда, ограничение 1). По длительностям
  окна 2026-11-04 серии с P1 займут около 2 ч, без P1 — около 1,1 ч.

## Риски и границы

- **Код проекта до юнита** — главный риск. У Vitest шаги 2–3 (своё окружение,
  `define`, `config.env`) остаются после выдачи, а с модулями из
  `execArgv`/`NODE_OPTIONS` префорк выключен. У node:test preload блокирует до
  юнита раньше любого `--require`/`--import` проекта, а legacy-загрузчики
  выключают префорк. Проверка — п. 1, 2 и 6 инварианта.
- **Сторож и время.** У node:test срок юнита считается от выдачи (`spawned`,
  `start.time`); у Vitest пульс и так ставится в `onBeforeCollect`
  (`runner.ts:573`). Тесты, которые смотрят на `process.uptime()` или
  `performance.now()` от старта процесса, увидят большее число. Других отличий у
  процесса нет.
- **CPU и память.** Загрузка замены отнимает CPU у идущих юнитов, а при P1 их
  время и так выросло на 12–18 %. Пограничные `time-limit` могут сменить
  вердикт, поэтому смотри число Timeout. Простаивающих процессов — до
  `maxWorkers`/`workers`, а пик PSS с P1 и так вырос (path-to-regexp
  980 → 1463 МБ). На машине стенда swap нет; OOM процесса юнита даст `crash`,
  то есть Killed без повтора (BUG-602).
- **Уборка.** Простаивающих процессов не видят ни пул Vitest, ни
  `waitForWorkers`. Их убирают `drain()`/`close()`, а при смерти родителя —
  выход по EOF (node:test) или по закрытию IPC (Vitest; проверить, п. 8
  инварианта).
- **Профили.** Под `--cpu-prof` (`analysis/bench/profile.sh`) воркер Vitest
  выходит по SIGTERM штатно (`chunks/init-forks.BaDXQSD8.js:10-11`), так что
  неиспользованные процессы префорка оставят лишние профили.
- **Сцепка с внутренностями Vitest.** Используются `ForksPoolWorker` из
  `vitest/node` и приватный геттер `fork`. При другом поведении молча
  возвращайся на старый путь.

## Связанные промпты

- **PERF-01** (P1, `run.parallelUnits`) — зависимость Vitest-части: прогноз
  ×1,2–1,4 дан поверх P1, а без P1 старт уже перекрыт ожиданием очереди.
  node:test-часть от P1 не зависит.
- **PERF-05** (кэш компиляции V8) — тоже удешевляет старт и загрузку и снижает
  CPU, а значит, поднимает потолок префорка. Мерь на общей базе.
- **PERF-03** (места тестов только в dry run, BUG-703) — снимает до 23 % CPU
  воркеров на path-to-regexp и тоже поднимает потолок. Укажи, был ли он в базе.
- **PERF-10** (node:test без процесса на юнит) — рискованная альтернатива;
  PERF-04 сохраняет процесс на юнит.
- **PERF-07** (перепроверка выживших без барьеров раундов): если раунды станут
  потоком, время жизни запаса придётся привязать не к запуску раннера.
- **BUG-601** (сироты при сигналах, включает BUG-600): префорк не должен
  добавлять сирот. **BUG-602** (смерть процесса = Killed): префорк не должен
  поднимать число `crash`.

## Критерий готовности

- Тесты:
  - пул Vitest на поддельном `Worker` (`test/adapters/vitest/create-forks-pool.test.ts`):
    выдача из запаса только при совпадающем ключе и живом процессе, один
    `start()` на процесс, `spawns` — время выдачи, ошибка простаивающего
    процесса не роняет главный, `drain()` останавливает и дожидается всех
    простаивающих, лимит запаса, выключение по `execArgv`;
  - node:test: preload получает юнит из fd 3, на EOF выходит без кода
    проекта, удаляет переменную и закрывает fd; сторож считает от выдачи;
    `close()` останавливает заранее запущенные;
  - интеграционные тесты п. 1, 2 и 8 инварианта.
- Эквивалентность: 0 расхождений (статус и убивающий файл, а также
  `--strict`) на четырёх проектах стенда (по 3 прогона, с P1 и без), на
  фикстурах оракула `vt` (по умолчанию и `--fast`) и `nt`, на
  `shared-resource`, `vitest-units` и `node-units`. Матрицы оракула не
  изменились. Встроенные наборы equivalence и «never runs a test file twice at
  once» зелёные с префорком.
- Выигрыш: порог из «Как измерить выигрыш» на `m-cold`, 3 прогона, с
  разбросом, и таблицы off/on (wall, CPU, PSS, старт на юнит, занятость
  слотов). Если развилка шага 0 или порог не пройдены, у этого адаптера
  отрицательный результат с числами, и его часть не мержится.
- Документация и JSDoc обновлены (шаг 4).
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`).

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Контракты `IsolatedUnit` и `AdapterSession` не меняй: префорк — деталь
  адаптеров.
- Не переиспользуй процесс между юнитами и не загружай в заранее запущенный
  процесс код проекта до выдачи юнита (см. «Граница задачи»). Раннюю отправку
  `start` Vitest можно рассматривать только отдельной задачей с обоснованием.
- Временную инструментацию шага 0, скрипты стенда и tarball в коммит не
  клади. Фикстуры — только в `test/fixtures/**`.
- Перед `pnpm test` удали `dist/`: на 170ec52 `test:astro` давал с ним ложные
  ошибки, а `tsconfig.json:2` на main исключает те же каталоги. По анализу на
  170ec52, `test:unit` зависит от окружения: запускай с
  `TERM=xterm-256color` и `env -u NODE_OPTIONS`, не под root.
- Сообщения коммитов — Conventional Commits (commitlint).
