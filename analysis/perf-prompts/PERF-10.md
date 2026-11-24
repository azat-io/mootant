# PERF-10: node:test без процесса на юнит (исследование)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 10 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: не оценён; верхняя граница — оценка, не замер:
> если снять весь старт процесса (58 мс × 2088 юнитов), до ≈ 40 с на
> fast-json-stringify `m-cold`, около 10 % без P1 и 15 % с P1. Риск для
> вердиктов: высокий (для ESM кэш модулей не сбросить, состояние процесса
> переживает юнит). Трудоёмкость: L. Прототип: нет. Тип: исследование с
> критерием «делать / не делать». Замерено на коммите 170ec52; код сверен с
> `main` на bd7af11.

## Контекст

Юнит isolated-пути — мутант в целом тест-файле «в свежем графе модулей» с
начала загрузки (`types/adapter/isolated-plan.d.ts:3-11`); юниты одного файла
не идут одновременно (`types/adapter/adapter-session.d.ts:14-20`). Адаптер
node:test даёт каждому юниту свежий процесс, документация это обещает
(`docs/content/guide/compatibility.mdx:136-137`). Путь юнита на main:

- пул с ключом — тест-файлом — на `handle.workers` слотов
  (`adapters/node-test/run-isolated.ts:47-99`, ключ `:96`;
  `adapters/shared/run-in-pool.ts:21-36`); юнит — в `MOOTANT_UNIT`
  (`adapters/node-test/run-test-file.ts:39-61`), `spawn` с `detached: true`
  (`adapters/node-test/run-test-process.ts:124-130`), сторож и выход — `:143-188`;
- preload (`adapters/node-test/preload/preload.ts`) читает и удаляет
  `MOOTANT_UNIT` (`:40`; в потоках и дочерних процессах тестов он инертен —
  `preload/read-unit.ts:20-22`), включает мутанта с начала процесса
  (`preload/create-try-tracker.ts:149`), ставит module hooks (`preload.ts:64-71`,
  `preload/install-module-hooks.ts:89-109`), пишет `start` (`preload.ts:72`) и
  вешает слушатели `process` (`:78-92`). Тест-файл — главный модуль (`:50`);
- `startup` = `start.time − spawned` (`adapters/node-test/build-isolated-facts.ts:86-87`):
  spawn, bootstrap Node, импорты preload. Загрузка, тесты и хуки — в `duration`
  записи `end`, там же `loadDuration` (`preload/create-try-tracker.ts:250-302`).

Идея (бывш. 7; в черновике раздела 4 — «переключать мутанты в одном процессе,
раз рантайм уже умеет менять активного мутанта»). Риск высокий: для ESM кэш
модулей не сбросить (§4.4), для CJS черновик ставил «средний» — через
`require.cache` (`preload.ts:90`). Раздел 1 (`analysis/01-architecture.md`,
«Архитектура адаптеров», 6.3 п. 1 и абзац после таблицы 6.4) отверг
«переиспользовать воркер со сбросом графа модулей»: глобалы, слушатели
`process.on`, таймеры и нативные модули переживают сброс, вердикты меняются.
Предложен префорк (6.4 п. 2 — PERF-04).

**Что изменилось на main с 170ec52.** Модель та же (`spawn` сдвинулся с
`:117-123` (170ec52) на `:124-130`, `run-in-pool.ts` переехал в
`adapters/shared/`); переиспользования процессов, префорка и P1 нет — задача не
сделана. Новое — Jest-адаптер (`bc6adec`): юниты файла идут на долгоживущем
воркере «тёплыми», потом файл перепроверяется без мутантов, при провале юниты
идут чисто (`adapters/jest/run-isolated.ts:206-260`; `freshWorkers` — процесс на
юнит, `adapters/jest/types/jest-adapter-options.d.ts:10-14`). Остаточный риск
код признаёт сам (`adapters/jest/run-isolated.ts:216-219`).

## Доказательства

Окно 2026-11-04, 07:35–13:43 UTC, без чужой нагрузки (§4.5.1): 4 vCPU Intel
Xeon 2.1 GHz, 15 GB RAM, Node 22.23.4, Mootant 170ec52, `--concurrency 3`,
3 прогона на точку; Vitest-проекты стенда — Vitest 5.0.5 (cheerio — Vitest 5).
fast-json-stringify `ac1723c7` (`node --test`, CJS, 58 тест-файлов, `MUTATE` —
`lib/*.js` без `lib/schema-validator.js`, 308 мутантов), `m-cold` — обычный
режим, холодный кэш.

| величина | значение |
|---|---|
| wall база / с P1, hyperfine, mean ± σ (медиана), §4.5.5 | 402,3 ± 9,1 (403,7) / 264,5 ± 5,3 (266,5) с, ×1,52 |
| CPU база → P1, user + sys дерева (GNU time) | 895 → 853 с |
| фазы, медианы `summary.duration` (§4.5.3) | dryRun 6,1, isolated 396,9 из 403,0 с; запусков раннера 1 + 7 |
| юнитов; Σ `staticCost.duration` / юнитов | 2088; 0,34 с |
| старт на юнит: (Σ `staticCost.duration` − Σ `mutants[].duration`) / юнитов, медиана 3 прогонов | 58 мс (у Vitest — 142–156 мс) |
| выжившие, Σ `mutants[].duration` | 68 мутантов, 392–413 с, 65 % времени юнитов |

**Не измерено** (§4.5.7, §4.2 и по коду): трассы юнитов node:test нет —
загрузка и тесты не разделены; CPU-профили fast-json-stringify в окно не вошли;
сворачивание после `exit` не учитывается; ESM-проекта на node:test в стенде нет.

**Смоук-профиль — не результат** (`analysis/bench/smoke/profile-fast-json-stringify.md`:
load average 25–40, `--concurrency 2`, 2 файла, 232 юнита, `--cpu-prof`). 297
тест-процессов, self-time: `node:internal/modules` 17,8 % (`wrapSafe` 6,9 %),
`ajv` 17,2 %, GC 9,6 %, `node:internal/bootstrap` 5,0 %, `node:internal/test_runner` 3,2 %.

**Оценки из этих чисел** (не замер). Старт — около 17 % юнита (58 из 340 мс).
Снять его целиком: 2088 × 58 мс ≈ 121 с слотов, на 3 слота — до ≈ 40 с; ту же
границу даёт PERF-04, не трогая изоляцию. Довод за PERF-10 (рассуждение):
префорк переносит работу старта, а не убирает её, а с P1 дерево уже занимает
853 / 264,5 ≈ 3,2 из 4 vCPU; сколько CPU стоит старт, неизвестно. Остальные
≈ 282 мс (загрузка, тесты, хуки) остаются при любой схеме со свежим графом.

## Что сделать

### Шаг 0. Стенд и инструменты

Сессия на main не видит `analysis/`; всё нужное — в опубликованной ветке. Нужны
hyperfine 1.18, `/usr/bin/time`, pnpm 12, сеть (`$A/analysis/bench/README.md`).

```bash
git fetch origin analysis/2026-11
A="$HOME/mootant-analysis"; mkdir -p "$A"
git archive origin/analysis/2026-11 analysis/bench analysis/tools/oracle \
  analysis/tools/perf-proto analysis/experiments/perf-fixtures \
  analysis/data/isolation.md analysis/data/oracle/matrices.md | tar -x -C "$A"
git show origin/analysis/2026-11:analysis/tools/compare-verdicts.mjs > /tmp/compare-verdicts.mjs
pnpm install --frozen-lockfile && pnpm build && pnpm pack && mv mootant-*.tgz "$HOME/mootant-dev.tgz"
export BENCH_PROJECTS="$HOME/bench" MOOTANT_TGZ="$HOME/mootant-dev.tgz"
"$A/analysis/bench/setup.sh" fast-json-stringify   # клон ac1723c7, патчи, tarball
# новый tarball: "$A/analysis/tools/perf-proto/use-mootant.sh" "$BENCH_PROJECTS/fast-json-stringify" <tgz>
```

### Шаг 1. Доля старта и сворачивания

Временно, без коммита, в `runTestProcess` (`run-test-process.ts:100`,
`:173-188`) пиши на процесс строку JSONL в файл из своей переменной окружения:
режим из `MOOTANT_UNIT`, `spawned`, время `exit` и `close`, `start.time`,
`loadDuration` и `duration` записи `end`. Сними `m-cold` (`BENCH_RESULTS=$HOME/r10/log
"$A/analysis/bench/run.sh" fast-json-stringify:m-cold`, 3 прогона, тихая машина)
и по isolated-юнитам посчитай медиану и p90:

- `c = exit − spawned`; `startup = start.time − spawned` (сверь с 58 мс окна:
  preload и `adapters/shared/track-*.ts` после 170ec52 менялись);
- `tail = exit − (start.time + duration)` — сворачивание процесса;
- `loadDuration` и `duration − loadDuration` — загрузка и тесты с хуками.

Затем `"$A/analysis/bench/profile.sh" fast-json-stringify run` — те же группы,
что в смоуке, по тест-процессам (профиль замедляет на 5–15 %, время не мерь).

**Порог A** (этого промпта, не из анализа). s = медиана (`startup` + `tail`) /
`c`; схема без процесса ускорит прогон не больше чем в 1 / (1 − s) раз. Дальше —
только при s ≥ 13 % (≥ ×1,15): у PERF-04 при среднем риске порог ×1,10, здесь
риск выше, и часть старта останется в любой схеме. Если PERF-04 уже в main,
считай s поверх него. Иначе — сразу итог (шаг 3) с «не делать».

### Шаг 2. Схема и сначала изоляция

Кандидаты (оценки выигрыша ни для одного нет):

1. **Процесс на файл, юниты подряд со сбросом `require.cache`** — только CJS;
   раздел 1 схему отверг. Бери, только если закроешь каждый канал из
   «Инварианта», п. 2.
2. **Тёплые юниты с перепроверкой файла**, как в Jest-адаптере
   (`adapters/jest/run-isolated.ts:206-260`). Свежего графа для ESM не даёт.
3. **Поток `worker_threads` на юнит** в долгоживущем процессе — в анализе не
   рассматривался, гипотеза. Проверь, что у потоков общее (`process.cwd()`,
   `process.env`, слушатели `process`, `process.exit`, нативные модули, stdout)
   и идёт ли node:test в потоке как в главном модуле. Сейчас preload в потоках
   инертен (`read-unit.ts:20-22`), а тест-файл — `process.argv[1]` (`preload.ts:50`).

Схему собери за выключателем (переменная окружения, как `MOOTANT_PARALLEL_UNITS`
у прототипа P1) и до замеров скорости прогони «Инвариант». Расхождение, которое
не закрыть без отката на процесс на юнит, — итог (шаг 3) с «не делать».

### Шаг 3. Порог B, оформление, итог

**Порог B:** ≥ ×1,10 по wall `m-cold` (интервалы mean ± σ не пересекаются), CPU
не выше базы, 0 расхождений вердиктов. Тогда — opt-in опция `nodeTestAdapter`
(`adapters/node-test/types/node-test-adapter-options.d.ts`); по умолчанию, для
ESM и при сбое схемы — процесс на юнит; обнови `docs/content/guide/compatibility.mdx:136-137`.
**Итог** — при любом решении, в PR или issue: числа шага 1, доли профиля, схема
и почему отброшены остальные, «Инвариант», A/B; при «не делать» — ссылка на PERF-04.

## Инвариант: вердикты не меняются

Ни статус, ни убивающий файл не меняются ни у одного мутанта.

1. **Тесты репозитория** с режимом, включённым принудительно:
   `describe('verdict equivalence')` в `test/adapters/node-test/index.test.ts:376`
   (`:413` мутанты, применённые руками, `:563` экспорты CJS, `:584` «never runs
   a test file twice at once»).
2. **Каналы утечки** (раздел 1, 5.1 и 6.3 п. 1) — новые фикстуры в
   `test/fixtures/node-test/`: мутант пишет в `globalThis` и `process.env`,
   вешает `process.on`, оставляет таймер, меняет `exitCode`, `cwd`, состояние
   модуля ESM и CJS; тест читает `process.argv` и зовёт `process.exit()`.
   Вердикты режима = процесс на юнит = мутант, применённый руками.
3. **Оракул анализа** (ESM-фикстуры): `$A/analysis/tools/oracle/fixtures/nt` →
   `$O/nt` со своим tarball вместо 170ec52; `ORACLE_ROOT=$O ORACLE_RESULTS=$O/off
   "$A/analysis/tools/oracle/run-suite.sh" nt state modes load hooks crash slow
   dynamic`, затем `run-mootant.sh <фикстура> default` с режимом в `$O/on`: 0
   расхождений; матрицы `compare.mjs` — как в `$A/analysis/data/oracle/matrices.md`;
   пара counter через `isolation.sh` — как в `$A/analysis/data/isolation.md` (id
   пар на main возьми из `mootant list src --json`: в файле они с 170ec52).
4. **`node-units`** (`perf-proto/setup-fixture.sh`, `perf-proto/run-mootant.sh`)
   — те же вердикты в 3 прогонах из 3.
5. **Стенд:** `node /tmp/compare-verdicts.mjs <off/run-1.json> <on/run-k.json>`
   и с `--strict` — 0 расхождений на каждом прогоне режима (в окне у Mootant
   0 смен вердиктов за 3 прогона, §4.5.2). Число Timeout и `crash` не растёт.

## Как измерить выигрыш

fast-json-stringify — единственный node:test-проект стенда, CJS (на ESM
выигрыш не измерить — так и напиши). Точки `m-cold` и `m-since` (сценарий PR: в
окне 39,3 ± 0,2 с по GNU elapsed, 106 юнитов); если PERF-01 в main — ещё и с
`parallelUnits`. Один tarball, 3 прогона, тихая машина:

```bash
R="$HOME/r10"; P=fast-json-stringify   # имя выключателя — на твой выбор
BENCH_RESULTS=$R/off "$A/analysis/bench/run.sh" $P:m-cold $P:m-since
MOOTANT_NODE_TEST_SHARED=1 BENCH_RESULTS=$R/on "$A/analysis/bench/run.sh" $P:m-cold $P:m-since
for m in off on; do node "$A/analysis/bench/summarize.mjs" "$R/$m"; done
```

Запиши wall (`m-cold` — hyperfine mean ± σ и медиана, `m-since` — GNU elapsed),
CPU (user + sys), пик PSS дерева (в окне 378 МБ, с P1 — 742 МБ), старт на юнит
по формуле §4.5.3 и медианы шага 1. Успех — порог B.

## Риски и границы

- **ESM:** без нового процесса или потока свежего графа нет — процесс на юнит.
- **Состояние вне графа** (глобалы, слушатели, таймеры, нативные модули):
  перепроверка, как у Jest, ловит не всё (`adapters/jest/run-isolated.ts:216-219`).
- **Внешнее состояние:** «один файл — никогда дважды одновременно» остаётся
  (`adapters/shared/run-in-pool.ts:21-26`).
- **Сторож и учёт:** дедлайн и `startup` (`adapters/node-test/get-unit-deadline.ts:20-25`)
  считай от выдачи юнита, иначе ложные Timeout. Сторож убивает группу
  (`run-test-process.ts:143-149`) — в общем процессе и соседей; их повторить, а
  не засчитать `crash` как Killed (BUG-602).
- **Код выхода:** `process.exit()`, `exitCode`, необработанные ошибки — свойства
  процесса юнита (`preload.ts:81-92`), код входит в hook error
  (`adapters/node-test/build-isolated-facts.ts:65-82`).
- **Не путать с batch для node:test** (раздел 1, 6.4 п. 5: `--fast`,
  эвристические kill'ы). **Откат:** режим за опцией, по умолчанию выключен.

## Связанные промпты

- **PERF-04** (префорк) — более безопасный вариант той же экономии: процесс на
  юнит остаётся, старт уходит с критического пути. Делать раньше; если влит,
  PERF-10 меряй поверх него.
- **PERF-01** (P1) уже дал ×1,52 на fast-json-stringify. **PERF-05** (кэш
  компиляции V8, и в процессах node:test) снижает ту же стоимость. **BUG-602**,
  **BUG-601** — схема не должна их усилить.

## Критерий готовности

- Итог шага 3 записан при любом решении.
- Тесты (если «делать»): фикстуры каналов утечки («Инвариант», п. 2), «юниты
  одного файла не одновременно» в новом режиме, откат на процесс на юнит.
- Эквивалентность: 0 расхождений вердиктов, в том числе с `--strict`, на
  fast-json-stringify (`m-cold`, `m-since`, по 3 прогона), наборах
  `test/adapters/node-test/`, оракуле `nt` (7 фикстур) и `node-units`.
- Выигрыш: ≥ ×1,10 по wall `m-cold` fast-json-stringify, 3 прогона, mean ± σ.
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
- Сообщения коммитов — Conventional Commits (commitlint).
