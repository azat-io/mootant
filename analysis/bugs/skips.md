# Ложные пропуски: эвристики эквивалентности, шума, subsumed/owned, timeout и дубли

> Раздел 2 («Ложные пропуски») анализа Mootant, коммит 170ec52. Диапазон ID —
> BUG-300…BUG-399. Статус: **промежуточный** — эмпирическая выборка на core
> ещё считается, таблица «по правилам» будет дополнена; всё остальное готово.

## Резюме

Найдено **11 классов ложных пропусков**, все подтверждены воспроизведением:
фикстура с тестами, на которой `mootant run` даёт 100 %, а физически
применённый пропущенный мутант проходит те же тесты обычным `vitest --run`, и
падающий тест в ветке `experiment/bug-repros` (`test/repros/BUG-300…310`).

- **high — BUG-305**: `--since` отбирает мутантов по изменённым строкам
  *после* правил пропуска. Если «владелец» пропуска стоит на неизменённой
  строке, изменённая строка остаётся без мутантов (`mutants 0`,
  `score none`). Это основной CI-сценарий из readme; в core 357 строк, в
  perfectionist 268 строк, где правка одной строки даёт ноль мутантов при
  наличии кандидатов.
- **`solitary`** (34 % всех пропусков core, 47 % perfectionist, помечен как
  эвристика) ломается на двух частых шаблонах: опустошённая строка в элементе
  множества/списка, которую убивает любой тест с `''` на входе (BUG-300), и
  возвращаемая локальная переменная, которую функция читает ещё где-то
  (BUG-301).
- **Правила, заявленные доказательными** (`heuristic: false`), ошибаются:
  `O19` — удаление then-ветки «тот же мутант», что `if (false)`, даже при
  условии с эффектом (`if (map.delete(key)) onRemove(key)`, BUG-302); `R6` — тот
  же изъян, что BUG-301, для `return ok` (BUG-304); `loop-advance` считает
  продвижением цикла `items[i].render()` (BUG-303); `loop-running` — один из
  нескольких выходов `for (;;)` (BUG-310, 30 из 131 в core).
- **Эквивалентность нарушается на `NaN`**: `done / total || 0` → `done / total`
  помечен `equivalent` (BUG-307); `value + 0` → `value - 0` при неизвестном
  типе (BUG-308, low).
- **Шум, который не шум**: все строки JSX-атрибутов, включая `type="password"`,
  `aria-label`, `href` (BUG-309); коды ошибок в `new AppError('NOT_FOUND', …)`
  (BUG-306, low).
- `strict` возвращает только `solitary` и `timeout`: BUG-302, 304, 305, 306,
  307, 308, 309 воспроизводятся и с `--preset strict` (проверено).
- **Выдержали проверку**: логика сравнений и полярности (`R2`,
  `comparison-region`, `O4`, `shifted-literal`, `O3` в булевом режиме),
  нижние границы, `duplicate`, эквивалентности регулярных выражений и
  `await`; 2 394 из 16 195 пропусков core дают буквально тот же файл, что
  выдаваемый мутант.

## Баги

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-300 | `solitary`: опустошение строки внутри элемента массива/свойства (`'else'` → `''`) считается «тонким» мутантом и прячет удаление элемента, хотя `''`-мутант убивает любой тест с пустой строкой на входе | medium | подтверждён | `core/generate/apply-solitary-rule.ts:124-136`, `core/mutators/array-element.ts:55-59`, `core/mutators/string-literal.ts:92-103` | `test/repros/BUG-300.test.ts`; `analysis/data/skips/fx1` (`keywords.js`): `mootant run` 100 %, удаление `'else'` физически выживает |
| BUG-301 | `solitary` для `return x`: диапазоны включают инициализатор и записи `x`, даже если `x` читается не только в `return`; мутант `return x → 0` пропадает, когда тонкий мутант инициализатора убит через другое чтение | medium | подтверждён | `core/mutators/return-value.ts:170-171, 349-365` | `test/repros/BUG-301.test.ts`; `fx1/process.js`: 100 %, `return 0` выживает |
| BUG-302 | `O19` (и `R4`/`R5` с владельцем-константой): удаление then-ветки считается тем же мутантом, что `if (false)`, хотя у условия есть эффект (`if (map.delete(key)) onRemove(key)`); вернуть нельзя ни `strict`, ни отключением владельца | medium | подтверждён | `core/mutators/statement-removal.ts:152-188`, `core/mutators/shared/get-owner-constant.ts:35-41` | `test/repros/BUG-302.test.ts`; `fx1/remove.js`: 100 %, удаление `onRemove(key)` выживает |
| BUG-303 | `loop-advance`: любой вызов метода, у которого корень объекта — имя из условия цикла, считается продвижением; `items[i].render()` и `bytes.push(…text.slice(…))` не удаляются | medium | подтверждён | `core/syntax/advances-loop.ts:67-75, 222-233` | `test/repros/BUG-303.test.ts`; `fx1/render.js`: 100 %, удаление завершается за 0.8 с и выживает; `core/git/unquote-git-path.ts:39` |
| BUG-304 | `R6`: константы `return ok` «поглощены» мутантом инициализатора `ok`, хотя `ok` читается и в другой ветке | medium | подтверждён | `core/mutators/return-value.ts:202-239, 508-517` | `test/repros/BUG-304.test.ts`; `fx1/validate.js`: 100 %, `return true` и `return false` выживают |
| BUG-305 | `--since` отбирает мутантов по строкам после правил пропуска: пропуск, чей владелец на неизменённой строке, не возвращается — изменённая строка без мутантов | high | подтверждён | `core/files/select-changed-mutants.ts:17-80`, `core/list-mutants.ts:70-90`, `core/run-mutants.ts:192` | `test/repros/BUG-305.test.ts`; `analysis/data/skips/fx-since`: `mutants 0`, `score none` |
| BUG-306 | `error-message`: любые строки в аргументах `new *Error(…)`, включая коды (`'NOT_FOUND'`), считаются текстом сообщения | low | подтверждён | `core/syntax/is-error-message.ts` (`isMessageArgument`) | `test/repros/BUG-306.test.ts`; `fx1/errors.js`: 100 %, `'NOT_FOUND'` → `''` выживает |
| BUG-307 | `canonical-falsy-default`: `x \|\| 0` для числа — «equivalent», хотя `NaN \|\| 0` — `0`; `done / total \|\| 0` и `Number(text) \|\| 0` теряют единственного мутанта защиты от `NaN` | medium | подтверждён | `core/mutators/shared/get-logical-drops.ts:81-84`, `core/mutators/shared/get-canonical-falsy.ts` | `test/repros/BUG-307.test.ts`; `fx1/nan.js`: все мутанты убиты, оба пропуска физически выживают |
| BUG-308 | `numeric-identity`: `value + 0` → `value - 0` пропущен при неизвестном типе `value` (строка даёт `'70'` против `7`); JSDoc обещает проверку типа для `+` и `-`, код проверяет только `-` | low | подтверждён | `core/mutators/arithmetic-operator.ts:79-80, 98` | `test/repros/BUG-308.test.ts` |
| BUG-309 | `jsx-attribute`: все строки JSX-атрибутов — шум, включая `type="password"`, `aria-label`, `href`; опции нет | medium | подтверждён | `core/mutators/string-literal.ts:170-175` | `test/repros/BUG-309.test.ts`; `analysis/data/skips/fx3/src/Login.jsx` |
| BUG-310 | `loop-running`: `false` для одного из нескольких выходов `for (;;)` пропущен как timeout, хотя остальные выходы завершают цикл (30 из 131 в core) | medium | подтверждён | `core/mutators/shared/get-running-value.ts:56-59`, `core/syntax/get-exited-loops.ts:33-87` | `test/repros/BUG-310.test.ts`; `fx1/root.js`: 100 %, оба `false` завершаются и выживают |

## Методика

1. **Статический разбор.** Для каждого правила из `core/skips/skip-rules.ts`
   (95 правил) — место выдачи (`rule: '…'` в `core/mutators/**`,
   `core/generate/*`, `core/regex/*`), утверждение в JSDoc и в строке `reason`,
   и попытка контрпримера: побочные эффекты условий, `NaN`/`-0`, строки вместо
   чисел, многократное чтение локальной переменной, несколько выходов из
   цикла, отбор `--since`. Каждый кандидат проверялся листингом
   (`mootant list --json --verbose --skipped`) на маленьком снипете
   (`analysis/data/skips/fx2`, `fx3`), затем фикстурой с тестами
   (`analysis/data/skips/fx1`, `fx-since`): `mootant run` + физическое
   применение пропущенного мутанта (`analysis/tools/skips/apply_mutant.py`) и
   обычный прогон Vitest без инструментирования.
2. **Связь пропуска с владельцем по данным листинга.** Для всех 16 195
   пропусков core и 4 966 пропусков eslint-plugin-perfectionist посчитано, даёт
   ли пропущенный кандидат **тот же файл**, что какой-то выдаваемый мутант
   (`analysis/tools/skips/classify_owners.py`): такой пропуск не теряет
   информации по построению.
3. **Эксперимент «unskip»** (`analysis/experiments/skips-unskip.diff`, ветка
   `experiment/skips`). Патч возвращает каждый пропущенный кандидат (кроме
   категории `invalid` и копий выдаваемых мутантов) как дополнительный мутант
   с собственным id и пишет журнал `{id, rule, by}`; на решения правил и id
   остальных мутантов он не влияет. Включается переменной `MOOTANT_UNSKIP` и
   только в главном процессе CLI (`MOOTANT_UNSKIP_PID`, иначе тесты самого
   Mootant видят лишних мутантов). Один прогон даёт вердикты и пропущенным, и
   их владельцам, с тем же выбором тестов по покрытию. Классы
   (`analysis/tools/skips/join_verdicts.py`):
   - `revealed` — пропущенный убит: на этом наборе тестов пропуск ничего не
     скрыл;
   - `owner-survives` / `neighbor-survives` — пропущенный выжил, но выжил и
     владелец (или выдаваемый мутант внутри диапазона): пользователь сигнал
     получает;
   - **`HIDDEN`** — пропущенный выжил, а все владельцы (для правил без
     владельца — все выдаваемые мутанты внутри его диапазона) убиты: отчёт
     Mootant чист, а мутант жив. Кандидат в ложный пропуск;
   - `not-equivalent` — правило `equivalent`, а мутант убит;
   - `timeout-confirmed` / `terminates-killed` — для `timeout`-правил.
   Каждый `HIDDEN` затем разбирался вручную (эквивалентен? какой тест его
   убьёт?) и физически перепроверялся обычным прогоном Vitest на отдельной
   копии репозитория (`analysis/tools/skips/verify_physical.py`).
4. **Выборки.** Кластерная по файлам (все кандидаты выбранного файла), файлы
   выбраны случайно (seed 20261104) с квотами по крупным правилам
   (`analysis/tools/skips/pick_files.py`): core — 47 файлов
   (`analysis/data/skips/core-sample-files.txt`), тесты — `test/core/**`;
   perfectionist — 17 файлов пяти правил (`sort-heritage-clauses`,
   `sort-switch-case`, `sort-enums`, `sort-export-attributes`, `sort-sets`) и
   их тестовые файлы (`analysis/data/skips/perf-sample-files.txt`).
   Доверительные интервалы — Уилсона 95 % в предположении независимости
   кандидатов; из-за кластеризации по файлам реальный разброс шире.
5. **Машина.** 4 vCPU, общая с ~6 агентами (load average 20–35 во время
   прогонов), Node 22.23.4, Vitest 5.0.5, Mootant 0.1.0 (170ec52), `nice -n 10`,
   `--concurrency 2`.

## Эмпирическая выборка по правилам

_Считается — будет добавлено._

## Конкретные примеры: полезный мутант молча пропадает

Во всех примерах ниже `mootant run` на фикстуре показывает **100 %** (или
100 % покрытых), а физически применённый пропущенный мутант проходит те же
тесты обычным `vitest --run` (`analysis/tools/skips/apply_mutant.py`). Код и
тесты — `analysis/data/skips/fx1/`, `fx-since/`, пробы листинга — `fx2/`,
`fx3/`.

### 1. Множество ключевых слов (BUG-300, `solitary`)

```js
const KEYWORDS = new Set(['if', 'else', 'for'])
export function isKeyword(word) {
  return KEYWORDS.has(word)
}
```

Тесты: `isKeyword('if') === true`, `isKeyword('') === false`,
`isKeyword('foo') === false`. Мутанты `'if'`/`'else'`/`'for'` → `''` убивает
тест с пустой строкой (`''` попадает в множество). Удаления `'else'` и `'for'`
пропущены: «a finer string-literal mutant lies inside the code it removes».
Физически `['if', 'for']` выживает. Убивающий тест — `isKeyword('else') ===
true` (и так для каждого элемента).

### 2. Счётчик, который отдаётся колбэку (BUG-301, `solitary`)

```js
export function processAll(items, onItem) {
  let count = 0
  for (let item of items) {
    count++
    onItem(item, count)
  }
  return count
}
```

Тест проверяет только `[['a', 1], ['b', 2]]` в колбэке. `return count` →
`return 0` пропущен из-за `let count = 0` → `1` (убит через колбэк). Убивающий
тест — `expect(processAll(['a'], () => {})).toBe(1)`.

### 3. Удаление с уведомлением (BUG-302, `O19`)

```js
export function remove(map, key, onRemove) {
  if (map.delete(key)) {
    onRemove(key)
  }
}
```

Тесты: «ключ удалён», «для отсутствующего ключа колбэк не вызван». Удаление
`onRemove(key)` пропущено как «the same mutant» с `if (false)`, но `if (false)`
не удаляет ключ, а удаление уведомления — удаляет. Убивающий тест — колбэк
вызван для существующего ключа. Тот же класс с владельцем logical-operator:
`if (queue.shift() && ready) onItem()` (`fx1/src/consume.js`).

### 4. Рендер элементов (BUG-303, `loop-advance`)

```js
for (let i = 0; i < items.length; i++) {
  items[i].render()
  rendered++
}
```

Удаление `items[i].render()` пропущено как «may keep the loop running
forever»; физически заканчивается за 0.8 с. Убивающий тест — шпион на
`render`.

### 5. Валидация с отчётом (BUG-304, `R6`)

```js
export function validate(input, report) {
  let ok = input.length > 2 && input.length < 10
  if (!ok) {
    report('invalid')
  }
  return ok
}
```

Шесть входов проверяют вызовы `report`; `return ok` → `true` и → `false`
пропущены как поглощённые мутантами `input.length > 2`. Убивающий тест —
`expect(validate('abc', () => {})).toBe(true)` и `toBe(false)` для `'ab'`.

### 6. PR меняет строку внутри `if` (BUG-305, `--since`)

```js
if (user.isAdmin) {
  door.unlock(user)   // PR: door.open(user)
}
```

`mootant run src --since HEAD`: `mutants 0`, `score none`. Без `--since`
выживают `user.isAdmin` → `true/false` (нет теста с админом) — с `--since` о
дыре не сообщает ничего.

### 7. Код ошибки (BUG-306, `error-message`)

```js
throw new AppError('NOT_FOUND', `No user ${id}`)
// …
return error.code === 'NOT_FOUND' ? 404 : 500
```

`'NOT_FOUND'` → `''` в `throw` пропущен как текст сообщения. Убивающий тест —
`statusOf` от ошибки `findUser` равен 404.

### 8. Деление без нуля (BUG-307, `canonical-falsy-default`)

```js
export function ratio(done, total) {
  return done / total || 0
}
```

Тесты `ratio(1, 2) === 0.5`, `ratio(0, 5) === 0` убивают все мутанты;
`done / total || 0` → `done / total` пропущен как «equivalent», хотя
`ratio(0, 0)` даёт `NaN` вместо `0`. Убивающий тест — `ratio(0, 0) === 0`.

### 9. Поиск корня с двумя выходами (BUG-310, `loop-running`)

```js
for (;;) {
  if (current.isRoot) break
  if (current.parent === null) break
  current = current.parent
}
```

Тест с цепочкой до узла `isRoot: true` убивает все мутанты; оба `false` для
выходов пропущены как timeout, физически завершаются и выживают. Убивающие
тесты — цепочка без `isRoot` и узел `isRoot` с непустым `parent`.

### 10. Атрибуты формы (BUG-309, `jsx-attribute`)

```jsx
<input type="password" aria-label="Password" />
```

Оба значения пропущены как шум. Убивающий тест — `getByLabelText('Password')`
или `toHaveAttribute('type', 'password')`.

## Разбор правил: что утверждает правило и выдержало ли проверку

Критерий корректности пропуска с владельцем (`subsumed`, `owned`, `duplicate`):
для любого теста `t` — если `t` убивает владельца, то `t` убивает и
пропущенного (`kill(владелец) ⊆ kill(пропущенный)`). Только в эту сторону:
тогда «владелец убит» ⇒ «пропущенный был бы убит», а «владелец выжил» ⇒
пользователь всё равно получит сигнал, и тест, убивающий владельца, убьёт и
пропущенного. Ложный пропуск — набор тестов, где владелец убит, а пропущенный
выживает и не эквивалентен. Для `equivalent` — существование входа, на котором
мутант наблюдаем. Для `noise`/`timeout` — полезный (не эквивалентный,
убиваемый разумным тестом) мутант, который к тому же не заканчивается
таймаутом.

| Правило (доля в core) | Что утверждает | Вердикт | Где |
| --- | --- | --- | --- |
| `solitary` (5 476, эвр.) | Тест, убивающий тонкий мутант внутри диапазона, наблюдает удаляемый код | **Ломается** на двух шаблонах: BUG-300 (`''` в элементе множества убивается тестом с пустой строкой), BUG-301 (локальная переменная читается не только в `return`). Для `statement-removal` (диапазон — сам оператор) и для тонких мутантов внутри возвращаемого выражения держится; `countsForSolitary: false` у `optional-chaining` правильно исключает мутанты, убиваемые исключением | `core/generate/apply-solitary-rule.ts:60-136`, `core/mutators/return-value.ts:349-365` |
| `O3` (3 010) | Константа операнда `&&`/`\|\|` — это drop или константа группы logical-operator | Верно в булевой логике: `A→true` в `A && B` ≡ drop-left (оба не вычисляют `A`); `B→false` ≡ константа группы с оговоркой — `A && false` вычисляет `A`, константа нет (теоретическая неточность при эффекте в `A`) | `core/mutators/shared/get-owned-constants.ts:25-78` |
| `O1` (2 527) | Константу условия выдаёт «свой» мутатор | 1 793 из 2 527 (71 %) дают **тот же файл**, что выдаваемый мутант, — пропуск тривиально верен. Остальные — константы `&&`/`\|\|`-групп: `if (a && b)` → `true` не равен ни одному мутанту logical-operator, но поглощён drop'ами (корректно как subsumption; категория `owned` неточна) | `core/mutators/shared/get-condition-constants.ts:127-138, 256-284` |
| `O4` (1 537) | Мутант comparison-operator меняет сравнение на части входов, где меняет литерал | Верно, если поглощающая константа выдаётся (541 случай в core) или ушла в `O3` (852 + 109, цепочка через logical-operator корректна). 8 случаев в core опираются на константу, пропущенную как `loop-running`: цепочка обрывается, мутант фактически «таймаутный», но помечен `subsumed` и не возвращается `timeouts` | `core/mutators/shared/get-literal-skip.ts:133-159` |
| `O19` (925) | Мутант с поведением «условие = const» — тот же мутант под другим именем | 477 из 925 — тот же файл. Для удаления then-ветки **неверно**, если у условия эффект (BUG-302), и вне `--since`-отбора (BUG-305). В core и perfectionist условий с явным эффектом под `O19`/`R4` нет (0 из 604 и 0 из 345, один `await` под `R4`) | `core/mutators/statement-removal.ts:152-188`, `core/mutators/shared/get-owner-constant.ts` |
| `R2` (411) | Мутант внутри операнда двигает его к значению, которое даёт drop | Верно в булевом режиме (полярность: `getComparisonPlan` даёт область и значение каждой записи) | `core/mutators/shared/has-polar-mutant.ts`, `get-logical-drops.ts:95-193` |
| `R6` (362) | Мутант двигает возвращаемое значение к константе | Верно для мутанта внутри выражения; **неверно** для значения, присвоенного локальной переменной, которую читают ещё где-то (BUG-304) | `core/mutators/return-value.ts:202-239, 508-517` |
| `R4` (191) | Мутант двигает условие then-ветки к `false` | Верно, когда владелец — перестановка/сдвиг сравнения (сохраняет вычисление условия); тот же изъян, что BUG-302, если владелец — константа группы или drop операнда при условии с эффектом; уязвим к `--since` (все 191 владельцы на другой строке) | `core/mutators/shared/get-toward-mutant.ts` |
| `comparison-region` (186) | Перестановка сравнения даёт константе её значение на части входов | Верно (`>=` при `x > 0` меняет только область `eq` на `true`, константа `true` там тоже `true`; `NaN` оба оставляют) | `core/mutators/shared/get-condition-constants.ts:256-284` |
| `case-label` (489, шум) | Метки `case` не мутируются без `caseTests` | Политика. 125 из 489 меток в core — пустые «алиасы» (`case 'a': case 'b': …`): мутант метки — единственная проверка, что алиас покрыт тестом; тело убивается любой меткой группы | `core/mutators/string-literal.ts:158-163`, `number-literal.ts:100-105` |
| `loop-advance` (165, timeout) | Изменение значения/оператора, продвигающего цикл, может зациклить | Для `index++`, `current = current.parent` верно; **неверно** для вызова метода у элемента/члена корневого имени (BUG-303) | `core/syntax/advances-loop.ts:47-75, 222-233` |
| `loop-running` (131, timeout) | Значение, держащее цикл, может зациклить | Для теста цикла верно; для одного из нескольких выходов из `for (;;)` — «может», но не обязан (другие выходы завершают, напр. `getLead` в `core/generate/group-replacement.ts:356-372`) | `core/mutators/shared/get-running-value.ts:45-66` |
| `nullish-swap` (161, шум, эвр.) | `??` и `\|\|` различаются только на значениях, которые режим не считает | Политика с опцией `nullishSwap: 'always'`; для `??` с неизвестным типом перестановка выдаётся (проверено) | `core/mutators/shared/get-nullish-swap-skip.ts:20-41` |
| `lower-bound` (111, эвр.) | Нижняя граница (`length ≥ 0`, счётчик) делает область невозможной | Держится: счётчик — неподвижная точка по всем записям, `size` только у доказанных Map/Set, `byteLength` исключён | `core/syntax/get-value-bound.ts` |
| `tail-return` (59, equivalent) | Удаление хвостового `return null` меняет только `null` на `undefined` | Наблюдаемо (`toBeNull()`, `=== null` у вызывающего); категория «equivalent» с оговоркой в документации, но `tail-return-false` того же рода — `noise` | `core/mutators/statement-removal.ts:385-428` |
| `canonical-falsy-default` (эвр.) | Правый операнд `\|\|` — единственное ложное значение типа | Для строк/булевых/BigInt верно, для чисел — нет из-за `NaN` (BUG-307) | `core/mutators/shared/get-logical-drops.ts:81-84` |
| `numeric-identity` (эвр.) | `x + 0` и `x - 0` равны | Только для чисел; для `+` тип не проверяется (BUG-308) | `core/mutators/arithmetic-operator.ts:88-115` |
| `error-message` (эвр.) | Строки в аргументах `*Error` — только текст сообщения | Коды ошибок — не текст (BUG-306) | `core/syntax/is-error-message.ts` |
| `jsx-attribute` (шум) | Значение JSX-атрибута — оформление | Только для `className`/`style`; `type`, `href`, `aria-*` — поведение (BUG-309) | `core/mutators/string-literal.ts:170-175` |
| `duplicate` (2) | Тот же файл | Верно по построению (`getCanonicalEdit`) | `core/generate/deduplicate-candidates.ts` |
| `shifted-literal` (83) | Тот же файл, что сдвиг comparison-operator | Верно: 83 из 83 — тот же файл | `core/mutators/shared/get-literal-skip.ts:142-149` |
| `unused-result`, `fall-through-break`, `loop-end`, `one-way-counter`, `void-operand`, `identity-operand`, `caseless-literal`, `default-option`, `awaited-by-caller`, `settled-value`, `truth-keeping-swap`, `length-keeping-swap`, `anchored-global`, `hook-dependencies`, `joined-array` | Эквивалентность | Проверены разбором кода и пробами; контрпримеров не найдено (`anchored-global` корректно учитывает `m` и альтернативы; `settled-value` не верит типу по имени метода; `typeof`-сравнения не доверяют значениям по умолчанию параметров) | см. файлы правил |

## Документация и флаги `heuristic` против поведения

Проверено скриптом (все 95 правил `core/skips/skip-rules.ts` есть в таблицах
skipped changes с той же категорией) и вручную по утверждениям страниц.

| Где | Утверждение | Поведение | Вывод |
| --- | --- | --- | --- |
| `docs/content/mutators.md:42` | `subsumed` — «Is caught by any test that catches another mutant» | `R6` (не эвристика) нарушает для локальной переменной (BUG-304); `solitary` — для строк в множествах и локальных переменных (BUG-300/301); `O4`, опирающийся на `loop-running`-константу, не имеет работающего поглотителя (8 в core) | Утверждение сильнее реализации |
| `docs/content/mutators.md:41` | `owned` — «Has the same effect as a mutant that Mootant makes instead» | `O1` для констант `&&`/`\|\|`-групп (728 в core, 159 в perfectionist) — не тот же эффект, а поглощение drop'ами; `O19` для удаления then-ветки при условии с эффектом — не тот же эффект (BUG-302) | Категория неточна; для `O19` — ложный пропуск без способа вернуть |
| `docs/content/mutators.md:40` | `timeout` — «Alters a value that decides whether a loop goes on» | `loop-advance` срабатывает на `items[i].render()`, `bytes.push(…text.slice(…))` (BUG-303); `loop-running` — на одном из нескольких выходов (BUG-310) | Утверждение не выполняется |
| `docs/content/mutators.md:38` | `equivalent` — «Can't alter what the code does, apart from details such as `undefined` for `null`» | `canonical-falsy-default` для чисел меняет результат на `NaN` (BUG-307; в таблице logical-operator — «`NaN` aside»); `numeric-identity` для `+` со строкой (BUG-308); `tail-return` для `return null` наблюдаем через `toBeNull()`, а того же рода `tail-return-false` — `noise` | `NaN` — не «деталь» для кода `x / y \|\| 0` |
| `docs/content/mutators.md:63-64`, `statement-removal.md:222`, `return-value.md:182`, `array-element.md:146` | `subsumed`/`solitary`/`R4`/`R6` возвращаются, «when the other mutant doesn't run» | С `--since` владелец на неизменённой строке не запускается, а пропуск не возвращается (BUG-305) | Обещание нарушено в CI-режиме |
| `docs/content/mutators.md:48-52` | Эвристические правила помечены `"heuristic": true`; `solitary` — «likely, not certain» | `O19`, `R4`, `R6`, `loop-advance`, `loop-running`, `tail-return` помечены `heuristic: false`, но опираются на допущения (нет эффекта в условии, переменная читается один раз, вызов метода = продвижение, один выход из цикла, `null` ≈ `undefined`) | Флаг занижает долю догадок: в core у этих шести правил 1 833 пропуска с `heuristic: false` (`O19` 925, `R6` 362, `R4` 191, `loop-advance` 165, `loop-running` 131, `tail-return` 59) |
| `docs/content/mutators/string-literal.md:35-37` | Пропуск строк JSX-атрибутов показан на `className="badge"` | Пропускаются все атрибуты, включая `type`, `href`, `aria-*` (BUG-309) | Документация описывает безобидную часть правила |
| `docs/content/mutators/return-value.md:84-94` | Пропуск возвращаемой локальной переменной — догадка; пример отказа — пустой список | Более частый отказ — переменная читается не только в `return` (BUG-301, BUG-304) — не описан | Дополнить |
| Комментарии кода | Правила ссылаются на «catalog 2.6», «catalog 4.6, rule 3», «5.2 O19» | Каталога в репозитории нет | Обоснования правил нельзя проверить по первоисточнику |
| `docs/content/guide/configuration.mdx:268-278` | `strict` возвращает `timeout` и coarse-мутантов | Остальные пропуски (`owned`, большинство `subsumed`, `equivalent`, `noise`) не возвращает ничто; опции для отдельного правила нет | Нет режима «без пропусков» для аудита |
| `mootant run` (текст и `--json`) | — | В отчёте `run` нет числа пропущенных кандидатов (`summary` без `skippedByCategory`, есть только у `list`) | Пользователь не видит, сколько решили эвристики |

## Что выдержало проверку

- **Прозрачность.** `list --skipped --json` отдаёт для каждого пропуска
  правило, категорию, причину, флаг `heuristic` и владельца (`by` с id, если
  владелец — выдаваемый мутант). Без этого эксперимент «unskip» и вся эта
  оценка были бы невозможны. Все 95 правил описаны в таблицах skipped changes
  страниц мутаторов, категории в документации совпадают с
  `core/skips/skip-rules.ts` (проверено скриптом: 95/95, расхождений 0).
- **Большая доля пропусков тривиально корректна**: дают тот же файл, что
  выдаваемый мутант (`analysis/tools/skips/classify_owners.py`): core 2 394 из
  16 195 (O1 — 1 793 из 2 527, O19 — 477 из 925, `shifted-literal` — 83 из 83,
  `solitary` — 39), perfectionist 744 из 4 966.
- **Логика сравнений и полярности** (`get-comparison-plan.ts`,
  `has-polar-mutant.ts`, `get-toward-mutant.ts`) — по сути минимальное
  достаточное множество мутантов отношений с явными областями `lt/eq/gt` и
  значением в области. `R2`, `comparison-region`, `O4` (через выдаваемые
  константы и через `O3`), `shifted-literal`, `one-way-counter`, `min-max-idiom`
  проверены разбором и пробами — контрпримеров в булевой логике нет;
  неточности только там, где ломаются внешние допущения (эффекты условия,
  `NaN`, отбор `--since`).
- **Продуманные исключения**: удаление простого присваивания не `solitary`
  (`core/mutators/statement-removal.ts:458-476`: «a mutant of the assigned
  value only shows that the value is observed»); `optional-chaining` не
  считается для `solitary` (`core/mutators/optional-chaining.ts:104`: его
  убивает исключение); `settled-value` не верит типу по имени метода
  (`core/mutators/missing-await.ts:352-357`); `typeof`-сравнения не доверяют
  значению по умолчанию параметра; нижние границы — неподвижная точка по всем
  записям, `size` только у доказанных `Map`/`Set`.
- **Опции, возвращающие спорные пропуски**: `timeouts`, `coarseMutants`,
  `loggers`, `caseTests`, `nullishSwap`, `nullishNormalization`; `strict`
  включает первые две.

## Предложения

Каждое — какую проблему решает, чем подтверждена, польза, риск, как проверить.

1. **Пропуск с владельцем действует, только если владелец запускается в этом
   прогоне** (исправление BUG-305). Проблема: `--since` теряет мутантов
   изменённых строк. Подтверждение: фикстура `fx-since`, 357 строк core и 268
   perfectionist с риском «ноль мутантов». Польза: CI на PR перестаёт молча
   пропускать правки внутри `if`/`return`. Риск: id и состав мутантов без
   `--since` не должны меняться — передавать отобранные строки в
   `runs()`/`countsFor` только при отборе. Проверка: `BUG-305.test.ts` и
   тест «без `--since` список и id те же».
2. **Режим аудита пропусков** (`mootant run --audit-skips` или
   `settings.skips: 'audit'`): вернуть все пропущенные кандидаты (кроме
   `invalid`) как мутанты с пометкой правила и вывести отдельно «пропущено, но
   выжило при убитом владельце» по правилам. Проблема: сейчас нельзя измерить,
   сколько правил ошибается на своём проекте; `strict` возвращает только
   `timeout` и coarse-мутантов. Подтверждение: прототип —
   `analysis/experiments/skips-unskip.diff` (~300 строк, без изменения
   поведения по умолчанию), на нём получены цифры этого отчёта. Польза:
   мейнтейнер и пользователь видят цену каждой эвристики на реальных тестах,
   правила можно калибровать данными. Риск: прогон дороже примерно вдвое —
   режим только по запросу. Проверка: на фикстуре `fx1` прототип помечает
   `HIDDEN` все пропуски BUG-300…BUG-304, BUG-306, BUG-310 и ещё два ожидаемых
   (текст сообщения об ошибке — честный шум; `i != items.length` при шаге 1 —
   эквивалентный мутант), а выжившие под `equivalent`-правилами (BUG-307)
   показывает отдельно — их надо смотреть глазами.
3. **Отключение отдельного правила** (`settings.skipRules: { solitary: false,
   'jsx-attribute': false }`). Проблема: у части правил нет «ручки» (`O19`,
   `R6`, `jsx-attribute`, `canonical-falsy-default`, `error-message`), даже
   `strict` их не возвращает (проверено). Польза: пользователь с React,
   кодами ошибок или числовыми защитами от `NaN` может вернуть нужное. Риск:
   рост конфигурации; `owned`-правила при отключении дадут дубли — это честно.
   Проверка: тест на каждое правило «выключено → кандидат стал мутантом».
4. **Показывать пропуски в отчёте `run`**: строка `skipped 812: 410 subsumed
   (290 heuristic), …` и `summary.skippedByCategory`/`skippedHeuristic` в
   `--json` (сейчас только у `list`). Проблема: 100 % у пользователя не
   говорит, сколько поведения решено догадкой. Риск: шум в выводе — одна
   строка. Проверка: снапшот вывода CLI.
5. **Точечные исправления правил**: BUG-300 (строковый мутант элемента не
   считается для удаления элемента), BUG-301/BUG-304 (локальная переменная —
   только при единственном чтении), BUG-302 (условие без эффекта), BUG-303
   (вызов на самом имени, а не на элементе), BUG-307 (`|| 0` у числа, которое
   может быть `NaN`), BUG-310 (единственный выход). У каждого — падающий тест
   в `experiment/bug-repros` и промпт в `analysis/bug-prompts/`.
6. **Честные категории и флаги**: `tail-return` для `return null` → `noise`
   (как `tail-return-false`); константы `&&`/`||`-групп у `O1` → `subsumed`;
   `O4` с поглотителем `loop-running` → `timeout` (и возврат по `timeouts`);
   `heuristic: true` для правил, которые опираются на допущения (`O19`/`R4`
   об эффектах условия, `R6` о единственном чтении, `loop-advance`,
   `loop-running`). Польза: `--json` перестаёт занижать долю догадок. Риск:
   меняется поле `heuristic` в отчётах — это часть формата, отметить в
   changelog.
7. **Положить каталог правил в репозиторий** (на него ссылаются JSDoc:
   «catalog 2.6», «4.6 rule 3», «5.2 O19»): без него обоснование правила не
   проверить, а добавление правила требует знания, которого нет в коде.

