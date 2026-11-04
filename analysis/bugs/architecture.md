# Баги, найденные при архитектурном разборе

Источник: `analysis/01-architecture.md` (§8.3, ARCH-4). Воспроизведение
независимо повторено координатором на чистой установке tarball 170ec52
(`/home/user/scratch/verify/skiprule/proj`): `list` — exit 0, `list --skipped` —
`Error: Cannot read properties of undefined (reading 'heuristic')`, exit 1.

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-800 | Плагинный мутатор с собственным `skip.rule` (вне встроенного реестра `skipRules`) роняет `mootant list --skipped` и `run --html` с `TypeError: Cannot read properties of undefined (reading 'heuristic')`; без `--skipped` замена молча исчезает. Публичный тип `SkipRuleId` закрыт, `validateReplacement` правило не проверяет | medium | подтверждён | `core/generate/generate-file-mutants.ts:376-377`, `types/mutant/skip-rule-id.d.ts:7`, `core/run-mutants.ts:198` | `analysis/architecture/repro-plugin-skip-rule/`; промпт `bug-prompts/BUG-800.md` |
