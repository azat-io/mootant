# Матрицы согласия Mootant × эталон

> Сгенерировано `analysis/tools/oracle/aggregate.mjs` из `analysis/data/oracle/**/*.oracle.jsonl` и отчётов Mootant в `/home/user/projects/oracle/results{,-nt}/`. Строки — вердикт Mootant, столбцы — исход эталона. Для `crash` и `slow` (Vitest), `crash` и `slow` (node:test) — пресет `strict`, для остальных — `recommended`. Стресс-фикстуры намеренно состоят из «трудных» случаев, их проценты не переносятся на обычные проекты. Для `nt/slow` в матрицу вошёл первый прогон, где `9trb33kh` — `Survived`; в 4 повторах из 5 он `Timeout` (BUG-204).

## Sums per group

### vitest-default

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 119 | 0 | 0 | 3 | 122 |
| Timeout | 0 | 5 | 2 | 3 | 10 |
| Survived | 2 | 0 | 0 | 67 | 69 |
| NoCoverage | 11 | 1 | 0 | 21 | 33 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 234; согласие «обнаружен / не обнаружен»: 214 (91.5 %), расхождений: 20.

### vitest-fast

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 118 | 0 | 0 | 5 | 123 |
| Timeout | 0 | 5 | 2 | 4 | 11 |
| Survived | 1 | 0 | 0 | 63 | 64 |
| NoCoverage | 8 | 1 | 0 | 18 | 27 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 225; согласие «обнаружен / не обнаружен»: 206 (91.6 %), расхождений: 19.

### node-test

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 119 | 0 | 0 | 0 | 119 |
| Timeout | 0 | 0 | 4 | 2 | 6 |
| Survived | 0 | 0 | 0 | 61 | 61 |
| NoCoverage | 5 | 0 | 0 | 18 | 23 |

Сравнимых (без Error): 209; согласие «обнаружен / не обнаружен»: 202 (96.7 %), расхождений: 7.

### real-default

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 120 | 0 | 1 | 0 | 121 |
| Timeout | 0 | 0 | 3 | 0 | 3 |
| Survived | 0 | 0 | 0 | 3 | 3 |

Сравнимых (без Error): 127; согласие «обнаружен / не обнаружен»: 127 (100.0 %), расхождений: 0.

### real-fast

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 120 | 0 | 1 | 0 | 121 |
| Timeout | 0 | 0 | 3 | 0 | 3 |
| Survived | 0 | 0 | 0 | 3 | 3 |

Сравнимых (без Error): 127; согласие «обнаружен / не обнаружен»: 127 (100.0 %), расхождений: 0.

## Per fixture

#### vitest-default/state

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 26 | 0 | 0 | 0 | 26 |
| Timeout | 0 | 0 | 0 | 2 | 2 |
| Survived | 0 | 0 | 0 | 10 | 10 |
| NoCoverage | 0 | 0 | 0 | 2 | 2 |

Сравнимых (без Error): 40; согласие «обнаружен / не обнаружен»: 38 (95.0 %), расхождений: 2.

#### vitest-default/mocks

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 9 | 0 | 0 | 0 | 9 |
| Survived | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 10; согласие «обнаружен / не обнаружен»: 10 (100.0 %), расхождений: 0.

#### vitest-default/dynamic

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 2 | 0 | 0 | 0 | 2 |
| Survived | 1 | 0 | 0 | 0 | 1 |
| NoCoverage | 8 | 1 | 0 | 0 | 9 |

Сравнимых (без Error): 12; согласие «обнаружен / не обнаружен»: 2 (16.7 %), расхождений: 10.

#### vitest-default/load

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 14 | 0 | 0 | 0 | 14 |
| Survived | 0 | 0 | 0 | 2 | 2 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 17; согласие «обнаружен / не обнаружен»: 17 (100.0 %), расхождений: 0.

#### vitest-default/modes

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 14 | 0 | 0 | 1 | 15 |
| Timeout | 0 | 1 | 0 | 0 | 1 |
| Survived | 0 | 0 | 0 | 4 | 4 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 21; согласие «обнаружен / не обнаружен»: 20 (95.2 %), расхождений: 1.

#### vitest-default/unhandled

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 2 | 0 | 0 | 2 | 4 |
| Survived | 0 | 0 | 0 | 2 | 2 |

Сравнимых (без Error): 6; согласие «обнаружен / не обнаружен»: 4 (66.7 %), расхождений: 2.

#### vitest-default/crash (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 39 | 0 | 0 | 0 | 39 |
| Timeout | 0 | 0 | 2 | 0 | 2 |
| Survived | 0 | 0 | 0 | 28 | 28 |
| NoCoverage | 0 | 0 | 0 | 12 | 12 |

Сравнимых (без Error): 81; согласие «обнаружен / не обнаружен»: 81 (100.0 %), расхождений: 0.

#### vitest-default/slow (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 5 | 0 | 0 | 0 | 5 |
| Timeout | 0 | 4 | 0 | 1 | 5 |
| Survived | 0 | 0 | 0 | 16 | 16 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 27; согласие «обнаружен / не обнаружен»: 26 (96.3 %), расхождений: 1.

#### vitest-default/hooks

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| Survived | 0 | 0 | 0 | 3 | 3 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 11; согласие «обнаружен / не обнаружен»: 11 (100.0 %), расхождений: 0.

#### vitest-default/fscache

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 1 | 0 | 0 | 0 | 1 |
| Survived | 1 | 0 | 0 | 1 | 2 |
| NoCoverage | 3 | 0 | 0 | 3 | 6 |

Сравнимых (без Error): 9; согласие «обнаружен / не обнаружен»: 5 (55.6 %), расхождений: 4.

#### vitest-fast/state

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 26 | 0 | 0 | 2 | 28 |
| Timeout | 0 | 0 | 0 | 2 | 2 |
| Survived | 0 | 0 | 0 | 8 | 8 |
| NoCoverage | 0 | 0 | 0 | 2 | 2 |

Сравнимых (без Error): 40; согласие «обнаружен / не обнаружен»: 36 (90.0 %), расхождений: 4.

#### vitest-fast/mocks

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 9 | 0 | 0 | 0 | 9 |
| Survived | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 10; согласие «обнаружен / не обнаружен»: 10 (100.0 %), расхождений: 0.

#### vitest-fast/dynamic

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 2 | 0 | 0 | 0 | 2 |
| Survived | 1 | 0 | 0 | 0 | 1 |
| NoCoverage | 8 | 1 | 0 | 0 | 9 |

Сравнимых (без Error): 12; согласие «обнаружен / не обнаружен»: 2 (16.7 %), расхождений: 10.

#### vitest-fast/load

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 14 | 0 | 0 | 0 | 14 |
| Survived | 0 | 0 | 0 | 2 | 2 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 17; согласие «обнаружен / не обнаружен»: 17 (100.0 %), расхождений: 0.

#### vitest-fast/modes

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 14 | 0 | 0 | 1 | 15 |
| Timeout | 0 | 1 | 0 | 0 | 1 |
| Survived | 0 | 0 | 0 | 4 | 4 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 21; согласие «обнаружен / не обнаружен»: 20 (95.2 %), расхождений: 1.

#### vitest-fast/unhandled

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 2 | 0 | 0 | 2 | 4 |
| Survived | 0 | 0 | 0 | 2 | 2 |

Сравнимых (без Error): 6; согласие «обнаружен / не обнаружен»: 4 (66.7 %), расхождений: 2.

#### vitest-fast/crash (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 39 | 0 | 0 | 0 | 39 |
| Timeout | 0 | 0 | 2 | 1 | 3 |
| Survived | 0 | 0 | 0 | 27 | 27 |
| NoCoverage | 0 | 0 | 0 | 12 | 12 |

Сравнимых (без Error): 81; согласие «обнаружен / не обнаружен»: 80 (98.8 %), расхождений: 1.

#### vitest-fast/slow (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 5 | 0 | 0 | 0 | 5 |
| Timeout | 0 | 4 | 0 | 1 | 5 |
| Survived | 0 | 0 | 0 | 16 | 16 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 27; согласие «обнаружен / не обнаружен»: 26 (96.3 %), расхождений: 1.

#### vitest-fast/hooks

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| Survived | 0 | 0 | 0 | 3 | 3 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 11; согласие «обнаружен / не обнаружен»: 11 (100.0 %), расхождений: 0.

#### node-test/state

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 26 | 0 | 0 | 0 | 26 |
| Timeout | 0 | 0 | 0 | 2 | 2 |
| Survived | 0 | 0 | 0 | 10 | 10 |
| NoCoverage | 0 | 0 | 0 | 2 | 2 |

Сравнимых (без Error): 40; согласие «обнаружен / не обнаружен»: 38 (95.0 %), расхождений: 2.

#### node-test/dynamic

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| NoCoverage | 5 | 0 | 0 | 0 | 5 |

Сравнимых (без Error): 12; согласие «обнаружен / не обнаружен»: 7 (58.3 %), расхождений: 5.

#### node-test/load

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 14 | 0 | 0 | 0 | 14 |
| Survived | 0 | 0 | 0 | 2 | 2 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 17; согласие «обнаружен / не обнаружен»: 17 (100.0 %), расхождений: 0.

#### node-test/modes

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 19 | 0 | 0 | 0 | 19 |
| Survived | 0 | 0 | 0 | 1 | 1 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 21; согласие «обнаружен / не обнаружен»: 21 (100.0 %), расхождений: 0.

#### node-test/crash (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 39 | 0 | 0 | 0 | 39 |
| Timeout | 0 | 0 | 2 | 0 | 2 |
| Survived | 0 | 0 | 0 | 28 | 28 |
| NoCoverage | 0 | 0 | 0 | 12 | 12 |

Сравнимых (без Error): 81; согласие «обнаружен / не обнаружен»: 81 (100.0 %), расхождений: 0.

#### node-test/slow (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| Timeout | 0 | 0 | 2 | 0 | 2 |
| Survived | 0 | 0 | 0 | 17 | 17 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 27; согласие «обнаружен / не обнаружен»: 27 (100.0 %), расхождений: 0.

#### node-test/hooks

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| Survived | 0 | 0 | 0 | 3 | 3 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 11; согласие «обнаружен / не обнаружен»: 11 (100.0 %), расхождений: 0.

#### real-default/mootant core-text

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 120 | 0 | 1 | 0 | 121 |
| Timeout | 0 | 0 | 3 | 0 | 3 |
| Survived | 0 | 0 | 0 | 3 | 3 |

Сравнимых (без Error): 127; согласие «обнаружен / не обнаружен»: 127 (100.0 %), расхождений: 0.

#### real-fast/mootant core-text

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 120 | 0 | 1 | 0 | 121 |
| Timeout | 0 | 0 | 3 | 0 | 3 |
| Survived | 0 | 0 | 0 | 3 | 3 |

Сравнимых (без Error): 127; согласие «обнаружен / не обнаружен»: 127 (100.0 %), расхождений: 0.

> В копиях `*.oracle.jsonl` здесь поле `tail` (хвост вывода упавшего прогона) удалено ради размера; полные файлы — `/home/user/projects/oracle/results{,-nt}/<фикстура>/oracle.jsonl`.
