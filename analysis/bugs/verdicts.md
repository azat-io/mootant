# Вердикты Mootant против независимого эталона (раздел 2 + «Изоляция»)

> Коммит 170ec52 (`main`), пакет `mootant-0.1.0-170ec52.tgz`, Node 22.23.4,
> Vitest 5.0.5 + Vite 8.3.5. Машина 4 vCPU / 15 GB, общая: во время прогонов
> load average был 4–32 (параллельно работали другие агенты), поэтому каждое
> расхождение по времени перепроверено повтором. ID багов: BUG-200…BUG-205.

## Коротко

(заполняется в конце)

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
| BUG-204 | Временной бюджет `3 × длительность + 250 мс` (у юнита — сумма по тестам файла плюс загрузка) много меньше собственного таймаута раннера: мутант, замедляющий тест до ~2 с, — `Timeout` в Vitest, хотя тест проходит; тот же мутант на эквивалентной фикстуре node:test — `Survived` (больший запас за счёт времени загрузки процесса). Вердикт по времени зависит от адаптера и нагрузки | low | подтверждён | `core/run/get-try-limits.ts:16-28`, `core/config/resolve-run-settings.ts:29-32`, `adapters/vitest/runner.ts:552`, `:853` | `vt/slow` vs `nt/slow`, мутант `9trb33kh` (`Math.min` → `Math.max`) |
| BUG-205 | Vitest: CJS-файл, который тест грузит через `createRequire`, исполняется без переключения, все его мутанты `NoCoverage` (эталон: убиты); диагностика `never-served` называет неверные причины («no test imports it, or tests import a built copy, an external or a pre-bundled dependency»), в `compatibility.mdx` случай не описан (описаны только вычисляемый `import()`, дочерние процессы и воркеры) | low | подтверждён | `core/run/run-dry-phase.ts:360-367`, `docs/content/guide/compatibility.mdx` (раздел Vitest) | `vt/dynamic`, `src/legacy.cjs` (4 мутанта) |

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
