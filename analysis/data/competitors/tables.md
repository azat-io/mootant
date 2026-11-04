## Мутанты и статусы (прогон 1; детерминизм — по 3 прогонам)

| проект | Mootant: мутантов | Killed | Timeout | Survived | NoCoverage | score | Stryker: мутантов | Killed | Timeout | Survived | NoCoverage | Runtime/CompileError | score | разных вердиктов в 3 прогонах (M / S) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| perfectionist | 314 | 259 | 2 | 47 | 6 | 83 % | 380 | 324 | 2 | 43 | 10 | 1 | 86 % | 0 / 1 |
| path-to-regexp | 342 | 307 | 3 | 29 | 3 | 91 % | 509 | 462 | 19 | 24 | 4 | 0 | 94 % | 0 / 0 |
| cheerio | 496 | 404 | 4 | 86 | 2 | 82 % | 828 | 733 | 11 | 80 | 4 | 0 | 90 % | 0 / 0 |
| fast-json-stringify | 308 | 240 | 0 | 68 | 0 | 78 % | 394 | 336 | 1 | 57 | 0 | 0 | 86 % | 0 / 3 |

## Мутаторы (все проекты; в скобках — Survived + NoCoverage)

mootant: comparison-operator 340 (67), string-literal 198 (39), condition 177 (16), logical-operator 176 (40), statement-removal 116 (11), return-value 85 (0), number-literal 73 (11), object-property 72 (8), arithmetic-operator 39 (5), boolean-literal 37 (14), regex-pattern 32 (10), method-call 29 (6), array-element 25 (3), unary-operator 21 (1), assignment-operator 16 (6), update-operator 11 (0), regex-flag 8 (4), optional-chaining 5 (0)

stryker: ConditionalExpression 662 (77), StringLiteral 347 (53), BlockStatement 339 (8), EqualityOperator 254 (22), BooleanLiteral 89 (14), LogicalOperator 86 (11), ObjectLiteral 47 (4), CallExpression 46 (7), Regex 43 (9), AssignmentOperator 33 (1), ArrayDeclaration 32 (3), ArrowFunction 30 (1), MethodExpression 29 (6), UpdateOperator 26 (0), ArithmeticOperator 22 (5), UnaryOperator 21 (1), OptionalChaining 5 (0)

## Сопоставление мутантов Stryker с Mootant

| проект | Stryker | двойник среди мутантов Mootant: точно | приближённо | только среди пропусков Mootant: точно | приближённо | нет у Mootant | мутантов Mootant с двойником у Stryker | неуверенных пар |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| perfectionist | 380 | 130 (34 %) | 27 | 75 (20 %) | 4 | 144 (38 %) | 152 из 314 (48 %) | 31 из 236 (13 %) |
| path-to-regexp | 509 | 191 (38 %) | 27 | 129 (25 %) | 0 | 162 (32 %) | 218 из 342 (64 %) | 27 из 347 (8 %) |
| cheerio | 828 | 286 (35 %) | 28 | 191 (23 %) | 13 | 310 (37 %) | 309 из 496 (62 %) | 41 из 518 (8 %) |
| fast-json-stringify | 394 | 147 (37 %) | 18 | 77 (20 %) | 4 | 148 (38 %) | 161 из 308 (52 %) | 22 из 246 (9 %) |

приближённые правила: {"unary-plus":21,"filler-string":42,"empty-body-undefined":33,"arrow-undefined":13,"filler-array":12}
нет у Mootant, по мутаторам Stryker: BlockStatement 217, EqualityOperator 208, ConditionalExpression 91, LogicalOperator 86, BooleanLiteral 48, ObjectLiteral 40, Regex 29, ArrowFunction 16, StringLiteral 10, AssignmentOperator 8, ArithmeticOperator 6, ArrayDeclaration 5

## Полезные мутанты Stryker (Survived + NoCoverage): классы

| проект | Stryker useful | (а) есть у Mootant | из них у Mootant тоже useful | (б) Mootant пропустил | из них владелец Mootant выжил | (в) Mootant не создаёт | из них внутри выживает мутант Mootant |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| perfectionist | 53 | 37 | 37 | 9 | 7 | 7 | 6 |
| path-to-regexp | 28 | 20 | 20 | 7 | 5 | 1 | 1 |
| cheerio | 84 | 49 | 49 | 20 | 19 | 15 | 14 |
| fast-json-stringify | 57 | 29 | 27 | 12 | 8 | 16 | 14 |

(б) по правилам (* — эвристика): O3 16, O4 9, O19 5, O1 5, comparison-region 4, solitary* 3, error-message* 3, tail-return-false 1, case-label 1, O8* 1
(в) по мутаторам Stryker: ConditionalExpression 14, LogicalOperator 11, Regex 4, EqualityOperator 3, ObjectLiteral 2, BlockStatement 2, AssignmentOperator 1, ArrowFunction 1, ArrayDeclaration 1

## Ручной разбор: Stryker (б) и (в)

| проект | класс | разобрано | эквивалентен | шум | тот же пробел виден | потерян |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cheerio | (б) | 20 | 8 | 1 | 11 | 0 |
| cheerio | (в) | 15 | 3 | 0 | 11 | 1 |
| fast-json-stringify | (б) | 12 | 8 | 0 | 4 | 0 |
| fast-json-stringify | (в) | 16 | 8 | 0 | 6 | 2 |
| path-to-regexp | (б) | 7 | 1 | 2 | 4 | 0 |
| path-to-regexp | (в) | 1 | 0 | 0 | 1 | 0 |
| perfectionist | (б) | 9 | 4 | 0 | 5 | 0 |
| perfectionist | (в) | 7 | 2 | 1 | 4 | 0 |

всего: 87; equivalent 34, noise 4, same-gap 46, lost 3; в выборке: equivalent 10, noise 3, same-gap 16, lost 1

## Ручной разбор: только у Mootant

| проект | Mootant-only useful | разобрано | useful | equivalent | noise |
| --- | ---: | ---: | ---: | ---: | ---: |
| perfectionist | 19 | 19 | 6 | 12 | 1 |
| path-to-regexp | 12 | 12 | 7 | 4 | 1 |
| cheerio | 39 | 39 | 23 | 16 | 0 |
| fast-json-stringify | 41 | 4 | 2 | 2 | 0 |

по мутаторам: object-property 1/2/0, logical-operator 18/12/0, comparison-operator 6/8/1, assignment-operator 3/3/0, number-literal 1/6/1, condition 1/1/0, statement-removal 1/2/0, regex-pattern 3/0/0, string-literal 1/0/0, regex-flag 3/0/0 (useful/equivalent/noise)
Mootant-only useful по мутаторам (все): logical-operator 38, comparison-operator 29, number-literal 11, object-property 8, assignment-operator 6, statement-removal 5, regex-pattern 5, condition 4, regex-flag 4, string-literal 1

## Время (hyperfine, 3 прогона)

| проект | Mootant, с (mean ± σ) | Stryker, с (mean ± σ) | M / S | CPU M, с | CPU S, с | с/мутант M | с/мутант S | с/useful M | с/useful S |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| perfectionist | 952,5 ± 40,7 | 661,1 ± 5,0 | 1,44 | 2450 | 1788 | 3,03 | 1,74 | 17,97 | 12,47 |
| path-to-regexp | 93,9 ± 1,5 | 76,9 ± 0,6 | 1,22 | 179 | 239 | 0,27 | 0,15 | 2,93 | 2,75 |
| cheerio | 164,3 ± 1,8 | 158,4 ± 9,9 | 1,04 | 365 | 483 | 0,33 | 0,19 | 1,87 | 1,89 |
| fast-json-stringify | 402,3 ± 9,1 | 248,2 ± 4,8 | 1,62 | 898 | 755 | 1,31 | 0,63 | 5,92 | 4,35 |

фазы Mootant (run 1, с): perfectionist: startup 0,8, dry 48,4, isolated 863,3, total 912,5, раундов 6; path-to-regexp: startup 0,5, dry 0,8, isolated 89,5, total 90,7, раундов 1; cheerio: startup 0,5, dry 2,7, isolated 161,7, total 164,8, раундов 5; fast-json-stringify: startup 0,3, dry 6,8, isolated 384,4, total 391,5, раундов 7
фазы Stryker (run 1, с): perfectionist: setup 3, initial 108, mutation 549; path-to-regexp: setup 2, initial 1, mutation 71; cheerio: setup 2, initial 6, mutation 158; fast-json-stringify: setup 1, initial 14, mutation 236
стоимость юнитов Mootant по статусам (run 1): perfectionist: Killed 259 мут., 285 юн., 351 с; Survived 47 мут., 289 юн., 1221 с; Timeout 2 мут., 18 юн., 151 с | path-to-regexp: Killed 307 мут., 307 юн., 64 с; Timeout 3 мут., 3 юн., 8 с; Survived 29 мут., 29 юн., 10 с | cheerio: Killed 404 мут., 408 юн., 111 с; Survived 86 мут., 247 юн., 78 с; Timeout 4 мут., 4 юн., 2 с | fast-json-stringify: нет трассы (node:test)

## Выборка: Stryker (б) и (в)

| # | проект | место | мутация Stryker | что сделал Mootant | вердикт | обоснование |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | perfectionist | `rules/sort-switch-case/build-case-block-comparator-by-options-computer.ts:35` | BlockStatement #10: `{ return -1 }` → `{}` | пропустил: `owned/O19` | тот же пробел виден | Ветка `if (b === lastBlockToKeepInPlace) { return -1 }` не исполняется ни одним тестом и помечена авторами `/* v8 ignore if */`. Mootant показывает это двумя NoCoverage-мутантами `-1` внутри блока; удаление `return -1` у него `owned` (O19) мутантом `if (false)`. |
| 2 | perfectionist | `rules/sort-switch-case/is-condition-expression.ts:21` | ConditionalExpression #22: `case AST_NODE_TYPES.UnaryExpression: re…` → `case AST_NODE_TYPES.UnaryEx…` | не создаёт | тот же пробел виден | Опустошённый `case UnaryExpression:` проваливается в `case Literal:` и для `!x` даёт `false` — то же поведение, что у выжившего Mootant `node.operator === '!'` → `false`. Тест: `switch (!a) { case b: f(); break; case a: g() } не сортируется (нет ошибки)` |
| 3 | perfectionist | `rules/sort-switch-case/is-condition-expression.ts:22` | StringLiteral #26: `'!'` → `""` | пропустил: `subsumed/O4` | тот же пробел виден | `node.operator === ''` всегда ложно, то есть совпадает с выжившим владельцем `node.operator === '!'` → `false` (правило O4). |
| 4 | perfectionist | `rules/sort-switch-case/is-condition-expression.ts:25` | ConditionalExpression #32: `default: return false` → `default:` | пропустил: `noise/tail-return-false` | эквивалентен | Без `return false` функция возвращает `undefined`. Оба вызова (`rules/sort-switch-case.ts:67,70`) используют результат только в `\|\|`/`&&`, поэтому для правила мутант эквивалентен. Убить его может только юнит-тест хелпера с `toBe(false)`, которого в проекте нет. Mootant: `noise/tail-return-false`. |
| 5 | perfectionist | `rules/sort-switch-case.ts:39` | ObjectLiteral #36: `{ type: 'unsorted' }` → `{}` | пропустил: `subsumed/solitary*` | эквивалентен | `computeComparators` строит запасной компаратор из `{ ...options, ...options.fallbackSort }` (`utils/compare/compute-comparators.ts:34-37`). С `fallbackSort: {}` это тот же компаратор, что основной: он возвращает 0 там же, где основной. Mootant пропустил по `solitary` (владелец `'unsorted'` → `''` убит падением «Unreachable case»): итог верный, причина в отчёте — нет. |
| 6 | perfectionist | `rules/sort-switch-case.ts:94` | ConditionalExpression #82: `index !== switchNode.cases.length - 1` → `true` | пропустил: `owned/O3` | эквивалентен | `index` в `reduce` не больше `cases.length - 1`. С `true` после последнего `case` добавляется пустая группа, на которой `sortNodes`, `some` и `pairwise` ничего не делают. Эквивалентны и три выживших Mootant на этом условии (`!==` → `<`, `- 1` → `+ 1`, отбрасывание правого операнда): здесь шум у обоих инструментов. |
| 7 | perfectionist | `utils/compare/build-subgroup-order-comparator.ts:23` | LogicalOperator #263: `!subgroupContainingA \|\| !subgroupContai…` → `!subgroupContainingA && !su…` | не создаёт | эквивалентен | `!A && !B \|\| A !== B` ≡ `!A \|\| !B \|\| A !== B`: если `null` ровно один из двух, неравенство даёт тот же `return 0`. Эквивалентны и два выживших Mootant, отбрасывающих `!A` или `!B`: шум у обоих инструментов. |
| 8 | path-to-regexp | `src/index.ts:270` | StringLiteral #161: `", "` → `""` | пропустил: `noise/error-message*` | шум | Разделитель в тексте ошибки `Missing parameters: ${missing.join(", ")}`; Mootant: `noise/error-message` (эвристика). Тест проекта проверяет сообщение только с одним пропущенным параметром. Граничный случай: формат сообщения с несколькими параметрами — часть поведения, но не логики. Тест: `expect(() => compile('/:a/:b')({})).toThrow('Missing parameters: a, b')` |
| 9 | path-to-regexp | `src/index.ts:333` | BlockStatement #201: `{ missing.push(token.name); return ""; }` → `{}` | не создаёт | тот же пробел виден | Без блока `{ missing.push(...); return "" }` пустой wildcard падает дальше на `!Array.isArray(value)` с другим TypeError — то же поведение, что у выжившего Mootant `value == null` → `false` (стр. 333). Тест: `expect(() => compile('/*path')({})).toThrow(new TypeError('Missing parameters: path'))` |
| 10 | path-to-regexp | `src/index.ts:368` | ConditionalExpression #248: `typeof value !== "string"` → `false` | пропустил: `owned/O3` | тот же пробел виден | `typeof value !== "string"` → `false` ≡ отбрасывание левого операнда; этот мутант Mootant (`value.length === 0`) выжил (O3). Нестроковое значение параметра проходит и кодируется. Тест: `expect(() => compile('/:id')({ id: 123 })).toThrow(TypeError)` |
| 11 | path-to-regexp | `src/index.ts:599` | StringLiteral #435: `ˋUnknown token type: ${(token as any).t…` → `ˋˋ` | пропустил: `noise/error-message*` | шум | Текст ошибки в недостижимой защитной ветке `throw new TypeError(`Unknown token type: …`)` (NoCoverage у обоих); Mootant: `noise/error-message`. |
| 12 | path-to-regexp | `src/index.ts:616` | ConditionalExpression #455: `b.length > 1` → `false` | пропустил: `subsumed/comparison-region` | тот же пробел виден | `b.length > 1` → `false` в `negate`: на той же границе выживают мутанты Mootant `>= 1` и `> 2`, а строка 616 у обоих инструментов NoCoverage (`comparison-region`). |
| 13 | path-to-regexp | `src/index.ts:616` | StringLiteral #458: `ˋ(?:(?!${escape(a)}\|${escape(b)})[^])ˋ` → `ˋˋ` | пропустил: `subsumed/solitary*` | тот же пробел виден | Шаблон на строке 616 не исполняется ни одним тестом; Mootant показывает это своим NoCoverage-мутантом того же шаблона (`solitary`, владелец NoCoverage). |
| 14 | path-to-regexp | `src/index.ts:617` | ConditionalExpression #459: `a.length > 1` → `true` | пропустил: `subsumed/comparison-region` | тот же пробел виден | `a.length > 1` → `true`: на той же границе выживают три мутанта Mootant (`>= 1`, `!= 1`, `> 2`). |
| 15 | cheerio | `src/api/attributes.ts:218` | StringLiteral #130: `'Bad combination of arguments.'` → `""` | пропустил: `noise/error-message*` | шум | Текст ошибки `'Bad combination of arguments.'` (NoCoverage); Mootant: `noise/error-message`. Сам пробел (нет теста на неверные аргументы) виден через выжившего владельца соседнего `{ throw … }`. |
| 16 | cheerio | `src/api/attributes.ts:79` | ConditionalExpression #60: `elem.name === 'input'` → `true` | пропустил: `owned/O3` | тот же пробел виден | `elem.name === 'input'` → `true` ≡ отбрасывание левого операнда; этот мутант Mootant выжил (O3). Не-`input` с `type="checkbox"` без `value` получит `'on'`. Тест: `expect($('<div type="checkbox">').attr('value')).toBeUndefined()` |
| 17 | cheerio | `src/api/attributes.ts:457` | LogicalOperator #233: `typeof URL !== 'undefined' && (name ===…` → `typeof URL !== 'undefined' …` | не создаёт | тот же пробел виден | `typeof URL !== 'undefined' \|\| …` всегда `true` (`URL` определён) — то же поведение, что у выжившего Mootant `4bb49tq0f2t9` (отброшена проверка тега). Тест: `с baseURI: expect($('<div href="x">').prop('href')).toBe('x')` |
| 18 | cheerio | `src/api/attributes.ts:551` | ConditionalExpression #310: `typeof name === 'string' && value !== u…` → `true` | пропустил: `owned/O1` | эквивалентен | `setData` вызывается только из `data()` (`attributes.ts:724-725`), где строковое имя проходит лишь при `value !== undefined` (стр. 721), поэтому условие на стр. 551 всегда истинно. Эквивалентны и два выживших Mootant (отбрасывание любого операнда) — шум у обоих. |
| 19 | cheerio | `src/api/attributes.ts:798` | StringLiteral #426: `'object'` → `""` | пропустил: `subsumed/O4` | тот же пробел виден | `typeof value === ''` → условие `… && false` ≡ `false`; этот мутант Mootant (`7m8ehjrsrqdr`, вся группа → `false`) выжил: для `<select>` без `multiple` массив значений не игнорируется. Тест: `expect($('<select><option selected>a</option><option>b</option></select>').val(['b']).val()).toBe('a')` |
| 20 | cheerio | `src/api/attributes.ts:798` | BlockStatement #427: `{ return this; }` → `{}` | пропустил: `owned/O19` | тот же пробел виден | Удаление `{ return this }` ≡ `if (false)`; выживший мутант Mootant `7m8ehjrsrqdr` (O19) — то же поведение. |
| 21 | cheerio | `src/api/attributes.ts:849` | ConditionalExpression #459: `elem.attribs && Object.hasOwn(elem.attr…` → `true` | не создаёт | эквивалентен | То же условие → `true`: без раннего выхода `delete` несуществующего свойства ничего не меняет (см. S#458). |
| 22 | cheerio | `src/api/attributes.ts:13` | Regex #0: `/\s+/` → `/\s/` | не создаёт | **потерян** | `rspace = /\s+/` → `/\s/`: `addClass('a  b')` даёт `class="a  b"` (пустое имя между пробелами), то же в `toggleClass`. Ни один выживший Mootant на это не указывает: удаление квантификатора есть только в `strict` (`regex-pattern`, опция `quantifiers`), а в `recommended` единственный мутант этой регулярки (`\s` → `[^]`) убит. Тест: `expect($('<div>').addClass('a  b').attr('class')).toBe('a b')` |
| 23 | fast-json-stringify | `lib/location.js:13` | Regex #3: `/[~/]/` → `/[^~/]/` | не создаёт | тот же пробел виден | `/[~/]/` → `/[^~/]/`: имя свойства из одних `~` и `/` перестаёт экранироваться в JSON pointer. На этой же строке выживают пять мутантов Mootant: `/[~/]/.test(name)` → `false`, флаги `g`, `'~0'`/`'~1'` → `''`. Экранирование имён в указателе не проверено. Тест с именем `/` убивает и этого мутанта, тест с `a/b` — только мутантов Mootant. Тест: `схема с anyOf и свойством '/', сериализация через ссылку на это свойство` |
| 24 | fast-json-stringify | `lib/serializer.js:29` | ConditionalExpression #48: `point < 32 \|\| (point >= 0xD800 && point…` → `true` | пропустил: `owned/O1` | эквивалентен | Условие выхода из цикла → `true`: на любом символе, кроме `"` и `\`, функция отдаёт `JSON.stringify(str)` — эталонный результат. Меняется только скорость. |
| 25 | fast-json-stringify | `lib/serializer.js:64` | BlockStatement #105: `{ return '' + i }` → `{}` | не создаёт | эквивалентен | Без `{ return '' + i }` целое идёт через `Math.trunc` (или другое округление), проверку на `Infinity`/`NaN` и тот же `'' + integer`; для целых `trunc(i) === i`, `-0` и там и там печатается как `0`. Эквивалентен и выживший Mootant `Number.isInteger(i)` → `false`. |
| 26 | fast-json-stringify | `lib/serializer.js:55` | StringLiteral #100: `'trunc'` → `""` | пропустил: `noise/case-label` | эквивалентен | `case 'trunc':` стоит прямо перед `default:` с тем же телом: `case ''` проваливается туда же. Mootant: `noise/case-label`. |
| 27 | fast-json-stringify | `lib/serializer.js:149` | StringLiteral #230: `'string'` → `""` | пропустил: `subsumed/O4` | эквивалентен | `typeof value !== ''` всегда истинно: медленный путь с первого элемента даёт тот же результат. Эквивалентен и выживший владелец Mootant (`… !== 'string'` → `true`, O4) — шум у обоих. |
| 28 | fast-json-stringify | `lib/validator.js:49` | LogicalOperator #327: `ajvOptions \|\| {}` → `ajvOptions && {}` | не создаёт | тот же пробел виден | `ajvOptions && {}` даёт `{}` при заданных опциях — то же поведение, что у выжившего Mootant с отброшенным левым операндом. |
| 29 | fast-json-stringify | `lib/validator.js:60` | ConditionalExpression #347: `this.ajv.schemas[schemaKey] === undefin…` → `true` | пропустил: `owned/O3` | тот же пробел виден | `schemas[key] === undefined` → `true` ≡ отбрасывание правого операнда; этот мутант Mootant выжил (O3). |
| 30 | fast-json-stringify | `lib/validator.js:99` | StringLiteral #376: `'object'` → `""` | пропустил: `owned/O8*` | тот же пробел виден | `includes('object')` → `includes('')` всегда `false` для массива типов, то есть `!…` → `true`; это отбрасывание третьего операнда, и этот мутант Mootant (`w5mxm613rcwg`) выжил. Mootant пропустил по эвристике O8 («пустой ключ поиска делает проверку константой»), и здесь она верна. |

## Выборка: только у Mootant

| # | проект | место | мутатор: мутация | выживший Stryker в том же месте | вердикт | обоснование |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | perfectionist | `rules/sort-switch-case.ts:94` | comparison-operator: `index !== switchNode.cases.length - 1` → `index < switchNode.cases.le…` | #82 ConditionalExpression:Survived, #84 ArithmeticOperator:Survived | эквивалентен | `index !== cases.length - 1` → `index < cases.length - 1`: индекс `reduce` никогда не больше `length - 1`. |
| 2 | perfectionist | `utils/compare/build-subgroup-order-comparator.ts:23` | logical-operator: `!subgroupContainingA \|\| !subgroupContai…` → `!subgroupContainingA \|\| !su…` | #263 LogicalOperator:Survived, #266 ConditionalExpression:Survived | эквивалентен | Отброшен `subgroupContainingA !== subgroupContainingB`: внутри одной группы обе подгруппы — один массив (см. S#266). |
| 3 | perfectionist | `utils/compare/compare-naturally.ts:45` | object-property: `{ specialCharacters, ignoreCase, }` → `{ specialCharacters, }` | — | полезен | Из форматтера `compareNaturally` удалено свойство `ignoreCase`: натуральная сортировка становится чувствительной к регистру для строк, которые отличаются только регистром. Ни один тест `natural` + `ignoreCase` это не проверяет; у Stryker здесь только `{}` (убит падением). Тест: `type: 'natural', ignoreCase: true: case 'a' и case 'A' в обоих порядках — без ошибки` |
| 4 | path-to-regexp | `src/index.ts:5` | regex-pattern: `/^[$_\p{ID_Start}][$\u200c\u200d\p{ID_C…` → `/^[$_\p{ID_Start}][$\u200c\…` | — | полезен | `ID` с `*` → `+`: однобуквенное имя параметра перестаёт быть идентификатором, и `stringify` берёт его в кавычки. Регулярка `ID` используется только в `stringifyName` (стр. 677); у Stryker все её мутанты убиты. Тест: `expect(stringify(parse('/:a'))).toBe('/:a')` |
| 5 | path-to-regexp | `src/index.ts:338` | logical-operator: `!Array.isArray(value) \|\| value.length =…` → `!Array.isArray(value)` | #208 ConditionalExpression:Survived | эквивалентен | Отброшен `value.length === 0`: пустой массив всё равно даёт ту же ошибку на стр. 353-355 (см. Stryker S#208, тоже выжил). |
| 6 | path-to-regexp | `src/index.ts:460` | comparison-operator: `combinations >= 256` → `combinations == 256` | #303 EqualityOperator:Survived | эквивалентен | `combinations >= 256` → `== 256`: счётчик растёт на 1 (стр. 472), и при 256 бросается ошибка, так что больше 256 он не бывает. |
| 7 | path-to-regexp | `src/index.ts:666` | regex-flag: `/["\\]/g` → `/["\\]/` | — | полезен | Флаг `g` в `quoteName`: экранируется только первая кавычка или обратная косая черта в имени. Тест: `expect(stringify({ tokens: [{ type: 'param', name: 'a"b"c' }] })).toBe(':"a\\"b\\"c"')` |
| 8 | cheerio | `src/api/attributes.ts:20` | regex-pattern: `/^{[\s\S]*}$\|^\[[\s\S]*]$/` → `/^{[\s\S]*}$\|^\[[\s\S]+]$/` | #5 Regex:Survived, #6 Regex:Survived, #11 Regex:Survived, #12 Regex:Survived | полезен | `rbrace` `^\[[\s\S]*]$` → `+`: строка `"[]"` в `data-*` перестаёт разбираться как JSON-массив. У Stryker в этой регулярке тоже есть выжившие (S#5, S#6). Тест: `expect($('<div data-x="[]">').data('x')).toEqual([])` |
| 9 | cheerio | `src/api/attributes.ts:1137` | number-literal: `1` → `2` | — | эквивалентен | `stateVal ? 1 : -1` → `2`: `state` сравнивается только с нулём (`state >= 0`, `state <= 0`, стр. 1153, 1155). |
| 10 | cheerio | `src/api/css.ts:210` | comparison-operator: `trimmed.length > 0` → `trimmed.length > 1` | — | полезен | `trimmed.length > 0` → `> 1` в разборе `style`: односимвольный хвост после `;` без `:` (например, `font-family: a;b`) теряется вместо того, чтобы дописаться к значению. Граничный случай разбора, тестов на него нет. Тест: `expect($('<div style="font-family: a;b">').css('font-family')).toBe('a;b')` |
| 11 | cheerio | `src/api/attributes.ts:735` | assignment-operator: `dataEl.data ??= {}` → `dataEl.data` | — | эквивалентен | `dataEl.data ??= {}` в `data()` избыточен: `readData` и `readAllData` сами делают `el.data ??= {}` (стр. 566, 594). |
| 12 | fast-json-stringify | `lib/location.js:13` | regex-flag: `/~/g` → `/~/` | — | полезен | Без флага `g` в `name.replace(/~/g, '~0')` экранируется только первая `~` в имени свойства, и JSON pointer для `a~b~c` неверный. У Stryker на этом месте выживших нет. Тот же случай для `/` (`/\//g`, `ash0m3fgpa66`) тоже выжил. Тест: `схема с anyOf и свойством 'a~b~c'` |
| 13 | fast-json-stringify | `lib/serializer.js:18` | number-literal: `-1` → `0` | — | эквивалентен | `let last = -1` → `0`: при первой кавычке `last === -1 && (last = 0)` и так ставит 0, а без кавычек `'"' + result + str.slice(0) + '"'` даёт ту же строку, что и ветка `last === -1`. |
| 14 | fast-json-stringify | `lib/validator.js:94` | statement-removal: `schema.fjs_type = 'string'` → `;` | #365 StringLiteral:Survived | полезен | Удалено `schema.fjs_type = 'string'` для `type: 'string'`: схема получает тип `['string', 'object']` без проверки `toJSON`, и в `anyOf` строковая ветка начинает принимать обычные объекты. Такое же удаление для массива типов (стр. 101) тесты убивают. У Stryker на этой строке выжил только `'string'` → `''` (#365), и он, вероятно, эквивалентен: код ключевого слова `fjs_type` (`validator.js:38-46`) значение не читает. Тест: `anyOf: [{ type: 'string' }, { type: 'object', properties: { a: { type: 'number' } } }]: expect(stringify({ a: 1 })).toBe('{"a":1}')` |
| 15 | fast-json-stringify | `lib/validator.js:23` | condition: `inlineValidators` → `true` | — | эквивалентен | `inlineValidators ? {code…} : {}` → `true`: ajv всегда хранит исходный код валидаторов (`source: true`, `esm: false` и так по умолчанию). Поведение то же, растёт только память. |

## Итоги по всем проектам

{"mootantMutants":1460,"strykerMutants":2111,"mootantUseful":241,"strykerUseful":222,"a":135,"aMootantUseful":133,"b":48,"c":39,"exact":1226,"approx":121,"unmatched":764,"mootantOnlyUseful":111,"mootantOnlyUsefulOverlap":68,"disagreements":3}
пропуски Mootant с двойником у Stryker (без дублей выданных мутантов): 507, из них у Stryker выжили 50
| правило (* — эвристика) | двойников у Stryker | из них дубли выданного мутанта | Killed/Timeout у Stryker | Survived/NoCoverage у Stryker |
| --- | ---: | ---: | ---: | ---: |
| owned/O1 | 299 | 226 | 68 | 5 |
| subsumed/O4 | 91 | 0 | 82 | 9 |
| owned/O3 | 66 | 0 | 50 | 16 |
| subsumed/solitary* | 58 | 0 | 55 | 3 |
| owned/O19 | 56 | 8 | 43 | 5 |
| noise/case-label | 31 | 0 | 30 | 1 |
| subsumed/comparison-region | 30 | 0 | 26 | 4 |
| timeout/loop-advance | 26 | 0 | 26 | 0 |
| noise/non-numeric-plus* | 25 | 0 | 25 | 0 |
| noise/error-message* | 21 | 0 | 18 | 3 |
| subsumed/R2 | 18 | 0 | 16 | 2 |
| subsumed/R4 | 11 | 0 | 11 | 0 |
| subsumed/R6 | 4 | 0 | 4 | 0 |
| owned/O8* | 2 | 0 | 1 | 1 |
| noise/tail-return-false | 1 | 0 | 0 | 1 |
| subsumed/R5 | 1 | 0 | 1 | 0 |
| timeout/loop-running* | 1 | 0 | 1 | 0 |
