# PERF-12: выборка мутантов для огромных проектов (`--sample`, score как оценка)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 12 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз — линейно по доле выборки f = n / N в
> isolated-фазе; startup и dry run не уменьшаются (в холодном прогоне стенда
> это 1–5 % wall); не измерено. Риск для вердиктов: нет — у выбранных мутантов
> те же вердикты; меняется смысл score (оценка), мутанты вне выборки не
> проверяются. Трудоёмкость: S–M. Прототип: нет. Тип: исследование с критерием
> «делать / не делать» — новая фича, а не ускорение существующего пути. Стенд
> снят на коммите 170ec52 (выборку не мерил); код сверен с `main` на bd7af11.

## Контекст

`mootant run` проверяет каждого найденного мутанта путей. Сузить набор можно
только флагами `--since` и `--mutant` (`selectMutants`,
`core/run-mutants.ts:661-692`, вызов `:209-217`). Выборки и шардирования
мутантов на main нет (`cli/parse-arguments.ts:65-83`; `grep -i 'sample\|shard'`
по `cli/`, `core/`, `types/` пуст): задача не сделана. «Раздел N, §…» — файлы
ветки `analysis/2026-11` (`git show origin/analysis/2026-11:analysis/<файл>`).

Почти всё время холодного прогона уходит на isolated-фазу, и она растёт с
числом мутантов. Идея (бывш. 9): на огромных проектах гонять детерминированную
выборку из n мутантов, а score показывать оценкой с доверительным интервалом.
Основание — Gopinath и др., *How hard does mutation analysis have to be,
anyway?*, ISSRE 2015: небольшая выборка постоянного размера даёт оценку score,
статистически близкую к полному анализу (раздел 3, §5.6), но конкретных
пробелов не находит. Раздел 3 отложил идею «до запросов с очень больших
проектов» (§6.12), в сводке §5.7 — «не делать». Решение принимает владелец.

**Почему вердикты те же.** После 170ec52 (`312ff7b`) dry run при любом отборе
связывает тесты со всеми файлами, которые хостил бы полный прогон
(`core/run-mutants.ts:356-361`, `:399-400`; `docs/content/guide/cli.mdx:29-31`;
тест — `test/adapters/vitest/index.equivalence.test.ts:954`). Поэтому и dry run
у выборки такой же, как у полного прогона. Id мутанта — SHA-256 пути, scope,
мутатора, текстов и номера вхождения, без строк (`core/identity/create-mutant-id.ts:51-73`),
так что выборка по хешу id переживает правки в других местах. Короткие id
считаются по всем найденным id (`types/run/run-result.d.ts:80-84`).

**Это не шардирование.** `--shard k/n` (раздел 3, §6.10; раздел 6, R15: low,
M) раскладывает всех мутантов по хешу id на n машин и объединяет отчёты: работы
столько же, score точный, dry run идёт в каждом шарде. Выборка — одна часть без
объединения: работы меньше, score — оценка. Общая у них лишь корзина по хешу id.

## Доказательства

Выборку стенд не мерил (в строке ранга 12 §4.4 нет ни замера, ни проверки),
выигрыш — прогноз. Ниже — то, что его ограничивает. Окно 2026-11-04 без чужой
нагрузки (§4.5.1): 4 vCPU Intel Xeon 2.1 GHz, 15 GB RAM, Node 22.23.4, Vitest
5.0.5, Mootant 170ec52, `--concurrency 3`, 3 прогона. Холодный прогон в обычном
режиме, медианы `summary.duration`, wall — GNU time, с (§4.5.3; мутанты — §4.2):

| проект | мутантов | startup | dryRun | isolated | wall | dryRun / wall |
|---|---|---|---|---|---|---|
| perfectionist | 314 | 0,7 | 48,4 | 896,4 | 948,6 | 5 % |
| path-to-regexp | 342 | 0,5 | 0,7 | 92,5 | 94,0 | 1 % |
| cheerio | 496 | 0,4 | 2,5 | 161,7 | 165,1 | 2 % |
| fast-json-stringify | 308 | 0,2 | 6,1 | 396,9 | 403,5 | 1 % |

- **Пол.** startup и dry run от выборки не зависят, поэтому прогноз — wall(f) ≈
  startup + dryRun + f × isolated. На стенде пол — 1–5 % wall.
- **Цена мутантов разная** (Σ `mutants[].duration`, диапазон 3 прогонов, §4.5.3):
  у perfectionist 47 выживших — по 26–29 с, 259 убитых — по 1,4–1,5 с (выжившие
  — 71 % времени юнитов), у cheerio — 0,9 и 0,27–0,28 с (41 %). Разброс по seed
  не измерен.
- **Детерминизм** (§4.5.2, §4.5.4): 0 смен вердиктов за 3 прогона, кроме `--fast`
  на cheerio (Timeout ↔ Killed, score тот же); интервалу остаётся ошибка выборки.
- **Огромного проекта на стенде нет** (подмножества — под 5–20 мин, §4.2).
  Смоук догфудинга не со стенда (`analysis/00-baseline.md`, 170ec52, с ~04:10
  load average 4–7): `mootant run core/text` не завершился за 42 мин; dry run —
  4 мин 37 с (8 393 теста из 10 491), раунды 2 и 4 (выжившие) — около 14 мин.

## Что сделать

**Шаг 0. Решение и стенд.** Без подтверждения владельца — итог «не делать» (раздел 3,
§6.12). Стенд — после шагов 1–4 (hyperfine 1.18, `/usr/bin/time`, pnpm 12, сеть):

```bash
git fetch origin analysis/2026-11
A="$HOME/mootant-analysis"; mkdir -p "$A"
git archive origin/analysis/2026-11 analysis/bench | tar -x -C "$A"
git show origin/analysis/2026-11:analysis/tools/compare-verdicts.mjs > /tmp/compare-verdicts.mjs
pnpm install --frozen-lockfile && pnpm build && pnpm pack && mv mootant-*.tgz "$HOME/mootant-dev.tgz"
export BENCH_PROJECTS="$HOME/bench" MOOTANT_TGZ="$HOME/mootant-dev.tgz" MOOTANT_SHA=$(git rev-parse --short HEAD)
"$A/analysis/bench/setup.sh" cheerio perfectionist fast-json-stringify
```

**Шаг 1. Флаги `run`.** `--sample <n>` — целое ≥ 1, как `--concurrency`
(`cli/parse-arguments.ts:6`, `:332-340`; доля `<p>%` — по желанию).
`--sample-seed <s>` по умолчанию фиксирован (например, `0`) и печатается в
отчёте. В том же файле — `parserOptions` (`:65-83`), `runOnlyOptions`
(`:88-97`), `RunOptions` (`:102-174`), справка (`:11-60`) и ошибки в
`parseRunOptions` (`:309-376`) по образцу `--incremental` + `--no-cache`
(`:347-352`): `--sample` с `--since` или `--mutant`, `--sample-seed` без
`--sample`. Затем `RunMutantsOptions` (`core/run-mutants.ts:56-140`). В
`run.*` конфига не выносить, чтобы CI-гейт незаметно не стал оценкой.

**Шаг 2. Выборка** — чистая функция в своём файле (например,
`core/run/sample-mutants.ts`), вызов — сразу после `selectMutants`
(`core/run-mutants.ts:209-217`), до события `mutants` (`:230-235`). Популяция N
— мутанты `Pending` (`types/mutant/mutant-status.d.ts:5`); `Ignored` в отчёт
выборки не попадают. Ключ — SHA-256 от seed и id, берутся n наименьших
(bottom-k): выборка не зависит от порядка путей, файлов и `--concurrency`, а
лишний или пропавший мутант сдвигает её максимум на одного (не `Math.random`,
не «первые n»). При n ≥ N — обычный полный прогон. `listedIds` (`:219-221`) не
трогать; файлы без выбранных мутантов выпадают, как при `--mutant` (`:686-691`).

**Шаг 3. Оценка в отчёте.**

- `buildRunReport` (`cli/report/build-run-report.ts:138-178`) пишет
  `summary.sample`: `null` без выборки, иначе `{ seed, size, population,
  confidence: 0.95, method: 'wilson', score: [low, high], coveredScore: [low,
  high] }`. `score` и `coveredScore` — точечные оценки, `compute-score.ts` не
  меняется. Тип — в `types/report/run-report.d.ts` (новое поле не меняет
  версию схемы 4, `:289-293`; на 170ec52 была 3), slim — `cli/report/slim-run-report.ts:30-37`.
- Интервал Уилсона, 95 % (предложение промпта, в анализе метода нет): p̂ = x/m,
  z = 1,96, границы (p̂ + z²/2m ± z·√(p̂(1 − p̂)/m + z²/4m²)) / (1 + z²/m), при
  m = 0 — `null`. Поправка на конечную совокупность — по желанию (без неё шире).
- Предупреждение в `diagnostics` (код вроде `sampled-run`, как `incremental-reuse`,
  `core/run-mutants.ts:529-542`): «оценка по n из N, seed s, остальные не
  проверены». Его увидит и потребитель JSON, не знающий нового поля. `passed`
  оно не ломает: тот учитывает только ошибки (`cli/report/build-run-report.ts:151-156`).
- Текст — `formatScore` (`cli/report/format-run-text-report.ts:322-348`):
  `score ≈ <p>% (95% CI <low>–<high>%, <n> of <N> mutants, seed <s>)`. Список
  файлов с низшим score (`cli/run-mutation.ts:65`, `format-run-text-report.ts:251-289`)
  скрыть или пометить. `--sample` есть в строке команды (`cli/report/format-command.ts:62-108`),
  но не в перепроверке (`cli/run-mutation.ts:52-58`), как и `--since`.

**Шаг 4. Другие флаги вместе с `--sample`.**

| флаг | поведение | где и почему |
|---|---|---|
| `--since` | ошибка (рекомендация) | в PR нужны конкретные пробелы, а `--since` и так оставляет 3–13 мутантов на стенде (§4.5.4) |
| `--mutant` | ошибка | id уже заданы |
| кэш | без изменений | выборка берёт и пишет вердикты своих мутантов, записи остальных остаются: файл перечитывается, записи прогона ложатся поверх (`core/cache/write-run-cache.ts:13-15`, `:36-43`). Удаляются только записи, не использованные 30 дней, и сверх 200 000 (`core/cache/prune-cache-entries.ts:3-15`). Timeout и Error не кэшируются (`core/cache/create-run-cache.ts:143-144`) |
| `--incremental` | совместим | предупреждение `incremental-reuse` остаётся, оценка наследует возможную устарелость вердиктов |
| `--threshold` | выбрать и описать в `docs/content/guide/cli.mdx:60-69` | (а) рекомендуется: сравнивать точечную оценку, как сейчас (`cli/report/build-run-report.ts:151-156`, текст — `format-run-text-report.ts:340-346`), и предупреждать, когда порог внутри интервала; (б) нижняя граница — строгий гейт; (в) ошибка. При том же коде и seed итог повторяется |
| `--fast` | совместим | выборка решает, какие мутанты идут, а не каким путём |
| `--html` | только с явным `--html` | как у `--mutant` (`core/run/get-html-path.ts:10-15`, `:29`; `picked` — `core/run-mutants.ts:184-187`), чтобы не заменить отчёт полного прогона; оценка помечена и в HTML |

**Шаг 5. Документация и итог.** Обнови «Run options» (`:43-53`) и «Mutation
score and exit code» (`:60-69`) в `docs/content/guide/cli.mdx`: оценка,
интервал, порог, несовместимые флаги, непроверенные мутанты, отличие от
`--shard`. В skill (`skills/mootant/SKILL.md:77`, `:87`) выборку не добавлять:
агенту нужны конкретные выжившие. Итог с числами — в PR или issue.

## Инвариант: вердикты не меняются

У каждого мутанта выборки статус и убивающий файл (с `--strict` — ещё тест и
cause) те же, что в полном прогоне того же кода той же сборкой. Тесты
репозитория — по образцу `index.equivalence.test.ts:954`: полный `runMutants`
против прогона с выборкой для Vitest, node:test и Jest (`test/adapters/`). На
стенде `full.json` — `base/<проект>/m-cold/run-1.json`, `sample.json` — каждый
`run-k.json` точки `m-sample`. Полный отчёт сначала сузь до id выборки, иначе
скрипт сочтёт остальные id пропавшими и выйдет с кодом 1:

```bash
node -e 'let fs=require("node:fs");let [f,s]=process.argv.slice(1).map(p=>JSON.parse(fs.readFileSync(p,"utf8")));let ids=new Set(s.mutants.map(m=>m.id));f.mutants=f.mutants.filter(m=>ids.has(m.id));console.log(JSON.stringify(f))' full.json sample.json > full-in-sample.json
node /tmp/compare-verdicts.mjs full-in-sample.json sample.json --label full,sample
node /tmp/compare-verdicts.mjs full-in-sample.json sample.json --label full,sample --strict
```

Нужно 0 расхождений и равное число мутантов в обоих файлах. Выборка — n
наименьших ключей среди не-`Ignored` id полного отчёта; при одном seed id
совпадают. Любое расхождение — блокер. Timeout по `time-limit` сначала проверь
на повторяемость между двумя полными прогонами (BUG-204).

## Как измерить выигрыш

Сборка одна, база — `m-cold` без `--sample`. В копии `$A/analysis/bench/run.sh`
добавь в `PLAN` строки `7 <проект> m-sample` (cheerio, perfectionist,
fast-json-stringify), в `define_point` — `m-sample) CMD=$(mootant_run --sample
"$BENCH_SAMPLE" --sample-seed "$BENCH_SEED") ;;`. `NC`, `NP`, `NF` — четверть
не-`Ignored` мутантов на main (`summary.totalMutants − summary.totalIgnored` у
`mootant list <MUTATE> --json`, `MUTATE` — в `$A/analysis/bench/projects/<проект>/project.sh`).

```bash
R="$HOME/r12"; B="$A/analysis/bench"
BENCH_RESULTS=$R/base "$B/run.sh" cheerio:m-cold perfectionist:m-cold
BENCH_RESULTS=$R/base "$B/run.sh" --runs 1 fast-json-stringify:m-cold
for s in 1 2; do
  BENCH_SAMPLE=$NC BENCH_SEED=$s BENCH_RESULTS=$R/s$s "$B/run.sh" cheerio:m-sample
  BENCH_SAMPLE=$NP BENCH_SEED=$s BENCH_RESULTS=$R/s$s "$B/run.sh" perfectionist:m-sample
done
BENCH_SAMPLE=$NF BENCH_SEED=1 BENCH_RESULTS=$R/f1 "$B/run.sh" --runs 1 fast-json-stringify:m-sample
for d in base s1 s2; do node "$B/summarize.mjs" "$R/$d"; done
```

На тихой машине запиши wall (hyperfine mean ± σ и медиана у точек длиннее ~30 с,
иначе GNU elapsed, §4.5.1), CPU (user + sys), фазы, число выживших в выборке и
прогноз startup + dryRun + f × isolated по медианам базы. **Покрытие
интервала** — без запуска тестов, после «Инварианта»: на полных отчётах cheerio
и perfectionist прогони функции выборки и интервала из сборки для seed 1…1000
при f = 25 %; покрытие — доля seed, где интервал содержит полный score по
счётчикам (не округлённый `summary.score`). Запиши и среднюю ширину.

**Успех** (пороги этого промпта, в анализе их нет): на cheerio при f = 25 %
wall ≤ 0,4 × базы для обоих seed (3 прогона, mean ± σ); покрытие ≥ 93 % на
обоих проектах. По perfectionist — wall по seed с разбросом, без порога: время
там уходит на выживших.

## Риски и границы

- **Score — оценка.** Пробелы вне выборки не найдены (раздел 3, §5.6), выжившие
  в ней — настоящие, score файла ненадёжен. Порог около интервала может
  разойтись с полным прогоном; повтор с тем же кодом и seed — нет.
- **С фиксированным seed** одни и те же мутанты всегда без проверки. Смена seed
  вместе с кэшем покрывает больше — так и написать в документации.
- **Пол startup + dry run остаётся** (у догфудинга `core/text` dry run —
  4 мин 37 с); тёплый повтор ускоряет PERF-02.
- **Откат.** Флаг opt-in; без него меняется только поле `summary.sample: null`.

## Связанные промпты

- **PERF-02**: ключ снимка зависит от переключённых файлов, а их набор меняет
  выборка, поэтому нужен фиксированный seed (так и записано в PERF-02).
- **PERF-01, PERF-07, PERF-09** (расписание isolated-фазы) независимы.
  **PERF-11** (отсев некомпилирующихся): реши, входит ли отсеянный мутант в N.
- `--shard k/n` (раздел 3, §6.10; раздел 6, R15) — не PERF-промпт. **BUG-204**
  (`time-limit`) — для разбора расхождений.

## Критерий готовности

- Итог «делать / не делать» с числами записан при любом решении.
- Тесты: выборка (детерминизм, порядок путей и файлов, мутант в другом файле
  сдвигает её максимум на одного, n ≥ N, другой seed); интервал (x = 0, x = m,
  m = 1, m = 0 → `null`, ручные значения); CLI (`--sample 0`, с `--since`, с
  `--mutant`, `--sample-seed` без `--sample`); снапшоты текста, полного и slim
  JSON; ветка `--threshold`; предупреждения; кэш (полный прогон после выборки
  берёт её вердикты, чужие записи целы); `--incremental`; HTML без `--html`.
- Эквивалентность: 0 расхождений (`compare-verdicts.mjs` по умолчанию и с
  `--strict`) на cheerio и perfectionist (2 seed × 3 прогона),
  fast-json-stringify (1 seed) и в тестах адаптеров.
- Покрытие интервала ≥ 93 % (1000 seed, f = 25 %) на cheerio и perfectionist.
- Выигрыш: на cheerio при f = 25 % wall ≤ 0,4 × базы, 3 прогона на seed, с
  разбросом; по perfectionist числа записаны.
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
