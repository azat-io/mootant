# Прототипы ускорения Mootant (раздел 4)

> Коммит под исследованием — `170ec52`. Каждый прототип — отдельная ветка
> `experiment/perf-<имя>` в своём worktree (`/home/user/wt/perf-<имя>`), diff —
> `analysis/experiments/perf-<имя>.diff`, tarball для бенча —
> `/home/user/artifacts/proto-<имя>/mootant-0.1.0.tgz`.
>
> **О скорости здесь ничего не утверждается.** Машина во время работы была
> перегружена чужими задачами (load average 15–44 на 4 vCPU), поэтому все
> времена ниже — только грубая проверка «работает / не работает». Замеры
> делает координатор в эксклюзивном окне по командам из раздела
> «Как измерить» каждого прототипа и сводного раздела в конце.

## Сводка

| | прототип | включается | эквивалентность вердиктов с базой | вывод | до продакшна |
|---|---|---|---|---|---|
| P1 | параллельные юниты одного тест-файла (`experiment/perf-parallel-units`, `eb5e261`) | `MOOTANT_PARALLEL_UNITS=1` | **совпадают** на трёх фикстурах без общих ресурсов (Vitest ×2 прогона, node:test), `--strict`; на стресс-фикстуре с общим файлом и портом — 4 и 6 расхождений из 13 (ложные Killed), база детерминирована | годится как **opt-in**; по умолчанию — нет | M |
| P2 | префиксная обрезка isolated-юнита (`experiment/perf-trim-units`, `6033fc0`), вариант P2' «только покрывающие» | `MOOTANT_TRIM_UNITS=prefix` / `covering` | на фикстуре с независимыми тестами совпадают; на граничной фикстуре **P2: 3 ложных Survived из 12, P2': 3 ложных Survived + 1 ложный Killed + 1 Killed→NoCoverage** | **отрицательный результат**: выигрыш P2 есть только у выживших и ровно там, где он может скрыть убийство; принцип 7 не выполнен | — (не рекомендуется) |
| P3 | полный кэш без запуска раннера (`experiment/perf-dry-snapshot`) | `MOOTANT_REUSE_DRY_RUN=1` | см. раздел P3 | см. раздел P3 | L |

Общее для всех прототипов:

- Каждый прототип выключен по умолчанию и включается переменной окружения,
  поэтому **один tarball даёт и базу, и прототип** (A/B на одной сборке, без
  разницы в сборке и штампе кэша). Без переменной поведение совпадает с
  `170ec52` (проверено: прогон «off» каждой фикстуры эквивалентен базе с
  `--strict`).
- Прототип с включённой переменной кладёт свои вердикты в кэш под отдельным
  ключом окружения (P1, P2: `core/cache/prepare-run-cache.ts`, поле `settings`
  ключа), чтобы вердикт, полученный в рискованном режиме, никогда не достался
  обычному прогону.
- Сравнение вердиктов — `analysis/tools/compare-verdicts.mjs` (один скрипт на
  все прототипы): по `id` мутанта сравнивает статус и убивший тест-файл
  (`killedIn`); с `--strict` — ещё убивший тест и причину; выводит таблицу
  статусов, переходы «база → прототип» и таблицу расхождений, код выхода 1 при
  расхождении.
- Фикстуры — `analysis/experiments/perf-fixtures/` (исходники и README),
  установка вне `analysis/` — `analysis/tools/perf-proto/setup-fixture.sh`,
  подмена сборки Mootant в проекте — `analysis/tools/perf-proto/use-mootant.sh`,
  один прогон — `analysis/tools/perf-proto/run-mootant.sh`. Все прогоны
  проверки — `--concurrency 2 --no-cache` (P3 — с кэшем), отчёты лежат в
  `/home/user/projects/perf-proto/results/`.
- Стиль: TypeScript, ESM, «одна функция — один файл», JSDoc, `let`; изменённые
  файлы проходят `pnpm exec eslint` и `tsc --noEmit` (ошибки `tsc` только в
  `docs/` из-за несгенерированных типов Astro — так же и на базе без
  `astro sync`); затронутые модули проходят свои тесты (`vitest run` по
  затронутым файлам). Полный `pnpm test` с порогом 100 % покрытия не гонялся.

Подготовка фикстур (уже сделана, повторять не нужно):

```sh
T=/home/user/mootant/analysis/tools/perf-proto
for f in vitest-units shared-resource prefix-boundary node-units; do
  $T/setup-fixture.sh $f /home/user/projects/perf-proto/base/$f \
    /home/user/artifacts/mootant-0.1.0-170ec52.tgz
done
# копия под прототип: cp -a .../base/<f> .../<proto>/<f>; затем
$T/use-mootant.sh /home/user/projects/perf-proto/<proto>/<f> \
  /home/user/artifacts/proto-<proto>/mootant-0.1.0.tgz
```

---

## P1. Параллельные юниты одного тест-файла

### Идея и проблема

Юниты isolated одного тест-файла идут строго по очереди. В Vitest воркер,
взявший юнит `i`, после `claimUnit` ждёт в `waitForTurn`
(`adapters/vitest/runner.ts:541`), пока **процесс** юнита `i−1` не завершится,
опрашивая раз в 20 мс (`adapters/vitest/worker/wait-for-turn.ts:11,32-49`), и
всё это время занимает слот пула Vitest. В node:test пул не запускает две
задачи с одним ключом (`adapters/node-test/run-in-pool.ts:21-33`), а ключ —
путь тест-файла (`adapters/node-test/run-isolated.ts:96`). Основание —
контракт `types/adapter/adapter-session.d.ts:14-20`: «a plain run of the test
runner never runs a test file twice at once and tests may rely on it (a fixed
file, port or database)». Ядро это учитывает: юниты одного файла считаются
одной последовательной цепочкой в оценке времени
(`core/run/run-isolated-rounds.ts:94`, `numberChains`), а «простаивающим
воркерам не дают лишних файлов» (`core/run/run-isolated-rounds.ts:18-21`).

Когда один тест-файл покрывает почти всех мутантов, раунд превращается в одну
цепочку: смоук path-to-regexp — 339 юнитов одного файла, цепочка 426 с при
длине раунда 427 с (`analysis/04-performance.md`, «Что смоук уже показал»);
догфудинг — 85 юнитов `test/core/generate/generate-file-mutants.test.ts` по
10–13 с ≈ 15 мин (`analysis/00-baseline.md`).

### Что изменено (`experiment/perf-parallel-units`, diff `perf-parallel-units.diff`)

| место | изменение |
|---|---|
| `core/run/read-parallel-units.ts` (новый) | флаг из `MOOTANT_PARALLEL_UNITS` (`1`/`true`); в релизе — `run.parallelUnits` |
| `types/adapter/adapter-context.d.ts:41-47` | новое необязательное поле контракта `AdapterContext.parallelUnits` |
| `types/adapter/adapter-session.d.ts:14-21`, `types/adapter/isolated-plan.d.ts:34-38` | оговорка «unless the context allows parallel units» |
| `core/run-mutants.ts:273,301,308,454,476` | флаг читается один раз, передаётся адаптеру, в `execute`, в кэш и в состояние |
| `core/run/run-isolated-rounds.ts:96-100` | при параллельных юнитах каждый юнит — своя «цепочка» в оценке времени раунда (только прогресс/ETA, `cli/create-time-estimator.ts:129-160`) |
| `core/cache/prepare-run-cache.ts:54,172-175` | ключ окружения кэша включает `parallelUnits: true` → вердикты параллельного режима не смешиваются с обычными; при выключенном флаге ключ прежний |
| `adapters/vitest/types/vitest-worker.d.ts` (`VitestWorkerOptions.parallel`), `adapters/vitest/run-specifications.ts:39` | главный процесс сообщает воркерам `parallel: true` через `vitest.provide` |
| `adapters/vitest/runner.ts:543-545` | `waitForTurn` пропускается только для isolated-юнитов при `parallel` (batch и dry не тронуты) |
| `adapters/node-test/run-isolated.ts:98` | при флаге ключ пула — индекс юнита, а не файл |
| тесты | `test/core/run/read-parallel-units.test.ts`; `test/adapters/vitest/runner.test.ts` («waits for the worker of the unit before only without parallel units» — второй юнит при живом процессе первого стартует сразу только с `parallel`); `test/adapters/vitest/run-specifications.test.ts` (передача `parallel`); `test/adapters/node-test/run-isolated.test.ts` (два юнита одного файла перекрываются только с флагом) |

Чего не нужно было менять: claim-файлы, out-файлы, пульсы и `done`-маркеры
адресуются по `<hash>-<index>` и pid (`adapters/vitest/worker/claim-unit.ts`,
`adapters/vitest/write-plan-files.ts:24-31`), out-файлы node:test — по счётчику
(`adapters/node-test/run-test-file.ts:36-37`), так что одновременные юниты
одного файла не конфликтуют внутри Mootant. Пул Vitest 5.0.5 сам не мешает
одновременному запуску одного файла: очередь FIFO до `maxWorkers`, без учёта
файла (`node_modules/vitest/dist/chunks/index.1TqnEahn.js`, класс `Pool`,
`schedule()`), при `isolate: true` каждый юнит — новый форк
(`adapters/vitest/configure-project.ts:46-48`). Снапшоты не пишутся
(`configure-project.ts:51-53`), так что одновременное чтение `.snap` безопасно.

### Почему корректно и где граница

Вердикт юнита зависит только от того, что видит его процесс: мутант
активируется глобалом рантайма своего форка (`adapters/vitest/runner.ts:550`),
свежий граф модулей (`isolate: true`). Решение по мутанту не зависит от того,
какие юниты шли вместе и в каком порядке закончились: вердикт — улика первого
по рангу файла (`core/run/decide-evidence.ts:5-16`), а раунды и размеры
пакетов файлов не меняются. Значит, при тестах, которые **не делят внешний
ресурс между процессами**, параллельные юниты дают те же вердикты.

Граница — ровно то, от чего защищает контракт: фиксированный файл, порт, БД,
каталог кэша, lock-файл, внешний сервис. Тогда два одновременных юнита одного
файла мешают друг другу, и вердикт зависит от гонки. Это не обнаружить общим
способом: запись файлов в пределах проекта Mootant уже видит (`DryFile.modified`,
`adapters/shared/track-file-reads.ts:24-45`), но не запись вне корня, порты,
сокеты, БД. Поэтому — только opt-in.

### Проверка эквивалентности

| фикстура | что внутри | прогоны | результат (`compare-verdicts.mjs --strict`) |
|---|---|---|---|
| `vitest-units` (Vitest) | 76 мутантов в 2 модулях, 3 тест-файла; почти все мутанты `src/text.js` покрывает один `test/text.test.js` (55 юнитов одного файла в раунде 1); 13 Survived, 1 Timeout, 4 NoCoverage | база ×2, P1 on ×2, P1 off ×1 | все пары **эквивалентны**: 76/76 (Killed 58, Survived 13, Timeout 1, NoCoverage 4), совпадают и убивший тест, и причина |
| `node-units` (node:test) | то же на `node --test` | база, P1 on, P1 off | **эквивалентны** 76/76 (Killed 54, Survived 15, Timeout 1, NoCoverage 6) |
| `shared-resource` (Vitest, стресс) | 13 мутантов `label()`; `test/fixed-file.test.js` пишет и читает `tmp/shared.txt` с паузой 400 мс; `test/fixed-port.test.js` слушает порт 47531 | база ×2, P1 on ×2 | база: два прогона совпадают (9 Killed, 4 Survived — детерминирована); **P1: 4 и 6 расхождений** — все 4 выживших становятся Killed (чужой юнит перезаписал или удалил файл, `EADDRINUSE`), у 2 убитых меняется убивший файл |

Команды (результаты — `/home/user/projects/perf-proto/results/p1/`):

```sh
T=/home/user/mootant/analysis/tools/perf-proto; P=/home/user/projects/perf-proto; R=$P/results/p1
C=/home/user/mootant/analysis/tools/compare-verdicts.mjs
$T/run-mootant.sh $P/base/vitest-units $R/vitest-units-base-1
MOOTANT_PARALLEL_UNITS=1 $T/run-mootant.sh $P/parallel-units/vitest-units $R/vitest-units-p1on-1
$T/run-mootant.sh $P/parallel-units/vitest-units $R/vitest-units-p1off-1
node $C $R/vitest-units-base-1.json $R/vitest-units-p1on-1.json --strict
# то же для node-units и shared-resource (shared-base-{1,2}, shared-p1on-{1,2})
```

Грубое время на занятой машине (не замер!): node-units 23,6 → 17,0 с
(isolated 22,9 → 16,0 с); vitest-units 31,3 → 37,4 с и 41,2 → 38,9 с в двух
парах. У Vitest при load average ~20 сумма стоимостей юнитов в P1 выросла на
24 % (55,4 → 68,7 с): два форка одного файла конкурируют за CPU, а в базе
второй слот в это время дешёво опрашивает claim-файл. На насыщенной чужими
задачами машине параллельность выигрыша дать не может — это и надо проверить
в эксклюзивном окне.

### Тесты для продакшна

- Контракт: тест адаптера (оба), что при `parallelUnits: false` два юнита
  одного файла не перекрываются по времени (сейчас это проверяют только
  `wait-for-turn.test.ts` и `run-in-pool.test.ts` по отдельности), а при `true` —
  перекрываются; интеграционный тест на фикстуре с паузой в тесте.
- Конфигурация: `run.parallelUnits` в `validate-config`, `resolve-run-settings`,
  флаг CLI, документация (`docs/content`), cspell.
- Кэш: тест `prepare-run-cache`, что ключ окружения различается при
  `parallelUnits` и не меняется без него.
- Прогресс: тест `run-isolated-rounds`/`count-run`, что при параллельных
  юнитах каждая единица — своя цепочка.
- Если делать `'auto'` (см. ниже) — тест, что файл с непустым
  `DryFile.modified` остаётся последовательным.

### Ожидаемый выигрыш и как измерить

Нижняя граница длины раунда в базе — самая длинная цепочка юнитов одного файла;
с P1 — `max(Σ стоимостей / W, самый долгий юнит)`. Значит выигрыш ограничен
долей «цепочечных» раундов: до ×W (×3 при `--concurrency 3`) на isolated-фазе
проектов, где один тест-файл покрывает всё (path-to-regexp, правило
perfectionist), около нуля там, где юниты и так распределены по многим файлам
(cheerio). Ожидание до замера: path-to-regexp m-cold — isolated ×2–3;
perfectionist — ×1,5–2,5; cheerio — ×1–1,2; fast-json-stringify (node:test) —
зависит от доли самого большого файла.

Команды (эксклюзивное окно; скрипт ставит tarball прототипа в проект бенча,
гоняет точки `run.sh` без переменной и с ней в отдельные каталоги результатов,
сравнивает вердикты каждого прогона «on» с прогоном 1 «off» и возвращает сборку
бенча):

```sh
cd /home/user/mootant
T=analysis/tools/perf-proto/bench-proto.sh
$T parallel-units path-to-regexp m-cold
$T parallel-units perfectionist m-cold
$T parallel-units cheerio m-cold
$T parallel-units fast-json-stringify m-cold
# по желанию: $T parallel-units perfectionist m-fast
node analysis/bench/summarize.mjs /home/user/projects/bench/results-proto/parallel-units/off
node analysis/bench/summarize.mjs /home/user/projects/bench/results-proto/parallel-units/on
# трасса юнитов: run-k.units.json → lib/units-report.mjs (длина цепочки, занятость слотов)
```

Что смотреть: wall и `summary.duration.isolated` (медиана), «самая длинная
цепочка» и занятость слотов из `units-report`, Σ стоимостей юнитов
(`summary.staticCost[].duration`) — не выросла ли из-за конкуренции за CPU;
файл `compare-<project>-m-cold.md` — расхождений быть не должно (иначе у
проекта есть общий ресурс между тестами, и это тоже результат).

### Риски

- Ложные вердикты на проектах с общим внешним ресурсом (стресс-фикстура:
  в основном ложные Killed — score завышается — но возможны и ложные Survived,
  если чужой юнит подложит «правильные» данные).
- Больше одновременных процессов одного файла → выше пик памяти (тот же
  `maxWorkers`, но тяжёлые файлы чаще оказываются в памяти одновременно).
- Флаки, которые раньше не проявлялись (гонки на общем `tmp`), будут выглядеть
  как ложные убийства без диагностики.

### Трудоёмкость до продакшна: M

Опция `run.parallelUnits: false | true | 'auto'` + флаг CLI; `'auto'` —
параллельно, кроме тест-файлов, которые в dry run меняли файлы проекта
(`DryFile.modified` уже есть) — это эвристика, не гарантия (порты и запись вне
корня не видны), поэтому по умолчанию оставить `false`; явный список
последовательных файлов (`run.serialTestFiles: ['test/db/**']`); документация с
примером, как стресс-фикстура ломается. Код в адаптерах уже минимален (две
строки), основная работа — конфигурация, документация и тесты.

---

## P2. Префиксная обрезка isolated-юнита (и P2' «только покрывающие»)

### Идея

Isolated-юнит гоняет весь тест-файл с активным мутантом и останавливается
только после первого упавшего теста, когда мутант уже достигнут
(`adapters/vitest/runner.ts:889-891`, `:630-637`; контракт
`types/adapter/isolated-plan.d.ts:3-10`: «every test of the file runs, since a
test that does not reach the mutant may still see the state an earlier test
left»). Батч-юнит уже обрезает файл до префикса до последнего запланированного
теста (`adapters/vitest/runner.ts:603-608`). Прототип передаёт в isolated-юнит
id тестов этого файла, достигших мутанта в dry run (они есть в
`MutantState.coveredBy`, из `analysis.stable ∪ analysis.firstReach`,
`core/run/classify-mutants.ts:44-61`), и воркер пропускает:

- **P2 (`prefix`)** — все тесты после последнего покрывающего;
- **P2' (`covering`)** — все тесты, кроме покрывающих.

Статические мутанты (достигнутые при загрузке, `MutantState.static`) не
обрезаются; бюджет юнита остаётся бюджетом всего файла (Timeout не меняется).

### Что изменено (`experiment/perf-trim-units`, diff `perf-trim-units.diff`)

| место | изменение |
|---|---|
| `types/adapter/isolated-plan.d.ts` | `IsolatedUnit.trim?: UnitTrim` (`{ tests: string[]; mode: 'prefix' \| 'covering' }`) с описанием, что каждый режим теряет |
| `core/run/read-trim-units.ts` (новый) | режим из `MOOTANT_TRIM_UNITS` |
| `core/run/get-unit-trim.ts` (новый) | покрывающие тесты файла юнита; `null` для статического мутанта и файла без покрывающих |
| `core/run/plan-isolated.ts:44-51` | юнит получает `trim` |
| `core/run-mutants.ts:443,453,474`, `core/run/create-run-state.ts:25,103`, `types/run/run-state.d.ts:36` | режим в состоянии прогона |
| `core/cache/prepare-run-cache.ts:38,167-170` | отдельный ключ окружения кэша для обрезанных прогонов |
| `adapters/vitest/worker/select-trimmed-tests.ts` (новый), `adapters/vitest/runner.ts:562,617-623` | воркер строит `runnable` из `trim` в `onCollected`; если ни одного покрывающего теста не нашлось — весь файл |
| тесты | `test/core/run/read-trim-units.test.ts`, `test/adapters/vitest/worker/select-trimmed-tests.test.ts`, `test/core/run/plan-isolated.test.ts` («names the covering tests of a unit…»), `test/adapters/vitest/runner.test.ts` («cuts a trimmed isolated unit down to the tests it names») |

node:test `trim` игнорирует (весь файл) — в прототипе не реализовано (нужен
пропуск тестов в preload по имени и вхождению, как у bail:
`adapters/node-test/preload/create-try-tracker.ts:207-210,245-247`).

### Проверка эквивалентности — отрицательный результат

| фикстура | база | P2 `prefix` | P2' `covering` |
|---|---|---|---|
| `vitest-units` (тесты независимы) | Killed 58, Survived 13, Timeout 1, NoCoverage 4 | **эквивалентно** 76/76 (`--strict`) | **эквивалентно** 76/76 |
| `prefix-boundary` (12 мутантов) | Killed 10, Survived 2 | **3 расхождения**: Killed → Survived ×3 | **6 расхождений**: Killed → Survived ×3, Survived → Killed ×1, Killed → NoCoverage ×1, другой убивший тест ×1 |

Что в `prefix-boundary` и почему расходится:

- `src/config.js` — ленивый синглтон: первый вызов `getConfig()` строит объект в
  `createConfig()`, последующие берут кэш. В dry run литералы `retries: 3`,
  `'strict'`, `2000` достигает только первый тест «loads a configuration»
  (слабая проверка `toBeTypeOf('object')`); поздние тесты, проверяющие
  значения, читают кэшированный объект и мутанта не достигают. База гонит весь
  файл: мутант `3 → 4` достигнут в тесте 1, флаг `reached` у юнита не
  сбрасывается (`core/run/read-isolated-unit.ts:45-47`, `runtime.reached`
  накапливается за весь юнит), тест «retries three times» падает → Killed. P2
  останавливается после теста 1 → **ложный Survived** (мутанты `w4ye`, `kn7s`,
  `1xzz`).
- `src/registry.js` — второй тест полагается на первый («registers an entry» →
  «looks the entry up»), первый `lookup` не вызывает. P2' пропускает первый тест:
  мутант `String(name).trim() → String(name)` (для `'a'` эквивалентный, база —
  Survived) получает **ложный Killed** (тест падает при любом мутанте); мутант
  `return entries.get(key) → undefined` не достигается вовсе → **Killed →
  NoCoverage** (недостигнутый юнит ничего не решает, `core/run/get-final-status.ts:34-39`
  — та же механика, что BUG-900).

Почему это принципиально, а не свойство фикстуры: у **убиваемого** покрывающим
тестом мутанта юнит и так останавливается на первом упавшем тесте
(`adapters/vitest/runner.ts:889-891`), то есть P2 экономит время только у
мутантов, переживших все покрывающие тесты, — и экономит ровно на тех тестах,
которые могли бы их убить через состояние. Выигрыш и потеря корректности —
одни и те же тесты. Ленивая инициализация, мемоизация, реестры и общие
`beforeAll`-фикстуры встречаются в реальных тест-сьютах часто. P2' дополнительно
ломает тесты, зависящие от предыдущих (так же ведёт себя Stryker с `perTest`, но
это противоречит модели Mootant «целые покрывающие файлы»). По принципу 7
задания ни P2, ни P2' не являются успешным ускорением.

Ожидаемый выигрыш даже без учёта корректности мал: тесты — около 15 %
стоимости юнита (смоук path-to-regexp: старт процесса 0,71 с, загрузка 0,78 с,
тесты 0,27 с, `analysis/04-performance.md`), а P2 срезает лишь хвост файла у
выживших. На `vitest-units` разницы не видно (тесты там почти пустые).

Команды (результаты — `/home/user/projects/perf-proto/results/p2/`):

```sh
T=/home/user/mootant/analysis/tools/perf-proto; P=/home/user/projects/perf-proto; R=$P/results/p2
$T/run-mootant.sh $P/base/prefix-boundary $R/prefix-base-1
MOOTANT_TRIM_UNITS=prefix $T/run-mootant.sh $P/trim-units/prefix-boundary $R/prefix-p2-1
MOOTANT_TRIM_UNITS=covering $T/run-mootant.sh $P/trim-units/prefix-boundary $R/prefix-p2c-1
node /home/user/mootant/analysis/tools/compare-verdicts.mjs $R/prefix-base-1.json $R/prefix-p2-1.json --strict
```

Если координатор всё же хочет оценить потенциал на реальных проектах (сколько
вердиктов меняется и сколько времени занимает хвост файла у выживших) —
`analysis/tools/perf-proto/bench-proto.sh trim-units <project> m-cold` (и
`trim-units-covering`). Ожидание: на perfectionist (сотни тестов RuleTester в
файле правила) выигрыш заметнее, чем на path-to-regexp; любое расхождение в
`compare-*.md` — ложный вердикт.

Тесты для продакшна не нужны: рекомендую **не доводить**. Если когда-нибудь
понадобится — только как явно эвристический режим (как `--fast`), с
диагностикой «verdict from a trimmed unit» и обязательной полной перепроверкой
выживших, что съедает весь выигрыш.

---

## P3. Полный кэш без запуска раннера

(раздел заполняется по результатам проверки — см. ниже)
