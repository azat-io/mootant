# Вердикты Mootant против независимого эталона (раздел 2 + «Изоляция»)

> Черновик, заполняется по ходу работы. Коммит исследования: 170ec52.

## Методика

- Эталон (оракул): `analysis/tools/oracle/oracle.mjs`. Для каждого мутанта из
  JSON Mootant (`run --json --all --verbose` или `list --json --verbose`)
  replacement физически подставляется в копию проекта (копия — git-репозиторий
  без `node_modules`, `node_modules` — симлинк), запускается обычная команда
  тестов проекта целиком (`vitest run` / `node --test`), без инструментирования.
  После каждого мутанта копия сбрасывается `git checkout` + `git clean`, так что
  снапшоты, кэши и временные файлы прогона не переходят в следующий.
- Классы исхода эталона: `killed` (код ≠ 0), `killed-timeout` (упал тест по
  собственному таймауту раннера), `timeout` (сработал внешний таймаут
  оракула), `survived` (код 0), `invalid` (текст не совпал со смещениями).
- Сравнение: `analysis/tools/oracle/compare.mjs`; Killed/Timeout = «обнаружен»,
  Survived/NoCoverage = «не обнаружен»; Error/Ignored не входят в счёт.

(разделы ниже заполняются)

## Гипотезы до экспериментов (по чтению кода)

| # | Гипотеза | Почему (код) | Чем проверить |
|---|---|---|---|
| H1 | Выбор тест-файлов для dry run в Vitest — статический анализ графа импортов Vitest (`related`), поэтому тест, достающий модуль вычисляемым `import()` или через хелпер `vi.importActual` внутри фабрики `vi.mock`, не попадёт в dry run → ложный Survived/NoCoverage | `adapters/vitest/run-dry.ts:225-244` (`vitest.config.related = request.related; getRelevantTestSpecifications()`), Vitest `AffectedModulesResolver` (`node_modules/vitest/dist/chunks/cli-api.De07GUeT.js:9930-10073`) | `vt/dynamic`, `vt/mocks` |
| H2 | Множество `related` = только файлы с выбранными мутантами, поэтому вердикт мутанта зависит от того, какие *другие* файлы в прогоне (`run src` vs `run src/a.js` vs `--mutant`/`--since`) | `core/run-mutants.ts:202-210`, `:379-395` (switched = файлы выбранных мутантов), `run-dry-phase.ts:156` | `vt/mocks`: `--mutant A` vs `--mutant A --mutant B` |
| H3 | Лимит срабатываний сайтов (`hitLimit`) превращает в `Timeout` мутанта, который лишь делает код в 100+ раз «горячее» (отключение мемоизации), хотя тесты проходят за миллисекунды | `core/run/read-isolated-unit.ts:31-38`, `classify-try.ts:26-28`, `core/config/resolve-run-settings.ts:25-28` (factor 100, floor 100000) | `vt/state` `memo.js`, `nt/state` |
| H4 | `--fast`: ложный Killed, когда мутант перестаёт сбрасывать состояние, оставленное контрольной попыткой | `core/run/apply-batch-result.ts:46-52`, `:305-320` (документировано) | `vt/state` `counter.js`, `seen.js` |
| H5 | Stray-ошибки убивают мутанта даже при `dangerouslyIgnoreUnhandledErrors: true`/`onUnhandledError`, при которых обычный `vitest run` проходит | `adapters/vitest/runner.ts:1249-1266` (свои слушатели `unhandledRejection`/`uncaughtException`), `read-isolated-unit.ts:46-63`, `:93-105`; поиск опций по `adapters/` пуст | `vt/unhandled` |
| H6 | `crash` и `load-error` дают Killed без проверки, достигнут ли мутант | `read-isolated-unit.ts:42-44`, `:75-83` | анализ кода, `vt/crash` |
| H7 | node:test: `process.exit(0)` посреди теста — и Mootant, и обычный `node --test` считают файл прошедшим | `adapters/node-test/preload/create-try-tracker.ts:173-180` (unfinished → не failed), проверено вручную: `node --test` даёт exit 0 | `nt/crash` |
