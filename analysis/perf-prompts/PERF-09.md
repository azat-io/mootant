# PERF-09: порядок тест-файлов мутанта: при равном ранге — более быстрый и тот, что убивал соседей

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 9 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз: ×1,0–1,1, не измерен; на проекте с
> одним тест-файлом — ноль по построению. Риск для вердиктов: средний —
> убивающий файл (`killedIn`) входит в вердикт и может смениться, по коду
> возможна и смена Killed ↔ Timeout (в §4.4 — «нет; может смениться
> `killedBy`»). Трудоёмкость: S. Прототип: нет. Тип: исследование с критерием
> «делать / не делать». Числа стенда сняты на 170ec52, сама идея не
> замерялась; код сверен с `main` на bd7af11.

## Контекст

**Как мутант проходит свои тест-файлы.** На isolated-пути у мутанта есть
список его тест-файлов `ranked` и очередь незапущенных `files` в том же порядке
(`core/run/route-isolated.ts:31-32`, `types/run/mutant-state.d.ts:61-71`);
раунды берут из очереди 1, 1, 2, 4, 8… файлов
(`core/run/run-isolated-rounds.ts:73-76`; на 170ec52 — `:69`). Вердикт —
убийство или тайм-аут первого по `ranked` файла с уликой, когда все файлы до
него отработали без улики (`core/run/decide-evidence.ts:3-35`); так же решаются
мутанты из кэша (`core/cache/apply-cached-batch.ts:38-40`). Поэтому порядок
`ranked` задаёт время убитого (сколько юнитов до убившего файла; выживший
проходит все файлы при любом порядке) и файл в `killedIn` и `killedBy`
(`types/report/run-report.d.ts:57`, `:66-70`). Если один файл убивает, а другой
даёт тайм-аут, порядок решает и статус (`decide-evidence.ts:21-31`; вывод по
коду, на стенде не проверялся). Переставлять одну очередь `files` бесполезно:
`decideEvidence` всё равно ждёт все файлы, стоящие раньше по `ranked`.

**Ранжирование на main**: `rankMutantFiles` (`core/run/rank-mutant-files.ts:28-59`)
вызывает `sortTestFiles` (`core/run/sort-test-files.ts:22-27`). Сначала идёт
ранг 0–4 из `rankTestFile` (`core/run/rank-test-file.ts:34-44`): 0 — файл назван
по модулю и повторяет его путь, 1 — назван и импортирует модуль, 2 —
импортирует, 3 — только назван, 4 — остальные. Затем — больше тестов файла,
достающих мутанта (`reaching`, `rank-mutant-files.ts:34-45`; у static-мутанта —
тесты любого мутанта модуля), и наконец ключ файла (`sort-test-files.ts:26`).
Равные ранги обычны (классов пять; все файлы, достающие модуль через другие
модули, получают 4), но порядок полный: «при равном ранге» на main — это замена
`reaching` или новый критерий перед ключом. Сколько мутантов стенда доходит до
ключа, в источниках нет.

**«Более быстрый первым» уже был, и автор его убрал.** До 2e203ef (2026-10-20,
«perf: rank test files by covering tests») файлы равного ранга шли от дешёвых
по dry run (`getFileCost`, `core/run/get-file-cost.ts:13-23`; теперь он нужен
только прогрессу, `run-isolated-rounds.ts:113-125`). Автор заменил его на
`reaching` и записал инвариант «never on its durations, so the same project
gets the same plan on every run and for any selection of mutants»
(`rank-mutant-files.ts:19-22`; для отчёта — `core/run/order-covering-tests.ts:7-11`,
`core/run/decide-results.ts:14-16`). Его держат тесты
`test/core/run/rank-mutant-files.test.ts:67` («gives the same order whatever the
durations of the dry run») и `:35` («… whatever mutants run»). Это было до
170ec52, в анализе не отмечено.

**«Тот, что убивал соседей»** на main нет: ранжирование статично. По коду такой
порядок ломает независимость вердикта от выбора мутантов (`--mutant`, `--since`,
`recheck` из отчёта, `types/report/run-report.d.ts:72-76`) и от кэша
(`decide-evidence.ts:4-10`): мутанты из кэша решаются до любого запуска.

**Не путать с LPT** — порядком юнитов внутри раунда, который анализ отбросил по
коду (§4.4): секвенсор Vitest при `cache: false`
(`adapters/vitest/start-vitest-session.ts:106`) сам ставит большие файлы первыми,
Mootant лишь перемежает юниты (`adapters/vitest/create-interleaved-sequencer.ts:43-62`),
а узкое место — цепочка одного файла. PERF-09 — о том, какой файл мутант пробует первым.

**Актуальность на `main` (bd7af11).** Не сделано: `rank-mutant-files.ts`,
`sort-test-files.ts`, `rank-test-file.ts`, `route-isolated.ts`, `decide-evidence.ts`,
`get-file-cost.ts`, `apply-cached-batch.ts` с 170ec52 не менялись; в соседних
`run-isolated-rounds.ts`, `plan-isolated.ts`, `decide-results.ts` порядок тот же.
Ранжирование в ядре общее для Vitest, node:test и Jest (Jest — после 170ec52, bc6adec).

## Доказательства

Стенд анализа (§4.1, §4.5.1): 4 vCPU Intel Xeon 2.1 GHz, 15 GB RAM, Node
v22.23.4; Vitest 5.0.5 (path-to-regexp, perfectionist), Vitest 5 (cheerio),
`node --test` (fast-json-stringify); Mootant 170ec52, окно 2026-11-04, точка
`m-cold` (обычный режим, холодный кэш, `--concurrency 3`, 3 прогона). Время по
статусам — Σ `mutants[].duration` без старта процессов, диапазон по 3 прогонам
(§4.5.3); wall — hyperfine, mean ± σ (медиана); σ/mean — по GNU elapsed.

| проект | раундов isolated | убитых | их время, с | на убитого, с | выживших | их время, с | wall `m-cold`, с | σ/mean |
|---|---|---|---|---|---|---|---|---|
| path-to-regexp | 1 | 307 | 64–67 | 0,21–0,22 | 29 | 9,7–10,0 | 93,9 ± 1,5 (94,2) | 1,7 % |
| cheerio | 5 | 404 | 108–112 | 0,27–0,28 | 86 | 77–79 | 164,3 ± 1,8 (165,3) | 1,1 % |
| fast-json-stringify | 7 | 240 | 212–221 | 0,9 | 68 | 392–413 | 402,3 ± 9,1 (403,7) | 2,3 % |
| perfectionist | 6 | 259 | 351–392 | 1,4–1,5 | 47 | 1233–1346 | 952,5 ± 40,7 (948,8) | 4,3 % |

- Выиграть можно только на убитых, которых убил не первый файл или убил бы и
  более дешёвый, стоящий позже. Верхняя граница — их время из таблицы; какая
  доля ушла на файлы до убившего, в источниках нет.
- path-to-regexp — один тест-файл на все мутанты и один раунд (§4.2): контроль,
  порядок там ничего не меняет.
- perfectionist: до `utils/compare` доходит почти каждый тест-файл правил
  (§4.2), выживший в утилитах проходит 24 покрывающих файла
  (`analysis/experiments/prototypes.md`, P4): там порядку есть из чего выбирать.
- Прогноз §4.4: ×1,0–1,1 («убитые и так дешёвые»); прототипа и замера нет.

## Что сделать

Это исследование: правку коммить, только если выполнен критерий готовности.

0. Материалы (пути проверены в `origin/analysis/2026-11`):

   ```bash
   git fetch origin analysis/2026-11
   git show origin/analysis/2026-11:analysis/tools/compare-verdicts.mjs > /tmp/compare-verdicts.mjs
   W=$HOME/perf09 && mkdir -p "$W"   # вне клона
   git archive origin/analysis/2026-11 analysis/bench analysis/tools/perf-proto | tar -x -C "$W"
   ```
1. Выбери вариант; всё, кроме (а), — только с явного согласия автора:
   - (а) новый критерий перед ключом (`sort-test-files.ts:26`) без длительностей,
     например «меньше тестов в файле» (`analysis.fileTests`) вместо «быстрее»;
     не нарушает `rank-mutant-files.ts:19-22` и тест `:67`. Что число тестов
     предсказывает время файла, — допущение промпта, анализ его не проверял;
   - (б) `getFileCost` перед `reaching` или вместо него — возврат снятого в
     2e203ef; ломает тест `:67`, план шумит вместе с длительностями dry run;
   - (в) «убивал соседей»: после раунда поднимать в `ranked` и `files` файлы,
     убившие другие мутанты модуля; ломает независимость от выбора мутантов и
     кэша, то же правило нужно в `apply-cached-batch.ts`.
2. Для (а) и (б) — дешёвая оценка до замера: временный вывод под переменной
   окружения (не для коммита) — `id` и `ranked` по-старому и по-новому
   (ранжирование идёт сразу после dry run, `core/run/create-run-state.ts:138-140`).
   Склей его с базовым отчётом по `id`: если убитых с ≥ 2 файлами, у которых
   меняется список до `killedIn` включительно, нет или единицы, выигрыш в шуме
   (σ/mean 1,1–4,3 %), исход «не делать».
3. A/B на стенде — «Как измерить выигрыш»; решение — по «Критерию готовности».
   Итог при любом исходе (таблица A/B, числа шага 2, смены статуса и
   `killedIn`) идёт в PR, а при «не делать» — в issue, без коммита кода.

## Инвариант: вердикты не меняются

Смена убивающего файла здесь — не шум, а цена изменения; её считают отдельно.
`/tmp/compare-verdicts.mjs` сравнивает два `mootant run --json --all --verbose`
по `id`: по умолчанию статус и `killedIn`, с `--status-only` — только статус, с
`--strict` — ещё убивающий тест и причину; при расхождении код выхода 1.

- **Статусы**: `compare-verdicts.mjs base.json change.json --status-only` — 0
  расхождений на каждом проекте и прогоне. Любая смена статуса, в том числе
  Killed ↔ Timeout, — блокер.
- **Убивающий файл**: тот же скрипт без флагов. 0 расхождений — порядок
  поменялся без смены убивающего файла; иначе выпиши переходы (число, пары
  файлов), решает автор.
- **Детерминизм**: изменение против самого себя (`run-1` и `run-2`, `--strict`)
  — не больше расхождений, чем база против себя. На стенде у Mootant 0 смен
  вердиктов за 3 прогона во всех режимах, кроме `--fast` на cheerio (§4.5.2).
- **Выбор мутантов** (для (в) обязательно): 5–10 убитых с ≥ 2 файлами
  перепроверь по `recheck`; `killedIn` должен совпасть с полным прогоном.

## Как измерить выигрыш

Тихая машина (`uptime` перед точкой меньше ~0,5), `--concurrency 3` на 4 vCPU,
hyperfine, `/usr/bin/time`, pnpm 12, доступ к GitHub и npm. `base.tgz` — main
без правки, `change.tgz` — ветка (`pnpm build && pnpm pack`, затем `rm -rf
dist`). Команды собраны по скриптам стенда и не запускались; по окну (§4.2,
§4.5.2) это около 2,5 ч машинного времени, из них 1,6 ч — perfectionist.

```bash
A=$W/analysis R=$W/results; export BENCH_PROJECTS=$W/projects MOOTANT_TGZ=$W/base.tgz
bash "$A/bench/setup.sh" --no-verify cheerio fast-json-stringify perfectionist   # те же SHA и патчи
for s in base change; do for p in cheerio fast-json-stringify perfectionist; do
  bash "$A/tools/perf-proto/use-mootant.sh" "$BENCH_PROJECTS/$p" "$W/$s.tgz"
  BENCH_RESULTS=$R-$s bash "$A/bench/run.sh" "$p:m-cold"   # 3 прогона, кэш Mootant чистится
done; done
node -e 'let fs = require("fs"); for (let f of process.argv.slice(1)) { let s = fs.readFileSync(f, "utf8"), t = {}
  let r = JSON.parse(s.slice(s.indexOf("{"))); for (let m of r.mutants) t[m.status] = (t[m.status] ?? 0) + m.duration / 1000
  console.log(f, Object.entries(t).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(", "), "| isolated runs:", r.summary.runs.isolated) }' \
  "$R"-*/*/m-cold/run-*.json   # Σ mutants[].duration по статусам
for p in cheerio fast-json-stringify perfectionist; do for k in 1 2 3; do
  node /tmp/compare-verdicts.mjs "$R-base/$p/m-cold/run-$k.json" "$R-change/$p/m-cold/run-$k.json" --label base,change --status-only
  node /tmp/compare-verdicts.mjs "$R-base/$p/m-cold/run-$k.json" "$R-change/$p/m-cold/run-$k.json" --label base,change
done
  node /tmp/compare-verdicts.mjs "$R-base/$p/m-cold/run-1.json" "$R-base/$p/m-cold/run-2.json" --strict --label base1,base2
  node /tmp/compare-verdicts.mjs "$R-change/$p/m-cold/run-1.json" "$R-change/$p/m-cold/run-2.json" --strict --label change1,change2
done
```

Запиши wall из `hyperfine.json` (mean ± σ, медиана), CPU
(`node "$A/bench/summarize.mjs" "$R-base"`, так же для `$R-change`), Σ времени по
статусам, `summary.runs.isolated` и условия (`nproc`, CPU, `node -v`, `uptime`).
Контроль по желанию — path-to-regexp: wall и вердикты должны совпасть.

## Риски и границы

- **Смена `killedIn`** — ожидаемая цена (б) и (в), возможно и (а); без согласия
  автора — блокер. (б) и (в) к тому же недетерминированы: `killedIn` может
  разойтись между прогонами и с `recheck`. **Killed ↔ Timeout** по коду
  возможен, если перед убившим файлом встанет файл с тайм-аутом; ловит
  `--status-only`, блокер.
- **Цепочки без P1.** Юниты одного файла идут по очереди
  (`types/adapter/adapter-session.d.ts:14-19`, `adapters/vitest/worker/wait-for-turn.ts:32`):
  если многие мутанты пойдут первым в один «быстрый» файл, его цепочка в раунде 1
  и сам раунд удлинятся (по коду, не мерилось). Смотри
  `node "$A/bench/lib/units-report.mjs" <run-k.units.json> --workers 3` (только Vitest).
- **Совет отчёта** (`testFiles`, `test`, порядок `coveredBy`: куда дописать тест)
  строит тот же `rankMutantFiles` (`core/run/decide-results.ts:69-78`,
  `types/report/run-report.d.ts:19-30`, `:47-64`) — он поменяется, если не
  развести порядок прогона и отчёта.
- **Jest** на стенде не было. Откат — вернуть компаратор `sortTestFiles`.

## Связанные промпты

- [PERF-01](PERF-01.md) (параллельные юниты одного файла) убирает цепочки:
  лишний юнит до убившего файла дешевле по wall, выигрыш PERF-09 ещё меньше.
  Если PERF-01 уже в main, мерить с ним.
- [PERF-07](PERF-07.md) (выжившие без барьеров раундов) — про выживших, на них
  порядок файлов не сказывается. [PERF-02](PERF-02.md) (кэш без раннера):
  вердикты из кэша решаются тем же ранжированием. [PERF-08](PERF-08.md)
  (тайм-ауты): от порядка зависит Killed ↔ Timeout.
- BUG-903 (`analysis/02-bugs.md`) — выбор файлов в том же `rank-mutant-files.ts`.

## Критерий готовности

Исход «делать» — только если выполнено всё:

- статусы: `--status-only` — 0 расхождений на cheerio, fast-json-stringify и
  perfectionist во всех 3 прогонах;
- убивающий файл: 0 расхождений без флагов, или автор явно принял смену
  `killedIn` (в PR — число переходов и пары файлов);
- детерминизм: изменение против себя с `--strict` — не больше расхождений, чем
  база против себя;
- выигрыш: wall `m-cold` (hyperfine, 3 прогона, mean ± σ, медиана) быстрее базы
  хотя бы на одном проекте с непересекающимися интервалами mean ± σ, без
  замедления за пределами σ на остальных, Σ `mutants[].duration` убитых ниже; в
  PR — таблица с CPU, `summary.runs.isolated` и условиями;
- тесты: unit-тест на новый критерий в `test/core/run/sort-test-files.test.ts`
  и `rank-mutant-files.test.ts`, для (а) тест `:67` не меняется; тесты
  `decide-evidence`, `run-isolated-rounds`, `apply-cached-batch` — без правок;
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`).

Иначе исход «не делать»: код не коммитится, итог шага 3 «Что сделать» — в issue.

## Ограничения

- Скорость не покупается вердиктами: любое расхождение статусов с базой —
  блокер, а не компромисс; смена убивающего файла — только с согласия автора.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip. JSDoc
  `rankMutantFiles`, `sortTestFiles` и `decideEvidence` обнови вместе с правкой.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Формат отчёта не меняется, только значения `killedIn`, `testFiles`, `test`.
- Сообщения коммитов — Conventional Commits (commitlint).
- Не трогай порядок юнитов внутри раунда (LPT) и размер пакетов файлов
  (PERF-07). Временный вывод шага 2, tarball'ы и `$HOME/perf09` — не в коммит.
- После `pnpm build` удали `dist/` перед `pnpm test`: `tsconfig.json` включает
  `**/*.ts`, и без этого `dist/` попадёт в проверку типов.
