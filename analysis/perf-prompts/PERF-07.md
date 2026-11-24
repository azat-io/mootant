# PERF-07: перепроверка выживших без барьеров раундов (крупнее пакеты, затем поток)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 7 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: прогноз, не замер: после P1 (PERF-01) около 5 %
> холодного прогона perfectionist, без P1 −80…−140 с из 913–994 с. Риск для
> вердиктов: нет — меняется только расписание. Трудоёмкость: S (вариант S —
> крупнее пакеты), L (вариант L — поток). Прототип: нет. Тип: исследование с
> критерием «делать / не делать» (сначала S, L — отдельным решением). Замерено
> на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

Isolated-путь гоняет нерешённых мутантов раундами. Раунд — один запуск раннера
(`session.runIsolated(plan)`, `core/run/run-isolated-rounds.ts:129`); следующий
планируется, только когда весь раунд кончился и записан (`:134-136`). Каждый
нерешённый мутант, не ждущий подтверждения тайм-аута (`:66-72`), берёт
следующие файлы из `mutant.files` — в порядке `rankMutantFiles`, вероятный
убийца первым (`core/run/route-isolated.ts:31-32`). Размер пакета — `let size =
round === 0 ? 1 : 2 ** (round - 1)` (`:73`, `splice` — `:74-76`; на
исследованном коммите — `core/run/run-isolated-rounds.ts:69` (170ec52)), то есть
1, 1, 2, 4, 8, 16… файлов за раунд. Убитый мутант останавливается на пакете
убившего файла, а выживший обязан пройти все покрывающие файлы: с 24 файлами
(утилиты perfectionist тянет каждый тест-файл правила) — 6 раундов (1 + 1 + 2 +
4 + 8 + 8), и каждый ждёт свой самый долгий юнит.

Вердикт от расписания не зависит: `decideEvidence`
(`core/run/decide-evidence.ts:3-35`) берёт kill или timeout первого по рангу
файла (`mutant.ranked`), когда все файлы до него сделаны без улики, а файл не
сделан, пока ждёт запуска, подтверждения или повтора (`:7-10`). Поэтому
размеры пакетов не должны менять ни статус, ни убивший файл.

Что на `main` изменилось с 170ec52. Запрос живёт до шести раундов, а не
четырёх: тайм-аут подтверждается один раз, а если подтверждение таймера
перешло hit limit — дважды (JSDoc `:25-28`, поле `raised` — `:83`; коммит
d3a61a5). Старт раунда считает `confirming`, `retrying` и `survivors` (`:93-125`
→ `core/run/count-run.ts:26-55`), по ним прогресс называет раунды
(`cli/create-run-progress.ts:435-438`); счётчики пришли вместе с адаптером Jest
(коммит bc6adec), и `runIsolated` теперь в
`adapters/{vitest,node-test,jest}/run-isolated.ts`. Размеры пакетов и барьеры
прежние — задача не сделана; P1 (`parallelUnits`, PERF-01) на `main` тоже нет.

Довод за нынешнюю схему — JSDoc `:18-21`: «Idle workers take no extra files: a
unit can wait for another of its test file, and the pool runs units in order, so
extra files may make a round longer, and measurements showed no gain». Он
держится на цепочках: юниты одного тест-файла идут по очереди
(`types/adapter/adapter-session.d.ts:14-20`, у Vitest —
`adapters/vitest/worker/wait-for-turn.ts:32-49`). Без P1 крупный пакет может
удлинить цепочку, с P1 довод отпадает; что тогда мерили, в анализе не записано.

## Доказательства

Условия: эксклюзивное окно 2026-11-04, 4 vCPU Intel Xeon 2.1 GHz, 15 GB RAM,
Node v22.23.4, Vitest 5.0.5, hyperfine 1.18.0; Mootant 170ec52, обычный режим,
холодный кэш, `--concurrency 3`, 3 прогона. Wall — hyperfine, mean ± σ (в
скобках медиана). Раунды — трассы рабочего каталога Vitest (`run-k.units.json`),
диапазон по 3 прогонам: занятость = Σ(done − start) / (3 · wall раундов), хвост
— время раунда после последнего момента, когда работали все 3 слота. Время
юнитов — Σ `mutants[].duration` без старта процессов.

**Измерено, perfectionist без P1** (`rules/sort-switch-case.ts`,
`rules/sort-switch-case/`, `utils/compare/`; 314 мутантов, 87 тест-файлов):
wall 952,5 ± 40,7 (948,8) с; isolated — 6 запусков раннера, 594 юнита. Выживших
47: 1233–1346 с, 26–29 с на выжившего, 71 % времени юнитов (убитых 259, по
1,4–1,5 с). Раунды 2–6 — по 47–171 с, вместе 547–604 с из 913–994 с прогона.
Раунды 5–6 заняты на 95 % (работа), раунды 2–4 — на 58–86 %, с хвостами по
20–72 с (простой у барьера).

**Измерено, perfectionist с P1** (`MOOTANT_PARALLEL_UNITS=1`, 712,8 ± 10,0
(715,9) с; раунды — трасса прогона 1): раунд 1 — 302,9 → 145,6 с, раунды 2–3 —
47 и 92 → 36 и 63 с, раунды 4–6 почти не изменились (112 → 112, 142 → 138,
154 → 155 с) — 405 из 701 с при занятости 96–97 %; хвосты 1–8 с.

**Другие проекты (база):** cheerio — 5 isolated-раундов, выживших 86 (77–79 с,
41 % времени юнитов); fast-json-stringify (node:test) — 7 раундов, выжившие —
65 %, трассы нет; path-to-regexp — 1 раунд (один тест-файл), задача его не
касается.

**Прогноз, не замер** (§4.4, ранг 7, по хвостам раундов 2–4): без P1 −80…−140 с
на perfectionist; после P1 около 5 %, раз раунды 4–6 уже заняты работой.
**В источниках нет:** сколько лишних юнитов даст S, насколько вырастут цепочки
без P1, каков эффект на cheerio и fast-json-stringify; прототипа нет.

## Что сделать

1. Прочитай `core/run/run-isolated-rounds.ts`, `core/run/decide-evidence.ts`,
   `core/run/apply-isolated-result.ts`, `test/core/run/run-isolated-rounds.test.ts`.
   Проверь, есть ли на `main` `run.parallelUnits` (PERF-01): от этого зависят
   точки замера.
2. **Вариант S — сначала только он** (P4.1 анализа): первые два раунда — по
   одному файлу, с третьего — все оставшиеся: в `:73-76` мутант берёт
   `round < 2 ? 1 : mutant.files.length` файлов вместо общего `size`. Выживший
   проходит 3 раунда вместо 6 (плюс раунды подтверждений и повторов). Остальное
   не трогай: фильтр подтверждений (`:71`), перенос повторов и подтверждений,
   счётчики `held` (`:93-112`), порядок `mutant.files`. Обнови JSDoc `:11-34`,
   в том числе довод `:18-21`.
3. Замерь (см. «Как измерить выигрыш») и реши. S быстрее по порогу на
   perfectionist и не медленнее на cheerio — сделать поведением по умолчанию.
   Без P1 медленнее (цепочки), с P1 быстрее — крупные пакеты только при
   параллельных юнитах (PERF-01), иначе прежние 1, 1, 2, 4, 8. Иначе — не
   делать; числа и причину — в описание PR или issue.
4. **Вариант L (поток) — не в этой задаче**, а отдельным решением, если после S
   в трассах остаются хвосты у барьеров (что S не закрыл — опиши в отчёте).
   Идея анализа: `runIsolated` принимает асинхронный поток юнитов (или адаптер
   даёт `submit(unit)`), ядро досылает следующий файл мутанта, как только
   пришли факты предыдущего. Задевает публичный `AdapterSession` (экспорт —
   `core/index.ts:15`; только необязательный метод с откатом на раунды), три
   адаптера, прогресс, `summary.runs.isolated` и счётчики `run-start`.

## Инвариант: вердикты не меняются

По построению вердикт даёт `decideEvidence` (см. «Контекст»). Проверка:

1. **Тесты** `test/core/run/run-isolated-rounds.test.ts`. Меняются ожидаемые
   планы, не вердикты: в `:50-86` — три запуска `[b]`, `[c]`, `[d…h]` у обоих
   мутантов (`killed` по-прежнему убит `e`, но гоняет и `f`–`h` — это цена S;
   у `kept` 7 юнитов); в `:421-470` `together.units` станет
   `[['a'], ['b'], ['c', 'd', 'f'], ['c']]`, вердикт — тот же Timeout `c`.
   Добавь: два убивающих файла в одном большом пакете — убивает первый по
   рангу; тайм-аут в большом пакете держит более поздний kill до подтверждения
   и уступает ему, если не подтвердился (по образцу `:472`); у выжившего с
   N > 2 файлами `state.runs.isolated` = 3. Ожидания `runs` в других тестах
   меняются, только если у мутанта больше двух файлов, — объясни каждую правку.
   Блоки «verdict equivalence» (`test/adapters/vitest/index.equivalence.test.ts`,
   `test/adapters/node-test/index.test.ts:376`,
   `test/adapters/jest/index.equivalence.test.ts`) — без правок вердиктов.
2. **Стенд**: отчёты `mootant run --json --all --verbose` базы и изменения на
   perfectionist и cheerio (точки — в «Как измерить выигрыш»), по id мутанта:

   ```bash
   git fetch origin analysis/2026-11 && git show origin/analysis/2026-11:analysis/tools/compare-verdicts.mjs > /tmp/compare-verdicts.mjs
   R=$HOME/perf07/results/perfectionist   # то же для cheerio
   for k in 2 3; do node /tmp/compare-verdicts.mjs $R/m-cold-base/run-1.json $R/m-cold-base/run-$k.json; done
   for k in 1 2 3; do node /tmp/compare-verdicts.mjs $R/m-cold-base/run-1.json $R/m-cold-s/run-$k.json --strict; done
   ```

   Первый цикл — база против себя (на 170ec52 за 3 прогона ни одной смены
   вердикта), второй — изменение против прогона 1 базы. Без `--strict`
   сравниваются статус и `killedIn`, с ним — ещё убивший тест и причина.
   Ожидание — 0 расхождений (код выхода 0). Timeout не больше, чем в базе: два
   `time-limit`-Timeout perfectionist зависят от нагрузки, а S меняет соседей.

## Как измерить выигрыш

Тихая машина: `uptime` перед точкой ниже ~0,5, ничего тяжёлого параллельно; на
4 vCPU — `--concurrency 3`, как в анализе. Нужны hyperfine, `/usr/bin/time`,
pnpm, доступ к GitHub и npm. База — точка ветвления от `main`, изменение — ваша
ветка (`dist/` не в git, поэтому сначала `pnpm build`). Проекты стенда ставятся
с теми же SHA, патчами и lockfile, что в анализе.

```bash
git fetch origin analysis/2026-11
W=$HOME/perf07; A=$W/analysis; REPO=$(git rev-parse --show-toplevel); mkdir -p "$W"
git archive origin/analysis/2026-11 analysis/bench analysis/tools/perf-proto | tar -x -C "$W"
git -C "$REPO" worktree add "$W/base-src" "$(git -C "$REPO" merge-base HEAD origin/main)"
(cd "$W/base-src" && pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination "$W") \
  && mv "$W"/mootant-*.tgz "$W/base.tgz"
(cd "$REPO" && pnpm build && pnpm pack --pack-destination "$W" && rm -rf dist) \
  && mv "$W"/mootant-*.tgz "$W/change.tgz"
BENCH_PROJECTS=$W/projects BENCH_RESULTS=$W/results MOOTANT_TGZ=$W/base.tgz \
  bash "$A/bench/setup.sh" --no-verify perfectionist cheerio
mutate() { case $1 in
  perfectionist) echo rules/sort-switch-case.ts rules/sort-switch-case utils/compare ;;
  cheerio) echo src/api/attributes.ts src/api/css.ts src/api/forms.ts ;;
esac; }
measure() { # measure <project> <point> <tarball> [флаги mootant]
  local project=$1 point=$2 tgz=$3; shift 3
  local P=$W/projects/$project O=$W/results/$project/$point
  bash "$A/tools/perf-proto/use-mootant.sh" "$P" "$tgz" && mkdir -p "$O" && uptime >>"$O/load.txt"
  (cd "$P" && hyperfine --runs 3 --prepare 'rm -rf node_modules/.cache/mootant' \
    --export-json "$O/hyperfine.json" \
    "bash $A/bench/lib/measure-one.sh $O mootant $P -- node node_modules/mootant/bin/mootant.js run $(mutate "$project") --concurrency 3 --json --all --verbose $*")
}
for p in cheerio perfectionist; do measure "$p" m-cold-base "$W/base.tgz"; measure "$p" m-cold-s "$W/change.tgz"; done
node "$A/bench/summarize.mjs" "$W/results" >"$W/results/summary.md"
# по раундам: wall, занятость, хвост, самая длинная цепочка
for pt in m-cold-base m-cold-s; do node "$A/bench/lib/units-report.mjs" "$W/results/perfectionist/$pt/run-1.units.json" --workers 3; done
```

- `measure-one.sh` пишет на прогон `run-k.json` (отчёт для
  `compare-verdicts.mjs`), `run-k.time` (GNU time) и `run-k.units.json` (трасса
  юнитов Vitest). Записать по точке: wall mean ± σ (медиана) из
  `hyperfine.json`, CPU (user + sys) из `summary.md`, `summary.runs.isolated`,
  число юнитов, таблицу раундов, число Timeout.
- Если на `main` уже есть параллельные юниты (PERF-01), сними ещё пару с их
  флагом. По желанию — fast-json-stringify (`lib/serializer.js lib/validator.js
  lib/standalone.js lib/location.js lib/merge-schemas.js`): трассы там нет,
  только wall и `summary.runs`. Время (оценка по 170ec52): perfectionist около
  16 мин на прогон, 48 мин на точку; cheerio — около 3 и 8 мин.

**Порог «делать»** (предложение этого промпта, в анализе его нет): медиана wall
perfectionist ниже базы не меньше чем на 3 % при непересекающихся диапазонах
трёх прогонов (пересекаются — ещё по 2 прогона); cheerio не медленнее больше
чем на 2 % по медиане; CPU не выше больше чем на 5 %; 0 расхождений вердиктов.
Для сравнения: σ/mean холодных точек на 170ec52 — 4,3 % у perfectionist и
1,1 % у cheerio, у точек P1 — 1,4–3,7 %.

## Риски и границы

- **Цепочки без P1 и лишние юниты.** Мутант, которого убил бы поздний файл, в S
  гоняет все оставшиеся файлы; эта цена из P4.1 не измерена, и где она больше,
  неизвестно. Если раунд 3 варианта S дольше суммы раундов 3–6 базы, разбери,
  что виновато: цепочки (`units-report.mjs`: самая длинная цепочка, ожидание
  очереди файла) или лишние юниты (их число, CPU). Цепочки — повод привязать S
  к P1 (шаг 3).
- **Тайм-ауты.** Когда у мутанта появляется тайм-аут, в работе больше его
  файлов; вердикт тот же (`core/run/decide-evidence.ts:7-10`), но юниты могут
  оказаться лишними.
- **Кэш.** Лишние улики в кэше вердиктов не меняют: правило одно для свежих и
  кэшированных юнитов (`core/run/decide-evidence.ts:4-5`).
- **Прогресс и откат.** Раунд 3 крупнее — оценка «left in round» длиннее,
  подписи по `survivors` верны. Откат — строки `:73-76`; если S только с P1,
  без P1 поведение — как на `main`.

## Связанные промпты

- **PERF-01** (P1) сокращает хвосты с 20–72 до 1–8 с, а прогноз этого промпта —
  с −80…−140 с до около 5 %, и снимает довод `:18-21`. Мерь на общей базе и
  укажи, был ли в ней P1.
- **PERF-04** (префорк): если раунды станут потоком (L), время жизни запаса
  процессов придётся привязать не к запуску раннера.
- **PERF-08** (тайм-ауты, BUG-752): подтверждения добавляют раунды; два
  `time-limit`-Timeout perfectionist — 8–9 % времени юнитов. Мерь раздельно.
- **PERF-09** (порядок тест-файлов) меняет ранг и может сменить `killedBy`;
  PERF-07 порядок не меняет — не смешивай их в одном изменении.

## Критерий готовности

- Тесты: обновлены `:50-86` и `:421-470`, добавлены три случая из «Инварианта»;
  покрытие 100 %.
- Эквивалентность: 0 расхождений (статус и `killedIn`; `--strict` — 0 или каждое
  объяснено) на perfectionist и cheerio, каждый из 3 прогонов изменения против
  прогона 1 базы; база детерминирована; Timeout не больше.
- Выигрыш: порог из «Как измерить выигрыш», не меньше 3 прогонов, mean ± σ
  (медиана), с таблицей раундов, `summary.runs.isolated`, числом юнитов и CPU —
  либо решение «не делать» с теми же числами.
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
