# PERF-01: параллельные юниты одного тест-файла по разрешению (`run.parallelUnits`)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 1 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: измерен: ×1,34–1,75 холодного прогона на четырёх
> проектах стенда (path-to-regexp ×1,75, fast-json-stringify ×1,52, cheerio
> ×1,47, perfectionist ×1,34; прототип P1, 3 прогона). Риск для вердиктов:
> средний — на стенде 0 расхождений, но тесты с общим файлом или портом дают
> ложные Killed, поэтому только по явному разрешению, по умолчанию выключено.
> Трудоёмкость: M. Прототип: diff `analysis/experiments/perf-parallel-units.diff`.
> Тип: реализация. Замерено на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

Isolated-юнит — один мутант в одном тест-файле, с начала загрузки файла
(`types/adapter/isolated-plan.d.ts:3-10`). Контракт запрещает гонять юниты одного
файла одновременно (`types/adapter/adapter-session.d.ts:14-20`): «they run one
after another, in plan order, never at the same time, since a plain run of the
test runner never runs a test file twice at once and tests may rely on it (a
fixed file, port or database)»; то же в `types/adapter/isolated-plan.d.ts:34-37`.
Ядро это учитывает: юниты одного файла — одна последовательная цепочка в оценке
времени (`core/run/number-chains.ts:1-15`, вызов —
`core/run/run-isolated-rounds.ts:119`, ETA — `cli/create-time-estimator.ts:128-131`),
а простаивающие воркеры лишних файлов не берут, потому что «a unit can wait for
another of its test file» (`core/run/run-isolated-rounds.ts:18-21`).

Как контракт соблюдают адаптеры на `main`:

- **Vitest.** Каждый юнит — свежий форк (`isolate: true` и свой пул форков,
  `adapters/vitest/configure-project.ts:46-48`). Воркер занимает юнит
  (`adapters/vitest/worker/claim-unit.ts:19-42`), затем в `onBeforeCollect` ждёт
  (`adapters/vitest/runner.ts:544`), пока жив процесс предыдущего юнита того же
  файла, опрашивая раз в 20 мс (`adapters/vitest/worker/wait-for-turn.ts:11`,
  `:32-49`). Всё это время слот пула занят. Сам Vitest 5.1.0 одновременному
  запуску одного файла не мешает: очередь `Pool.schedule()` — FIFO до
  `maxWorkers`, без учёта файла (`node_modules/vitest/dist/chunks/index.Di8au7q4.js:5859`,
  `:5891`). Внутри Mootant юниты одного файла не конфликтуют: claim-, out- и
  done-файлы адресуются как `<hash>-<index>` (`adapters/vitest/write-plan-files.ts:24-31`,
  `adapters/vitest/runner.ts:547`), снапшоты не пишутся
  (`adapters/vitest/configure-project.ts:51-53`).
- **node:test.** Процесс на юнит; пул не запускает две задачи с одним ключом
  (`adapters/shared/run-in-pool.ts:21-32`), ключ — путь файла
  (`adapters/node-test/run-isolated.ts:96`). Out-файлы — по счётчику
  (`adapters/node-test/run-test-file.ts:36-37`).
- **Jest** (добавлен после 170ec52, `bc6adec`) устроен иначе. Юниты файла
  собираются в одну цепочку (`adapters/jest/run-isolated.ts:105-114`), ключ
  пула — путь файла, в каком бы проекте он ни был (`:79-81`, `:115-121`).
  Цепочка держит один слот (`:240`) и идёт по одному юниту на тёплом воркере
  (`:242-248`; `freshWorkers` — новый воркер на юнит,
  `adapters/jest/types/jest-adapter-options.d.ts:10-14`).
  Затем тот же слот прогоняет файлы цепочки без мутанта (`checkRepeatable`,
  `:249`; `adapters/jest/check-repeatable.ts:46-67`), и если файл падал только на
  тёплом состоянии, все тёплые юниты цепочки теряют факты (`:250-253`). Номер
  слота — `JEST_WORKER_ID` (`adapters/jest/create-worker-pool.ts:8-9`). У Jest
  цепочка — часть механизма защиты от тёплого состояния, а не только ожидание.

Где теряется время. Когда один тест-файл покрывает почти всех мутантов, раунд
превращается в одну цепочку: слоты ждут очереди файла, а не работают. На
path-to-regexp слоты заняты 31 % времени и ещё 51 % ждут очереди (числа — в
«Доказательствах»). Прототип P1 разрешает юниты одного файла одновременно и
убирает это ожидание.

Актуальность на `main` (bd7af11, 37 коммитов после 170ec52):

- **Не сделано.** `parallelUnits` нет нигде в коде, тестах и документации; текст
  контракта `runIsolated` не изменился. В `types/adapter/adapter-session.d.ts`
  изменился только `close()` (`:35-40`, диагностика закрытия).
- **Третья реализация контракта — Jest**, P1 о ней ничего не знает. `runInPool`
  переехал из `adapters/node-test/` в `adapters/shared/run-in-pool.ts`.
- Раунды: до шести раундов, подтверждение `hit-limit`-тайм-аутов (`d3a61a5`),
  `countRun` получил `confirming`/`survivors`/`retrying`
  (`core/run/run-isolated-rounds.ts:93-125`). `core/run-mutants.ts` перестроен
  (`close()` с диагностикой, `:308-338`; `prepareRunCache` берёт `runnable.files`,
  `:475`). Тесты адаптеров разделены: эквивалентность Vitest — в
  `test/adapters/vitest/index.equivalence.test.ts`.
- `DryFile.modified` на `main` учитывает и чтения вне корня (`996431f`,
  `adapters/shared/create-input-filter.ts:11-25`). Это важно для `'auto'`
  (см. «Что сделать», п. 8).
- Набор мутантов и id менялись (например, `b6142d3 fix!: narrow removals…`),
  поэтому отчёты 170ec52 — не база. Базу снимайте на `main` без изменения.

## Доказательства

Условия замера (`analysis/04-performance.md` §4.1, §4.5.1): эксклюзивное окно
2026-11-04 (P1 на path-to-regexp — пара off/on 07:40–08:35 UTC, остальное —
12:23–13:40 UTC), load average 2–6 — это сами замеряемые процессы. 4 vCPU Intel
Xeon 2.1 GHz, 15 GB RAM, без swap; Node 22.23.4, npm 10.9.9, pnpm 12.16.1,
hyperfine 1.18.0, GNU time. Mootant 170ec52 из tarball, P1 — tarball прототипа
(`MOOTANT_PARALLEL_UNITS=1`). Stryker 10.1.1. `--concurrency 3`, обычный режим,
холодный кэш, 3 прогона. Wall — hyperfine, mean ± σ (медиана): точки длинные,
смещение обвязки меньше 1 %. CPU — user + sys дерева процессов (GNU time),
среднее. PSS — пик суммы по дереву процессов (`analysis/bench/lib/memtree.mjs`,
раз в 2 с), максимум по прогонам. Трасса юнитов —
`analysis/bench/lib/trace-units.mjs` и `units-report.mjs`.

**Измерено, база (170ec52) → P1** (§4.5.5; сырые hyperfine JSON —
`analysis/data/bench/results_<проект>_m-cold_hyperfine.json` и
`results-proto_parallel-units_{on,off}_<проект>_m-cold_hyperfine.json`):

| проект (раннер) | база, с | P1, с | ускорение | CPU, с | PSS, МБ | занятость слотов | ожидание очереди | вердикты |
|---|---|---|---|---|---|---|---|---|
| path-to-regexp `32292b9d` (Vitest 5.0.5) | 93,9 ± 1,5 (94,2) | 53,5 ± 1,2 (54,2) | ×1,75; пара off/on на сборке P1: 92,9 ± 2,5 → ×1,74 | 178 → 172 | 980 → 1463 | 31 → 67 % | 51 → 0 % | 342 из 342 × 3 |
| cheerio `40d4365f` (Vitest 5 из lockfile) | 164,3 ± 1,8 (165,3) | 111,6 ± 4,2 (110,3) | ×1,47 | 363 → 364 | 476 → 482 | 40 → 68 % | 40 → 0 % | 496 из 496 × 3 |
| fast-json-stringify `ac1723c7` (node:test) | 402,3 ± 9,1 (403,7) | 264,5 ± 5,3 (266,5) | ×1,52 | 895 → 853 | 378 → 742 | трассы нет | — | 308 из 308 × 3 |
| perfectionist `486c3c85` (Vitest 5.0.5) | 952,5 ± 40,7 (948,8) | 712,8 ± 10,0 (715,9) | ×1,34 | 2437 → 2363 | 1767 → 1614 | 68 → 93–94 % | 26 → 0 % | 314 из 314 × 3 |

- **Цепочки базы** (§4.5.3, диапазон по 3 прогонам): path-to-regexp — 339 из
  339 юнитов раунда 1 в `src/index.spec.ts`, цепочка 89,1–92,5 с = весь раунд;
  cheerio — 391 из 494 юнитов в `src/api/attributes.spec.ts`, 127,8–131,8 с;
  perfectionist — 207 из 308 в `test/rules/sort-switch-case.test.ts`,
  302,7–337,3 с.
- **После P1** (трасса прогона 1): раунд path-to-regexp 89–93 → 50–52 с; раунд 1
  cheerio 130,7 → 78,7 с; раунд 1 perfectionist 302,9 → 145,6 с, раунды 2–3 — 47
  и 92 → 36 и 63 с, раунды 4–6 почти не изменились (это работа выживших). Фаза
  isolated прогона 1 (`analysis/data/bench/run-1-summaries.json`) в порядке
  таблицы: 89,5 → 52,0; 161,7 → 106,6; 384,4 → 261,9; 863,3 → 653,7 с.
- **Цена P1.** Время юнитов выросло, потому что форки одного файла делят CPU:
  path-to-regexp +16–18 % (130 → 154 с), cheerio +12 %, perfectionist +3 %,
  fast-json-stringify +1 %. Тайм-аут-юниты path-to-regexp шли 5,3–6,0 с вместо
  3,5–4,4 с, вердикты те же. PSS вырос там, где раньше работал один процесс
  файла: path-to-regexp +49 %, fast-json-stringify ×2.
- **Против Stryker** (`s-cold`, те же условия): с P1 Mootant быстрее на
  path-to-regexp и cheerio (×1,44 и ×1,42), медленнее на 6,5 % и 7,8 % на
  fast-json-stringify и perfectionist. После P1 слоты path-to-regexp и cheerio
  заняты на 67–69 %, остальное — старт и сворачивание форков (PERF-04).
- **Где P1 ломает вердикты** (`analysis/experiments/prototypes.md`, P1;
  `--concurrency 2 --no-cache`, машина под нагрузкой). Стресс-фикстура
  `shared-resource` — 13 мутантов `label()`, один тест пишет и читает
  `tmp/shared.txt` с паузой 400 мс, другой слушает порт 47531. База в двух
  прогонах детерминирована (9 Killed, 4 Survived); P1 дал 4 и 6 расхождений: все
  4 Survived стали Killed, у 2 Killed сменился убивший файл. Без общих ресурсов
  эквивалентны (`--strict`) `vitest-units` (76 из 76, два прогона) и `node-units`
  (76 из 76). Тесты «verdict equivalence» Mootant с флагом — 17 из 20: упали ровно
  три теста с общим ресурсом («never runs a test file twice at once» у Vitest и
  node:test, «counts errors of worker-scoped fixture cleanup against the mutant» —
  фикстура держит порт). Без флага — 20 из 20.
- **Прогноз против факта** (фаза isolated): до замера `prototypes.md` ждал
  ×2–3 / ×1,5–2,5 / ×1–1,2 (path-to-regexp / perfectionist / cheerio), прогон 1
  дал ×1,72 / ×1,32 / ×1,52. Нижняя граница раунда с P1 —
  `max(Σ стоимостей / W, самый долгий юнит)` вместо самой длинной цепочки.

**Не измерено:** `main` (bd7af11); Jest (адаптера не было); целые проекты — на
стенде мутировались 1–5 модулей; `--since`, `--incremental`, `--mutant` и
`--fast` с P1; машины с большим числом ядер; CI с лимитом памяти. Полные отчёты,
трассы и `compare-*.md` остались на машине анализа
(`analysis/data/bench/README.md`); в ветке — только hyperfine JSON, сводки
прогона 1 и `summary.md`.

## Что сделать

Материалы анализа (пути проверены в `origin/analysis/2026-11`):

```bash
git fetch origin analysis/2026-11
W=$HOME/perf01 && mkdir -p "$W"          # вне клона
git show origin/analysis/2026-11:analysis/experiments/perf-parallel-units.diff > "$W/perf-parallel-units.diff"
git archive origin/analysis/2026-11 analysis/04-performance.md analysis/experiments/prototypes.md \
  analysis/bench analysis/tools analysis/experiments/perf-fixtures analysis/data/bench | tar -x -C "$W"
git apply --check "$W/perf-parallel-units.diff"   # на bd7af11: не применяется (6 файлов, см. ниже)
git cat-file -e '170ec52^{commit}' && git apply --3way "$W/perf-parallel-units.diff"
```

Diff снят с 170ec52, его базовые блобы есть в истории `main` (170ec52 — предок
`main`), так что `--3way` сольёт что сможет и оставит маркеры конфликтов (при
подготовке запускался только `--check`; в неглубоком клоне сначала
`git fetch --deepen=60`). По отдельности (`git apply --check` по ханкам)
применяются 25 из 33 ханков; 8 не применяются, в шести файлах:

1. `adapters/vitest/run-specifications.ts` — JSDoc (на `main` переписан,
   `:9-28`); код (`:31`, `:36-40`) применяется.
2. `adapters/vitest/types/vitest-worker.d.ts` — прототип переносит
   `VitestWorkerOptions` выше `VitestHeartbeat`, а удаление старого места не
   применяется (другой JSDoc `root`, `:225-228`). Просто добавьте
   `parallel?: boolean` в интерфейс на месте (`:199-229`); порядок членов
   поправит `eslint --fix`.
3. `core/cache/prepare-run-cache.ts` — JSDoc (`:110-137`); поле `PrepareInput`
   и ключ (`:226-227`) применяются.
4. `core/run-mutants.ts` — контекст `adapter.start` и вызов `execute` (на `main`
   `let result: RunResult` и `close()` с диагностикой, `:282-338`), вызов
   `prepareRunCache` (`:471-484`).
5. `core/run/run-isolated-rounds.ts` — JSDoc («six rounds», `:25-30`) и вызов
   `countRun` с новыми полями (`:113-125`); меняется только `chains` (`:119`).
6. `test/adapters/vitest/runner.test.ts` — тест дописывался в конец файла; на
   `main` блок называется `describe('Runner')` (`:613`); импорт `spawn`
   применяется.

В diff нет Jest, конфига, CLI, документации, `recheck` и объявления
возможности адаптера. `core/run/read-parallel-units.ts`
(`MOOTANT_PARALLEL_UNITS`) замените настройкой и удалите вместе с тестом:
переменной окружения в продакшн-коде быть не должно.

План:

1. **Настройка.** `run.parallelUnits?: boolean` в `types/config/run-config.d.ts`
   (рядом с `fast`, `:75-80`; в JSDoc — предупреждение про общий файл, порт и БД,
   по умолчанию `false`). Ключ — в `runKeys` и булева проверка, как у `fast`
   (`core/config/validate-config.ts:16-27`, `:95-97`, JSDoc `:52-57`).
   `RunSettings` и `resolveRunSettings`
   (`types/config/run-settings.d.ts:34-38`, `core/config/resolve-run-settings.ts:16-40`):
   CLI > конфиг > `false`. `RunMutantsOptions.parallelUnits`
   (`core/run-mutants.ts:56-140`). Флаг `--parallel-units`; `--no-parallel-units`
   даёт `allowNegative` (`cli/parse-arguments.ts:252`). Добавьте его в
   `parserOptions` (`:65-83`), `runOnlyOptions` (`:88-97`), `RunOptions` и справку
   (как `--fast`, `:43-44`). `recheck` должен повторять режим:
   `cli/run-mutation.ts:52-58` и `cli/report/format-command.ts:9-60`, `:90-92`.
2. **Контракт.** `AdapterContext.parallelUnits?: boolean` и оговорка «unless the
   context allows parallel units» в `types/adapter/adapter-session.d.ts:14-20`
   и `types/adapter/isolated-plan.d.ts:34-37` — ханки P1 применяются. Сверх P1
   (рекомендация этого промпта, в духе «возможности — явные»,
   `analysis/01-architecture.md` §9) нужна возможность
   `TestAdapter.parallelUnits?: boolean` — «адаптер выполняет
   `AdapterContext.parallelUnits`» (`types/adapter/test-adapter.d.ts:11-35`), с
   проверкой в `core/run/validate-adapter.ts:32-49` (JSDoc `:6-10`). Без неё
   сторонний адаптер, который поле не читает, шёл бы по очереди, а ядро считало
   бы прогон параллельным: другой ключ кэша, неверная ETA, нет заметки.
3. **Ядро.** В `core/run-mutants.ts` вычислите
   `parallelUnits = runSettings.parallelUnits && adapter.parallelUnits === true`.
   Если пользователь просил, а адаптер не умеет, выведите `note`, как для `--fast`
   без batch (`:241-247`). Передайте флаг в контекст `adapter.start`
   (`:282-306`), в `prepareRunCache` (`:471-484`) и в `createRunState`
   (`:488-505`); `RunState.parallelUnits` — ханки P1. Ключ окружения кэша при
   включённой опции другой (P1: `settings: { runner, parallelUnits: true }`,
   `core/cache/prepare-run-cache.ts:226-227`), чтобы вердикт рискованного режима
   не достался обычному прогону, а при выключенной — побайтно прежний. Тогда
   поднимать `CACHE_VERSION` (`core/cache/cache-version.ts:1-6`) не обязательно:
   новые ключи со старыми не совпадут; решение опишите в PR. JSDoc
   `core/cache/get-environment-key.ts:59-69` («Concurrency and fast mode are not
   part of it») дополните. ETA: с опцией у каждого юнита своя
   цепочка (`core/run/run-isolated-rounds.ts:119`). JSDoc `:18-21` поправьте, но
   политику раундов не меняйте — это PERF-07.
4. **Vitest** — ханки P1. Главный процесс передаёт `parallel: true` через
   `vitest.provide` (`adapters/vitest/run-specifications.ts:36-40`). Воркер
   пропускает `waitForTurn` только при `mode === 'isolated'`
   (`adapters/vitest/runner.ts:544`): batch и dry не трогать. Обновите JSDoc,
   который обещает «never runs twice at once»: `adapters/vitest/runner.ts:206-207`
   и `:508-513`, `adapters/vitest/run-plan.ts:24-27`,
   `adapters/vitest/worker/wait-for-turn.ts:13-23`,
   `adapters/vitest/create-interleaved-sequencer.ts:11-13`. Объявите возможность
   в `adapters/vitest/index.ts:17-22`.
5. **node:test** — ханк P1: ключ пула — индекс юнита, если контекст разрешает
   (`adapters/node-test/run-isolated.ts:96`), плюс JSDoc `:19-31` и возможность в
   `adapters/node-test/index.ts:21-26`.
6. **Jest.** Рекомендация: в этой задаче возможность не объявлять (ядро выведет
   заметку, контекст получит `false`) и покрыть это тестом. Причина — цепочка у
   Jest держит проверку тёплого состояния (см. «Контекст»). Если всё же
   поддерживаете: разбейте цепочку файла на подцепочки с разными ключами
   `runInPool` (`adapters/jest/run-isolated.ts:115-121`), каждая через `runChain`
   — свой слот, свой `checkRepeatable`, свой откат тёплых юнитов; дополните
   `test/adapters/jest/index.warm-safety*.test.ts` и замерьте на Jest-проекте.
   В стенде такого проекта нет, выигрыш не оценён.
7. **Документация.** Строка в таблице и раздел после `fast` в
   `docs/content/guide/configuration.mdx` (`:316-327`, `:346-351`), строка в
   `docs/content/guide/cli.mdx:43-53`. Что описать: когда безопасно, когда нет
   (фиксированный файл, порт, БД, lock, общий кэш-каталог, worker-scoped фикстура
   с портом), рост памяти, отдельный ключ кэша (переключение опции не берёт
   прежние вердикты), какие раннеры поддержаны. Желательно, не обязательно (идея
   из `analysis/README.md` §3, п. 10): одна заметка за прогон, если опция
   выключена, а раунд был одной цепочкой.
8. **`'auto'` — не в этой задаче.** Идея анализа — параллельно всё, кроме файлов
   с непустым `DryFile.modified`. Но на `main` `modified` — только входы, которые
   тест прочитал, а потом изменил; чтение того, что код сам записал, входом не
   считается (`adapters/shared/track-file-inputs.ts:28-41`, `:56-60`, `:66`;
   `types/adapter/dry-file.d.ts:35-42`). Проверено при подготовке промпта
   коротким скриптом с `trackFileInputs` и `createInputFilter` из `main` (на
   синтетических данных, не через адаптер): для «mkdir, write, read, rm» (как
   `fixed-file.test.js` стресс-фикстуры) и «lock `wx`, write, read, rm» во
   временном каталоге (как `test/fixtures/equivalence/shared`) `modified` пуст;
   существующий файл, прочитанный и перезаписанный, туда попадает. Порты,
   сокеты, БД и записи дочерних процессов не видны вовсе. `'auto'` по `modified`
   пропустил бы обе фикстуры, ради которых опция сделана opt-in. Для `'auto'`
   позже нужен сигнал шире (любая запись через `node:fs` — множество `written`,
   `adapters/shared/track-file-inputs.ts:45-55`; новое необязательное поле
   `DryFile` во всех трёх адаптерах), свои стресс-фикстуры и по-прежнему `false`
   по умолчанию. Сейчас тип — `boolean`, `'auto'` добавится аддитивно.

Решения, которые нужно принять и описать в PR: имя флага, где объявлена
возможность (рекомендация — `TestAdapter`), Jest (п. 6), закреплять ли
`--no-parallel-units` в skill агента рядом с `--no-fast --no-incremental`
(`skills/mootant/SKILL.md:77-87`), показывать ли режим в отчёте рядом с `mode`
(новое поле `schemaVersion` не меняет, `types/report/run-report.d.ts:290-293`).

## Инвариант: вердикты не меняются

Вердикт — улика первого по рангу файла (`core/run/decide-evidence.ts:3-12`), а
раунды и пакеты файлов P1 не трогает. Значит, при тестах без общего внешнего
ресурса вердикты те же. Проверка:

1. **Без опции поведение прежнее.** Ключ кэша при `parallelUnits: false` равен
   ключу `main` (тест `prepare-run-cache`). Тесты «never runs a test file twice at
   once» проходят без правок: `test/adapters/vitest/index.equivalence.test.ts:549`,
   `test/adapters/node-test/index.test.ts:584`, `test/adapters/jest/index.test.ts:513`.
   То же для теста про worker-scoped фикстуру
   (`test/adapters/vitest/index.equivalence.test.ts:362`). На стенде
   `m-cold-off` против `m-cold-base` — 0 расхождений в каждом из 3 прогонов.
2. **С опцией на стенде** — 0 расхождений: каждый прогон `m-cold-on` против
   прогона 1 `m-cold-base` на path-to-regexp, cheerio, fast-json-stringify (и
   perfectionist, если снимаете). Сначала убедитесь, что база детерминирована:
   прогон 1 против 2 и 3. Мутант, который меняется уже в базе, вынесите отдельно
   и объясните, а не списывайте на шум.
3. **`--strict`** (убивший тест, причина) — для информации; каждое расхождение
   по `cause` объясните. Число Timeout с опцией расти не должно.
4. **Фикстуры Mootant.** Новый интеграционный тест: эквивалентность с
   `parallelUnits: true` (`runMutants({ …, parallelUnits: true })`) на фикстуре
   без общих ресурсов, у Vitest и node:test. Фикстуры `shared` и `teardown` без
   опции остаются последовательными (п. 1).
5. **Стресс-фикстура** (демонстрация, не критерий): `T=$W/analysis/tools/perf-proto`,
   `$T/setup-fixture.sh shared-resource "$W/fx/shared" "$W/change.tgz"` (ставит
   `vitest@5.1.0`), затем `$T/run-mootant.sh "$W/fx/shared" "$W/fx/base-1" src
   --concurrency 2 --no-cache` — дважды без флага (`base-1`, `base-2`, ожидается
   детерминизм) и дважды с `--parallel-units` в конце (`on-1`, `on-2`). С флагом
   ожидаются ложные Killed; если их нет, это не повод смягчать документацию.

Сравнение по id мутанта, без внешних зависимостей. Формат сверен с `main`:
`killedBy`, `killedIn`, `cause`, `status` — `types/report/run-report.d.ts:57`,
`:70`, `:86`, `:96`; `listed` — `:259`; заполнение —
`cli/report/build-run-report.ts:97-100`, `:185`. Сохраните как `$W/compare.mjs`.
Подробнее (таблица переходов, `--json`) умеет
`$W/analysis/tools/compare-verdicts.mjs`.

```js
// Compares the verdicts of two reports of `mootant run --json --all --verbose`
// by mutant id: status and the test file of the verdict (killedIn); with
// --strict also the killing test (name, line) and the cause.
// Usage: node compare.mjs <base.json> <change.json> [--strict]
// Exit code: 0 equivalent, 1 a difference or a mutant in one report only, 2 bad input.
import { readFileSync } from 'node:fs'

let [baseFile, changeFile, ...flags] = process.argv.slice(2)
let strict = flags.includes('--strict')
let read = file => {
  let text = readFileSync(file, 'utf8')
  let report = JSON.parse(text.slice(Math.max(0, text.indexOf('{'))))
  if (!Array.isArray(report.mutants) || report.listed !== 'all') {
    console.error(`${file}: not a report of mootant run --json --all --verbose`)
    process.exit(2)
  }
  if ((report.summary?.totalCached ?? 0) > 0) {
    console.error(`${file}: ${report.summary.totalCached} verdicts came from the cache`)
  }
  return report
}
let verdict = mutant => {
  let fields = { status: mutant.status, file: mutant.killedIn ?? mutant.killedBy?.file ?? null }
  if (strict) {
    fields.test = mutant.killedBy ? `${mutant.killedBy.name}:${mutant.killedBy.line}` : null
    fields.cause = mutant.cause ?? null
  }
  return JSON.stringify(fields)
}
let [base, change] = [read(baseFile), read(changeFile)]
let left = new Map(base.mutants.map(mutant => [mutant.id, mutant]))
let right = new Map(change.mutants.map(mutant => [mutant.id, mutant]))
let differences = []
for (let id of new Set([...left.keys(), ...right.keys()])) {
  let [a, b] = [left.get(id), right.get(id)].map(mutant => (mutant ? verdict(mutant) : 'missing'))
  if (a !== b) {
    let { file, line, mutator } = left.get(id) ?? right.get(id)
    differences.push(`${id} ${file}:${line} ${mutator}\n  base   ${a}\n  change ${b}`)
  }
}
let count = report => {
  let counts = {}
  for (let { status } of report.mutants) counts[status] = (counts[status] ?? 0) + 1
  return JSON.stringify(counts)
}
console.log(`base   ${base.mutants.length} mutants ${count(base)}`)
console.log(`change ${change.mutants.length} mutants ${count(change)}`)
console.log(differences.length === 0 ? 'equivalent' : `${differences.length} differences:\n${differences.join('\n')}`)
process.exitCode = differences.length === 0 ? 0 : 1
```

Скрипт проверен на синтетических отчётах: совпадение → код 0; другой
`killedIn`, смена статуса или пропавший id → 1; другая `cause` → 0 без
`--strict` и 1 с ним; отчёт без `--all` → 2.

## Как измерить выигрыш

Тихая машина: ничего тяжёлого параллельно, `uptime` перед точкой меньше ~0,5,
точку с load average выше ~1,5 на старте перезапустить. Запишите `nproc`, модель
CPU, RAM, `node -v`, `pnpm -v`, `hyperfine --version`. Нужны hyperfine,
`/usr/bin/time`, pnpm 12, доступ к GitHub и npm. На 4 vCPU держите
`--concurrency 3`, как в анализе.

```bash
W=$HOME/perf01; A=$W/analysis; REPO=$(git rev-parse --show-toplevel)
# 1. Две сборки одной версии: база — main без изменения (коммит, от которого
#    начата ветка), изменение — ваша ветка. dist/ в git нет (.gitignore:15),
#    скрипта prepack нет, поэтому сначала pnpm build.
git -C "$REPO" worktree add "$W/base-src" "$(git -C "$REPO" merge-base HEAD origin/main)"
(cd "$W/base-src" && pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination "$W") \
  && mv "$W"/mootant-*.tgz "$W/base.tgz"
(cd "$REPO" && pnpm build && pnpm pack --pack-destination "$W" && rm -rf dist) \
  && mv "$W"/mootant-*.tgz "$W/change.tgz"
# 2. Проекты стенда: те же SHA, патчи и lockfile, что в анализе (Stryker тоже
#    ставится, он не нужен), порядка 10 минут. Патчи: path-to-regexp — без
#    src/cases.spec.ts и src/redos.spec.ts; cheerio — typecheck выключен;
#    fast-json-stringify — без test/webpack.test.js и test/property-names.test.js,
#    зависимости по npm install --before=2026-11-03 (lockfile в репозитории нет).
BENCH_PROJECTS=$W/projects BENCH_RESULTS=$W/results MOOTANT_TGZ=$W/base.tgz \
  bash "$A/bench/setup.sh" --no-verify path-to-regexp cheerio fast-json-stringify
# 3. Точка: 3 холодных прогона; кэш Mootant удаляется перед каждым.
mutate() { case $1 in
  path-to-regexp) echo src/index.ts ;;
  cheerio) echo src/api/attributes.ts src/api/css.ts src/api/forms.ts ;;
  fast-json-stringify) echo lib/serializer.js lib/validator.js lib/standalone.js lib/location.js lib/merge-schemas.js ;;
  perfectionist) echo rules/sort-switch-case.ts rules/sort-switch-case utils/compare ;;
esac; }
measure() { # measure <project> <point> <tarball> [extra flags]
  local project=$1 point=$2 tgz=$3; shift 3
  local P=$W/projects/$project O=$W/results/$project/$point
  bash "$A/tools/perf-proto/use-mootant.sh" "$P" "$tgz" && mkdir -p "$O" && uptime >>"$O/load.txt"
  (cd "$P" && hyperfine --runs 3 --prepare 'rm -rf node_modules/.cache/mootant' \
    --export-json "$O/hyperfine.json" \
    "bash $A/bench/lib/measure-one.sh $O mootant $P -- node node_modules/mootant/bin/mootant.js run $(mutate "$project") --concurrency 3 --json --all --verbose $*")
  uptime >>"$O/load.txt"
}
for p in path-to-regexp cheerio fast-json-stringify; do
  measure "$p" m-cold-base "$W/base.tgz"
  measure "$p" m-cold-on "$W/change.tgz" --parallel-units
  measure "$p" m-cold-off "$W/change.tgz"
done
node "$A/bench/summarize.mjs" "$W/results" >"$W/results/summary.md"
node "$A/bench/lib/units-report.mjs" "$W/results/path-to-regexp/m-cold-on/run-1.units.json" --workers 3
```

- `measure-one.sh` пишет на прогон `run-k.json` (отчёт), `run-k.time` (GNU time),
  `run-k.mem.json` (PSS дерева) и `run-k.units.json` (трасса юнитов Vitest);
  смещение обвязки +0,2–1,0 с исправлено после окна (`$A/bench/README.md`,
  «Известные ограничения», п. 11). Трассировщик читает рабочий каталог Vitest;
  папки и поля на `main` те же (`adapters/vitest/reset-run-directory.ts:7`,
  `adapters/vitest/runner.ts:938-957`), но в деле это не проверено. У node:test
  трассы нет. В режиме «on» «самая длинная цепочка» смысла не имеет: смотрите
  занятость и ожидание.
- `use-mootant.sh` ставит tarball поверх `node_modules/mootant` и задаёт файлам
  `mtime` по хэшу tarball: две сборки не делят кэш (штамп сборки в ключе —
  `core/cache/prepare-run-cache.ts:226`).
- Записать по точке: wall mean ± σ (медиана) из `hyperfine.json`, GNU elapsed,
  фазы, CPU и PSS из `summary.md`, Σ `summary.staticCost[].duration`, занятость
  слотов, число Timeout.
- Время (оценка по временам 170ec52, без установки): path-to-regexp ≈ 12 мин,
  cheerio ≈ 22 мин, fast-json-stringify ≈ 53 мин на три точки; perfectionist
  (`pnpm`, около 1,5 ч на base и on) — по желанию. Тёплые точки с опцией прогревайте прогоном с той
  же опцией: у неё свой ключ кэша.

**Порог успеха** (рекомендация этого промпта по замеру P1 на 170ec52, с
запасом на изменения `main`; если база `main` сильно отличается от 170ec52,
объясните):

- медиана wall `m-cold-on` против `m-cold-base`: path-to-regexp — не меньше
  ×1,5 (на 170ec52 было ×1,75), cheerio и fast-json-stringify — не меньше ×1,3
  (было ×1,47 и ×1,52), perfectionist, если снят, — не меньше ×1,2 (было ×1,34);
  диапазоны трёх прогонов не пересекаются;
- `m-cold-off` против `m-cold-base` — в пределах 3 % по медиане (σ/mean
  холодных точек на 170ec52 — 1,1–2,3 %, на perfectionist 4,3 %);
- CPU с опцией не выше базы больше чем на 5 %; PSS записан (ожидание — рост
  на path-to-regexp около +50 %, на fast-json-stringify около ×2);
- вердикты — 0 расхождений (см. «Инвариант»).

## Риски и границы

- **Ложные вердикты при общем ресурсе**: в основном ложные Killed (score
  завышается), возможны и ложные Survived, если чужой юнит подложит «верные»
  данные. Закрыто так: opt-in, `false` по умолчанию, отдельный ключ кэша,
  `recheck` с тем же флагом, документация с примерами.
- **Память.** Растёт пик PSS (path-to-regexp 980 → 1463 МБ). Воркер, убитый по
  OOM, на `main` сразу даёт `Killed` с `cause: 'crash'` без повтора
  (`core/run/read-isolated-unit.ts:56-63`; BUG-602 и BUG-901). В документации
  посоветуйте снизить `--concurrency`, если памяти мало.
- **Конкуренция за CPU.** Юниты идут дольше. Подтверждения тайм-аутов isolated
  идут без снижения параллельности (у batch оно есть,
  `core/run/plan-batch.ts:72-73`), поэтому `time-limit` у границы бюджета
  (BUG-204) может сработать чаще. Следите за числом Timeout.
- **Teardown.** `waitForTurn` гарантирует, что юнит не стартует, пока предыдущий
  держит ресурс в teardown (`adapters/vitest/worker/wait-for-turn.ts:17-21`). С
  опцией этой гарантии нет — это задокументированная цена.
- **Ресурсы по id воркера.** `Pool` Vitest 5.1.0 даёт одновременным задачам
  разные `poolId` (`VITEST_POOL_ID`; `node_modules/vitest/dist/chunks/index.Di8au7q4.js:5899`,
  `:6013-6023`), у Jest номер слота — `JEST_WORKER_ID`. Тесты, которые разносят
  ресурсы по этим id, вероятно, останутся изолированными, а тесты, которые
  делят ресурс по пути файла, — нет. Гипотеза: не проверено, в том числе с
  собственным пулом форков Mootant.
- Batch-прогоны `--fast` не меняются. С `--concurrency 1` выигрыша нет.

## Связанные промпты

- **PERF-04** (префорк): его прогноз ×1,2–1,4 дан «после P1» — после P1 слоты
  заняты на 67–69 %, остальное — старт форков. Делать после этой задачи.
- **PERF-07** (выжившие без барьеров раундов): P1 сокращает его прогноз с
  −80…−140 с до около 5 % на perfectionist, а обоснование
  `core/run/run-isolated-rounds.ts:18-21` держится на цепочках — согласуйте.
- **PERF-03** (`includeTaskLocation` только в dry run) и **PERF-05** (кэш
  компиляции V8): экономия CPU становится экономией wall, когда слоты не
  простаивают, то есть после P1.
- **PERF-08** (калибровка тайм-аутов, BUG-752): калибруйте и в параллельном
  режиме — юниты в нём медленнее. **PERF-02** (полный кэш, P3): если войдут оба,
  ключ снимка должен включать `parallelUnits`.
- **PERF-10** (node:test без процесса на юнит): P1 уже дал ×1,52 на
  fast-json-stringify. **PERF-06**, **PERF-09**, **PERF-11**, **PERF-12** —
  независимы. Отрицательный результат «LPT» (§4.4) отброшен, потому что узким
  местом была цепочка; после P1 его стоит перепроверить (не измерялось).
- **BUG-602/BUG-901** (`crash` → Killed), **BUG-204** (`time-limit`
  недетерминирован) — `analysis/bug-prompts/` той же ветки.

## Критерий готовности

- **Тесты.**
  - `test/adapters/vitest/runner.test.ts`, блок `Runner`: второй юнит при живом
    процессе первого стартует сразу только с `parallel` и только в isolated
    (тест P1; batch и dry по-прежнему ждут).
  - `test/adapters/vitest/run-specifications.test.ts`: `parallel: true` уходит
    воркерам только при `context.parallelUnits` (тест P1).
  - `test/adapters/node-test/run-isolated.test.ts`: перекрытие 1 без опции и
    2 с ней (тест P1, применяется).
  - Jest: заметка и последовательная цепочка с опцией (или тесты подцепочек,
    если выбрана поддержка).
  - Ядро: `prepare-run-cache` (ключ другой с опцией и прежний без неё),
    `run-isolated-rounds` или `count-run` (цепочка на юнит), `run-mutants` на
    `test/helpers/create-fake-adapter.ts` (флаг в контексте только при опции и
    возможности, заметка без возможности), `validate-adapter`,
    `validate-config`, `resolve-run-settings`, `parse-arguments`,
    `format-command`.
  - Интеграционный тест из «Инварианта», п. 4.
- **Без опции** все существующие тесты, включая три «never runs a test file
  twice at once» и тест worker-scoped фикстуры, проходят без правок ожиданий.
- **Эквивалентность:** 0 расхождений (`status` + `killedIn`) в 3 прогонах
  `m-cold-on` и `m-cold-off` против `m-cold-base` на path-to-regexp, cheerio и
  fast-json-stringify; база детерминирована; Timeout не прибавилось.
- **Выигрыш:** по медиане wall `m-cold`, 3 прогона, с разбросом — не меньше
  ×1,5 на path-to-regexp и ×1,3 на cheerio и fast-json-stringify; без опции —
  в пределах 3 % от базы. В PR — таблица mean ± σ (медиана), CPU, PSS,
  занятость слотов, условия и версии.
- **Документация:** `configuration.mdx`, `cli.mdx`, справка CLI, JSDoc контракта
  и мест из п. 4–5 плана; решения из «Что сделать» описаны в PR.
- `pnpm test` полностью зелёный (включая 100 % coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`).

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс. Без опции поведение, ключи кэша и вердикты — как на
  `main`; по умолчанию `false`.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Новые поля `RunConfig`, `AdapterContext` и `TestAdapter` — только
  необязательные.
- Политику раундов (PERF-07) и механизм тёплых воркеров Jest без отдельных
  тестов не меняй.
- Окружение (замечено на 170ec52; на `main` места в коде те же): pnpm 12
  (`pnpm-workspace.yaml` использует `configDependencies`). Тесты Unicode падают
  при `TERM=linux` (`cli/terminal/is-unicode-supported.ts:13`), «skips test files
  it cannot read» — под root (`test/adapters/node-test/score-node-test.test.ts:98`),
  при заданном `NODE_OPTIONS` покрытие ниже 100 %
  (`adapters/node-test/start-node-test-session.ts:119`, `:167`). Запускай
  `env -u NODE_OPTIONS TERM=xterm-256color pnpm test:unit`. `tsconfig.json`
  не исключает `dist/`, поэтому после `pnpm build` `test:astro` даёт ложные
  ошибки: удаляй `dist/`.
- Стенд, tarball'ы и результаты замеров в коммит не входят; итоги — в описание PR.
- Сообщения коммитов — Conventional Commits (commitlint).
