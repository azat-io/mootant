# Прогон всех тестов-воспроизведений на 170ec52

Команда: `cd <worktree experiment/bug-repros> && TERM=xterm-256color pnpm exec vitest --run test/repros` (14:00 UTC, после окна замеров, Node 22.23.4, Vitest 5.0.5).

Итог: **41 тест-файл из 41 падает** — 57 тестов упали, 2 прошли (контрольные проверки внутри файлов). Каждый unit-репро воспроизводит свой баг на исследуемом коммите. Фикстуры с `run.sh` (BUG-407, 500, 501, 503–506, 509 и др.) этим прогоном не покрыты — их воспроизведение описано в промптах и проверено верификаторами.

| Файл | упало | прошло |
| --- | ---: | ---: |
| BUG-100.test.ts | 2 | 0 |
| BUG-101.test.ts | 2 | 0 |
| BUG-102.test.ts | 1 | 0 |
| BUG-103.test.ts | 1 | 0 |
| BUG-104.test.ts | 1 | 0 |
| BUG-106.test.ts | 2 | 0 |
| BUG-200.test.ts | 1 | 0 |
| BUG-201.test.ts | 1 | 0 |
| BUG-202.test.ts | 1 | 0 |
| BUG-203.test.ts | 1 | 0 |
| BUG-204.test.ts | 1 | 0 |
| BUG-206.test.ts | 1 | 0 |
| BUG-300.test.ts | 2 | 0 |
| BUG-301.test.ts | 2 | 0 |
| BUG-302.test.ts | 2 | 0 |
| BUG-303.test.ts | 2 | 1 |
| BUG-304.test.ts | 2 | 0 |
| BUG-305.test.ts | 1 | 0 |
| BUG-306.test.ts | 1 | 0 |
| BUG-307.test.ts | 2 | 0 |
| BUG-308.test.ts | 1 | 0 |
| BUG-309.test.ts | 1 | 1 |
| BUG-310.test.ts | 2 | 0 |
| BUG-311.test.ts | 1 | 0 |
| BUG-312.test.ts | 1 | 0 |
| BUG-401.test.ts | 2 | 0 |
| BUG-402.test.ts | 2 | 0 |
| BUG-403.test.ts | 1 | 0 |
| BUG-404.test.ts | 2 | 0 |
| BUG-410.test.ts | 1 | 0 |
| BUG-412.test.ts | 1 | 0 |
| BUG-419.test.ts | 1 | 0 |
| BUG-502.test.ts | 1 | 0 |
| BUG-507.test.ts | 1 | 0 |
| BUG-508.test.ts | 1 | 0 |
| BUG-510.test.ts | 1 | 0 |
| BUG-900.test.ts | 2 | 0 |
| BUG-901.test.ts | 2 | 0 |
| BUG-902.test.ts | 1 | 0 |
| BUG-904.test.ts | 1 | 0 |
| BUG-905.test.ts | 2 | 0 |
