# Матрицы согласия Mootant × эталон

> Сгенерировано `analysis/tools/oracle/aggregate.mjs` из `analysis/data/oracle/**/*.oracle.jsonl` и отчётов Mootant в `/home/user/projects/oracle/results{,-nt}/`. Строки — вердикт Mootant, столбцы — исход эталона. Для `crash` и `slow` (Vitest) и `slow` (node:test) — пресет `strict`, для остальных — `recommended`. Стресс-фикстуры намеренно состоят из «трудных» случаев, их проценты не переносятся на обычные проекты.

## Sums per group

### vitest-default

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 111 | 0 | 0 | 3 | 114 |
| Timeout | 0 | 5 | 2 | 3 | 10 |
| Survived | 1 | 0 | 0 | 63 | 64 |
| NoCoverage | 8 | 1 | 0 | 17 | 26 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 214; согласие «обнаружен / не обнаружен»: 198 (92.5 %), расхождений: 16.

### vitest-fast

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 111 | 0 | 0 | 5 | 116 |
| Timeout | 0 | 5 | 2 | 4 | 11 |
| Survived | 1 | 0 | 0 | 60 | 61 |
| NoCoverage | 8 | 1 | 0 | 17 | 26 |
| Error | 2 | 0 | 0 | 0 | 2 |

Сравнимых (без Error): 214; согласие «обнаружен / не обнаружен»: 195 (91.1 %), расхождений: 19.

### node-test

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 105 | 0 | 0 | 0 | 105 |
| Timeout | 0 | 0 | 2 | 2 | 4 |
| Survived | 0 | 0 | 0 | 51 | 51 |
| NoCoverage | 5 | 0 | 0 | 14 | 19 |

Сравнимых (без Error): 179; согласие «обнаружен / не обнаружен»: 172 (96.1 %), расхождений: 7.

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

#### node-test/crash

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 32 | 0 | 0 | 0 | 32 |
| Survived | 0 | 0 | 0 | 21 | 21 |
| NoCoverage | 0 | 0 | 0 | 9 | 9 |

Сравнимых (без Error): 62; согласие «обнаружен / не обнаружен»: 62 (100.0 %), расхождений: 0.

#### node-test/slow (strict)

| Mootant \ эталон | killed | killed-timeout | timeout | survived | всего |
|---|---:|---:|---:|---:|---:|
| Killed | 7 | 0 | 0 | 0 | 7 |
| Timeout | 0 | 0 | 2 | 0 | 2 |
| Survived | 0 | 0 | 0 | 17 | 17 |
| NoCoverage | 0 | 0 | 0 | 1 | 1 |

Сравнимых (без Error): 27; согласие «обнаружен / не обнаружен»: 27 (100.0 %), расхождений: 0.

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
