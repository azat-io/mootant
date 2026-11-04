# Баги и проблемы, найденные при подготовке бенчмарка (BUG-700…BUG-749)

Коммит `170ec52`. Серьёзность: critical / high / medium / low. Статус:
**подтверждён** (есть воспроизведение) или **гипотеза** (почему так думаем и как
проверить).

| ID | описание | серьёзность | статус | где | как воспроизвести |
|---|---|---|---|---|---|
| BUG-700 | Фазы в `summary.duration` не совпадают с документированными: `dryRun` включает подготовку кэша (`prepareRunCache` — хэширование входов), `createRunState` с `readTestImports` и применение кэша, а `isolated` — сохранение кэша (`saveRunCache`). В документации типа: `dryRun` — «Dry runs, the uninstrumented check of failing tests included», `isolated` — «Isolated runs, retries and confirmations included». На тёплом кэше без единого юнита `isolated` ≠ 0, а цена хэширования входов приписывается dry run; пользователь (и агент) делает неверный вывод о том, куда уходит время | low | гипотеза (по коду; проверка — точка `m-warm`: `runs.isolated` отсутствует, а `duration.isolated` > 0) | `core/run-mutants.ts:410-491` (интервал dryRun), `:496-531` (isolated, `saveRunCache` на `:516`), `types/run/run-durations.d.ts` | `analysis/bench/run.sh <project>:m-warm`, затем сравнить `summary.duration.isolated` и `summary.runs` в `run-1.json` |
