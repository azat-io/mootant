# PERF-05: кэш компиляции V8 в тестовых процессах (воркеры Vitest, процессы node:test)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 5 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз: −10…−15 % CPU воркеров на проектах с
> тяжёлыми CommonJS-зависимостями (eslint-plugin-perfectionist), меньше на
> остальных; не замерено. Риск для вердиктов: низкий. Трудоёмкость: S.
> Прототип: нет. Тип: реализация с порогом выигрыша на замере.
> Замерено на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

**Где теряется время.** Каждый юнит isolated-пути (мутант × тест-файл) идёт в
свежем процессе, и каждый процесс заново компилирует одни и те же модули.
Vitest: форк на тест-файл, Mootant ставит свой пул форков и `isolate: true`
(`adapters/vitest/configure-project.ts:46-48`, пул —
`adapters/vitest/create-forks-pool.ts:44-104`; форк делает `ForksPoolWorker`
самого Vitest, `node_modules/vitest/dist/chunks/index.Di8au7q4.js:5489-5495`,
Vitest 5.1.0 в `node_modules` main); так же идут dry run и batch. node:test:
процесс `node` с preload Mootant на юнит (`adapters/node-test/run-test-file.ts:25-65`,
`adapters/node-test/run-test-process.ts:124-130`). Jest (адаптер появился после
170ec52) устроен иначе, см. ниже.

**Кэш компиляции Node.** Node хранит код V8 на диске для следующих процессов:
переменная `NODE_COMPILE_CACHE=<каталог>` (с 22.1.0, по документации Node) или
`module.enableCompileCache(<каталог>)` (с 22.8.0) и `module.flushCompileCache()`
(с 22.10.0) — `@since` в
`node_modules/.pnpm/@types+node@26.6.6/node_modules/@types/node/module.d.ts:98-139`.
В Node 20 их нет, а `engines` на main — `^20.19.0 || >=22.12.0`
(`package.json:164-166`). Vitest 5 сам требует Node 22.12+
(`docs/content/guide/compatibility.mdx:30-35`), node:test и Jest работают и на
Node 20.

Поведение проверено при подготовке промпта короткими скриптами на синтетических
файлах (Node 22.23.4; не стенд и не замер):

1. Ключ записи — абсолютный путь. При чтении Node сверяет длину и CRC32 текста
   (`code size mismatch`, `code hash mismatch` в
   `NODE_DEBUG_NATIVE=COMPILE_CACHE`) и компилирует тот текст, что ему дали.
   Проверено на трёх путях подмены, которыми пользуется адаптер node:test:
   патч `Module.prototype._compile`, синхронный `module.registerHooks`,
   асинхронный `module.register`. Текст той же длины (`'ORIG'` → `'SWCH'`)
   всегда исполнялся новый.
2. `vm.runInThisContext`, `new vm.Script`, `vm.compileFunction` и встроенные
   модули (`node:test`, `node:assert`, `node:http`) кэш не используют.
3. Запись — при нормальном выходе, `process.exit()` и необработанном
   исключении; при внешнем SIGTERM записи нет; `flushCompileCache()` пишет сразу.
4. `module.enableCompileCache(dir)` действует только на свой процесс:
   `process.env.NODE_COMPILE_CACHE` не появляется, дочерний `node` кэша не видит
   (Node 22.23.4 и 24.22.1). `NODE_DISABLE_COMPILE_CACHE=1` → статус 3
   (DISABLED); заданный `NODE_COMPILE_CACHE` → статус 2 (ALREADY_ENABLED) с его
   каталогом. На Node 22 аргумент — только строка (объект — исключение
   `cacheDir should be a string`).
5. Под `Proxy` на `process.env`, как у трекинга Mootant, за включение кэша и
   `require` прочитана только `WATCH_REPORT_DEPENDENCIES` — её читает сам
   загрузчик CJS, и трекинг её пропускает (`adapters/shared/track-environment.ts:11`).
   Файлы кэша Node читает и пишет из C++: обёртки всех функций `node:fs` не
   увидели ни одного вызова с путём кэша. Стеки ошибок кода из кэша те же.
6. Подкаталог — `v22.23.4-x64-<хэш флагов V8>-<uid>`, файлы 0600.
   `require('typescript')` 6.0.3 и `require('eslint')` 10.15.0 из
   `node_modules` main — 3,3 МБ в 141 файле (`typescript.js` — 2,4 МБ); в
   настоящих тестах функций компилируется больше, на стенде размер не мерился.

**Что кэш задевает в адаптерах main.**

- **Vitest.** Модули проекта и всё, что Vite инлайнит, module runner исполняет
  через `vm.runInThisContext` — мимо кэша
  (`node_modules/vitest/dist/module-evaluator.js:261`; та же строка в Vitest
  5.0.5 у 170ec52). Внешние модули грузит нативный `import()` (`:103`) — их кэш
  задевает: у perfectionist это typescript, ESLint и typescript-eslint. Без module runner Mootant не работает
  (`adapters/vitest/check-project-config.ts:25-26`). Vitest 5.0.5 и 5.1.0 сами
  сбрасывают кэш воркера при `stop`, так как форк потом получает SIGTERM
  (`node_modules/vitest/dist/chunks/init.CO4AB7HZ.js:397-427`;
  `init.PvxYpuCm.js:397-427` (170ec52)), а выключают его только при coverage v8
  (`index.Di8au7q4.js:6124-6133`) — Mootant запускает Vitest с
  `coverage: { enabled: false }` (`adapters/vitest/start-vitest-session.ts:101`).
  Сам Vitest кэш не включает. Самая ранняя точка кода Mootant в воркере —
  конструктор раннера (`adapters/vitest/runner.ts:475-478`; рабочий каталог —
  из `injectValue('mootant')`, его кладёт `adapters/vitest/run-specifications.ts:36-40`).
  К этому моменту модули Vitest уже загружены, а тест-файл с зависимостями
  грузится позже (`onBeforeCollect`, `runner.ts:514`; `waitForTurn`, `:544`;
  `loadDuration`, `:588`). В цепочке юнитов одного файла это критический путь:
  юнит ждёт смерти процесса предыдущего (`adapters/vitest/worker/wait-for-turn.ts:32-49`),
  а свой старт проходит, пока ждёт.
- **node:test.** Preload Mootant — первый `--import` или `--require`
  (`adapters/node-test/preload/preload.ts:25-36`), всё после него идёт через
  загрузчик Node: `node_modules`, модули проекта, переключённые файлы и
  тест-файл. Переключённый текст отдают патч `_compile`
  (`adapters/node-test/preload/patch-module-compile.ts:15-43`) и хук загрузки
  (`adapters/node-test/preload/install-module-hooks.ts:89-109`); он один на файл
  на весь прогон (`adapters/node-test/preload/create-source-switcher.ts:44-66`),
  так что попадания ждут и файлы проекта. Если ядро убирает файл из
  переключаемых (`types/adapter/adapter-context.d.ts:25-34`), текст пути
  меняется, и Node отбрасывает запись (п. 1). Процесс завершается сам — Node
  пишет кэш на выходе, — и следующий процесс того же файла стартует после него
  (`adapters/shared/run-in-pool.ts:21-36`). На main юнит несёт рабочий каталог
  (`adapters/node-test/run-test-file.ts:39-45`; «whose files never count as
  inputs», `adapters/node-test/types/node-test-unit.d.ts:37-40`), на 170ec52 —
  нет. Node тестовых процессов может отличаться от Node Mootant (`options.node`,
  `adapters/node-test/start-node-test-session.ts:70`): проверяйте API в самом
  тестовом процессе.
- **Jest.** Воркеры тёплые: юнит идёт в живой воркер слота
  (`adapters/jest/create-worker-pool.ts:31-41`), план начинается с пустого пула
  (`adapters/jest/run-isolated.ts:77-79`, `:104`), процесс на юнит — только с
  `freshWorkers: true` или в «чистой» попытке
  (`adapters/jest/types/jest-adapter-options.d.ts:10-14`,
  `adapters/jest/run-on-worker.ts:57-72`; «Each mutant runs a test file in a
  long-lived Jest worker», `compatibility.mdx:105-111`). Тесты и их
  `node_modules` компилирует jest-runtime через vm: `vm.compileFunction` в Jest
  30.5.2 (`node_modules/.pnpm/jest-runtime@30.5.2_supports-color@8.1.1/node_modules/jest-runtime/build/index.js:3081`),
  `new vm.Script` в 29.7.0
  (`node_modules/.pnpm/jest-runtime@29.7.0_supports-color@8.1.1/node_modules/jest-runtime/build/index.js:1500-1505`).
  Кэшу остаются пакеты Jest, которые воркер грузит при старте
  (`adapters/jest/worker/boot-worker.ts:99-120`). Останавливают воркеры через
  SIGKILL (`create-worker-pool.ts:73-92` → `adapters/shared/stop-process-group.ts:9-19`),
  так что без явного `flushCompileCache()` кэш не запишется. Выигрыш мал,
  Jest-проекта на стенде нет.

**Почему не переменная окружения.** Каталог в рабочем каталоге прогона
(`$TMPDIR/mootant-XXXXXX`, `core/run/create-work-directory.ts:26-32`) новый
каждый раз. У Vitest через `project.config.env` он попал бы в ключ кэша
вердиктов (`adapters/vitest/get-cache-inputs.ts:118`), и кэш не сработал бы ни
разу; через окружение воркера в обход конфига — в хэш `*` окружения первого
воркера dry run (`adapters/vitest/runner.ts:1042-1057` →
`get-cache-inputs.ts:50-54`), и промахивались бы тест-файлы, читающие `*`
(RuleTester у perfectionist), как в BUG-701. У node:test окружение процессов
хэшируется в ключ
(`adapters/node-test/start-node-test-session.ts:111-116`, `:154-162` →
`adapters/node-test/get-node-cache-inputs.ts:63`). Переменную к тому же видят
тесты и наследуют их дочерние процессы, а `--import` в `execArgv` виден в
`process.execArgv` и уходит в `child_process.fork` из тестов. Поэтому — API
внутри процесса.

**Состояние на main.** Не сделано: в коде, тестах, документации и истории main
нет ни `enableCompileCache`, ни `NODE_COMPILE_CACHE` (`git grep`, `git log -S`).
Механизм с 170ec52 тот же — процесс на юнит. Места сдвинулись: в
`adapters/vitest/runner.ts` конструктор `:474` (170ec52) → `:475`, `finishUnit`
`:913` (170ec52) → `:927`, `startTracking` `:1015` (170ec52) → `:1032`; хэш
окружения — `adapters/node-test/hash-environment.ts:13` (170ec52) →
`adapters/shared/hash-environment.ts:13-24`. Мутаторы менялись (b6142d3,
f660892, a684578, aaa4689 и др.), так что наборы и id мутантов стенда могут
отличаться от окна: база — только main без изменения. P1 (`parallelUnits`) и
BUG-703 на main нет (`adapters/vitest/configure-project.ts:55`).

## Доказательства

Снято на 170ec52 в эксклюзивном окне 2026-11-04 (07:35–13:43 UTC): 4 vCPU Intel
Xeon 2.1 GHz, 15 ГБ RAM, Node 22.23.4, Vitest 5.0.5 (cheerio — Vitest 5),
Stryker 10.1.1 (для сравнений), `--concurrency 3`, 3 прогона на точку. Точки
длиннее ~30 с — wall hyperfine (mean ± σ, в скобках медиана), короче — elapsed
GNU time (`run-k.time`); CPU — user + sys дерева процессов по GNU time, среднее
(`analysis/04-performance.md` §4.1, §4.5.1).

**База, обычный режим, холодный кэш** (§4.5.2, §4.5.3; на юнит — медианы по
трассе; «старт» — spawn → `onBeforeCollect` у Vitest, spawn → начало у node:test):

| проект | wall `m-cold`, с | CPU, с | юнитов | старт / загрузка / тесты на юнит, мс |
|---|---|---|---|---|
| perfectionist | 952,5 ± 40,7 (948,8) | 2437 | 594 | 156 / 752 / 2233 |
| path-to-regexp | 93,9 ± 1,5 (94,2) | 178 | 339 | 143 / 151 / 71 |
| cheerio | 164,3 ± 1,8 (165,3) | 363 | 662 | 142 / 163 / 105 |
| fast-json-stringify (node:test) | 402,3 ± 9,1 (403,7) | 895 | 2088 | 58 / — / — (трассы нет) |

σ/mean `m-cold` по GNU elapsed — 4,3 / 1,7 / 1,1 / 2,3 %. Первый раунд
perfectionist — цепочка `test/rules/sort-switch-case.test.ts`: 207 юнитов,
302,7–337,3 с; занятость слотов по всем раундам — 67–68 %. `--mutant` (GNU
elapsed): perfectionist 6,91 ± 0,41 с (медианный прогон: startup 0,8 + dry run
4,9 + isolated 1,0 + 0,3 с вне `total`), fast-json-stringify 6,66 ± 0,17 с
(§4.5.3, §4.5.4).

**Профили** (`profile.sh`, 13:40–13:43 UTC; доли от не-idle CPU по
`analysis/bench/lib/cpuprofile-categories.mjs`, «инклюзивно» — по внешнему кадру
функции; под `--cpu-prof` прогон path-to-regexp на 15 % медленнее; §4.5.6):

| воркеры | perfectionist: `rules/sort-switch-case/`, 21 мутант, 21 профиль, 39 с CPU | path-to-regexp: 342 мутанта, 326 профилей из 340, 135 с CPU |
|---|---|---|
| загрузка модулей (загрузчик Node, компиляция, module runner Vite) | 26 % | 22 % |
| компиляция CJS, `wrapSafe` (инклюзивно) | 15 % (typescript, ESLint) | — |
| компиляция ESM, `compileSourceTextModule` (инклюзивно) | 3 % | 7 % |
| загрузка CJS с исполнением модулей (инклюзивно) | 31 % | — |

**node:test — только смоук** (не результаты: load average 25–40,
`--concurrency 2`, `lib/location.js lib/standalone.js`, 297 профилей;
`analysis/bench/smoke/profile-fast-json-stringify.md`): self-время `wrapSafe`
6,9 %, `compileForInternalLoader` 4,1 %, `compileSourceTextModule` 1,1 %.
Раздел 1 (`analysis/01-architecture.md`, 6.4, п. 3) складывает первые два в
«около 11 %», но `compileForInternalLoader` — встроенные модули Node, им кэш не
поможет (п. 2).

**Прогноз** (§4.4, ранг 5): −10…−15 % CPU воркеров на perfectionist, меньше на
остальных. Опора — доли компиляции 15 + 3 %, и это верхняя граница: попадание
стоит десериализации, а ленивую компиляцию функций профиль относит к другим
кадрам. По проектам (тоже прогноз):

- perfectionist: `wrapSafe` ≈ 0,28 с CPU на процесс (39 с / 21 × 15 %), и это
  загрузка тест-файла после `waitForTurn`, то есть критический путь цепочки:
  должны упасть «загрузка / юнит» (752 мс) и длина первого раунда;
- path-to-regexp: ESM ≈ 29 мс CPU на процесс (135 с / 326 × 7 %). По коду это
  модули Vitest и Mootant: проект и тест-файл идут через vm, зависимостей у
  path-to-regexp нет. Большая их часть грузится до конструктора раннера, оттуда
  их не достать, а в цепочке одного файла они грузятся во время ожидания; без
  P1 wall почти не изменится;
- fast-json-stringify: по смоуку до ~7–8 % CPU тестовых процессов (`wrapSafe` +
  ESM), кэш задевает и файлы проекта;
- cheerio и Jest — не оценено.

Не измерено: ни одного прогона с кэшем, прототипа нет, профилей cheerio и
fast-json-stringify в окне нет (§4.5.7).

## Что сделать

**0. Стенд и инструменты** — из опубликованной ветки (пути проверены
`git cat-file -e`):

```bash
git fetch origin analysis/2026-11
mkdir -p /tmp/perf05
git archive origin/analysis/2026-11 analysis/bench analysis/tools/compare-verdicts.mjs \
  analysis/04-performance.md analysis/data/bench | tar -x -C /tmp/perf05
# стенд: /tmp/perf05/analysis/bench (README.md); цифры окна: /tmp/perf05/analysis/data/bench/summary.md
```

**1. Хелпер** `adapters/shared/enable-compile-cache.ts` (одна функция, JSDoc).
`node:module` он берёт через локальный интерфейс с необязательным методом, как
`registerHooks?` в `adapters/node-test/preload/install-module-hooks.ts:51-68`,
`:95`: ветка Node 20 покрывается тестом без Node 20. Без функции — ничего,
аргумент — строка, исключение глотается (кэш только экономит время). Имя папки
— одна константа, например `compile-cache` в рабочем каталоге:
`adapters/vitest/reset-run-directory.ts:7` чистит только свои папки, а
перечисляют только `beat/`, `out/` и `claim/` (`adapters/vitest/watch-heartbeats.ts:36`,
`:44`; `read-out-files.ts:26-28`; `run-plan.ts:130`).

```ts
interface CompileCacheApi {
  enableCompileCache?(directory: string): unknown // Node 22.8+
}

export function enableCompileCache(api: CompileCacheApi, directory: string): void {
  if (typeof api.enableCompileCache !== 'function') {
    return
  }
  try {
    api.enableCompileCache(directory)
  } catch {}
}
```

**2. Vitest.** В конструкторе раннера после `this.options`
(`adapters/vitest/runner.ts:475-478`) — вызов с `path.join(directory,
'compile-cache')`; `node:module` раннер уже импортирует (`:12`). Сбрасывает кэш
Vitest при `stop`, но проверено это только в 5.0.5 и 5.1.0, а peer — `^5.0.0`
(`package.json:145`): не уверены — вызовите `flushCompileCache?.()` в конце
`finishUnit` (`:927-968`). В `test/adapters/vitest/runner.test.ts` хелпер
замокайте, иначе кэш включится в воркере тест-раннера.

**3. node:test.** Первым делом внутри `if (unit !== null)`
(`adapters/node-test/preload/preload.ts:40-41`; `moduleApi` импортирован на
`:4`) — вызов с `path.join(unit.directory, 'compile-cache')`. Сброс не нужен:
процесс пишет кэш на выходе. В `test/adapters/node-test/preload/preload.test.ts`
замокайте хелпер, как там мокают остальное (`vi.mock`).

**4. Jest — по желанию.** В `bootWorker` до загрузки пакетов Jest
(`adapters/jest/worker/boot-worker.ts:86-112`); каталог — рядом с
`<рабочий каталог>/jest/session.json` (`adapters/jest/write-worker-files.ts:67-70`)
или полем `WorkerSession`; после первого юнита, до `done` (`:283`), —
`flushCompileCache?.()`. Через `NODE_DEBUG_NATIVE=COMPILE_CACHE` проверьте, нет
ли промахов из-за смены флагов V8 на лету (`:96-97`). Без замера на Jest-проекте
с тяжёлым трансформером (ts-jest, babel-jest), обычном и с `freshWorkers: true`,
Jest не трогайте и скажите об этом в PR.

**5. Документация** — абзац в «Node.js» (`docs/content/guide/compatibility.mdx:30-35`):
с Node 22.8 тестовые процессы держат кэш компиляции модулей в рабочем каталоге
прогона и удаляют его вместе с ним; процессы, которые запускают тесты, его не
получают; `NODE_DISABLE_COMPILE_CACHE=1` выключает его; заданный
`NODE_COMPILE_CACHE` используется как есть.

**6. Чего не делать.** Переменную окружения и `execArgv` (см. выше). Каталог
`.mootant/` — это папка HTML-отчёта (`core/run/get-html-path.ts:7`). Новую
опцию конфига: выключатель уже есть, `NODE_DISABLE_COMPILE_CACHE=1`, и тестовые
процессы наследуют его из окружения Mootant. `fsModuleCache: false` и кэш
трансформаций Vite — другой слой, он в отрицательных результатах §4.4. Не
поднимайте `CACHE_VERSION` (`core/cache/cache-version.ts:1-6`): рецепт ключа тот
же. Главный процесс Mootant — вне задачи (простаивает 89–92 %, §4.5.6).

**7. Постоянный каталог — отдельно и только по замеру.** Кэш на прогон в
длинном прогоне теряет лишь первую волну процессов, но между прогонами не даёт
ничего: `--mutant` и `--since` платят холодный dry run. Постоянный кэш (рядом с
`run-v3.json` в `node_modules/.cache/mootant/`, `core/cache/get-cache-path.ts:13-21`,
или каталог Node по умолчанию, как у Vite, `node_modules/vite/bin/vite.js:53`)
требует чистки чужих версий Node, предела размера, отказа при `cache: false` и
копит тексты одного пути (см. «Риски»). Стенд перед прогоном чистит `TMPDIR` и
`node_modules/.cache/mootant` (`analysis/bench/lib/measure-one.sh:34-38`,
`analysis/bench/prepare/state.sh:26-37`) — для такого замера нужна своя схема.
В задачу не входит.

## Инвариант: вердикты не меняются

Расхождений не ждём: код из кэша — тот же код (п. 1, 5 «Контекста»), окружение
и прочитанные файлы те же (п. 4, 5), а покрытие мутантов Mootant считает своей
инструментацией (`adapters/vitest/runner.ts:528`; node:test coverage не
собирает, `adapters/node-test/filter-exec-argv.ts:3-15`), не V8 coverage, у
которой кэш портит точность. Меняется только время. Процедура:

1. A — tarball main без изменения, B — с изменением; один стенд, один Node
   (команды — в «Как измерить выигрыш»).
2. `m-cold` × 3 на четырёх проектах. Каждый прогон B — против прогона 1 A,
   прогоны 2–3 A — против прогона 1 A (шум базы; в окне — 0 смен вердиктов за 3
   прогона). По id мутанта: статус и убивающий файл — 0 расхождений; с
   `--strict` (ещё `cause` и убивающий тест) — 0, а если `--strict` различает уже
   прогоны A между собой, то не больше, чем у A, и по тем же мутантам.
   `summary.totalCached` = 0 у обоих; `leakedWorkDirs` = 0 в `run-k.meta.json`
   (каталог вместе с кэшем удалён).
3. Timeout особо: `time-limit` и `hang` зависят от времени, `hit-limit` — нет
   (`types/run/try-cause.d.ts:13-18`), лимиты — из длительностей dry run
   (`core/run/get-try-limits.ts:6-7`, `:16-26`). В окне: perfectionist — 2
   `time-limit`, path-to-regexp — 3 `hit-limit`, cheerio — 4 `hit-limit`,
   fast-json-stringify — нет. В B у тех же id тот же статус и `cause`.
4. Кэш вердиктов цел: `m-warm` на perfectionist и fast-json-stringify даёт у A и
   B одинаковый `summary.totalCached` (в окне — 306 из 314 и 308 из 308).
5. Контроль (по желанию): B с `NODE_DISABLE_COMPILE_CACHE=1` на `m-cold`
   perfectionist — вердикты и время как у A.
6. Отрицательный контроль гарантии Node: тот же путь, та же длина, другой текст
   через `_compile`, как у адаптера node:test. Ждём `ORIG ORIG SWCH SWCH ORIG` и
   `ok`:

   ```bash
   dir=$(mktemp -d)
   echo "module.exports = () => 'ORIG'" >"$dir/m.cjs"
   cat >"$dir/main.cjs" <<'JS'
   let api = require('node:module')
   let [cache, swap] = process.argv.slice(2)
   api.enableCompileCache?.(cache)
   let compile = api.Module.prototype._compile
   api.Module.prototype._compile = function (text, file, ...rest) {
     if (swap === '1' && file.endsWith('m.cjs')) text = text.replace('ORIG', 'SWCH')
     return compile.call(this, text, file, ...rest)
   }
   console.log(require('./m.cjs')())
   JS
   out=$(for swap in 0 0 1 1 0; do node "$dir/main.cjs" "$dir/cache" $swap; done | tr '\n' ' ')
   echo "$out"; [ "$out" = "ORIG ORIG SWCH SWCH ORIG " ] && echo ok || echo FAIL
   rm -rf "$dir"
   ```

7. Тест-сьют Mootant с настоящим кэшем. В `pnpm test:unit` (coverage v8,
   `vitest.config.ts:30-39`) Vitest ставит воркерам
   `NODE_DISABLE_COMPILE_CACHE=1`, вложенные прогоны фикстур его наследуют и
   проверяют только путь «выключено». Поэтому интеграционные тесты адаптеров
   прогоните ещё раз без coverage и без этой переменной:

   ```bash
   env -u NODE_OPTIONS -u NODE_DISABLE_COMPILE_CACHE pnpm vitest run --project unit \
     test/adapters/vitest/index.equivalence.test.ts test/adapters/vitest/index.test.ts \
     test/adapters/node-test/index.test.ts
   env -u NODE_OPTIONS -u NODE_DISABLE_COMPILE_CACHE pnpm vitest run --project jest-30 \
     test/adapters/jest/index.equivalence.test.ts   # если трогали Jest
   ```

Скрипт сравнения — формат отчёта сверен с main (`RunReport.listed`,
`mutants[].id`, `status`, `killedIn`, `killedBy {file, line, name}`, `cause`:
`types/report/run-report.d.ts:18-108`, `:254-272`, `:322-337`); краткий `--json`
без `--verbose` не годится, в нём нет Killed и Timeout
(`types/report/slim-run-report.d.ts:20`). Выход 0 — вердикты те же, 1 —
расхождения, 2 — не тот отчёт; проверен на синтетических отчётах. То же делает
`analysis/tools/compare-verdicts.mjs --strict` из ветки анализа.

```js
// node verdicts.mjs <base.json> <change.json> [--strict]
import { readFileSync } from 'node:fs'

let [baseFile, changeFile, flag] = process.argv.slice(2)
if (!baseFile || !changeFile) {
  console.error('usage: node verdicts.mjs <base.json> <change.json> [--strict]')
  process.exit(2)
}
let read = file => {
  let report = null
  try {
    report = JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  let verbose = report?.mutants?.every(mutant => 'killedBy' in mutant)
  if (report?.listed !== 'all' || !verbose) {
    console.error(`${file}: not a report of mootant run --json --all --verbose`)
    process.exit(2)
  }
  return new Map(report.mutants.map(mutant => [mutant.id, mutant]))
}
let verdict = mutant => {
  let parts = [mutant.status, mutant.killedIn ?? mutant.killedBy?.file ?? '-']
  if (flag === '--strict') {
    let test = mutant.killedBy
    parts.push(mutant.cause ?? '-', test ? `${test.name}:${test.line}` : '-')
  }
  return parts.join(' | ')
}
let base = read(baseFile)
let change = read(changeFile)
let differences = 0
for (let id of new Set([...base.keys(), ...change.keys()])) {
  let left = base.has(id) ? verdict(base.get(id)) : '(missing)'
  let right = change.has(id) ? verdict(change.get(id)) : '(missing)'
  if (left !== right) {
    differences += 1
    let { file, line } = base.get(id) ?? change.get(id)
    console.log(`${id} ${file}:${line}\n  base:   ${left}\n  change: ${right}`)
  }
}
console.log(`${base.size} / ${change.size} mutants, ${differences} differences`)
process.exitCode = differences === 0 ? 0 : 1
```

```bash
r=/tmp/perf05
for p in perfectionist path-to-regexp cheerio fast-json-stringify; do
  for k in 1 2 3; do node verdicts.mjs $r/results-A/$p/m-cold/run-1.json $r/results-B/$p/m-cold/run-$k.json --strict; done
  for k in 2 3; do node verdicts.mjs $r/results-A/$p/m-cold/run-1.json $r/results-A/$p/m-cold/run-$k.json --strict; done
done
```

## Как измерить выигрыш

**Условия.** Тихая машина: `uptime` < 0,5 перед стартом; точку с load average
выше ~1,5 в начале (`point.log`) переснимите (`run.sh --redo`). Запишите
`node -v` и машину; `env | grep -i compile_cache` — пусто. Нужны Node 22.12+
(22.23.4 — как в окне), pnpm 12, npm, hyperfine, `/usr/bin/time`, доступ к
GitHub и npm. `lib/env.sh` стенда добавляет в `PATH` `/home/user/tools/bin`
(pnpm 12 машины анализа) — у вас pnpm 12 должен быть в `PATH` сам.

**Проекты стенда** (`analysis/bench/projects/<name>/project.sh`, правки копий —
`patch.sh` там же):

| проект | SHA | менеджер | раннер | `MUTATE` и правки копии |
|---|---|---|---|---|
| azat-io/eslint-plugin-perfectionist | `486c3c85239e78a24aba2ade212cdef6acba1829` | pnpm | Vitest 5.0.5 | `rules/sort-switch-case.ts rules/sort-switch-case utils/compare`; профили — `rules/sort-switch-case` |
| pillarjs/path-to-regexp | `32292b9d13239c7fa3ed23e89c59c10264f9fe20` | npm | Vitest 5.0.5 | `src/index.ts`; из тестов исключены `src/cases.spec.ts`, `src/redos.spec.ts` |
| cheeriojs/cheerio | `40d4365fc025ebc053e6c886c1dac3cf29a4bc61` | npm | Vitest 5 | `src/api/attributes.ts src/api/css.ts src/api/forms.ts`; `typecheck` выключен |
| fastify/fast-json-stringify | `ac1723c7073ab4e0ceca074ad214af742fa439fa` | npm, `--before=2026-11-03T00:00:00Z` | node:test | `lib/serializer.js lib/validator.js lib/standalone.js lib/location.js lib/merge-schemas.js`; удалены `test/webpack.test.js`, `test/property-names.test.js` |

**Команды.** `dist/` в git нет (`.gitignore:15`), `prepack` в `scripts` нет
(`package.json:55-83`):

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm pack   # до изменения
mv mootant-*.tgz /tmp/perf05/mootant-A.tgz && rm -rf dist
pnpm build && pnpm pack && mv mootant-*.tgz /tmp/perf05/mootant-B.tgz && rm -rf dist   # после

bench() { # bench <A|B> <script> [args]
  local v=$1 script=$2; shift 2
  BENCH_PROJECTS=/tmp/perf05/bench-$v BENCH_RESULTS=/tmp/perf05/results-$v \
    MOOTANT_TGZ=/tmp/perf05/mootant-$v.tgz MOOTANT_SHA=main-$v \
    /tmp/perf05/analysis/bench/$script "$@"
}
for v in A B; do bench $v setup.sh perfectionist path-to-regexp cheerio fast-json-stringify; done
# A и B чередуются по точкам; m-warm — после m-cold, который сохраняет снимок кэша
for point in perfectionist:m-cold path-to-regexp:m-cold cheerio:m-cold fast-json-stringify:m-cold \
  perfectionist:m-one fast-json-stringify:m-one perfectionist:m-warm fast-json-stringify:m-warm; do
  uptime; bench A run.sh "$point"; bench B run.sh "$point"
done
for v in A B; do node /tmp/perf05/analysis/bench/summarize.mjs /tmp/perf05/results-$v >/tmp/perf05/$v.md; done
for v in A B; do for p in perfectionist path-to-regexp fast-json-stringify; do   # профили
  bench $v profile.sh $p run
  node /tmp/perf05/analysis/bench/lib/cpuprofile-categories.mjs \
    /tmp/perf05/results-$v/profiles/$p/run/workers >/tmp/perf05/profile-$v-$p.txt
done; done
# размер кэша — отдельным незамеряемым прогоном B
probe=$(mktemp -d)
(cd /tmp/perf05/bench-B/perfectionist && TMPDIR=$probe node node_modules/mootant/bin/mootant.js \
  run rules/sort-switch-case --concurrency 3 --no-cache >/dev/null 2>&1) &
while kill -0 $! 2>/dev/null; do du -sk "$probe"/mootant-*/compile-cache 2>/dev/null; sleep 2; done |
  sort -n | tail -1
ls -A "$probe"   # пусто: кэш удалён вместе с рабочим каталогом
```

Трассировщик юнитов (`lib/trace-units.mjs`) написан под рабочий каталог
170ec52; папки и поля записи `end` на main те же
(`adapters/vitest/reset-run-directory.ts:7`, `runner.ts:941`, `:951`), но
убедитесь, что в `summary.md` заполнены «загрузка / юнит» и «старт процесса /
юнит». По окну `m-cold` × 3 на четырёх проектах — около 81 мин на вариант
(perfectionist 47,6, fast-json-stringify 20,1, cheerio 8,2, path-to-regexp 4,7
мин); всё вместе, по оценке, — 3,5–4 ч машинного времени.

**Что записать** для A и B: wall (hyperfine mean ± σ и медиана у `m-cold`, GNU
elapsed у `m-one`), CPU (user + sys, GNU time), пик PSS дерева, фазы
`summary.duration`, «загрузка / юнит» и «старт процесса / юнит» (Vitest), доли
`wrapSafe` и `compileSourceTextModule` в профилях, размер кэша.

**Успех:** CPU `m-cold` perfectionist ниже A не меньше чем на 5 % по медиане 3
прогонов, диапазоны min–max не пересекаются, wall не хуже A (прогноз — −10…−15 %
CPU воркеров); доля `wrapSafe` в воркерах perfectionist заметно ниже 15 %;
path-to-regexp, cheerio и fast-json-stringify по CPU и wall не хуже A больше
чем на σ базы. Меньше 5 % на perfectionist — не вливать, числа записать в PR
или issue.

## Риски и границы

- **Устаревший код.** Node сверяет длину и CRC32 текста: другой текст той же
  длины с тем же CRC32 для того же пути исполнил бы старый код — 2^-32 на
  каждый изменившийся текст. С кэшем на прогон смен мало (переключённый текст
  против исходного, когда ядро убирает файл); постоянный кэш копит их с каждой
  правкой — ещё одна причина держать шаг 7 отдельно.
- **Время.** Юниты быстрее, первая волна (dry run) компилирует холодно, и запас
  лимитов из dry run только растёт; новых Timeout по времени ждать неоткуда, но
  п. 3 инварианта обязателен.
- **Видимые тестам отличия.** `module.getCompileCacheDir()` вернёт путь вместо
  `undefined`, `module.enableCompileCache()` из теста — ALREADY_ENABLED. Тест
  инструмента, который сам управляет кэшем компиляции, под Mootant может вести
  себя иначе, чем в обычном прогоне (упадёт dry run или сменится вердикт).
  Редкость — опишите в документации.
- **Диск.** Мегабайты–десятки мегабайт на прогон в `TMPDIR` (на tmpfs — в
  памяти). Удаляются вместе с рабочим каталогом (`core/run-mutants.ts:339-341`),
  но при прерывании он остаётся (BUG-600; на main спиннер всё ещё вызывает
  `process.exit` в обработчике сигнала, `cli/terminal/create-spinner.ts:153-158`)
  — теперь вместе с кэшем. Ошибку записи Node глотает, прогон не падает.
- **Версии.** Node 20 — без кэша. Jest — промахи из-за флагов V8 и обязательный
  явный сброс. Vitest до 5.0.5 — сброс при `stop` не проверялся.
- **Настройки пользователя.** С заданным `NODE_COMPILE_CACHE` кэш Node включает
  сам, в каталоге пользователя, и он переживает прогоны — так уже сейчас
  работают форки Vitest и процессы node:test: они наследуют окружение, а
  Vitest сбрасывает кэш при `stop`. `NODE_DISABLE_COMPILE_CACHE=1` выключает
  кэш везде — это выключатель на случай регрессии.

## Связанные промпты

- **PERF-01** (параллельные юниты, `run.parallelUnits`): с P1 слоты perfectionist
  заняты на 93–94 %, экономия CPU переходит в wall, в том числе на
  path-to-regexp. Если P1 уже влит, мерьте с ним и без него.
- **PERF-03** (места тестов только в dry run, BUG-703): другая статья CPU тех же
  воркеров (23 % на path-to-regexp); выигрыши складываются, проверка та же —
  профиль `run`.
- **PERF-04** (префорк): дополняют друг друга — префорк уводит старт воркера с
  критического пути, кэш ускоряет то, что грузится после получения юнита. Если
  префорк влит раньше, переснимите оба.
- **PERF-10** (node:test без процесса на юнит): с ним польза кэша для node:test
  уменьшится. **PERF-02** (полный кэш без раннера): в таком тёплом прогоне
  процессов нет. **PERF-08** (тайм-ауты, BUG-752): кэш меняет длительности
  юнитов — калибруйте `time-limit` после него.
- **BUG-701** — почему не переменная окружения (хэш `*`); **BUG-600** —
  оставшийся рабочий каталог.

## Критерий готовности

- **Тесты.** Хелпер: без функции — ничего; с функцией — вызов со строкой
  каталога; исключение проглочено (100 % веток). Вызов из раннера Vitest с
  `<рабочий каталог>/compile-cache` (`test/adapters/vitest/runner.test.ts`), из
  preload — только при `unit !== null`
  (`test/adapters/node-test/preload/preload.test.ts`), из `bootWorker`, если
  Jest включён. Интеграционные тесты node:test и Vitest по образцу
  `test/adapters/node-test/index.test.ts:240-300`: со снятым на время теста
  `NODE_DISABLE_COMPILE_CACHE` после `dryRun` в `<work>/compile-cache/v*/` есть
  файлы (пропуск, где у `node:module` нет `enableCompileCache`). Регрессия
  node:test: файл переключён в первом `dryRun` и убран из `context.files` перед
  вторым — во втором исполняется исходный текст.
- **Эквивалентность:** на perfectionist, path-to-regexp, cheerio и
  fast-json-stringify (`m-cold`, 3 прогона B против прогона 1 A) 0 расхождений
  статуса и убивающего файла, по `--strict` — не больше, чем между прогонами A
  (п. 2 инварианта); те же Timeout с той же `cause`; одинаковый
  `summary.totalCached` в `m-warm`; equivalence-тесты адаптеров зелёные и с
  включённым кэшем (п. 7).
- **Выигрыш:** CPU `m-cold` perfectionist ниже базы на 5 % и больше (медиана 3
  прогонов, диапазоны не пересекаются), wall не хуже; остальные проекты не хуже
  базы больше чем на σ. Таблица A/B с условиями, доли из профилей и размер кэша
  — в PR.
- **Документация** (`docs/content/guide/compatibility.mdx`) и JSDoc хелпера
  называют каталог, его удаление и `NODE_DISABLE_COMPILE_CACHE`.
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
  Здесь не нужны ни новое поле конфига, ни изменения контракта адаптера.
- Не меняй окружение, `execArgv` и аргументы тестовых процессов: всё, что видят
  тесты, остаётся как в обычном прогоне раннера.
- Сообщения коммитов — Conventional Commits (commitlint).
- Проверки запускай по отдельности: после `pnpm build` `test:astro` даёт ложные
  `ts(2322)` (`tsconfig.json:2-4` не исключает `dist/`) — запускай его после
  `rm -rf dist`. От окружения зависят (найдено на 170ec52, на main строки те
  же): Unicode-тесты при `TERM=linux` (`cli/terminal/is-unicode-supported.ts:13`),
  «skips test files it cannot read» под root
  (`test/adapters/node-test/score-node-test.test.ts:98`), покрытие веток при
  заданном `NODE_OPTIONS` (`adapters/node-test/start-node-test-session.ts:118-121`):
  `env -u NODE_OPTIONS TERM=xterm-256color pnpm test:unit`.
