# Статическое ревью критического пути вердикта (BUG-900…BUG-949)

> Коммит 170ec52. Метод: чтение кода и рассуждение, точечные проверки гипотез.
> Черновик, заполняется по ходу работы.

## Рабочие заметки (черновик)

- Прочитано: core/run-mutants.ts, core/run/{run-dry-phase,read-dry-run,create-run-state,
  classify-mutants,route-isolated,rank-mutant-files,index-module-tests,plan-isolated,
  run-isolated-rounds,apply-isolated-result,read-isolated-unit,get-unit-evidence,
  decide-evidence,classify-try,run-batch-phases,plan-batch,apply-batch-result,
  mark-outside-mutants,count-verdicts,get-final-status,compute-score,decide-results}.ts,
  core/runtime/*, core/cache/{apply-cached-units,apply-cached-batch,create-run-cache,
  prepare-run-cache,get-environment-key,get-test-file-keys}.ts,
  core/instrument/{create-switched-files,instrument-file,group-mutant-ranges,
  render-mutant-range,find-statement-starts,resolve-switched-text}.ts,
  core/generate/{get-replacement-kind,validate-replacement,group-replacement}.ts,
  core/syntax/is-value-position.ts, adapters/vitest/runner.ts (частично).
- Гипотеза: выбор тест-файлов dry run делегирован `vitest related`
  (adapters/vitest/run-dry.ts:231-233) — статический граф импортов; тест,
  загружающий модуль вычисляемым `import(path)`, не попадёт в dry run →
  возможен ложный Survived. Проверить фикстурой.
