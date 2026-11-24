# PERF-08: калибровка и кэш тайм-аутов (BUG-752)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории azat-io/mootant.
> Ранг 8 из 12 в `analysis/04-performance.md` §4.4 (ветка `analysis/2026-11`). Выигрыш:
> кэш `hit-limit` измерен только в составе P3 вместе со снимком dry run (тёплый прогон
> cheerio 5,40 → 0,54 с, GNU elapsed, 3 прогона), отдельно — прогноз; более жёсткий
> `time-limit` — прогноз до −8 % на perfectionist, не измерено. Риск для вердиктов: кэш
> подтверждённых `hit-limit` — низкий; более жёсткий `time-limit` — высокий (ложные
> Timeout на шумной машине, BUG-204). Трудоёмкость: S–M. Прототип: для кэша — часть diff
> `analysis/experiments/perf-dry-snapshot.diff` (P3, п. 3, до подтверждения `hit-limit`),
> для калибровки — нет. Тип: исследование с критерием «делать / не делать» (калибровка) и
> реализация (кэш, если его не сделал PERF-02).
> Замерено на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

Ранг 8 — тайм-ауты, которые повторяются в каждом тёплом прогоне. Кэш хранит только
`Survived` и `Killed` без `crash` (`core/cache/create-run-cache.ts:313-319`). Чтение отдаёт
`Killed` (`:287-296`), статусы файла — `core/cache/read-run-cache.ts:13`; с 170ec52 эти
файлы не менялись. Часть **А** — калибровка бюджета `time-limit`, исследование (M):
такой тайм-аут кэшировать нельзя (BUG-204), его можно только удешевить. Часть **Б** — кэш
подтверждённых `hit-limit`, реализация (S).

**Граница с PERF-02** (ранг 2). Кэш подтверждённых `hit-limit` — его шаг 2. Б делается,
только если PERF-02 не делается или откладывается, отдельным малым PR, который PERF-02
потом переиспользует. Снимок dry run — только там, калибровка — только здесь.
`time-limit`, `hang`, `crash`, `Error` и неподтверждённые тайм-ауты не кэшируются нигде.

**Бюджет.** Лимит попытки — `scale × (ceil(factor × длительность dry run) + constant)` мс,
лимит срабатываний — `max(floor, factor × hits)` (`core/run/get-try-limits.ts:16-28`), по
умолчанию 3 и 250, 100 и 100 000 (`core/config/resolve-run-settings.ts:24-33`). Бюджет
isolated-юнита — сумма по загрузке и всем тестам файла (`core/run/get-test-file-limits.ts:16-40`),
так что каждый тест добавляет не меньше `constant`. В Vitest попытки юнита делят один дедлайн
от его начала (`adapters/vitest/runner.ts:555`, `:867`): зависание первого теста ждёт бюджет
всего файла. В node:test юнит останавливает сторож процесса (`hang`,
`adapters/node-test/get-unit-deadline.ts:20-25`). Лимиты входят в ключ кэша
(`core/cache/get-environment-key.ts:63`, `:82`).

**Что изменил main.** d3a61a5 подтверждает и `hit-limit`: удвоенное время и ещё
`factor × floor` срабатываний (`core/run/plan-isolated.ts:25-32`). Окончательный
`Timeout(hit-limit)` даёт только юнит с `raised` (`core/run/get-unit-evidence.ts:25-29`), а на
170ec52 вердикт был окончательным сразу (`:22-28` (170ec52)). Но `recordUnit` получает сырой
вердикт каждого юнита до `getUnitEvidence` (`core/run/apply-isolated-result.ts:78-84`) и о
`raised` не знает (`core/cache/create-run-cache.ts:393-399`). Правило прототипа «isolated +
`Timeout` + `hit-limit`» запишет и неподтверждённый тайм-аут. Он останется в кэше, если
подтверждение даст `crash` или `time-limit`, ничего не решит или потеряется: проход или kill
перезаписывают слот. 26656f8 в `--fast` подтверждает тест удвоенным лимитом файла
(`core/run/plan-batch.ts:97-101`). 98406ee документирует замедляющего мутанта: хватает удвоенного
лимита — решают тесты, иначе `Timeout`; у границы вердикт зависит от нагрузки; совет — поднять
`constant` (`docs/content/guide/configuration.mdx:472-484`, `types/config/run-config.d.ts:8-15`).
Это минимум BUG-204. Тест `test/adapters/vitest/index.equivalence.test.ts:339-360` закрепляет,
что тест, замедленный сверх своего лимита, но в пределах лимита файла, решает сам. Main идёт к
более мягкому бюджету, а часть А проверяет более жёсткий.

## Доказательства

Стенд анализа, 170ec52: 4 vCPU Xeon 2,1 GHz, 15 GB, Node v22.23.4, Vitest 5.0.5 (cheerio —
Vitest 5), `--concurrency 3`, 3 прогона, тихая машина. `m-warm` — тёплый прогон без
изменений: elapsed GNU time, mean ± σ; фазы — медианы `summary.duration`.

| проект | wall, с | dryRun / isolated, с | из кэша | прогнано заново |
|---|---|---|---|---|
| perfectionist | 80,4 ± 1,2 | 46,4 / 32,2 | 306 из 314 | 2 Timeout `time-limit` (юниты 31–33 и 16–17 с) |
| path-to-regexp | 10,3 ± 0,5 | 0,8 / 8,8 | 336 из 342 | 3 Timeout `hit-limit` |
| cheerio | 5,40 ± 0,56 | 2,3 / 2,1 | 490 из 496 | 4 Timeout `hit-limit` |
| fast-json-stringify | 6,83 ± 0,31 | 6,2 / 0,0 | 308 из 308 | — |

- **Повтор тайм-аутов.** На path-to-regexp — 86 % wall тёплого прогона. Два `time-limit`
  на perfectionist — 41 % (32 с из 80), а в холодном прогоне (952,5 ± 40,7 с, hyperfine,
  σ/mean 4,3 %) — 151–163 с времени юнитов, 8–9 %.
- **P3** (снимок dry run и кэш `hit-limit` вместе): cheerio `m-warm` 5,40 ± 0,56 →
  0,54 ± 0,05 с. Из кэша 494 из 496, в том числе четыре `hit-limit`; вердикты 496 из
  496 × 3. Кэш `hit-limit` без снимка не мерили.
- **BUG-752**, фикстура `vitest-units`: мутант `67sz` (`src/text.js:16`, `' ' → ''` в `pad`,
  бесконечный цикл). Тёплый прогон базы — `summary.runs = {"dry":1,"isolated":1}`, P3 — `{}`.
- **BUG-204**, мутант `9trb33kh` (`Math.min` → `Math.max`, тест ~2 с): `Timeout(time-limit)`
  в 4 из 5 прогонов Vitest и `Timeout(hang)` в 4 из 5 у node:test, в остальных —
  `Survived`, как у эталона. С `run.timeout.constant: 8000` — `Survived`.

**Прогнозы (не замер).** Б: уходит повтор `hit-limit`, по фазам 170ec52 — 8,8 из 10,3 с на
path-to-regexp и 2,1 из 5,40 с на cheerio; старт и dry run остаются. На main такой тайм-аут
стоит не меньше двух юнитов (d3a61a5): база, вероятно, медленнее, выигрыш больше, а часть
тайм-аутов могла стать `Killed` или `Survived`. А: до −8 % холодного прогона perfectionist,
в тёплом — не больше 41 %. **Нет в источниках:** замеров на main, списка мутантов и файлов
perfectionist с `time-limit`, бюджетов их юнитов, других значений `timeout`.

## Что сделать

**0. Проверка.** Если в `core/cache/read-run-cache.ts:13` уже есть `'Timeout'` (влит
PERF-02), часть Б не делай. Проверь только, что пишется лишь подтверждённый тайм-аут.

**А. Калибровка (исследование, код продукта не меняется).** Бюджет задаётся конфигом
(`run.timeout`, `docs/content/guide/configuration.mdx:316-327`), например `.mootantrc.json`
в корне проекта. Ключа `mootant` в его `package.json` быть не должно: он важнее.

1. Сними базу main на perfectionist: `m-warm` и `m-cold` × 3. Для `Timeout` с `cause`
   `time-limit` или `hang` запиши id, `killedIn`, `duration`, `summary.runs`, число тестов
   файла и бюджет юнита по `getTestFileLimits` (временный вывод в `planIsolated` локальной
   сборки, не в коммит) с долями `constant` и `factor × duration`.
2. Варианты ниже значений по умолчанию: например, `{"run":{"timeout":{"constant":100}}}` и
   `{"run":{"timeout":{"factor":2}}}`. Сначала `m-warm`, где идут только тайм-ауты
   (прогрев — тем же вариантом), потом `m-cold` лучшего варианта на четырёх проектах.
3. Шум: базу и лучший вариант гоняй под одинаковой фоновой нагрузкой (например, `nproc`
   процессов `node -e 'for(;;);'`, load average запиши). Посчитай смены вердиктов.
4. **Делать**, только если разом: вариант быстрее базы на perfectionist (диапазоны трёх
   прогонов не пересекаются); 0 расхождений `--strict` на четырёх проектах × 3, а под
   нагрузкой смен не больше, чем у базы; `test/adapters/vitest/index.equivalence.test.ts:302-360`
   и `test/adapters/vitest/index.test.ts:144-179` проходят с новым значением по умолчанию без
   правки ожиданий. Тогда — отдельный PR: объясни, почему это не противоречит 98406ee и
   BUG-204, и смени значение в `core/config/resolve-run-settings.ts:29-32` (JSDoc `:4-10`) и
   везде, где `git grep -nE 'constant[": ]+250'` находит его в типах, документации и
   тестах. Иначе — **не делать**: итог — числа и причина.

**Б. Кэш подтверждённых `hit-limit`.** Без переключателя: в прототипе запись шла только с
`MOOTANT_REUSE_DRY_RUN`. Заготовка — hunks прототипа для файлов шагов 2–3, флаг
`hitLimits` убери. С 170ec52 файлы не менялись, но чисто ли лягут hunks, не проверено:
`git show origin/analysis/2026-11:analysis/experiments/perf-dry-snapshot.diff | git apply --include=core/cache/create-run-cache.ts --include=core/cache/read-run-cache.ts --include=types/cache/cache-entry.d.ts`.

1. `core/run/apply-isolated-result.ts:78-94`: вызывай `recordUnit` после
   `getUnitEvidence` и не записывай `'confirming'`.
2. `core/cache/create-run-cache.ts`: `write` (`:313-319`) пропускает ещё `Timeout` с
   `cause: 'hit-limit'` при `origin.path === 'isolated'`. Запись хранит статус
   (`:353-364`, сейчас всегда `'Killed'`), `read` (`:287-296`) его отдаёт.
3. `types/cache/cache-entry.d.ts:8-13` и `core/cache/read-run-cache.ts:13`. Формат файла
   меняется: подними `CACHE_VERSION` (`core/cache/cache-version.ts:1-6`,
   `test/core/cache/cache-version.test.ts:8-9`) или обоснуй совместимость.
4. Обнови JSDoc: `core/cache/create-run-cache.ts:129-145`, `types/cache/run-cache.d.ts:43-49`
   и `:110-113`, `core/cache/apply-cached-units.ts:5-15`, `core/run/apply-isolated-result.ts:19-37`.
   В раздел `cache` документации (`docs/content/guide/configuration.mdx:353-376`) добавь
   фразу: тайм-аут по лимиту срабатываний переиспользуется, по времени — нет.
5. `--fast` применяет кэш isolated-улик ещё раз после batch-фаз (`core/run-mutants.ts:520-523`):
   записи `Timeout` там не читай, пока не докажешь эквивалентность.

## Инвариант: вердикты не меняются

Скрипт сравнивает по id статус и убивающий файл, с `--strict` — ещё тест и причину (в клоне
с одной веткой нужен refspec `'+refs/heads/analysis/2026-11:refs/remotes/origin/analysis/2026-11'`):

```bash
git fetch origin analysis/2026-11 && git show origin/analysis/2026-11:analysis/tools/compare-verdicts.mjs > /tmp/compare-verdicts.mjs
node /tmp/compare-verdicts.mjs base.json change.json --strict   # код 0 — совпали
```

- **Б.** Холодный и тёплый прогоны изменения против холодного прогона базы main: 0
  расхождений на четырёх проектах × 3, у бывших тайм-аутов `cached: true`. На фикстуре
  (id на main может отличаться — мутант в `pad`) прогноз: в тёплом прогоне изменения он
  `Timeout`, `hit-limit`, `cached: true`, в `summary.runs` нет `isolated` (`$W` — ниже):

  ```bash
  for s in base change; do d=$W/fx-$s; rm -rf "$d"; mkdir -p "$d"
    git archive origin/analysis/2026-11 analysis/experiments/perf-fixtures/vitest-units | tar -x -C "$d" --strip-components=4
    (cd "$d" && npm install -D --ignore-scripts --no-audit --no-fund --save-exact vitest@5.1.0 "$W/$s.tgz" >/dev/null \
      && printf 'node_modules\n' >.gitignore && git init -q && git add -A && git -c user.name=f -c user.email=f@localhost commit -qm fixture \
      && for k in cold warm; do node node_modules/mootant/bin/mootant.js run src --concurrency 3 --json --all --verbose >$k.json; done)
  done   # Vitest 5.1.0: установка 5.0.5 в npm 10.9.9 падает в arborist (edgesOut)
  ```
- **А.** Варианты меняют вердикты по определению: эквивалентность — условие решения (А.4).

## Как измерить выигрыш

Нужна тихая машина: перед точкой `uptime` меньше ~0,5, на 4 vCPU — `--concurrency 3`.
Нужны hyperfine, `/usr/bin/time`, pnpm 12, сеть. Обвязка стенда держит одно окружение и
один `TMPDIR` на проект, иначе тёплый perfectionist ничего не берёт из кэша (BUG-701).

```bash
W=$HOME/perf08; REPO=$(git rev-parse --show-toplevel); mkdir -p "$W"; git fetch origin main analysis/2026-11
git archive origin/analysis/2026-11 analysis/bench analysis/tools/perf-proto | tar -x -C "$W"; A=$W/analysis
git -C "$REPO" worktree add --detach "$W/base-src" origin/main   # база — main без изменения
(cd "$W/base-src" && pnpm install --frozen-lockfile && pnpm build && pnpm pack --pack-destination "$W") && mv "$W"/mootant-*.tgz "$W/base.tgz"
(cd "$REPO" && pnpm build && pnpm pack --pack-destination "$W" && rm -rf dist) && mv "$W"/mootant-*.tgz "$W/change.tgz"
BENCH_PROJECTS=$W/projects BENCH_RESULTS=$W/results MOOTANT_TGZ=$W/base.tgz \
  bash "$A/bench/setup.sh" --no-verify perfectionist path-to-regexp cheerio fast-json-stringify   # SHA и патчи анализа
mutate() { case $1 in perfectionist) echo rules/sort-switch-case.ts rules/sort-switch-case utils/compare ;; path-to-regexp) echo src/index.ts ;;
  cheerio) echo src/api/attributes.ts src/api/css.ts src/api/forms.ts ;; fast-json-stringify) echo lib/serializer.js lib/validator.js lib/standalone.js lib/location.js lib/merge-schemas.js ;; esac; }
measure() { # measure <project> <point> <tgz> cold|warm; warm прогревается той же сборкой и конфигом
  local P=$W/projects/$1 O=$W/results/$1/$2 prep='rm -rf node_modules/.cache/mootant' one="bash $A/bench/lib/measure-one.sh"
  local cmd="node node_modules/mootant/bin/mootant.js run $(mutate "$1") --concurrency 3 --json --all --verbose"
  bash "$A/tools/perf-proto/use-mootant.sh" "$P" "$3" && mkdir -p "$O" && uptime >>"$O/load.txt"
  if [ "$4" = warm ]; then (cd "$P" && $one "$O-prime" mootant "$P" -- $cmd); prep=true; fi
  (cd "$P" && hyperfine --runs 3 --prepare "$prep" --export-json "$O/hyperfine.json" "$one $O mootant $P -- $cmd")
}
for p in path-to-regexp cheerio perfectionist fast-json-stringify; do for b in base change; do measure "$p" m-warm-$b "$W/$b.tgz" warm; measure "$p" m-cold-$b "$W/$b.tgz" cold; done; done   # Б
C=$W/projects/perfectionist/.mootantrc.json; echo '{"run":{"timeout":{"constant":100}}}' >"$C"; measure perfectionist m-warm-c100 "$W/base.tgz" warm; rm "$C"   # А
```

- **Что записать:** wall mean ± σ (медиана) из `hyperfine.json`, GNU elapsed из
  `run-k.time`, `summary.duration`, `summary.runs`, Timeout по причинам, `cached`, load
  average. Время по 170ec52 (оценка): perfectionist — около 16 мин холодный и 80 с
  тёплый; холодные path-to-regexp — 1,5 мин, cheerio — 2,7, fast-json-stringify — 6,7.
- **Успех Б.** У `m-warm` path-to-regexp и cheerio медиана ниже базы main, диапазоны
  трёх прогонов не пересекаются. Если все их Timeout — `hit-limit`, в `summary.runs` нет
  `isolated`. Остальные точки — в пределах 3 % от базы. **Успех А** — условия шага А.4.

## Риски и границы

- **Не кэшировать** `time-limit`, `hang`, `crash`, `Error` и `'confirming'`: у границы бюджета
  `time-limit` недетерминирован (`docs/content/guide/configuration.mdx:481-482`, BUG-204), а
  неподтверждённый `hit-limit` бывает у «горячего» мутанта (BUG-200, фикстура `hot`). Если
  подтверждение кончилось `crash` или `time-limit`, ничего не решило или потерялось, слот пуст.
- **Цепочка** `time-limit` → `hit-limit` → `hit-limit` с `raised` (`core/run/run-isolated-rounds.ts:25-27`):
  статус тот же, но причина зависит от скорости машины, и `--strict` может разойтись. Реши,
  кэшировать ли такой случай (вывод из чтения кода, не проверено).
- **А.** Не возвращай бюджет «на тест» и не урезай подтверждение: это закреплено
  (26656f8). Более жёсткий бюджет раньше обрывает зависания, но даёт `Timeout`
  замедляющим мутантам и завышает score (`docs/content/guide/cli.mdx:60-63`). Значения по
  умолчанию действуют и в `--fast`: если решение — «делать», сравни и его.
- **Откат:** `--no-cache` или удаление `node_modules/.cache/mootant`. После подъёма
  `CACHE_VERSION` или смены значений по умолчанию первый прогон у пользователей холодный.

## Связанные промпты

- **PERF-02.** Кэш `hit-limit` — его шаг 2. Влит PERF-02 — Б не нужна; влита Б — PERF-02
  переиспользует её запись.
- **PERF-01** (`run.parallelUnits`): юниты одного файла делят CPU (с P1 на 170ec52
  тайм-аут-юниты path-to-regexp шли 5,3–6,0 с вместо 3,5–4,4 с). Если P1 влит, меряй А и с ним.
- **BUG-204.** Минимум на main сделан (26656f8, 98406ee); его направление — поднять
  `constant`, обратное части А. **BUG-752** закрывается частью Б или PERF-02. **BUG-200,
  BUG-202** («горячий» код → `hit-limit`) по коду закрыты d3a61a5, поэтому
  кэшируется только подтверждённый тайм-аут. **BUG-701** — окружение в ключе кэша.

## Критерий готовности

- **А.** Отчёт по базе main и вариантам: mean ± σ, медиана, счётчик, 3 прогона, load
  average; бюджеты `time-limit`-юнитов и доля `constant`; расхождения `--strict` на
  четырёх проектах; смены под нагрузкой; решение с причиной; при «делать» — PR (А.4).
- **Б, тесты.** `test/core/cache/create-run-cache.test.ts:250-272` обновлён осознанно: isolated
  `hit-limit` хранится и читается как `Timeout`, а batch `Timeout`, `time-limit`, `hang`,
  `crash` и `Error` — нет. В `test/core/cache/read-run-cache.test.ts:77` пример недопустимого
  статуса — не `Timeout`, а другой (например, `Error`). `test/core/run/apply-isolated-result.test.ts`:
  `'confirming'` не пишется, итог подтверждения пишется, при `crash`, `time-limit` или пропаже
  юнита слот пуст. `test/core/cache/apply-cached-units.test.ts`: кэшированный `Timeout` решает, как
  свежий. Сквозной тест в `test/adapters/vitest/index.cache.test.ts`: повтор без изменений
  берёт `hit-limit` из кэша, в `runs` нет `isolated`, вердикты как без кэша.
- **Эквивалентность Б:** 0 расхождений `--strict` на четырёх проектах и `vitest-units`,
  в холодном и тёплом прогонах. **Выигрыш Б** — «Успех Б»: ≥ 3 прогонов, с разбросом.
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`).

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс. Тайм-ауты по времени не кэшируй ни в каком виде.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
  Документация (`docs/content/**`) — на английском.
- Сообщения коммитов — Conventional Commits (commitlint).
