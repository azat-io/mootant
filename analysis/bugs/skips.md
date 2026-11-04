# Ложные пропуски (раздел 2): эвристики эквивалентности, шума, subsumed/owned, timeout, дубли

> Черновик, заполняется по ходу работы. Коммит 170ec52. Диапазон ID: BUG-300…BUG-399.

## Находки (по ходу)

- BUG-300 (solitary, string-literal внутри элемента массива/свойства) — подтверждён фикстурой
  `analysis/data/skips/fx1` (`src/keywords.js`): `mootant run` даёт 100 %, физическое удаление
  `'else'` из `new Set(['if', 'else', 'for'])` переживает тесты.
- BUG-301 (solitary, return-value с локальной переменной) — подтверждён (`src/process.js`):
  `return count` → `return 0` пропущен из-за `let count = 0` → `1`, который убивается через
  колбэк; физически применённый мутант выживает.
- BUG-302 (O19: удаление then-ветки ≠ `if (false)`, если у условия есть побочный эффект) —
  подтверждён (`src/remove.js`, `if (map.delete(key)) onRemove(key)`).
- BUG-303 (loop-advance: вызов метода у элемента массива, который читает условие цикла, принят за
  продвижение цикла) — подтверждён (`src/render.js`: `items[i].render()` в `for (i < items.length)`;
  удаление пропущено как timeout, физически завершается за 0.8 с и выживает; `mootant run` = 100 %).
- BUG-304 (R6: `return ok` → `true/false` «поглощён» мутантом инициализатора `ok`, хотя `ok`
  читается ещё и в `if (!ok) report(...)`) — подтверждён (`src/validate.js`: 100 % при
  физически выживающих `return true` и `return false`).
