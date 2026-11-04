# Сырые результаты бенчмарка (эксклюзивное окно 2026-11-04)

- `results__<проект>__<точка>__hyperfine.json` — вывод hyperfine для точек
  стенда (ярусы 1–3: `test`, `m-cold`, `s-cold`, `m-warm`, `m-one`, `m-fast`,
  `m-edit-inc`, `m-since`).
- `results-proto__<прототип>__<on|off>__<проект>__<точка>__hyperfine.json` —
  замеры прототипов P1 (`parallel-units`) и P3 (`dry-snapshot`).
- `run-1-summaries.json` — `summary` первого прогона каждой точки Mootant
  (фазы `duration`, счётчики статусов, score, кэш) и счётчики статусов Stryker.
- `summary.md` — вывод `node analysis/bench/summarize.mjs` по всем точкам.

Полные отчёты (`run-k.json` по 1–5 МБ, трассы юнитов, профили, всего около
250 МБ) остались на машине анализа в `/home/user/projects/bench/results*`. Они
воспроизводятся стендом: `analysis/bench/README.md`.
