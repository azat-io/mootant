# Баги и риски из раздела 7 (совместимость, надёжность, релиз)

Источник: реестр рисков `analysis/07-compat-and-release.md` §7.2.2 и журналы
экспериментов `analysis/data/compat-experiments.md` (M1–M15). Здесь только те
пункты, которых нет в таблицах других агентов. Риски R1, R2 и R5 совпадают с
BUG-502, BUG-511 и BUG-505/BUG-600/BUG-418, R11 — с BUG-515. Риски R15 (права
релизного workflow) и R16 (версия глобального рантайма) остаются в разделе 7
как риски процесса и дизайна.

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-820 | yarn PnP + `node:test`: устаревший `--experimental-loader .pnp.loader.mjs` срабатывает раньше хуков Mootant, переключения нет, все мутанты `NoCoverage`, score 0%, exit 0; есть только предупреждение `config-overridden` | medium | подтверждён | `adapters/node-test/start-node-test-session.ts:123-132` | M10 в `data/compat-experiments.md`; промпт `bug-prompts/BUG-820.md` |
| BUG-821 | Рантайм Bun (`bunx --bun mootant`): exit 1 при `summary.passed: true` (с кэшем — exit 0) | low | подтверждён, причина не выяснена | — | M10 |
| BUG-822 | `npx`/`dlx`/глобальная установка не работают с Vitest: «mootant and the project load different copies of Vitest (none, …)». Сообщение верное, но документация не предупреждает | low | подтверждён | `adapters/vitest/check-vitest-copy.ts:16-26` | M10 |
| BUG-823 | BOM в любом `package.json` от cwd вверх ломает загрузку конфига (lilconfig BOM срезает, собственный загрузчик — нет) | low | подтверждён | `core/config/load-config.ts:145-147` | M5 |
| BUG-824 | Кэш jiti в общем `/tmp/jiti`: на многопользовательской машине можно подложить исполняемый код | low | подтверждён в песочнице | `core/config/load-typescript-config.ts:27-29` | M3 |
| BUG-825 | Сообщения об убийстве (первая строка ошибки теста, могут содержать значения секретов) хранятся открытым текстом в кэше и HTML-отчёте; переменные — несолёным SHA-256 | low | подтверждён | `types/cache/cache-entry.d.ts`; `cli/html/build-html-report.ts:142`; `adapters/node-test/hash-environment.ts:20` | M7 |
| BUG-826 | Конфиг ищется вверх до `$HOME` (вне домашнего каталога — до `/`), корень проекта переносится в каталог найденного конфига; поиск документирован (`docs/content/guide/configuration.mdx:95`), но шапка отчёта не показывает, какой файл загружен | low | подтверждён | `core/config/load-config.ts:86-108,133` | M4 |
| BUG-827 | HTML-отчёт пишется неатомарно и по symlink: прерывание даёт обрезанный файл | low | гипотеза | `cli/html/write-html-report.ts:10-16` | — |
