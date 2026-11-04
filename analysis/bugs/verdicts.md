# Вердикты Mootant против независимого эталона (раздел 2 + «Изоляция»)

> Коммит 170ec52 (`main`), пакет `mootant-0.1.0-170ec52.tgz`, Node 22.23.4,
> Vitest 5.0.5 + Vite 8.3.5. Машина 4 vCPU / 15 GB, общая: во время прогонов
> load average был 4–32 (параллельно работали другие агенты), поэтому каждое
> расхождение по времени перепроверено повтором. ID багов: BUG-200…BUG-205.

## Коротко

- Эталон (физическая мутация + обычный `vitest run` / `node --test` всего
  набора) прогнан на 18 стресс-фикстурах (Vitest и эквивалентные node:test) и на
  реальном коде самого Mootant (`core/text`, 127 мутантов, 528 тестов): 531
  физических прогонов, плюс 9 режимов на 7 пар мутантов (изоляция) и
  3–5 повторов на 7 конфигураций (детерминизм).
- **Режиму по умолчанию в целом можно доверять**: реальный код — 127 из 127
  совпадений (и в `--fast`); изоляция isolated-единиц настоящая (свежий процесс
  на единицу в обоих адаптерах), вердикт не зависит от соседних мутантов, их
  порядка и `--concurrency`; вердикты детерминированы, кроме временных.
- Найдено 7 проблем (BUG-200…206, все подтверждены, 5 medium, 2 low), каждая —
  детерминированный механизм, а не шум:
  - ложный `Timeout` вместо `Survived`: лимит срабатываний сайтов ловит
    «горячий», но конечный код (BUG-200, оба адаптера), в `--fast` — ещё и по
    лимиту одной попытки без перепроверки (BUG-202); бюджет `3× + 250 мс`
    превращает замедленный, но проходящий тест в `Timeout`, к тому же
    недетерминированно (BUG-204, оба адаптера);
  - ложный `Killed`: необработанная ошибка, которую конфигурация Vitest
    велит игнорировать (BUG-203);
  - ложный `NoCoverage`/`Survived`: в Vitest набор тест-файлов зависит от
    *других* файлов прогона — полный прогон `Killed`, а `--mutant <id>`,
    узкий путь и `--since` — `NoCoverage` (BUG-201, нарушен инвариант из
    `core/run-mutants.ts:340-342`); `createRequire` без точной диагностики
    (BUG-205); «покрыт в dry run, но не достигнут» молча становится
    `NoCoverage` (BUG-206).
- `--fast` даёт документированные ложные `Killed` (мутант не сбрасывает
  состояние, оставленное контрольной попыткой): на фикстурах 2 из 40 в
  `vt/state`; на реальном коде — 0.
- Документированные ограничения подтверждены эталоном: дочерние процессы и
  worker_threads (`NoCoverage`), `globalSetup` (`Error`), вычисляемый `import()`
  в Vitest (`Survived`/`NoCoverage`), снапшоты не пишутся (семантика CI).
- Внешние реальные проекты запустить не удалось: исполнение кода из
  склонированных репозиториев запрещено системой разрешений; использован код
  Mootant.

## Методика

- Эталон (оракул): `analysis/tools/oracle/oracle.mjs`. Для каждого мутанта из
  JSON Mootant (`run --json --all --verbose` или `list --json --verbose`)
  replacement физически подставляется в копию проекта, запускается обычная
  команда тестов проекта **целиком** (`vitest run` / `node --test`), без
  инструментирования. Копия — git-репозиторий без `node_modules` (симлинк);
  после каждого мутанта `git checkout` + `git clean`, так что снапшоты, кэши и
  временные файлы прогона не переходят в следующий. Для expression-мутантов
  сырой текст сравнивается с вариантом `(replacement)` через AST oxc-parser;
  если разбор отличается (приоритет операторов), применяется вариант со
  скобками — как его исполняет инструментирование
  (`core/instrument/render-mutant-range.ts:91-95`). На всех фикстурах таких
  случаев не встретилось: мутаторы сами ставят скобки там, где нужно
  (`2 ** attempt` → `(2 * attempt)`).
- Классы исхода эталона: `killed` (код ≠ 0), `killed-timeout` (упал тест по
  собственному таймауту раннера), `timeout` (внешний таймаут оракула:
  max(20 с, 4 × базовый прогон)), `survived` (код 0).
- Сравнение — `analysis/tools/oracle/compare.mjs`: Killed/Timeout =
  «обнаружен», Survived/NoCoverage = «не обнаружен»; Error/Ignored в счёт не
  входят. Классы расхождений: false-killed, false-timeout, false-survived,
  false-nocoverage.
- Прогоны Mootant — `run-mootant.sh` (`--json --all --verbose --no-cache`),
  пакеты — `run-suite.sh`, изоляция — `isolation.sh`, детерминизм —
  `determinism.sh`, сводка вердиктов — `verdicts.mjs`; установка —
  `setup-fixtures.sh` (npm 10.9.9 падает на peer-зависимостях Vitest 5.0.5
  с `Cannot read properties of null (reading 'edgesOut')` — помогает
  `--legacy-peer-deps` плюс явный `vite@8.3.5`).
- Фикстуры: копия в `analysis/tools/oracle/fixtures/{vt,nt}/*`, рабочие — в
  `/home/user/projects/oracle/{vt,nt}` (общий `node_modules` на семейство:
  mootant и Vitest резолвятся из одного каталога, проверка
  `adapters/vitest/check-vitest-copy.ts` проходит). Сырые отчёты Mootant —
  `/home/user/projects/oracle/results/` (Vitest) и `results-nt/` (node:test);
  ответы эталона и матрицы — `analysis/data/oracle/`.

## Найденные проблемы

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
|---|---|---|---|---|---|
| BUG-200 | Мутант, который лишь делает код «горячее» в 100+ раз (отключённая мемоизация, кэш), получает окончательный `Timeout(hit-limit)`, хотя обычный прогон тестов проходит за миллисекунды; оба адаптера | medium | подтверждён | `core/run/read-isolated-unit.ts:31-38`, `core/run/classify-try.ts:26-28`, `core/config/resolve-run-settings.ts:25-28`, `core/runtime/install-mutant-runtime.ts:42-43` | `test/repros/BUG-200.test.ts`; фикстуры `vt/state`, `nt/state` (мутанты `prd6tx8n`, `jngxgvvz`) |
| BUG-201 | Vitest: вердикт мутанта зависит от остальных файлов прогона: полный прогон `Killed`, `--mutant <id>` / узкие пути (и по той же причине `--since`) — `NoCoverage`. `related` dry run = только файлы выбранных мутантов, а статический анализ Vitest пропускает тест, который грузит оригинал модуля через хелпер в фабрике `vi.mock` (или вычисляемым `import()`). Нарушен инвариант из `core/run-mutants.ts:340-342` | medium | подтверждён | `core/run-mutants.ts:379-395`, `core/run/run-dry-phase.ts:156`, `adapters/vitest/run-dry.ts:225-244` | `test/repros/BUG-201.test.ts`; `isolation.sh vt/mocks mocks jnhjhh9w 2hmxc740` |
| BUG-202 | `--fast`: `hit-limit` в batch окончателен и считается по лимиту одной попытки, в N раз меньшему лимита isolated-юнита: конечный «горячий» цикл даёт `Timeout`, режим по умолчанию и эталон — `Survived` | medium | подтверждён | `core/run/apply-batch-result.ts:163-171`, `core/run/plan-batch.ts:92-96` | `test/repros/BUG-202.test.ts`; `vt/crash`, мутант `eb0ye9vm` |
| BUG-203 | Vitest: необработанная ошибка, которую проект игнорирует (`dangerouslyIgnoreUnhandledErrors`, `onUnhandledError`), убивает мутанта (`stray-error`), хотя `vitest run` с мутацией завершается с кодом 0 | medium | подтверждён | `adapters/vitest/runner.ts:665-686`, `:1249-1266`, `core/run/read-isolated-unit.ts:46-63`, `:93-105` | `test/repros/BUG-203.test.ts`; `vt/unhandled` (`knkyemhs`, `7mkvyn7b`) |
| BUG-204 | Временной бюджет `3 × длительность dry run + 250 мс` (у юнита — сумма по тестам файла плюс загрузка; при подтверждении ×2) много меньше собственного таймаута раннера, а результат зависит от шума замеров dry run: мутант, лишь замедляющий проходящий тест, получает `Timeout`. `9trb33kh` (`Math.min` → `Math.max`, тест идёт ~2 с): Vitest — `Timeout(time-limit)` в 4 из 5 прогонов, node:test — `Timeout(hang)` в 4 из 5, в оставшихся — `Survived`; эталон — survived. То есть вердикт ещё и недетерминирован | medium | подтверждён | `core/run/get-try-limits.ts:16-28`, `core/config/resolve-run-settings.ts:29-32`, `core/run/get-unit-evidence.ts:15-30`, `adapters/vitest/runner.ts:552`, `:853`, `adapters/node-test/get-unit-deadline.ts` | `test/repros/BUG-204.test.ts` (замедление до 4 с — детерминированно); `vt/slow`, `nt/slow` + `determinism.sh` |
| BUG-205 | Vitest: CJS-файл, который тест грузит через `createRequire`, исполняется без переключения, все его мутанты `NoCoverage` (эталон: убиты); диагностика `never-served` называет неверные причины («no test imports it, or tests import a built copy, an external or a pre-bundled dependency»), в `compatibility.mdx` случай не описан (описаны только вычисляемый `import()`, дочерние процессы и воркеры) | low | подтверждён | `core/run/run-dry-phase.ts:360-367`, `docs/content/guide/compatibility.mdx` (раздел Vitest) | `vt/dynamic`, `src/legacy.cjs` (4 мутанта) |
| BUG-206 | Мутант, который dry run покрыл, но ни одна isolated-единица не достигла, получает `NoCoverage` без диагностики, а отчёт при этом перечисляет покрывающий тест (`tests: 1`, `coveredBy: [...]`). Пример — тест, кэширующий результат на диске между запусками: dry run пишет кэш, единицы его читают и до мутанта не доходят; эталон на свежей копии мутанта убивает. Родственно BUG-900 (другой триггер, тот же сток) | low | подтверждён | `core/run/decide-results.ts:50`, `core/run/get-final-status.ts:36` | `vt/fscache` (`43bfzptb`, `ch4kze59`, `3hbdt5q6` — NoCoverage, `7dtdwjsz` — Survived; эталон — killed) |

Пересечение с другими агентами: падение воркера в isolated-юните без
достижения мутанта (`crash` → `Killed`) — BUG-901 в
`analysis/bugs/static-review.md`. Моя фикстура `vt/crash` подтверждает только
«правильную» сторону той же ветки кода: OOM от мутанта (`gt34y7x6`, бесконечное
выделение по 32 МБ при `--max-old-space-size=512`) → `Killed(crash)`, эталон
тоже `killed`. Ложный `Killed` от посторонней ошибки загрузки (`load-error` без
проверки reached, `core/run/read-isolated-unit.ts:75-83`) — та же природа, что
BUG-901; отдельно не воспроизводил (**гипотеза**: тест-файл, загрузка которого
нестабильно падает, даёт `Killed` всем своим мутантам; проверить фикстурой,
где загрузка падает только во втором и последующих процессах).

## Гипотезы до экспериментов и что из них вышло

| # | Гипотеза | Почему (код) | Итог |
|---|---|---|---|
| H1 | Выбор тест-файлов для dry run в Vitest — статический анализ Vitest (`related`): тест, достающий модуль вычисляемым `import()` или через хелпер `vi.importActual` в фабрике `vi.mock`, в dry run не попадёт → ложный Survived/NoCoverage | `adapters/vitest/run-dry.ts:225-244`, Vitest `AffectedModulesResolver` (`node_modules/vitest/dist/chunks/cli-api.De07GUeT.js:9930-10073`) | подтверждено: `vt/dynamic` `y1rmnxcp` (`a + b` → `a`) — `Survived`, эталон `killed` (документированное ограничение «may not be selected», без диагностики). Шаблонный `import(\`../src/${name}.js\`)` Vite превращает в glob и такой тест выбирается. В node:test ограничения нет (`nt/dynamic`: `Killed`) |
| H2 | `related` = только файлы выбранных мутантов → вердикт зависит от остальных файлов прогона | `core/run-mutants.ts:202-210`, `:379-395`, `run-dry-phase.ts:156` | подтверждено → BUG-201 |
| H3 | `hitLimit` превращает «горячего» мутанта в `Timeout` | `core/run/read-isolated-unit.ts:31-38`, `classify-try.ts:26-28`, `resolve-run-settings.ts:25-28` | подтверждено → BUG-200 (оба адаптера), в `--fast` ещё и BUG-202 |
| H4 | `--fast`: ложный Killed, когда мутант перестаёт сбрасывать состояние после контрольной попытки | `core/run/apply-batch-result.ts:46-52`, `:305-320` (документировано) | подтверждено: `09w15scc` (`count = 0` → `;`), `7kq6qzrd` (`seen.clear()` → `;`) — `Killed [batch]`, эталон и режим по умолчанию — `Survived` |
| H5 | Stray-ошибки убивают мутанта и при `dangerouslyIgnoreUnhandledErrors`/`onUnhandledError` | `adapters/vitest/runner.ts:1249-1266`, `read-isolated-unit.ts:46-63`, `:93-105` | подтверждено → BUG-203 |
| H6 | `crash` и `load-error` дают Killed без проверки reached | `read-isolated-unit.ts:42-44`, `:75-83` | по коду да; `crash` — BUG-901 другого агента; ложный случай сам не воспроизводил |
| H7 | node:test: `process.exit(0)` посреди теста — файл «прошёл» и у Mootant, и у `node --test` | `adapters/node-test/preload/create-try-tracker.ts:173-180` | подтверждено, это согласие, не баг: `nt/crash` `5nbbr7jm` — `Survived`, эталон `survived` (`node --test` сам даёт exit 0). В Vitest тот же мутант `Killed` у обоих: Vitest бросает «process.exit unexpectedly called» |

(разделы с матрицами — ниже)

## Стресс-фикстуры: что говорит Mootant и что эталон

Фикстуры для Vitest (`vt/*`) и эквивалентные для node:test (`nt/*`), исходники
и тесты одинаковые, кроме API раннера. «Mootant» — режим по умолчанию;
отличия `--fast` указаны отдельно. Мутант — короткий id из отчёта.

| Класс | Фикстура, мутант | Vitest: Mootant / эталон | node:test: Mootant / эталон |
|---|---|---|---|
| общее модульное состояние, мутант не сбрасывает его | `state`, `09w15scc` `count = 0` → `;` | Survived / survived; **`--fast`: Killed [batch]** | Survived / survived |
| модульный кэш, мемоизация отключена | `state`, `prd6tx8n`, `jngxgvvz` | **Timeout (hit-limit)** / survived (BUG-200) | **Timeout (hit-limit)** / survived |
| кэш прячет мутанта в batch | `state`, `twzenj03` `n < 2` → `n <= 2` | Killed / killed; `--fast`: survived в batch → isolated → Killed | Killed / killed |
| `globalThis`, `process.env`, прототипы (top-level, static) | `state/src/registry.js`, 12 мутантов | совпадают все | совпадают все |
| `vi.mock` с фабрикой, `{ spy: true }`, `vi.doMock`, `vi.spyOn` | `mocks`, 10 мутантов | совпадают все в полном прогоне; **`--mutant`/узкий путь — NoCoverage** (BUG-201) | — (node:test без моков модулей) |
| вычисляемый `import()` через переменную | `dynamic`, `y1rmnxcp` `a + b` → `a` | **Survived** / killed (тест не выбран, документировано как «may not be selected») | Killed / killed |
| шаблонный `import(\`../src/${name}.js\`)` | `dynamic`, `tzcw9x1g`, `tw7j08nf` | Killed / killed (Vite делает из него glob) | Killed / killed |
| `createRequire` CJS-файла | `dynamic`, `src/legacy.cjs`, 4 мутанта | **NoCoverage** / killed + неточный `never-served` (BUG-205) | Killed / killed |
| дочерний процесс, worker_threads | `dynamic`, `cli.js`, `worker.js`, `scale` | **NoCoverage** / killed (документировано) | **NoCoverage** / killed (документировано) |
| код при загрузке модуля (static) | `load/src/constants.js`, 11 мутантов | совпадают все | совпадают все |
| `setupFiles` / `--import` setup импортирует мутируемый модуль | `load/src/greeting.js` | Killed [static] / killed | Killed [static] / killed |
| `globalSetup` импортирует мутируемый модуль | `load/src/seed.js`, 2 мутанта | Error (`outside-workers`) / killed — документировано, в score не идёт, но exit 1 | — |
| `import()` внутри теста, `vi.resetModules()` | `load/src/lazy.js`, 5 мутантов | совпадают все (не static, достигаются в тесте) | совпадают все |
| `test.concurrent`, fake timers, `retry`, `repeats`, `skip`/`todo`/`only`, `test.fails` | `modes`, 21 мутант | совпадают все, кроме снапшота ниже; `--fast` то же | совпадают все (`only` без `--test-only` в Node 22 игнорируется и в эталоне, и в Mootant) |
| новый ключ снапшота (`toMatchSnapshot` в цикле, мутант добавил итерацию) | `modes`, `x90jyavh` `index < count` → `index <= count` | Killed («Snapshot … 3 mismatched») / **survived без CI** (Vitest дописал снапшот), **killed с `CI=1`** — Mootant ведёт себя как CI, это задокументировано («Snapshots are never written»), не баг | — |
| `process.exit(0)` в тесте | `crash`, `5nbbr7jm` | Killed / killed (Vitest бросает «process.exit unexpectedly called») | Survived / survived (`node --test` сам считает файл прошедшим) |
| `process.exitCode = 1` | `crash`, `t8tvwwbe` | Survived / survived (Vitest код воркера не смотрит) | Killed (hook-error) / killed |
| бросок при загрузке модуля | `crash`, `1q7p1tzs` `JSON.parse('')` | Killed (load-error) [static] / killed | Killed (load-error) [static] / killed |
| unhandled rejection, uncaught exception в микрозадаче | `crash`, `d2dn1btq`, `6cm2bm5g` | Killed (stray-error) / killed | Killed (stray-error) / killed |
| то же при `dangerouslyIgnoreUnhandledErrors: true` | `unhandled`, `knkyemhs`, `7mkvyn7b` | **Killed (stray-error)** / survived (BUG-203) | — |
| бесконечный синхронный цикл (strict) | `crash`, `mqzeg79s` `index++` → `index--`, `s4b8m9bv` | Timeout (hit-limit) / timeout | Timeout (hit-limit) / timeout |
| бесконечная рекурсия | `crash`, `vge39vdq` `count - 1` → `count + 1` | Killed (RangeError) / killed | Killed / killed |
| бесконечный асинхронный цикл на таймерах (strict) | `slow`, `6nb7t7bq`, `05ztzkkx` | Timeout (time-limit) / killed-timeout | Timeout (hang) / timeout (у node:test нет таймаута теста по умолчанию) |
| неразрешающийся промис | `slow`, `c54q4t9c`, `ytg8ja3g` | Timeout (time-limit) / killed-timeout | Killed (assertion) / killed (node:test: «Promise resolution is still pending…») |
| конечное замедление теста до ~2 с | `slow`, `9trb33kh` `Math.min` → `Math.max` | **Timeout (time-limit)** / survived (BUG-204; 4 из 5 повторов) | Survived в первом прогоне, **Timeout (hang)** в 4 следующих / survived |
| огромное выделение памяти (OOM при `--max-old-space-size=512`, strict) | `crash`, `gt34y7x6` `block++` → `block--` | Killed (crash) / killed | Killed (crash) / killed |
| массовый вывод (20 000 строк по 210 символов) | `crash`, `eb0ye9vm` `verbose` → `true` | Survived / survived; **`--fast`: Timeout (hit-limit)** (BUG-202) | Survived / survived |
| исключение в `beforeAll`/`before` и `afterAll`/`after` из-за мутанта | `hooks`, `86e7wwdj`, `0ap8zdz3`, `g733625x`, `z8vzgrgv` | Killed (hook-error) [static] / killed | Killed (hook-error) [static] / killed |
| мутант убивает собственный процесс (`process.kill(process.pid, 'SIGKILL')`) | `hooks`, `bw6hqbwf` | Killed (crash) / killed; `--fast`: batch-юнит потерян → recovery → isolated → Killed | Killed (crash) / killed |
| тест кэширует результат на диске между запусками | `fscache`, 4 мутанта | **NoCoverage** ×3 и **Survived** ×1 / killed (BUG-206) | — |

## Матрицы согласия

Полностью — `analysis/data/oracle/matrices.md` (по фикстурам и суммы),
по-мутантно — `analysis/data/oracle/{vitest,node-test,real}/*.verdicts.md`.
Строки — вердикт Mootant, столбцы — исход эталона; «согласие» — совпадение
«обнаружен / не обнаружен». Фикстуры нарочно собраны из трудных случаев,
поэтому их проценты — не оценка для обычных проектов, а счётчик механизмов.

**Стресс-фикстуры Vitest, режим по умолчанию** (10 фикстур, 236 мутантов, из
них 2 `Error`):

| Mootant \ эталон | killed | killed-timeout | timeout | survived |
|---|---:|---:|---:|---:|
| Killed | 119 | 0 | 0 | 3 |
| Timeout | 0 | 5 | 2 | 3 |
| Survived | 2 | 0 | 0 | 67 |
| NoCoverage | 11 | 1 | 0 | 21 |
| Error | 2 | 0 | 0 | 0 |

Согласие 214 из 234 (91,5 %), 20 расхождений.

**Те же фикстуры, `--fast`** (без `fscache`): согласие 206 из 225 (91,6 %),
19 расхождений — те же, что в режиме по умолчанию для этих 9 фикстур (16), плюс
2 ложных Killed (H4) и 1 ложный Timeout (BUG-202).

**Стресс-фикстуры node:test** (7 фикстур, 209 мутантов): согласие 202 из 209
(96,7 %), 7 расхождений.

| Mootant \ эталон | killed | killed-timeout | timeout | survived |
|---|---:|---:|---:|---:|
| Killed | 119 | 0 | 0 | 0 |
| Timeout | 0 | 0 | 4 | 2 |
| Survived | 0 | 0 | 0 | 61 |
| NoCoverage | 5 | 0 | 0 | 18 |

(`nt/slow` в матрице — первый прогон, где `9trb33kh` `Survived`; в 4 повторах
из 5 он `Timeout(hang)`, то есть расхождений по node:test обычно 8.)

**Реальный код** (см. ниже), Vitest, 127 мутантов: согласие 127 из 127
(100 %) и в режиме по умолчанию, и в `--fast`.

| Mootant \ эталон | killed | killed-timeout | timeout | survived |
|---|---:|---:|---:|---:|
| Killed | 120 | 0 | 1 | 0 |
| Timeout | 0 | 0 | 3 | 0 |
| Survived | 0 | 0 | 0 | 3 |

## Реальный код

Внешние проекты (склонированные `unjs/defu`, `unjs/scule`, `ai/nanoid`,
`fastify/fastify-error`) запускать было нельзя: система разрешений сессии
запретила исполнять код из внешних репозиториев («Code from External»), и
обходить запрет я не стал. Вместо них — настоящий код и настоящие тесты самого
Mootant: `core/` и `types/` коммита 170ec52 плюс тесты `test/core/text` и
`test/core/tree` с хелперами (26 файлов, 528 тестов) как отдельный
Vitest-проект (`analysis/tools/oracle/make-mootant-text.sh`). Мутировались 9
файлов `core/text` (127 мутантов: `blank-outside`, `create-source-code`,
`edit-text`, `find-last-start`, `find-token-start`, `get-line-starts`,
`get-source-position`, `pluralize`, `get-operator-range`); эталон каждый раз
гонял все 26 файлов. Mootant: 121 Killed, 3 Timeout, 3 Survived, score 97,64;
dry run отобрал 463 теста из 528, ни одного ложного `NoCoverage`/`Survived` из-за
отбора. Время: по умолчанию 92 с, `--fast` 35 с (под нагрузкой load ≈ 30).

Единственное различие статусов внутри класса «обнаружен»: `9ztm553t`
(`low + high` → `low - high` в `find-last-start.ts:19`) — у Mootant `Killed`
(первый тест файла упал, единица остановилась), у эталона `timeout` (обычный
Vitest не останавливается после падения, и следующий тест зацикливается).
Три `Timeout(hit-limit)` (`q17b4x3v`, `c80xm7m2`, `nfjnnqws` — бесконечный
двоичный поиск) подтверждены: эталон висит до внешнего таймаута 120 с.

Для node:test реального проекта нет (те же ограничения на внешний код; в
репозитории Mootant кода на node:test нет) — его заменяют шесть фикстур `nt/*`.

## Разбор расхождений (Vitest 20 + 3 в `--fast`, node:test 7–8, реальный код 0)

| Класс | Сколько | Мутанты | Корневая причина | Статус |
|---|---:|---|---|---|
| ложный Timeout по `hit-limit` | Vitest 2, node:test 2 | `prd6tx8n`, `jngxgvvz` | лимит сайтов ловит «горячий», но конечный код | BUG-200 |
| ложный Timeout по `hit-limit`, только `--fast` | 1 | `eb0ye9vm` | лимит одной batch-попытки и окончательность batch-Timeout | BUG-202 |
| ложный Timeout по времени | Vitest 1 (и node:test в 4 из 5 повторов) | `9trb33kh` | бюджет 3× + 250 мс против замедления до ~2 с, зависит от шума dry run | BUG-204 |
| ложный Killed (stray) | 2 | `knkyemhs`, `7mkvyn7b` | игнорируется `dangerouslyIgnoreUnhandledErrors` | BUG-203 |
| ложный Killed, только `--fast` | 2 | `09w15scc`, `7kq6qzrd` | общий модульный граф batch, мутант не сбрасывает состояние контрольной попытки | документировано |
| Killed vs survived (снапшот) | 1 | `x90jyavh` | Mootant не пишет снапшоты (как CI); эталон без `CI` дописывает новый ключ. С `CI=1` эталон — killed | не баг, семантика CI |
| ложный Survived | 1 | `y1rmnxcp` | тест с `import(переменная)` не выбран статическим анализом Vitest | документировано («may not be selected»), без диагностики |
| ложный NoCoverage | Vitest 9, node:test 5 | `cli.js` ×3, `scale`, `worker.js`; `legacy.cjs` ×4 | дочерний процесс / worker_threads исполняют исходник; `createRequire` в Vitest обходит Vite | документировано; `createRequire` — BUG-205 |
| `Error` вместо killed | 2 | `vjx704xe`, `b8yr2n0p` | `globalSetup` в главном процессе, переключить нельзя | документировано |
| NoCoverage/Survived вместо killed | 4 | `43bfzptb`, `ch4kze59`, `3hbdt5q6`, `7dtdwjsz` | dry run пишет кэш на диск, единицы читают его и до мутанта не доходят; эталон на чистой копии | BUG-206 |

Вне матриц (другие режимы запуска): `vt/mocks` при `--mutant`/узком пути/
`--since` — 2 мутанта `NoCoverage` против killed (BUG-201).

Каждое расхождение перепроверено: детерминированные (hit-limit, stray,
выбор файлов, fs-кэш) — повторами в «Детерминизме» и в `test/repros`;
временное (`9trb33kh`) — тремя повторами и `--concurrency 1`.

## Изоляция (кратко; подробно — `analysis/data/isolation.md`)

- Пары мутантов, делящие тест-файл и модульное состояние (`counter`, `memo`,
  `seen`, static-пара `load`, пара из двух файлов `mocks`, `nt/state`):
  вердикт каждого мутанта одинаков при `--mutant A`, `--mutant B`,
  `--mutant A --mutant B`, `--mutant B --mutant A` и при `--concurrency 1`
  против 3, — в isolated-пути у каждой единицы свой процесс
  (`adapters/vitest/configure-project.ts:46-49` + новый `PoolRunner` Vitest на
  каждую isolated-задачу; `adapters/node-test/run-isolated.ts:57-68`).
- Исключения: (1) множество тест-файлов зависит от выбранных *файлов*
  (BUG-201, в том числе `--since`); (2) диск общий для dry run и единиц
  (BUG-206); (3) в `--fast` общий модульный граф даёт документированные
  ложные Killed и ложный Timeout (BUG-202). Влияния одного batch-мутанта на
  другой при здоровых контрольных попытках не нашёл (гипотеза о такой
  возможности описана в `isolation.md`).

## Как адаптер отличает падение теста от сбоя раннера

Таблица по коду — `analysis/data/isolation.md`. Экспериментально (фикстуры
`crash`, `slow`, `hooks`; эталон совпал во всех случаях, кроме отмеченных):

| Что случилось | Vitest | node:test |
|---|---|---|
| процесс умер (OOM от мутанта, `SIGKILL` из кода) | `Killed(crash)` | `Killed(crash)` |
| ошибка при загрузке модуля | `Killed(load-error)` [static] | `Killed(load-error)` [static] |
| исключение в `beforeAll`/`before` или `afterAll`/`after` | `Killed(hook-error)` [static: сайты в suite-хуках считаются вне попыток] | `Killed(hook-error)` [static] |
| бесконечный синхронный цикл | `Timeout(hit-limit)` | `Timeout(hit-limit)` |
| бесконечный асинхронный цикл / зависший промис | `Timeout(time-limit)` (свой таймер, подтверждение ×2) | `Timeout(hang)` (сторож процесса) или `Killed` (node:test сам роняет тест с «Promise resolution is still pending») |
| `process.exit(0)` | `Killed` (Vitest бросает) | `Survived` (как `node --test`) |

Различие «тест упал» / «раннер сломался» ядро делает только по наличию
end-записи и по `reached`; сбой раннера после того, как единица взята
(`claim`), неотличим от краха из-за мутанта и даёт `Killed` (BUG-901).
Единица, которую не взял ни один воркер, повторяется и затем даёт `Error`
(`core/run/apply-isolated-result.ts:93-112`) — это правильная сторона.

## Детерминизм

Один и тот же прогон 3 раза с `--no-cache` плюс один с `--concurrency 1`
(`analysis/tools/oracle/determinism.sh`, сравнение —
`determinism-compare.mjs`, по статусу и причине), под нагрузкой load average
25–32:

| Фикстура | Режим | Прогонов | Мутантов | Разошлись |
|---|---|---:|---:|---|
| `vt/modes` (concurrent, таймеры, retry, снапшоты) | по умолчанию | 5 | 21 | 0 |
| `vt/state` | `--fast` | 5 | 40 | 0 (ложные Killed batch воспроизводятся каждый раз) |
| `vt/crash` (stray, OOM, циклы, вывод 4 МБ) | `strict` | 5 | 81 | 0 |
| `nt/crash` | `strict` | 4 | 81 | 0 |
| `vt/slow` (таймеры, бэкофф) | `strict` | 5 | 27 | 1: `9trb33kh` — Timeout ×4, Survived ×1 |
| `nt/slow` | `strict` | 5 | 27 | 1: `9trb33kh` — Survived ×1, Timeout(hang) ×4 |
| реальный код `core/text` | по умолчанию | 3 (в т. ч. `--concurrency 1`) | 127 | 0 |

Вывод: вердикты детерминированы везде, кроме мутантов, чей исход зависит от
времени около границы бюджета (BUG-204). `--concurrency 1` против
`maxWorkers`/«ядра − 1» ни на одной фикстуре вердикт не изменил (кроме того же
временного мутанта). Hit-limit, stray-ошибки, отбор тест-файлов и ложные
batch-убийства воспроизводятся стабильно — это детерминированные дефекты, а не
шум.

## Проверено без находок

- Изоляция isolated-единиц: свежий процесс на единицу в обоих адаптерах;
  ни порядок `--mutant`, ни совместный запуск, ни `--concurrency` не меняют
  вердикт (7 пар, 9 режимов на пару).
- `vi.mock` с фабрикой, `vi.mock(…, { spy: true })`, `vi.doMock` +
  `import()`, `vi.importActual` — в полном прогоне все 10 мутантов `mocks`
  совпали с эталоном.
- Код при загрузке модуля (static): 11 мутантов `constants.js`, 3 мутанта
  `registry.js` (`globalThis`, `Array.prototype`) — совпадают; static-мутанты
  в `--fast` всегда isolated.
- `setupFiles` (Vitest) и `--import`-setup (node:test), импортирующие
  мутируемый модуль, — мутанты переключаются (`Killed [static]`).
- `import()` внутри теста и `vi.resetModules()` — совпадают.
- `test.concurrent`/`describe.concurrent`, fake timers Vitest и
  `t.mock.timers` node:test, `retry`, `repeats`, `skip`, `todo`, `only`
  (Node 22 игнорирует `only` без `--test-only` одинаково у Mootant и у
  `node --test`), `test.fails` — совпадают.
- Unhandled rejection / uncaught exception (без опций игнорирования),
  `process.exit`, `process.exitCode`, бесконечная рекурсия, бесконечные
  циклы, OOM, 4 МБ вывода в stdout — совпадают (кроме BUG-202 в `--fast`).
- Применение replacement: на 531 прогоне эталона текст мутанта ни разу не
  разобрался иначе, чем `(replacement)` инструментирования (0 случаев
  приоритета), смещения всегда указывали на `original` (0 `invalid`).
- Реальный код (`core/text` Mootant, 127 мутантов): 100 % согласия в обоих
  режимах, статический отбор тестов ничего не потерял.

## Отсутствующие гарантии (неявные предположения)

Каждое предположение ниже — условие, при нарушении которого вердикт Mootant
перестаёт совпадать с обычным прогоном тестов с физически применённой
мутацией. Для каждого — чем подтверждено и что можно сделать.

1. **«Статический анализ Vitest находит все тест-файлы, которые могут
   достать мутанта»** (`adapters/vitest/run-dry.ts:225-244`). Нарушается
   вычисляемым `import()` (документировано), фабрикой `vi.mock`, грузящей
   оригинал не напрямую (BUG-201), `createRequire` (BUG-205), чтением
   исходника через `fs` и запуском копии (пример из жизни —
   `fastify/fastify-error`, `test/instanceof.test.js` копирует `index.js` с
   диска во временный проект и запускает его через `fork`), `vm` /
   `new Function` над текстом файла. Последствие — тихий `Survived` /
   `NoCoverage`. Сверки «по факту загрузки», как в адаптере node:test
   (`adapters/node-test/run-dry.ts:75-80`, `:127-129`), в Vitest нет; нет и
   диагностики «тест-файл не выбран, но мог бы».
2. **«План мутанта не зависит от выбора»** (`core/run-mutants.ts:340-342`) —
   верно для мутантов внутри файла, но не для множества тест-файлов: оно
   строится из файлов выбранных мутантов (BUG-201). `--mutant`, `--since` и
   узкие пути могут дать другой вердикт, чем полный прогон.
3. **«Срабатывания сайтов растут без предела только в бесконечном цикле»**
   (`core/run/classify-try.ts:6-8`). Отключённый кэш/мемо, удалённый ранний
   выход, «горячий» конечный цикл — `Timeout` без подтверждения (BUG-200), в
   `--fast` ещё и по лимиту одной попытки (BUG-202).
4. **«Тест, превысивший `3 × dry run + 250 мс`, завис»**. Бюджет относителен
   к времени dry run на той же машине и намного меньше таймаута раннера
   (Vitest 5 с, node:test — без таймаута); подтверждение с удвоенными
   границами отсекает шум, но не реальное конечное замедление (BUG-204).
   На общей машине под нагрузкой (load average до 32) ложных Timeout в
   повторах не было — см. «Детерминизм».
5. **«Падение процесса или ошибка загрузки вызваны мутантом»**
   (`core/run/read-isolated-unit.ts:42-44`, `:75-83`) — без проверки reached
   (BUG-901 у другого агента). Посторонний OOM, нестабильная загрузка, сбой
   RPC Vitest под нагрузкой дают `Killed`.
6. **«Необработанная ошибка — провал»** независимо от конфигурации проекта
   (BUG-203). Обычный `vitest run` при `dangerouslyIgnoreUnhandledErrors` /
   `onUnhandledError` считает иначе. Эталон самого проекта
   (`test/helpers/run-reference-mutants.ts`) делает то же допущение, поэтому
   его не замечает.
7. **«Снапшоты не пишутся»** — семантика CI. Мутант, который лишь добавляет
   новый ключ снапшота, — `Killed`, хотя локальный `vitest run` без `CI`
   допишет снапшот и пройдёт (`vt/modes`, `x90jyavh`). Задокументировано;
   стоит явно упомянуть в FAQ.
8. **«Файловая система между единицами чиста»**. Процессы единиц свежие, но
   диск общий: dry run и единицы одного сеанса видят файлы, которые писали
   предыдущие запуски тестов (кэши, записи HTTP, выходные файлы). Эталон с
   чистой копией на каждого мутанта видит другое (`vt/fscache`, BUG-206).
   Обычный `vitest run` с тем же кэшем вёл бы себя как Mootant, поэтому это
   не баг, а условие корректности: тесты не должны зависеть от следов
   предыдущих запусков.
9. **«Мутант в главном процессе Vitest проверить нельзя — значит `Error`»**
   (`core/run/mark-outside-mutants.ts:17-52`): корректно, но `Error`
   выключает мутанта из score и делает exit 1 у всего прогона
   (`cli/report/build-run-report.ts:151-156`), так что проект с
   `globalSetup`, импортирующим мутируемый код, никогда не проходит CI без
   `mootant-ignore`.
10. **«Дочерние процессы и worker_threads исполняют исходный код»** —
    документировано; эталон показывает, что их мутанты получают
    `NoCoverage`, а не «не проверено», и тянут score вниз.

## Что не удалось проверить

- **Внешние реальные проекты.** Склонированные `unjs/defu`, `unjs/scule`
  (Vitest), `ai/nanoid`, `fastify/fastify-error` (node:test) лежат в
  `/home/user/projects/oracle/real/`, зависимости поставлены, но запуск их
  тестов заблокировала система разрешений («Code from External»). Чтобы
  выполнить пункт, нужно разрешить исполнение кода из этих клонов; команды
  готовы: `MOOTANT_PATHS=src run-mootant.sh <проект> default` и
  `oracle.mjs --project <проект> --report …` (для nanoid —
  `--cmd "node --test --test-reporter=tap test/*.test.js"`). Ожидаемые
  расхождения по чтению кода: `nanoid/test/bin.test.js` запускает CLI в
  дочернем процессе (мутанты `bin/nanoid.js` — `NoCoverage` против killed),
  `fastify-error/test/instanceof.test.js` копирует `index.js` с диска во
  временный проект и запускает его через `fork` (мутанты, которые ловит
  только этот тест, — `Survived`/`NoCoverage` против killed).
- **Реальный проект на node:test** — по той же причине; в самом Mootant кода на
  node:test нет.
- Windows, Node 20/24, Vitest `threads`/`isolate: false` в эталоне (Mootant
  их принудительно меняет на forks + isolate с предупреждением, эталон
  гонялся только с настройками по умолчанию), монорепозитории и `projects`
  Vitest, браузерный режим — не проверялись.
- Влияние одного batch-мутанта на другой при здоровых контрольных попытках —
  не воспроизведено (см. «Изоляция»).
- Ложный `Killed` от посторонней ошибки загрузки (H6) — только по коду.
