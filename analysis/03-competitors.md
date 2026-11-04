# 3. Качество мутантов и сравнение с конкурентами

> Дата исследования: 2026-11-04. Mootant: коммит `170ec52`. Ссылки вида
> `path:строка` ведут в рабочую копию `/home/user/mootant`, которая вне
> `analysis/` совпадает с этим коммитом. StrykerJS:
> `stryker-mutator/stryker-js@8f24ef0` (2026-10-29), пакеты npm
> `@stryker-mutator/*@10.1.1`. Сравнение запусков на реальных проектах не
> входит в этот раздел, для него оставлен подраздел
> [«Эмпирическая проверка»](#эмпирическая-проверка).

## Кратко

1. **Мутаторы Mootant точнее, у Stryker они грубее.** Только у Mootant есть
   `number-literal`, `missing-await`, `return-value` с типизированными
   значениями, `regex-flag`, бинарные побитовые операторы, удаление одного
   элемента или свойства, замена `||` ↔ `??` и отбрасывание одной стороны
   `&&`/`||`/`??`. Сравнения у Mootant построены на «достаточном» наборе из
   исследований: `<` → `<=`, `!=`, `false`. В Stryker тот же набор предлагали
   в issue #4349, но оно закрыто ботом без реализации. Только у Stryker есть
   грубые мутаторы, которых Mootant избегает намеренно: `BlockStatement`,
   `ArrowFunction`, `ObjectLiteral → {}`, `&&` ↔ `||`, отрицание сравнения.
2. **Мутанты на одном и том же коде.** На 117 файлах `core/{text,regex,git,cache,run}`
   Stryker 10.1.1 создаёт 5168 мутантов, Mootant с пресетом `recommended` —
   4048, то есть на 22% меньше. Буквально совпадают только 1722 мутанта. Ещё
   3248 кандидатов Mootant рассмотрел и пропустил: 90% из них как избыточные
   (`subsumed` и `owned`) и лишь 2% как эквивалентные. 37% пропусков держатся
   на эвристике, самая крупная — `solitary` (1031 пропуск).
3. **Шум от типов не закрыт.** 29% мутантов Mootant на его собственном строго
   типизированном коде не проходят `tsc --strict`. На подвыборке, где
   сравнивались оба инструмента, доля такая: Mootant 25.3%, Stryker 33.2%. Для
   TypeScript-проектов это главный незакрытый источник шума. У Stryker для
   этого есть отдельный checker, и он дорогой: на самом Stryker он замедлял
   прогон «в 10 раз», пока не появилась группировка. Infection и mutmut
   проверяют типы только у выживших мутантов. Для Mootant это **must**.
4. **Изоляция static mutants.** Mootant решает их устройством запуска: мутант
   активен с загрузки модуля, тестовый файл целиком идёт в изолированном
   воркере. У Stryker для этого отдельная ветка: `ignoreStatic`, перезагрузка
   окружения и прогон всех тестов. Тесты Stryker выбирает по имени через regex
   (`testNamePattern`), и на Vitest 5 это сломалось. С выхода Vitest 5.0.0
   (2026-09-03) до Stryker 10.1.1 (2026-10-23) почти все покрытые мутанты
   получали Survived (issue #6210).
5. **Кэш Mootant по умолчанию строже инкрементального режима Stryker.** Он
   учитывает файлы и переменные окружения, которые прочитали тесты, lockfile
   и major-версию Node. Incremental у Stryker не видит изменений вне
   мутируемых и тестовых файлов.
6. **Установка.** В проект с Vitest Mootant добавляет 5 пакетов и 11.8 MB,
   Stryker — 168 пакетов и 61.5 MB. Холодная установка Mootant всё равно
   длится около 9 с: ~5 с уходит на метаданные optional peers. Подробно в
   [`data/install-size.md`](data/install-size.md).
7. **Главные пробелы Mootant:**
   - раннеры: только Vitest 5 и `node:test`, у Stryker их 7 плюс `command`;
   - нет интеграции с CI: аннотаций и сводки в PR;
   - нет файла подавлений;
   - нет фильтра по типам;
   - нет экспорта в общий формат отчёта (dashboard, SonarQube).
8. **Исследования в основном поддерживают философию Mootant.**
   - Google подавляет «arid»-узлы и показывает один мутант на строку. Доля
     непродуктивных мутантов упала у них с 85% до 11%.
   - Meta ACH генерирует LLM-тесты под мутантов и фильтрует эквивалентных
     мутантов LLM-детектором.
   - EMS (ISSTA 2024) статически подавляет эквивалентных мутантов до генерации.
     Это та же идея, что `core/skips`.
   - Достаточные операторы описаны у Kaminski–Ammann–Offutt и Just et al.

   Эвристику `solitary` исследования напрямую не подтверждают, и её
   надёжность нужно измерить.

## Содержание

1. [Методика и источники](#1-методика-и-источники)
2. [Мутаторы: StrykerJS ↔ Mootant](#2-мутаторы-strykerjs--mootant)
3. [Возможности: StrykerJS ↔ Mootant](#3-возможности-strykerjs--mootant)
4. [Другие экосистемы: идеи для Mootant](#4-другие-экосистемы-идеи-для-mootant)
5. [Исследования и индустрия](#5-исследования-и-индустрия)
6. [Чего не хватает Mootant](#6-чего-не-хватает-mootant)
7. [В чём Mootant уже сильнее и как это подчеркнуть](#7-в-чём-mootant-уже-сильнее-и-как-это-подчеркнуть)
8. [Эмпирическая проверка](#эмпирическая-проверка)
9. [Источники](#9-источники)
10. [Приложение: скрипты статических замеров](#приложение-скрипты-статических-замеров)

## 1. Методика и источники

**StrykerJS** я изучал по исходникам, а не только по README:

- клон `/home/user/projects/research/stryker-js` (`8f24ef0`): мутаторы,
  instrumenter, планировщик тестов, incremental differ, все раннеры,
  typescript-checker и документация `docs/*.md`;
- сайт `stryker-mutator.github.io`: блог и dashboard;
- `mutation-testing-elements`: supported mutators, static mutants, метрики и
  JSON schema 3.9.0.

Issues и PR смотрел через `gh api search/issues` и WebFetch страниц
github.com. Цитаты из них дальше помечены номером.

**Другие инструменты** изучал по shallow-клонам их репозиториев с
документацией. Хеши и даты коммитов:

| Инструмент    | Коммит и дата      |
| ------------- | ------------------ |
| cargo-mutants | `6c720ae` 2026-10-19 |
| Infection site | `e95e69f` 2026-08-02 |
| mutmut        | `857019a` 2026-10-28 |
| cosmic-ray    | `f6550ad` 2026-10-15 |
| mull          | `04f5c40` 2026-11-02 |
| gremlins      | `b48a4aa` 2026-03-30 |
| go-mutesting  | `9ce5f73` 2026-10-02 |
| pitest-site   | `614bec6` 2026-06-03 |

**Статьи.** Из сессии недоступны stryker-mutator.io, arxiv.org,
research.google, dblp.org, а также сайты университетов: DNS и прокси
отказывают. Поэтому названия, авторы, площадки и ключевые цифры статей я
проверял через поисковую выдачу, то есть по аннотациям и фрагментам текста.
Полные тексты я не читал. Где цифра взята из вторичного источника или
источники расходятся, это сказано рядом с цифрой.

**Свои замеры.** Все статические, тесты не запускались:

1. Размер установки, см. [`data/install-size.md`](data/install-size.md).
2. Мутанты обоих инструментов на одних и тех же 117 файлах Mootant
   (`core/text`, `core/regex`, `core/git`, `core/cache`, `core/run`). Для
   Mootant использовался `mootant list --json --verbose` из артефакта
   `mootant-0.1.0-170ec52.tgz`, для Stryker — `@stryker-mutator/instrumenter@10.1.1`
   напрямую.
3. Типовая корректность мутантов. Я применял каждый мутант в памяти и
   спрашивал TypeScript 5.9.3 LanguageService о диагностиках изменённого
   файла, как это делает typescript-checker Stryker без группировки. Опции
   переопределены так же, как у Stryker: `allowUnreachableCode: true`,
   `noUnusedLocals: false`, `noUnusedParameters: false`.

Скрипты приведены в [приложении](#приложение-скрипты-статических-замеров).
Источник кода — копия `core/` и `types/` в `/home/user/projects/research/tc-exp`,
тот же коммит.

## 2. Мутаторы: StrykerJS ↔ Mootant

### 2.1. Таблица соответствия

Пути Stryker даны относительно `packages/instrumenter/src/mutators/` в
`stryker-js@8f24ef0`. Список мутаторов Stryker 10 —
[`mutate.ts`](https://github.com/stryker-mutator/stryker-js/blob/8f24ef0/packages/instrumenter/src/mutators/mutate.ts):
17 мутаторов. Таблица
[supported-mutators](https://github.com/stryker-mutator/mutation-testing-elements/blob/master/docs/supported-mutators.md)
на сайте отстаёт: в ней нет `ArrowFunction`, `CallExpression` и замены
Date-сеттеров. Пути Mootant даны относительно `core/mutators/`.

| Концепт | StrykerJS 10.1 | Mootant 0.1 (`recommended`) | Чем отличаются |
| --- | --- | --- | --- |
| Арифметика | `ArithmeticOperator`: `+`↔`-`, `*`↔`/`, `%`→`*`. Не мутирует, если рядом строковый литерал или шаблон (`arithmetic-operator-mutator.ts:7-13,40-48`) | `arithmetic-operator`: те же замены и `**`→`*`. `+`→`-` только если известно, что операнд — число; иначе отбрасывается правая сторона (`a + b` → `a`). Тождества (`+ 0`, `* 1`), тексты ошибок и задержки таймеров пропускаются (`arithmetic-operator.ts:36-47`) | Stryker при сложении строк неизвестного типа даёт `a - b`, то есть `NaN`; Mootant вместо этого убирает правую сторону. Мутация `**` есть только у Mootant |
| Сравнения | `EqualityOperator`: `<`→`<=`,`>=`; `<=`→`<`,`>`; `>`→`>=`,`<=`; `>=`→`>`,`<`; `==`↔`!=`; `===`↔`!==` (`equality-operator-mutator.ts:7-16`). Кроме того, `ConditionalExpression` даёт `true`/`false` для любого сравнения (`conditional-expression-mutator.ts:32-50`) | `comparison-operator`: `<`→`<=`,`!=`,`false`; `<=`→`<`,`==`,`true`; числовое `===`→`<=`,`>=`,`false`; `!==`→`<`,`>`,`true`; нечисловое равенство, `in`, `instanceof` → `true`,`false` (`shared/get-comparison-plan.ts:113-182`). Если с одной стороны числовой литерал, константа заменяется сдвигом литерала на 1: `x > 10` → `x > 11` | У Mootant достаточный набор из 3 мутантов на оператор (Kaminski–Ammann–Offutt; Just et al., 2012), у Stryker — 2 замены и 2 константы. `<`→`>=` у Stryker почти всегда поглощается (subsumed) другими мутантами. Сдвиг литерала есть только у Mootant |
| Логические | `LogicalOperator`: `&&`↔`\|\|`, `??`→`&&` (`logical-operator-mutator.ts:5-9`) | `logical-operator`: отбрасывает каждую сторону; меняет `\|\|`↔`??`, где ложные значения различаются, с учётом типа; один раз делает всё условие константой: `&&`→`false`, `\|\|`→`true` (`logical-operator.ts:26-30`) | Операторы разные по сути. Отбрасывание стороны и константа поглощают почти все случаи `&&`↔`\|\|`. Замены `\|\|`↔`??` у Stryker нет вовсе |
| Условия | `ConditionalExpression`: тест цикла → `false`; тест `if` → `true`,`false`; любое булево выражение → `true`,`false`; `for(;;)` → `for(;false;)`; непустой `case` очищается (`conditional-expression-mutator.ts:26-61`) | `condition`: тесты `if` и тернарного оператора → `true`/`false`; тест цикла → `false` (с `timeouts` ещё и `true`); `!x` вне теста → `true`/`false`; `for(;;)` → `for(;false;)`. Сравнения, группы и литералы оставлены своим мутаторам (`condition.ts:12-15`) | Mootant не дублирует `comparison-operator` (правило `O1`, 542 пропуска в выборке §2.5). Очистки `case` у Mootant нет: у него `statement-removal` удаляет `break` |
| Булевы литералы | `BooleanLiteral`: `true`↔`false`, `!x`→`x` (`boolean-literal-mutator.ts:13-22`) | `boolean-literal`: `true`↔`false`, кроме случаев, которые поглощаются (`boolean-literal.ts:6-18`). `!x` обрабатывает `condition` | Удаления `!` у Mootant нет: вместо него `true`/`false` |
| Строки | `StringLiteral`: строка → `""`, пустая → `"Stryker was here!"`; шаблон → пустой. Не трогает import/export, `require`, `Symbol()`, директивы, JSX-атрибуты, ключи и литеральные типы (`string-literal-mutator.ts:12-50`) | `string-literal`: строка → `''`, пустая → `'mootant'` (`string-literal.ts:28`). Шаблон из одних чтений → `''`; шаблон с вызовом оставляет только `${}`. Пропускает тексты ошибок и логов, сравнения, JSX-атрибуты, `case` (настраивается опцией), ключи, tagged templates, `Symbol()`, аргументы `RegExp`, макросы компилятора (`string-literal.ts:48-63`) | Mootant пропускает намного больше шумных мест; на выборке 516 мутантов против 816 у Stryker. Обработка шаблонов у Mootant тоньше |
| Массивы | `ArrayDeclaration`: непустой `[..]` → `[]`; `[]` → `["Stryker was here"]`; `new Array(..)` → `new Array()` (`array-declaration-mutator.ts:13-35`) | `array-element`: удаляет каждый элемент (spread тоже) отдельным мутантом; `[]` → `[undefined]`. Зависимости React-хуков пропускает; к удалению элемента применяется `solitary` (`array-element.ts:16-26`) | Мутации мельче и осмысленнее. Мутации `new Array` у Mootant нет |
| Объекты | `ObjectLiteral`: непустой `{..}` → `{}` (`object-literal-mutator.ts:11-13`) | `object-property`: удаляет каждое свойство или spread отдельным мутантом. Опции `Intl` со значением по умолчанию пропускает; к удалению применяется `solitary` (`object-property.ts:5-12`) | Аналогично массивам. Но 94% таких мутантов не проходят `tsc` (§2.5) |
| Присваивания | `AssignmentOperator`: `+=`↔`-=`, `*=`↔`/=`, `%=`→`*=`, `<<=`↔`>>=`, `&=`↔`\|=`, `&&=`↔`\|\|=`, `??=`→`&&=` (`assignment-operator-mutator.ts:7-20`) | `assignment-operator`: те же арифметические и побитовые, плюс `**=`, `>>>=`, `^=`. `+=` только для чисел. Логические: «всегда присвоить», «никогда не присвоить», `??=`↔`\|\|=` с учётом типа (`assignment-operator.ts:81-93`) | Логические присваивания у Mootant ближе к реальным ошибкам. Шума `+=` над строками нет |
| Унарные | `UnaryOperator`: `+a`↔`-a`, `~a`→`a` (`unary-operator-mutator.ts:9-13`) | `unary-operator`: убирает `-`; убирает `+`, если операнд может быть не числом; убирает `~` и `~~` (`unary-operator.ts:12-23`) | Стратегии противоположные: у Stryker замена знака, у Mootant удаление оператора |
| `++`/`--` | `UpdateOperator`: `++`↔`--` (`update-operator-mutator.ts:5-8`) | `update-operator`: `++`↔`--`; префикс ↔ постфикс, если значение используется. Счётчики циклов считаются timeout-мутантами и по умолчанию не создаются (`update-operator.ts:5-15`) | Только у Mootant: замена префикса и постфикса и пропуск мутантов, которые подвесят тест |
| Методы | `MethodExpression`, на любом receiver. Удаление: `charAt`, `filter`, `reverse`, `slice`, `sort`, `substr`, `substring`, `trim`. Пары: `startsWith`↔`endsWith`, `every`↔`some`, `to(Locale)LowerCase`↔`…UpperCase`, `trimStart`↔`trimEnd`, `min`↔`max` и Date-сеттеры (`setDate`↔`setTime`, `setHours`↔`setMinutes` и т. п.) (`method-expression-mutator.ts:9-40`) | `method-call`: тот же список плюс `padStart`↔`padEnd`, `Math.floor`↔`ceil`, удаление `toSorted` и `toReversed`. Date-сеттеров нет. Только на receiver, который может быть строкой или массивом; `Math.*` только у глобального `Math`; с `anyReceiver` — на любом (`method-call.ts:58-87,150`) | Mootant не мутирует `filter()` у собственных классов (правило `receiver-type`) и пропускает замены регистра, когда результат сравнивается с литералом в том же регистре |
| Optional chaining | `OptionalChaining`: каждый `?.` → `.` (`optional-chaining-mutator.ts:20-46`) | `optional-chaining`: то же, по мутанту на звено. Пропускает, если по подсказкам типов значение не может быть nullish; опция `nonNullable` возвращает эти мутанты (`optional-chaining.ts:74-79`) | Здесь Mootant ничего не выигрывает: 30 из 30 его мутантов не проходят `tsc` (§2.5) |
| Регулярные выражения | `Regex`: weapon-regex, уровень 1 (`regex-mutator.ts:31`). Удаление `^`/`$`, отрицание класса и `\d`/`\s`/`\w`, удаление квантификатора, смена полярности lookaround. Для литералов и `new RegExp('…')` | `regex-pattern`: собственный анализ на `@eslint-community/regexpp` (`core/regex/*`). Удаление `^`, `$`, `\b`, lookaround и альтернативы; optional → required; класс или escape → `[^]`. Опции `negations`, `quantifiers`, `classMembers`, `largeAlternations`. Пропуск эквивалентных изменений, удаления групп захвата, невалидных выражений и пустых совпадений с `g`. `RegExp` со строкой, шаблоном или `String.raw` (`regex-pattern.ts:28-47`) | В `recommended` отрицания и квантификаторы выключены, они есть в `strict`. Mootant отсеивает эквивалентные изменения регулярок; у Stryker такого отсева нет |
| Флаги regex | — | `regex-flag`: убирает `i`, `m`, `s`; `g` убирает только в первом аргументе `.replace()`/`.match()`. Бесполезные флаги пропускает. С `additions` добавляет `i`/`g` (`regex-flag.ts:44-60`) | Только у Mootant |
| Удаление кода | `BlockStatement`: любой непустой блок → `{}` (`block-statement-mutator.ts:11-15`). `CallExpression`, новый в 10.0: вызов-statement и `throw new …` → `;`, но только если внутри поддерева нет других мутантов (`empty-expression-mutator.ts:14-48`) | `statement-removal`: удаляет один statement с эффектом: вызов, присваивание, `++`/`--`, `await`, `new`, `delete`, `throw`, ранний `return` с литералом, `break` в `case`. Опция `jumps` добавляет `continue`, `break`, `yield`. К удалению применяется `solitary`; текст логов пропускается (`statement-removal.ts:72-81`) | Разная гранулярность: Stryker удаляет блоки, Mootant — statements. Фильтр Stryker `mutantsInScope.length === 1` — это правило `solitary` Mootant, появившееся в Stryker в 2026 году (§2.4) |
| Возвращаемое значение | `ArrowFunction`: `() => x` → `() => undefined` (`arrow-function-mutator.ts:10-20`). Для `return` отдельного мутатора нет: тела функций покрывает `BlockStatement` | `return-value`: значение по типу: `''`, `0`, `0n`, `[]`, `true`/`false`, `undefined`, `Promise.resolve(…)`. Работает в `return` и в стрелке без фигурных скобок (`return-value.ts:64-79,95`). В `recommended` к нему применяется `solitary` | Только у Mootant типизированные значения и `Promise.resolve`. Но 42% этих мутантов не проходят `tsc` (§2.5) |
| Числа | — | `number-literal`: +1, включая BigInt и отрицательные. Пропускает задержки таймеров, `case` (настраивается опцией) и операнды сравнений (`number-literal.ts:33-44`) | Только у Mootant. 352 из 4048 мутантов выборки; с `tsc` расходятся 0.9% |
| Побитовые | Только в составе присваиваний (`&=`, `\|=`, `<<=`, `>>=`) | `bitwise-operator`: `&`↔`\|`, `^`→`\|`, `<<`↔`>>`, `>>>`→`>>`, удаление `\| 0` (`bitwise-operator.ts:25-34`) | Только у Mootant |
| `await` | — | `missing-await`: убирает `await`. Пропускает, если тот же promise ждёт вызывающий код или значение не promise по типу (`missing-await.ts:53-67`) | Только у Mootant. Важная для JS ошибка, но 72% таких мутантов ловит `tsc` (§2.5) |
| Не мутируется | Типы, `import`, декораторы (`babel-transformer.ts:195-206`) | Типы, enum, декораторы, пути модулей (`docs/content/mutators.md:66-67`) | — |
| Расширение | Свои мутаторы через плагины нельзя. Типы плагинов: `Checker`, `TestRunner`, `Reporter`, `Ignore` (`packages/api/src/plugin/plugin-kind.ts:4-9`) | Плагины добавляют мутаторы и пресеты (`types/config/plugin.d.ts:8-18`). Раннер подключается объектом-адаптером в `run.runner` | Mootant расширяется в части «что мутировать», Stryker — в части «как запускать, проверять, игнорировать и отчитываться» |

### 2.2. Чего нет у Mootant и стоит ли добавлять

| Мутатор Stryker | Стоит ли добавлять | Почему |
| --- | --- | --- |
| `BlockStatement` (`{…}` → `{}`) | Нет | Грубый мутант. Его убивает любой тест, который убивает мутанта внутри блока; именно это правило `solitary` и выбрасывает. Пустые функции частично покрывают `return-value` (`undefined` в `void`-функции) и `statement-removal` |
| `ArrowFunction` (`() => x` → `() => undefined`) | Нет | `return-value` уже даёт типизированное значение для стрелки без фигурных скобок (`docs/content/mutators/return-value.md`, «Return a fixed value») |
| `ObjectLiteral → {}`, `ArrayDeclaration → []` | Нет | Удаление по одному элементу точнее: показывает, какое именно поле не проверено |
| `EqualityOperator`: отрицание (`<` → `>=`) | Нет | Поглощается достаточным набором (§5.4) |
| `LogicalOperator` `&&` ↔ `\|\|` | Нет | Его поглощают отбрасывание стороны и константа |
| `StringLiteral` для import/require | Нет | Stryker сам их пропускает |
| Date-сеттеры (`setHours` ↔ `setMinutes` и т. п.) | nice, S | Узкий случай. Подходит для плагина или опции `method-call`. Доказательств пользы нет, поэтому в список §6 не включено |
| `ConditionalExpression` для `case` (очистка тела) | Нет | У Mootant удаление `break` и отдельных statements |
| `UnaryOperator` `+a` ↔ `-a` | Нет | Удаление оператора у Mootant проще и поглощает замену знака для большинства входов |

Вывод: по набору мутаторов Mootant ничего важного не упускает. Разница
между инструментами — в философии, а не в пробелах.

### 2.3. Чего нет у Stryker

- `number-literal`, `missing-await`, `regex-flag`, бинарные побитовые
  операторы и `**`.
- Типизированный `return-value`, включая `Promise.resolve(...)` для функций,
  которые возвращают `Promise<T>` без `async`.
- Удаление одной стороны логического выражения и замена `||` ↔ `??`. У
  Stryker `??` только превращается в `&&`.
- Логические присваивания по смыслу: «всегда», «никогда», `??=` ↔ `||=`.
- Сдвиг числового литерала в сравнении (`x > 10` → `x > 11`).
- Замена префикса и постфикса у `++`/`--` там, где используется значение.
- Мутации шаблонов внутри Vue- и Svelte-шаблонов (`docs/content/guide/compatibility.mdx`,
  раздел «Vue and Svelte»). Stryker мутирует в `.vue` только `<script>`
  (`packages/instrumenter/src/parsers/create-parser.ts:55-72`, html-parser), а
  в `.svelte` — скрипт и шаблон.

### 2.4. Одноимённые мутаторы, которые ведут себя по-разному

- **Регулярные выражения.** Stryker берёт все мутации уровня 1 из weapon-regex
  без анализа эквивалентности. Если weapon-regex не может разобрать шаблон, он
  пишет `console.error` (`regex-mutator.ts:57-69`). Mootant разбирает шаблон
  через regexpp и создаёт только изменения, которые различимы при чтении
  результата (`regex-pattern.ts:28-45`). Например, он не создаёт мутант, если
  wildcard у якоря и так доходит до края строки, и проверяет, что мутант
  компилируется. Флаги вынесены в отдельный мутатор. В выборке §2.5 у
  `regex-pattern` 73 мутанта, у Stryker `Regex` — 69, совпадают 28.
- **`await`.** У Stryker такого мутатора нет вообще. В JS пропущенный `await`
  — частая реальная ошибка, и мутант полезен. Но у типизированного кода `tsc`
  ловит 72% таких мутантов (`Property 'x' does not exist on type 'Promise<…>'`).
  Без фильтра типов (§6.1) остальные 28% выживших будут в основном шумом.
- **Возвращаемое значение.** У Stryker это `ArrowFunction` и `BlockStatement`.
  У Mootant значение по типу из аннотации или из типа возврата функции, иначе
  `undefined` (`docs/content/mutators/return-value.md`). Подсказки типов
  берутся только из того же файла, поэтому для импортированных типов
  возвращается `undefined`: 42% мутантов `return-value` в выборке — ошибки
  `TS2322`.
- **Вызовы методов.** Список у обоих почти одинаковый, но Mootant мутирует
  только если receiver может быть строкой или массивом. В выборке 178 таких
  мутантов, 141 совпадает со Stryker, и ни один не нарушает типы (0.0%). У
  Stryker 152 мутанта, 1.5% с ошибками типов.
- **Сравнения.** У Stryker из `a < b` получаются `a <= b`, `a >= b`, а через
  `ConditionalExpression` ещё `true` и `false`. У Mootant получаются
  `a <= b`, `a != b`, `false`. Мутант `a != b` убивается только тестом с
  `a > b`, причём таким, который отличает `a != b` от `a < b`. Это сильнее
  отрицания. О том, почему это достаточный набор, см. §5.4.
- **Строки.** Stryker заполняет пустую строку текстом `"Stryker was here!"`,
  Mootant — `'mootant'`. Различаются и места, где мутанты не создаются; см.
  таблицу выше.
- **Удаление statements.** В 2026 году Stryker сделал шаг к философии
  Mootant. В issue #4463 ([«Feature: Mutant filters»](https://github.com/stryker-mutator/stryker-js/issues/4463))
  мейнтейнеры предложили фильтры мутантов и написали, что statement-мутатор
  без них даст *«many additional mutants without real value since another
  mutant already covered the statement»*. Отфильтрованные мутанты по их
  решению *«should not exist in your report»*. PR #6010 (2026-05-22) добавил
  `filter(mutantsInScope)` в API мутатора (`babel-transformer.ts:64-153`).
  PR #6012 (2026-07-03) добавил мутатор `CallExpression`, у которого
  `filter` возвращает `mutantsInScope.length === 1`
  (`empty-expression-mutator.ts:46-48`). Это и есть правило `solitary`
  Mootant, только без следа в отчёте. Mootant показывает такие пропуски через
  `list --skipped` с правилом, причиной и флагом `heuristic`
  (`docs/content/mutators.md:26-50`).

### 2.5. Статическое сравнение на одном и том же коде

117 файлов Mootant (`core/text`, `core/regex`, `core/git`, `core/cache`,
`core/run`) прогнаны через генерацию мутантов обоих инструментов. Тесты не
запускались, поэтому это сравнение **объёма и состава мутантов, а не их
полезности**. Полезность проверяется в [«Эмпирической проверке»](#эмпирическая-проверка).

| Показатель | StrykerJS 10.1.1 | Mootant `recommended` | Mootant `strict` |
| --- | ---: | ---: | ---: |
| Мутантов | 5168 | **4048** | 5348 |
| Время всего процесса, 3 прогона (работа не идентична: Stryker ещё печатает инструментированный код, Mootant ещё анализирует пропуски) | 1.83–2.04 s | 0.94–1.14 s (`mootant list --json`) | — |
| Буквально совпадающих с другим инструментом (тот же диапазон, та же замена без учёта пробелов и кавычек) | 1722 (33% от Stryker) | 1722 (43% от Mootant) | — |
| Рассмотрено и пропущено | — (фильтр Stryker ничего не оставляет в отчёте) | 3248 | — |

Распределение по мутаторам. Совпадение — сколько мутантов этого мутатора
буквально есть и у другого инструмента:

| Mootant | Мутантов | Совпадает со Stryker | | Stryker | Мутантов | Совпадает с Mootant |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| comparison-operator | 727 | 480 | | ConditionalExpression | 1362 | 620 |
| logical-operator | 617 | 101 | | StringLiteral | 816 | 462 |
| string-literal | 516 | 462 | | BlockStatement | 681 | 0 |
| object-property | 451 | 5 | | EqualityOperator | 605 | 94 |
| number-literal | 352 | 0 | | LogicalOperator | 344 | 0 |
| condition | 246 | 133 | | ObjectLiteral | 241 | 5 |
| array-element | 188 | 40 | | ArrayDeclaration | 224 | 40 |
| arithmetic-operator | 179 | 158 | | ArithmeticOperator | 179 | 158 |
| method-call | 178 | 141 | | ArrowFunction | 155 | 0 |
| statement-removal | 152 | 57 | | BooleanLiteral | 152 | 80 |
| return-value | 150 | 0 | | MethodExpression | 152 | 141 |
| boolean-literal | 80 | 80 | | CallExpression | 84 | 57 |
| regex-pattern | 73 | 28 | | Regex | 69 | 28 |
| missing-await | 61 | 0 | | AssignmentOperator | 54 | 11 |
| assignment-operator | 35 | 11 | | OptionalChaining | 30 | 26 |
| optional-chaining | 30 | 26 | | UnaryOperator | 12 | 0 |
| unary-operator | 12 | 0 | | UpdateOperator | 8 | 0 |
| regex-flag | 1 | 0 | | | | |

**Что Mootant отбросил.** Из 3248 пропущенных кандидатов:

| Категория | Пропусков | Доля |
| --- | ---: | ---: |
| `subsumed` | 1644 | 51% |
| `owned` | 1284 | 40% |
| `noise` | 174 | 5% |
| `timeout` | 78 | 2% |
| `equivalent` | 67 | 2% |
| `duplicate` | 1 | <1% |

Главные правила:

| Правило | Категория | Пропусков | Эвристика |
| --- | --- | ---: | --- |
| `solitary` | subsumed | 1031 | да |
| `O1` | owned | 542 | нет |
| `O3` | owned | 483 | нет |
| `O4` | subsumed | 259 | нет |
| `O19` | owned | 189 | нет |
| `R2` | subsumed | 139 | нет |

Эвристикой помечены 1194 пропуска (37%); всего в
`core/skips/skip-rules.ts` 95 правил, из них 40 эвристических. Отсюда
следует: в этом коде шум Mootant убирает в основном за счёт **избыточности**,
то есть поглощённых и «чужих» (`owned`) мутантов, а не за счёт
эквивалентности. Это согласуется с исследованиями: в ручной выборке EMS
медианная доля эквивалентных мутантов была 2.97%, а TCE находит до 21%
дубликатов в C-программах (§5.5).

**Типовая корректность.** Метод описан в §1. Учитывались только новые
диагностики в изменённом файле, поэтому цифры — нижняя оценка.

| Набор | Мутантов | Не проходят `tsc` | Доля | Время проверки |
| --- | ---: | ---: | ---: | --- |
| Mootant `recommended`, 117 файлов | 4048 | 1173 | **29.0%** | 62.5 ms на мутант, 1 поток |
| Mootant, подвыборка `core/{text,git,cache}` | 1382 | 350 | **25.3%** | — |
| Stryker, та же подвыборка | 1701 | 564 | **33.2%** | 60.9 ms на мутант |

По мутаторам Mootant (все 117 файлов):

| Мутатор | Не проходят `tsc` |
| --- | --- |
| `optional-chaining` | 30/30 |
| `object-property` | 425/451 (94%) |
| `missing-await` | 44/61 (72%) |
| `array-element` | 98/188 (52%) |
| `return-value` | 63/150 (42%) |
| `string-literal` | 145/516 (28%) |
| `comparison-operator` | 172/727 (24%) |
| `logical-operator` | 125/617 (20%) |
| `statement-removal` | 26/152 (17%) |
| `condition` | 40/246 (16%) |
| `number-literal` | 0.9% |
| `boolean-literal` | 1.3% |
| `method-call`, `arithmetic-operator`, `regex-pattern` | 0% |

Частые коды ошибок: `TS2345`, `TS2322`, `TS2339`, `TS2741` (не хватает
обязательного свойства), `TS18047`/`TS18048` (значение может быть
`null`/`undefined`). Примеры:

- `object-property`: `{ evidence, ranked }` → `{ ranked }` даёт
  `TS2345: … Property 'evidence' is missing`.
- `string-literal`: `'isolated'` → `''` даёт
  `TS2322: Type '""' is not assignable to type '"isolated" | "batch" | null'`.
- `comparison-operator`: `cache === null` → `true` ломает сужение типа, и
  дальше появляется `TS2345 … 'RunCache | null'`.
- `missing-await`: `await stat(file)` → `stat(file)` даёт
  `TS2339: Property 'mtimeMs' does not exist on type 'Promise<Stats>'`.

Оговорки:

1. Код Mootant очень строгий: литеральные union-типы, `strict` и
   `noFallthroughCasesInSwitch`. В обычных проектах доля будет ниже.
2. Мутант, который нарушает типы, не обязательно бесполезен: если тест его
   убивает, вреда нет. Шум — это **выжившие** мутанты, которые не
   компилируются, а их долю можно узнать только по результатам прогона
   (см. «Эмпирическую проверку»).
3. Подсказки типов Mootant снижают долю невалидных мутантов, но только там,
   где решение принимается по типу (`method-call` 0%, `number-literal`
   0.9%). Мутаторы удаления (`object-property`, `array-element`) и `?.` типы
   почти не учитывают.

## 3. Возможности: StrykerJS ↔ Mootant

Сводная таблица; подробности и ссылки ниже.

| Возможность | StrykerJS 10.1.1 | Mootant 0.1.0 |
| --- | --- | --- |
| Выбор тестов по покрытию | `coverageAnalysis: off \| all \| perTest`, по умолчанию `perTest`. Запускаются отдельные тесты: фильтр по id или имени | Всегда по покрытию из dry run. Изолированный прогон берёт тестовые файлы целиком; `--fast` работает потестово |
| Static mutants | Отдельная ветка: прогон всех тестов с перезагрузкой окружения или `ignoreStatic` | Особого случая нет: мутант активен с загрузки модуля в изолированном воркере |
| Защита от зависаний | `timeoutMS` 5000 + `timeoutFactor` 1.5; лимит срабатываний = 100 × хиты активного мутанта | `factor 3 × длительность + 250 ms`; лимит вычислений `max(100 000, 100 × хиты)`; timeout подтверждается повторным прогоном; мутанты, которые вероятно подвесят цикл, в `recommended` не создаются |
| Повторное использование результатов | `--incremental`: файл-отчёт и diff-match-patch; не видит изменений вне мутируемых и тестовых файлов | Кэш по умолчанию по всему, что читали тесты; `--incremental` как более смелый режим |
| Только изменённое | Нет; есть `--mutate file:lines` и внешние скрипты | `--since <ref>`: merge base плюс незакоммиченные и неотслеживаемые файлы |
| Перепроверка одного мутанта | `--mutate file:line:col` вместе с `--incremental --force` | `--mutant <id>` со стабильным id; команда перепроверки есть в отчёте |
| Отчёты | `clear-text`, `progress`, `progress-append-only`, `dots`, `html` (mutation-testing-elements), `json` (общая schema), `dashboard`, `event-recorder` | Терминал, `--html` (один офлайн-файл), `--json` в двух видах: для агента (slim) и полный |
| Общий формат отчёта | mutation-testing-report-schema 3.x; dashboard; SonarQube через jq | Собственный `schemaVersion`; несовместим с общей schema |
| Раннеры | Jest, Mocha, Karma, Jasmine, Vitest ≥ 2, Tap, Cucumber, `command` | Vitest 5, `node:test` |
| Проверка типов | `@stryker-mutator/typescript-checker`: в памяти, с группами, экспериментально TS 7 | Нет; синтаксические подсказки типов из того же файла |
| Плагины | Типы `TestRunner`, `Checker`, `Reporter`, `Ignore`; своих мутаторов нет | Мутаторы и пресеты под namespace; адаптер раннера объектом |
| Отключение мутантов | `excludedMutations`; `// Stryker disable [next-line] …: reason`; ignorer-плагины | `'off'` у мутатора; `mootant-ignore-next-line \| start \| end \| file …: reason`; настройка `loggers` |
| Объяснение отбора | Отфильтрованные мутанты в отчёт не попадают | `list --skipped`: категория, правило, причина, `heuristic` |
| CI | Dashboard (project и version берутся из GitHub Actions, Travis, CircleCI), `thresholds.break` | `--since`, `--threshold`; кэш в `node_modules/.cache/mootant` |
| Аннотации в PR | В ядре нет | Нет |
| IDE и протокол | VS Code-плагин через Mutation Server Protocol 0.4 (`stryker serve`, stdio или socket) | Нет; есть `--json` и `--mutant` для агентов |
| Node.js | ≥ 22 | `^20.19 \|\| >=22.12` (Vitest 5 требует 22.12+) |
| Установка поверх проекта с Vitest | 168 пакетов, 61.5 MB | 5 пакетов, 11.8 MB |

### 3.1. Coverage analysis и static mutants

**Как это устроено в Stryker.** В заголовок каждого файла instrumenter
вставляет три функции (`packages/instrumenter/src/util/syntax-helpers.ts:21-67`):

- `stryNS_9fa48` хранит пространство имён в `globalThis.__stryker__`;
- `stryCov_9fa48(ids…)` увеличивает счётчик в `cov.static`, если тест ещё не
  начался, или в `cov.perTest[currentTestId]`;
- `stryMutAct_9fa48(id)` проверяет активный мутант и считает срабатывания для
  hit limit.

Рядом с каждым местом мутации ставится последовательность
`(stryCov_9fa48("id"), original)`. Раннер выставляет `currentTestId` в
`beforeEach`, а покрытие отдаёт через meta. В Vitest это
`packages/vitest-runner/src/stryker-setup.ts:51-73`.

План для каждого мутанта строит
`packages/core/src/mutants/mutant-test-planner.ts:88-138`:

- мутант не static: запускаются только покрывающие тесты, мутант активируется
  во время выполнения (`mutantActivation: 'runtime'`), окружение можно не
  перезагружать (hot swap, `:189-217`);
- static: запускаются все тесты с перезагрузкой окружения;
- `ignoreStatic`: static-мутант без потестового покрытия получает `Ignored`,
  а «гибридный» (есть и static-, и потестовое покрытие) запускается только
  на покрывающих тестах.

Если static-мутанты занимают не меньше 40% оценочного времени, Stryker
выводит предупреждение (`:222-268`). Hit limit равен числу срабатываний в
dry run × 100 (`:37,185-187`).

Узкое место — выбор отдельных тестов по имени. Vitest-раннер собирает regex
по полным именам тестов и кладёт его в `testNamePattern`
(`packages/vitest-runner/src/vitest-test-runner.ts:299-312`). Из-за этого:

- **#6210** (закрыт 2026-10-23, исправлен в 10.1.1). Vitest 5 склеивает
  цепочку имён через `' > '`, фильтр ничего не находил, поэтому покрытые
  мутанты получали Survived. По словам автора issue, score упал с 47.36 до
  2.96.
- **#6248** (закрыт): фильтр запускал и тесты, чьё имя начинается с имени
  отфильтрованного.
- Открыты **#6213** (мутанты с `testsCompleted: 0` считаются Survived),
  **#6256** (если ни один тест не покрывает мутантов, они получают Survived и
  запускаются все тесты), **#6209** и **#6144** (static-мутанты при
  `--testFiles` активируются слишком поздно) и **#6073** (недетерминированные
  вердикты при `perTest`).

Я проверил только статус и описания этих issues, сами ошибки не
воспроизводил.

**Как это устроено в Mootant.** Переключаемый код вызывает
`globalThis.__mootant.hit(id)` в каждом месте мутации
(`core/runtime/install-mutant-runtime.ts:18-61`). Этот вызов:

- пишет покрытие в `Set`;
- отмечает `reached` для активного мутанта;
- увеличивает общий счётчик вычислений и бросает ошибку hit limit при
  превышении.

Dry run запускает каждый тест один раз, а в `--fast` — дважды, чтобы найти
тесты, которые нельзя повторять. Если тесты падают, Mootant отделяет
настоящие падения от вызванных инструментированием: прогоняет тесты ещё раз
без переключаемых файлов и выбрасывает файлы с `instrumentation-break`
(`core/run/run-dry-phase.ts:116-140`). У Stryker при падении dry run запуск
просто останавливается.

Изолированная единица прогона — пара (мутант, тестовый файл). Мутант активен
с начала загрузки модулей и до teardown. После падения, которое убило
мутанта, ещё не начатые тесты пропускаются (`adapters/vitest/runner.ts:195-221`).
Поэтому static-мутант — не особый случай: он активен уже при загрузке модуля.

Тестовые файлы упорядочены по вероятности убить мутанта: сначала файл,
названный по модулю, затем файл, который импортирует модуль, затем остальные
(`core/run/rank-test-file.ts`, `core/run/rank-mutant-files.ts`). Запускаются
они раундами по 1, 1, 2, 4, 8… файлов. Timeout подтверждается повторным
прогоном, а единица, которая не отработала дважды, получает `Error`
(`core/run/run-isolated-rounds.ts`, docstring).

`--fast` переключает мутантов между тестами внутри одного прогона. До и после
каждой попытки с мутантом идёт контрольная попытка без мутанта
(`adapters/vitest/runner.ts:198-200`). Документация честно предупреждает, что
*«a kill may be false»* (`docs/content/guide/configuration.mdx:343-348`).

**Компромисс.** Гранулярность Mootant — файл, Stryker — отдельный тест.
Mootant дороже на больших тестовых файлах, но не опирается на сопоставление
имён тестов и на независимость тестов. Stryker прямо требует, чтобы тесты
*«run independently of each other and in random order»* (`docs/configuration.md`,
`coverageAnalysis`). Какой подход быстрее на реальных проектах, покажет
раздел 4. По корректности позиция Mootant сильнее; это стоит измерить и
подчеркнуть (§7).

### 3.2. Incremental, кэш и `--since`

**Stryker** ([`docs/incremental.md`](https://github.com/stryker-mutator/stryker-js/blob/8f24ef0/docs/incremental.md);
`packages/core/src/mutants/incremental-differ.ts:38-57,394-436`).

- Предыдущий полный отчёт хранится в `reports/stryker-incremental.json`.
- Мутант опознаётся по файлу, мутатору, location и замене, тест — по имени,
  файлу и location. Сдвиг позиций в изменённых файлах пересчитывается через
  diff-match-patch.
- Вердикт `Killed` переиспользуется, если убивший тест не изменился.
  Остальные вердикты — если мутант не покрыт новыми тестами и покрывающие
  тесты не изменились.
- Dry run выполняется всегда.
- Ограничения из документации: изменения в других файлах, зависимостях,
  переменных окружения и `.snap` не видны. Mocha, Jasmine, Karma и Tap
  сообщают о тестах неполно, `command` не сообщает ничего.
- `--force` перезапускает всё. С 10.0 при прерывании сохраняются частичные
  результаты.
- Открыт **#6004**: недетерминированные id тестов Vitest дают diff в ~15k
  строк в incremental-файле на каждом запуске.

**Mootant.**

- Кэш включён по умолчанию и лежит в `node_modules/.cache/mootant`.
- Запись хранит доказательство для пары «мутант × тестовый файл», а для
  batch — «мутант × тест».
- Запись действительна, пока не изменились мутант и его файл, тестовый файл,
  всё, что этот тестовый файл прочитал (файлы и переменные окружения), и
  входы, прочитанные во время самого прогона (`types/cache/run-cache.d.ts:6-14`).
- Отдельный ключ окружения учитывает (`core/cache/get-environment-key.ts:59-88`):
  - версии Mootant, instrumenter, runtime, кэша, адаптера и раннера;
  - конфиг раннера, `.env` и lockfile;
  - пресет и набор мутаторов;
  - major-версию Node, платформу и архитектуру.
- Убийства через падение процесса, таймауты и ошибки не кэшируются
  (`types/cache/run-cache.d.ts:43-49`).
- `--incremental` переиспользует вердикт, пока не изменились «регион»
  мутанта (его объявление и то, что оно использует в файле) и чтения тестов
  вне мутируемых файлов. Документация предупреждает, что вердикт может
  устареть после изменения вызывающего кода (`docs/content/guide/configuration.mdx:361-367`).
- `--since <ref>` берёт строки, изменённые относительно merge base, вместе с
  незакоммиченными изменениями и неотслеживаемыми файлами
  (`core/git/read-changed-lines.ts:55-70`, `core/git/get-merge-base.ts:4-14`).

У StrykerJS аналога `--since` нет. Запрос #2843 («mutate only changed
lines») закрыт ботом. Мейнтейнер предлагал собирать `--mutate foo.js:25-30`
из git diff; эту нишу закрывают сторонние скрипты вроде stryker-diff-runner.

**Вывод.** Режим Mootant по умолчанию строже incremental Stryker, а режим
`--incremental` по риску с ним сопоставим. Корректность кэша Mootant
проверяет раздел 2: moки, symlinks, монорепы.

### 3.3. Отчёты и dashboard

**Stryker.** HTML-отчёт строится на web-компонентах mutation-testing-elements.
JSON соответствует mutation-testing-report-schema (3.9.0 в
`mutation-testing-elements`). В нём есть исходники всех файлов, тесты,
`coveredBy`/`killedBy`, флаг `static`, `statusReason` и, начиная с 10.1,
`duration` у мутанта.

[Stryker Dashboard](https://github.com/stryker-mutator/stryker-mutator.github.io/blob/master/docs/General/dashboard.md):

- бесплатный для open source хостинг отчётов и бейдж mutation score;
- модули для монорепо;
- загрузка через `PUT /api/reports/{project}/{version}` с API-ключом;
- принимает отчёт любого инструмента, который пишет в этой schema.

SonarQube получает внешние issues через jq-фильтр
(`mutation-testing-elements/docs/sonarqube-integration.md`). Real-time
обновление HTML есть в Stryker.NET; для JS оно было «запланировано» в
2023 году (блог 2023-05-04).

**Mootant.**

- Терминальный отчёт (`docs/content/guide/cli.mdx`): выжившие, непокрытые и
  ошибки по файлам; diff строки; короткий id; файл теста, который стоит
  дополнить; команда перепроверки.
- HTML (`docs/content/guide/report.mdx`): один офлайн-файл со страницами
  Overview, Files, Mutants, Mutators и Tests. Можно показать пропущенные
  изменения, работают горячие клавиши, отчёт выгружается в JSON.
- Slim `--json` для агентов (`cli/report/slim-run-report.ts:9-24`): только
  мутанты, с которыми надо что-то делать, исходные строки, focus,
  `recheck`, вероятные тестовые файлы и первый покрывающий тест. Полный
  отчёт — с `--verbose --all`.

**Разница.** У Stryker стандарт и экосистема: dashboard, бейдж, SonarQube,
общий viewer, которым пользуются и Mull, и Infection. У Mootant формат,
удобный агенту, и объяснение пропусков. Экспорт в общую schema добавить
дёшево (§6.8).

### 3.4. Раннеры

Возможности раннеров Stryker по исходникам `packages/*-runner/src` в `8f24ef0`:

| Раннер | Потестовое покрытие | Как выбираются тесты | Bail | Перезагрузка (`reloadEnvironment`) | Примечание |
| --- | --- | --- | --- | --- | --- |
| Jest (`jest-runner`) | Да, через mixin окружения (circus или jasmine2) | `testNamePattern` и `findRelatedTests` (`jest-test-runner.ts:169-203`) | Внутри Jest всегда без bail, но отдаётся первый упавший тест | `true` (`:131`) | Jest ≥ 24 для покрытия |
| Mocha | Да, root hooks | `grep` по regex (`mocha-test-runner.ts:143-148`) | `suite.bail` | `false` (`:61`) | ESM нельзя выгрузить |
| Karma | Да, только для фреймворков jasmine и mocha | spec filter (`test-hooks-middleware.ts:68-90`) | `failFast` | `true` (`karma-test-runner.ts:77`) | Браузер |
| Jasmine | Да | `specFilter` (`jasmine-test-runner.ts:196-216`) | `stopOnSpecFailure` | `false` (`:77-80`) | — |
| Vitest ≥ 2 | Всегда `perTest`, настройка `coverageAnalysis` игнорируется | `testNamePattern` и список файлов, плюс `related` (`vitest-test-runner.ts:286-312`) | `bail: 1` (`:216`) | `true` (`:101`); #6209 утверждает, что это не реализовано | Пулы threads, forks, vmThreads, vmForks (10.1); `maxWorkers: 1` на каждый worker Stryker (`:181`); без browser mode |
| Tap (node-tap, `node --test --test-reporter=tap`, Ava) | Только на уровне файла; static-мутанты не обнаруживаются | По файлам | `forceBail` | Процесс на каждый тестовый файл | `docs/tap-runner.md`, раздел Limitations |
| Cucumber | Да, по сценарию | `file:line` сценария (`cucumber-test-runner.ts:210-225`) | `failFast` | `false` (`:108-110`) | — |
| `command` | Нет | Нет, запускаются все тесты | — | `true` | Работает с любым раннером, но медленно |

Нативного раннера `node:test` у Stryker нет: PR #6020 открыт с 2026-06-03.

**Mootant.**

- Vitest 5 и только он (`docs/content/guide/compatibility.mdx:43`). Mootant
  всегда запускает тесты в своём forks-пуле с `isolate: true` (`:46`). Browser
  mode, кастомные раннеры, другие пулы и `experimental.viteModuleRunner: false`
  не поддерживаются (`:48-54`). Тесты, которые грузят мутируемый файл только
  через вычисляемый `import()`, могут не попасть в выборку; дочерние процессы
  выполняют оригинальный код (`:56-57`).
- `node:test`: отдельный процесс на каждую пару «мутант × тестовый файл»,
  `--fast` не действует (`:68`). Распознаются `node --test`, `tsx --test`,
  `bnt` и `borp`.

**Разрыв по охвату — главная конкурентная слабость Mootant.** Vitest 5 вышел
2026-09-03 (`npm view vitest time`), Vitest 4.0 — 2025-10-22, 4.1 —
2026-03-12. Значит, большинство проектов на Vitest пока на 4.x, а Jest
остаётся крупнейшей базой. Скачивания с api.npmjs.org получить не удалось:
прокси отвечает 403. Как подключать Rstest и Jest через контракт адаптера,
разбирает раздел 1; оценку аудитории даёт раздел 7.

### 3.5. TypeScript checker

[`@stryker-mutator/typescript-checker`](https://github.com/stryker-mutator/stryker-js/blob/8f24ef0/packages/typescript-checker/src/typescript-checker.ts)
работает так.

- **Метод.** В памяти держится программа TS в watch-режиме. Каждый мутант
  применяется к ней, и ошибка компиляции даёт статус `CompileError`, который
  не входит в score. Опции `allowUnreachableCode`, `noUnusedLocals` и
  `noUnusedParameters` переопределены, чтобы не было ложных срабатываний
  (`docs/typescript-checker.md`). Project references (`--build`)
  поддерживаются.
- **Группировка** появилась в 6.4 (PR #3900) и включена по умолчанию через
  `prioritizePerformanceOverAccuracy: true` (`typescript-checker.ts:141-160`).
  По графу зависимостей файлов мутанты из несвязанных файлов собираются в
  группу и проверяются за один прогон компилятора. Ошибку относят к мутанту
  через тот же граф.
- **Цена**, по блогу Stryker от 2023-02-17
  (`stryker-mutator.github.io/blog/2023-02-17-announcing-faster-typescript-checker.mdx`):
  до группировки *«Running StrykerJS on itself took 10x longer with this
  plugin than without it!»*; после неё на пакете `core` *«performance
  increased by 43% while still being 99.1% accurate»*. Неточность возникает
  из-за того, как TS сообщает об ошибках (microsoft/TypeScript#46272).
  Issue #3137 «TypeScript checker performance cost» закрыт ботом без
  решения.
- **TypeScript 7.** В 10.0 добавлен `experimentalNativePreview` (PR #6099):
  проверка через нативный TS 7, но без project references и только по одному
  мутанту. Группировка для TS 7 — открытый #6112.
- **`disableTypeChecks: true`** по умолчанию вставляет `// @ts-nocheck` в
  инструментированные файлы (`docs/configuration.md`, `disableTypeChecks`).
  Без этого переключение мутантов ломает типы при запуске через раннер,
  который сам проверяет типы. Mootant это не нужно: Vite и type stripping
  типы не проверяют.

**Mootant** проверки типов не делает. Он опирается на синтаксические
подсказки типов из того же файла (`core/hints/*`, например
`create-syntactic-type-provider.ts`): какой тип у receiver, какое значение
подставить по типу возврата, может ли значение быть nullish, числовой ли
`+`. Мой замер (§2.5): 25–29% мутантов на строгом TS-коде остаются
невалидными по типам. Если бы Mootant проверял все мутанты так же, как я
(62 ms на мутант в одном потоке, только изменённый файл), это добавило бы
около 4 минут на 4048 мутантов. Проверка только выживших обойдётся на
порядок дешевле (§6.1).

### 3.6. Плагины, конфигурация, отключение мутантов

**Stryker.**

- Конфиг: `stryker.config.{json,js,mjs,cjs}`, есть JSON schema для
  автодополнения (`docs/config-file.md`).
- Опция в CLI **полностью заменяет** опцию из файла, а не дополняет её
  (`docs/configuration.md`, «Command Line vs. Config File»).
- `stryker init` настраивает проект интерактивно.
- Автоматически загружаются плагины `@stryker-mutator/*`.
- Способы отключить мутанты (`docs/disable-mutants.md`):
  - `mutator.excludedMutations`;
  - комментарии `// Stryker disable|restore [next-line] Mutator,…: reason`
    (с 5.4);
  - ignorer-плагины (с 7.3; встроенный `angular` для `input()`, `output()` и
    `model()`).

  Отключённые мутанты остаются в отчёте со статусом `Ignored`.

**Mootant.**

- Конфиг ищется так: ключ в `package.json`, `.mootantrc(.json)`,
  `mootant.config.{js,mjs,cjs,ts,mts,cts}`. Типы даёт `defineConfig`.
- Модель как у ESLint: пресеты в `extends`, переключатели и опции в
  `mutators`, общие `settings` (`loggers`, `templates`, `timeouts`,
  `coarseMutants`), плагины с namespace и раздел `run`
  (`docs/content/guide/configuration.mdx`).
- Отключение: комментарии `mootant-ignore-next-line|start|end|file` со
  списком мутаторов и причиной; в шаблонах — HTML-комментарии
  (`docs/content/mutators.md:84-113`).
- Плагина-игнорера нет. Есть только `loggers`, и он работает лишь для логов.

### 3.7. CI, IDE, агенты

**Stryker.**

- Dashboard reporter: project и version берутся из окружения GitHub Actions,
  Travis и CircleCI (`packages/core/src/reporters/ci/*`).
- `thresholds.break` даёт код выхода 1.
- Есть `--incremental`, `--mutate` с диапазоном строк, `--dryRunOnly` и
  `--testFiles` (9.5).
- **Аннотаций GitHub в ядре нет**: grep по `packages/core/src/reporters`
  находит `GITHUB_*` только в определении CI-провайдера.
- `stryker serve` поднимает сервер Mutation Server Protocol 0.4.1 (JSON-RPC;
  методы `configure`, `discover`, `mutationTest`). Его использует
  VS Code-плагин (блог 2025-11-07).

**Mootant.**

- `--since` и `--threshold`; код выхода 1 и при ошибке, и при score ниже
  порога (`cli/run-mutation.ts:74,93,136`).
- Кэш можно сохранять между запусками CI через `actions/cache` на
  `node_modules/.cache/mootant`.
- `--json` и `--mutant <id>` дают агенту полный цикл.
- Аннотаций, комментариев в PR, dashboard и IDE-интеграции нет: grep по
  `GITHUB_` и `::warning` в `cli/`, `core/` и `adapters/` ничего не находит.
- Agent skill обещан в документации (`npx skills add azat-io/mootant`), но в
  дереве `170ec52` нет ни одного `SKILL.md` (`git ls-files | grep -i skill`
  находит только `docs/components/Skill.astro` и `skill-session.ansi`).
  Подробнее об этом в разделе 6.

### 3.8. Размер установки

Сырые данные и методика: [`data/install-size.md`](data/install-size.md).
Окружение: Node 22.23.4, npm 10.9.9, Linux x64, 4 vCPU. Время — медиана и
разброс по 3 холодным прогонам, у каждого свой чистый `--cache`.

| Что добавляется к проекту с `vitest@5` | Пакетов | На диске | Cold install | Warm install |
| --- | ---: | ---: | --- | --- |
| Mootant 0.1.0 (tgz `170ec52`) | **5** | **11.8 MB** | 10.6 s (9.3–10.8) | 5.6 s |
| Stryker core + vitest-runner 10.1.1 | 168 | 61.5 MB | 14.7 s (12.9–15.8) | 6.4 s |
| То же + typescript-checker поверх `vitest typescript` | 169 | 62.0 MB | 15.5 s (14.0–16.8) | 8.5 s |

Из этих цифр вычтен артефакт npm: при повторном `npm i` он ставит
musl-бинарники rolldown и lightningcss, 29.8 MB.

Две находки по Mootant:

1. **Optional peers стоят дороже, чем пакеты.** Холодная установка скачивает
   около 103 MB метаданных (packuments `vite`, `playwright`, `@types/node`
   и т. д.). Без `peerDependencies` перепакованный tarball ставится за
   3.2 s вместо 8–9 s.
2. **В пакете 1434 файла**: 609 `.js` и 822 `.d.ts`. Их apparent size —
   1.7 MB, а на диске из-за блоков по 4 KiB они занимают 6.4 MB.

Обе находки относятся к разделу 7, здесь они для полноты картины.

## 4. Другие экосистемы: идеи для Mootant

Цель — идеи, а не совместимость. Для каждой идеи сказано, есть ли что-то
похожее в Mootant и куда она ведёт в списке §6.

### 4.1. PIT (Java)

Источник — документация сайта `hcoles/pitest-site@614bec6`:
[`quickstart/incremental_analysis.markdown`](https://github.com/hcoles/pitest-site/blob/master/quickstart/incremental_analysis.markdown),
`basic_concepts.markdown`, `mutators.markdown`, `commandline.markdown` и
`pages/faq.markdown`.

1. **Риски incremental названы прямо.** PIT перечисляет пять оптимизаций и
   предупреждает: *«With the exception of 4), all these optimisations
   introduce a degree of potential error»*. Зависимости класса он считает
   только по суперклассам и внешним классам, а допущение называет
   *«currently unproven»*. Безопасна лишь оптимизация 4: если мутант раньше
   убивал определённый тест, этот тест запускается первым.
   *Для Mootant:* документация `--incremental` честная, но безопасную
   оптимизацию 4 Mootant пока не использует. Когда запись кэша протухла,
   стоит ставить в начало порядка тестовый файл, который убил мутанта в
   прошлый раз. Вердикт от этого не меняется, может поменяться только
   `killedIn`. Это идея для раздела 4 (производительность).
2. **Выбор тестов по покрытию и времени.** Тесты отбираются по строчному
   покрытию, и в первую очередь идут быстрые. В Mootant порядок нарочно не
   зависит от длительности (`core/run/rank-mutant-files.ts`, docstring:
   *«never on its durations»*). Внутри одного ранга можно сортировать по
   длительности, округлённой до корзины (например, `log2`), и сохранить
   детерминизм. Это тоже идея для раздела 4.
3. **`FLOGCALL` и `avoidCallsTo`.** Строки с вызовами логгеров по умолчанию
   не мутируются, а список логгеров настраивается. В Mootant есть аналог —
   `loggers`, но он не обобщён на другие вызовы. → §6.6.
4. **Группы мутаторов** `DEFAULTS`, `STRONGER`, `ALL` и лимит
   `+CLASSLIMIT(limit[n])`. Пресеты Mootant устроены так же. Лимит на класс
   для Mootant неинтересен, а лимит показа «на строку» — интересен (§5.1).
5. **Arcmutate** — коммерческие плагины PIT, в том числе git-интеграция
   `+GIT(from[HEAD~1])`, история и интеграция в pull request
   (`quickstart/maven.markdown:149-152`). В экосистеме Java за интеграцию в
   PR платят, а Mootant может дать её бесплатно. → §6.2.

### 4.2. cargo-mutants (Rust)

Источник —
[`sourcefrog/cargo-mutants/book/src`](https://github.com/sourcefrog/cargo-mutants/tree/main/book/src)
(`6c720ae`, версия 27.1.0).

1. **`--in-diff FILE`** (`in-diff.md`, `pr-diff.md`). На вход подаётся
   готовый diff, а не ref. Так проще в CI: diff можно получить из API PR или
   при shallow-клоне. Документация честно пишет, что изменение в одном месте
   может ослабить тесты в другом, поэтому *«not a substitute for a full test
   run»*. Mootant требует, чтобы ref и merge base были в локальном
   репозитории (`docs/content/guide/cli.mdx:111-112`). → §6.9.
2. **`--shard k/n`** с алгоритмами `slice` и `round-robin`, плюс
   `--baseline=skip` для шардов (`shards.md`, `baseline.md`). Шарды
   независимы: каждый сам находит мутантов и берёт свою долю. В документации
   есть модель стоимости:
   `SHARD_STARTUP + CLEAN_BUILD + TEST + N/N_SHARDS × (BUILD + TEST)`.
   → §6.10.
3. **Различимые коды выхода** (`exit-codes.md`): 2 — есть пропущенные
   мутанты, 3 — таймауты, 4 — тесты падают уже без мутантов, 5–6 — проблемы с
   diff, 70 — внутренняя ошибка. У Mootant код 1 означает и ошибку, и «score
   ниже порога» (`cli/run-mutation.ts:74,93,136`). → §6.11.
4. **Аннотации GitHub Actions включаются сами**, если задан
   `$GITHUB_ACTION`; управляются через `--annotations=github|none`
   (`ci.md`, «Annotations»). Каталог `mutants.out/` обновляется по ходу
   прогона (`outcomes.json`, `missed.txt`, `diff/`, `logs/`), и внешние
   программы могут следить за ним (`mutants-out.md`). → §6.2.
5. **`skip_calls`**: не мутировать аргументы вызовов с заданными именами, по
   умолчанию `with_capacity` (`skip_calls.md`). Это та же «аридность», что у
   Google, только задана пользователем. Есть ещё атрибут `#[mutants::skip]`
   и regex-фильтры по имени мутанта. Цели те же, что у Mootant: *«only
   enable by default features that seem reasonably likely to say something
   important»* (`goals.md`), а *«by default only missed mutants and timeouts
   are printed … because they're the most actionable»* (`using-results.md`).
   → §6.6.

### 4.3. mutmut и cosmic-ray (Python)

mutmut смотрел по
[`boxed/mutmut/README.rst`](https://github.com/boxed/mutmut/blob/main/README.rst)
(`857019a`, 3.8.1).

1. **Фильтр мутантов через type checker.** `type_check_command` для mypy и
   pyrefly с JSON-выводом. Ограничения описаны честно: *«it can also hide a
   few relevant mutations»*. Для pyright и ty фильтр не работает: мутация
   метода ломает типы всего класса, и ошибку нельзя сопоставить с мутантом.
   Код mutmut 3 построен как trampoline: каждый мутант — отдельная копия
   функции. Поэтому один прогон type checker проверяет всех мутантов сразу,
   а ошибка относится к мутанту по месту. → §6.1.
2. **`max_stack_depth`.** Тест засчитывается как покрывающий, только если
   мутант достигнут на небольшой глубине стека. Так отсекается
   «случайное» покрытие базовых функций: это быстрее, а тесты получаются
   локальнее. В Mootant ранг 4 (`rank-test-file.ts`) — это как раз тесты,
   которые доходят до модуля через другие модули. Можно сделать опцию
   «только прямые импортёры» для быстрых прогонов, но выживших станет
   больше. Это идея для раздела 4, в §6 не включена.
3. **`mutate_only_covered_lines`** уважает `# pragma: no cover` и
   `exclude_lines` в coverage.py: код, который команда сама исключила из
   покрытия, не мутируется. Аналог для JS — комментарии
   `/* v8 ignore … */`, `/* istanbul ignore … */`, `/* c8 ignore … */`.
   → §6.6.
4. **`mutmut apply <mutant>` и TUI `browse`.** Мутант можно записать на
   диск, чтобы воспроизвести его руками. Для агентов и отладки Mootant
   хватило бы `list --mutant <id> --patch`, который печатает unified diff
   (nice, S; в §6 не вынесено отдельно).

cosmic-ray смотрел по `docs/source` (`f6550ad`). **Сессия хранится в
SQLite**, а фильтры — отдельные программы, которые меняют сессию между
`init` и `exec`: `cr-filter-pragma`, `cr-filter-git`, `cr-filter-operators`
(`how-tos/filters.rst`). Мысль для Mootant — компонуемые пользовательские
фильтры поверх списка мутантов. Её покрывает §6.6. Распределённое
выполнение через HTTP-воркеры для Mootant избыточно; шардов достаточно.

### 4.4. Infection (PHP)

Источник — `infection/site` (`e95e69f`):
[`src/guide/command-line-options.md`](https://github.com/infection/site/blob/master/src/guide/command-line-options.md),
`static-analysis-integration.md`, `profiles.md`, `usage.md` и `index.md`.

1. **Статический анализ только для выживших.** С `--static-analysis-tool=phpstan|mago`
   Infection прогоняет анализатор только по escaped-мутантам и помечает их
   *«Killed by SA»*. В документации сказано: *«Static analysis is only
   performed on mutants that escape the test suite, ensuring optimal
   performance.»* Это ровно то, что нужно Mootant для TypeScript. → §6.1.
2. **`--logger-github`**: GitHub-аннотации для выживших прямо в PR, в GitHub
   Actions включаются автоматически. **`--logger-gitlab`** создаёт отчёт
   Code Quality. → §6.2.
3. **Метрики и пороги.** MSI, Mutation Code Coverage и Covered Code MSI с
   отдельными порогами `--min-msi` и `--min-covered-msi`. `--with-timeouts`
   считает таймауты escaped, `--max-timeouts` ограничивает их число, а
   `ignoreMsiWithNoMutations` не проваливает прогон без мутантов. У Mootant
   один `--threshold` по полному score, хотя covered score он показывает
   (`docs/content/guide/cli.mdx`, «Mutation score and exit code»).
   Отдельный порог для covered score стоит S и полезен для legacy-кода. В
   §6 не вынесен, потому что приоритет низкий.
4. **Профили и игноры.** Профили `@default`, `@function_signature` и т. д.,
   `ignore` по `Class::method` и `ignoreSourceCodeByRegex`, в том числе
   глобальный (`profiles.md`, `usage.md`). Это прецедент для
   паттерн-игнорирования (§6.6).
5. **Режим diff:** `--git-diff-lines`, `--git-diff-filter=AM` и
   `--git-diff-base`. Есть `--map-source-class-to-test` для быстрого
   начального прогона и `--id` для одного мутанта. Почти всё это у Mootant
   уже есть: `--since`, ранжирование тестовых файлов по имени, `--mutant`.

### 4.5. mull (C/C++, LLVM)

Источник — `mull-project/mull/docs` (`04f5c40`): `HowMullWorks.rst` и
`IncrementalMutationTesting.rst`.

1. **Junk detection.** Мутации, найденные на уровне LLVM IR, сверяются с
   Clang AST, и мутации, которые нельзя связать с исходным кодом,
   отбрасываются «контролируемо». Это аналог категории `invalid` в Mootant.
2. **Вывод в виде предупреждений компилятора** (`file:line:col: warning:
   Survived: …`). По такому выводу кликают в IDE, его разбирают problem
   matcher-ы CI. Mootant может дать такой формат дёшево. → §6.2.
3. **SQLite-репортёр** для произвольных SQL-запросов по результатам и HTML
   через mutation-testing-elements. Mull использует общую schema Stryker. →
   §6.8.
4. **Инкрементальный режим** через `gitDiffRef` и `gitProjectRoot`. У
   Mootant он уже есть (`--since`).

### 4.6. gremlins и go-mutesting (Go)

1. **gremlins**
   (`docs/docs/usage/commands/unleash/index.md`, `b48a4aa`). `--diff` по
   merge base; статусы `NOT COVERED`, `TIMED OUT`, `NOT VIABLE`. Два порога с
   разными кодами выхода: `--threshold-efficacy`
   (`KILLED / (KILLED + LIVED)`, код 10) и `--threshold-mcover` (код 11).
   `--output-diff-statuses l` печатает diff только для выживших. → §6.11.
2. **go-mutesting**
   ([README](https://github.com/avito-tech/go-mutesting/blob/master/README.md),
   раздел «Blacklist false positives»). Файл с MD5 мутаций, которые признаны
   ложными. Сам автор пишет: *«badly implemented as a change in the original
   source code will change all checksums»*. Это урок для файла подавлений
   (§6.4): ключом должен быть стабильный id. Id Mootant не содержит
   смещений, строк и колонок (`core/identity/create-mutant-id.ts:52-61`),
   поэтому подходит.

## 5. Исследования и индустрия

Статус проверки описан в §1: я проверял по поисковой выдаче (аннотации и
фрагменты), полные тексты недоступны. Цифры, по которым есть расхождения,
помечены.

### 5.1. Google: мутанты на код-ревью

**Публикации.**

- G. Petrović, M. Ivanković, *State of Mutation Testing at Google*,
  ICSE-SEIP 2018, с. 163–171, doi:10.1145/3183519.3183521.
- G. Petrović, M. Ivanković, G. Fraser, R. Just, *Practical Mutation Testing
  at Scale: A view from Google*, IEEE TSE, 2021 (arXiv:2102.11378).
- Те же авторы, *Does mutation testing improve testing practices?*,
  ICSE 2021, с. 910–921 (arXiv:2103.07189).

**Как это устроено.**

- Мутанты создаются только на покрытых строках диффа под ревью.
- *Arid*-узлы отбрасываются ещё до генерации. Чаще всего это логирование,
  кроме того — вызовы резервирования памяти и import. Составной узел arid,
  если arid все его дети. Эвристики накоплены по обратной связи
  разработчиков, и авторы признают, что не все они корректны: часть
  опирается на рекомендации стиля.
- На строку показывается **один** мутант.
- Мутационные операторы выбираются по их исторической продуктивности.
- Мутант публикуется как комментарий на ревью с кнопками «Please fix» и
  «Not useful». Если целый класс мутантов признан бесполезным, для него
  добавляется правило подавления.

**Цифры по фрагментам текста.**

- Сначала разработчики считали непродуктивными 85% показанных мутантов,
  после правил подавления — 11%. В другой версии статьи та же динамика
  описана как рост продуктивности с 80% до 89%.
- Работа 2018 года: 1.1 млн мутантов, 150 тыс. actionable-находок, около
  6000 инженеров. В разных версиях встречаются и 13 000, и 14 000; эти цифры
  я не сверил.
- ICSE 2021: разработчики, которые получают мутантов, пишут больше тестов и
  со временем оставляют меньше выживших. Мутанты связаны с реальными
  ошибками: если бы мутационное тестирование применили к изменениям,
  которые внесли баги, оно показало бы живого мутанта.

**Что это значит для Mootant.**

- Модель та же: `--since` — это дифф на ревью, а `core/skips` — это
  arid-правила.
- Чего не хватает:
  - доставки результата в ревью: аннотаций и комментариев (§6.2);
  - петли обратной связи: подавлений, которые решение человека или агента
    превращает в данные (§6.4), и статистики продуктивности правил (§6.5);
  - режима показа «один мутант на строку» (§6.7).
- Google подтверждает и опасность: часть его эвристик тоже неточна. Нужен
  аудит (§6.5).

### 5.2. Meta: ACH и обучение на мутантах

**Публикации.**

- C. Foster, A. Gulati, M. Harman и др., *Mutation-Guided LLM-based Test
  Generation at Meta*, FSE 2025 Companion (arXiv:2501.12862). Система ACH
  (Automated Compliance Hardening).
- M. Harman, P. O'Hearn, S. Sengupta, *Harden and Catch for Just-in-Time
  Assured LLM-Based Software Testing: Open Research Challenges*, статья к
  keynote FSE 2025 (arXiv:2504.16472).

**ACH.**

- LLM по текстовому описанию проблемы (privacy-concern) генерирует
  целевых мутантов.
- LLM-детектор отсеивает эквивалентных мутантов. По аннотации у него
  precision 0.79 и recall 0.47, а с простой предобработкой — 0.95 и 0.96.
- LLM пишет тест, и тест обязан собраться, пройти и убить мутанта
  («assured LLMSE»).
- По фрагментам статьи: на test-a-thon в Messenger и WhatsApp из 191 теста
  приняли 140 (73%), «privacy relevant» признаны 36%. Около 49% тестов были
  бы отброшены, если бы генерация ориентировалась только на строчное
  покрытие.
- Расхождение: в аннотации 9095 мутантов и 571 тест, в другой версии —
  4660 кандидатов. Его я не разрешил.

**Facebook, 2021.** M. Beller и др., *What It Would Take to Use Mutation
Testing in Industry — A Study at Facebook*, ICSE-SEIP 2021
(arXiv:2010.13464).

- Больше 15 000 мутантов, больше половины выжили.
- Из 26 разработчиков почти все сочли найденные пробелы интересными, но
  действовать готова была лишь почти половина. Остальные отказывались по
  причинам вне мутационного тестирования.
- Принцип авторов: мутанты без actionable-сигнала не нужно создавать вовсе.

**Что это значит для Mootant.**

- Цикл agent skill — прочитать отчёт, написать тест, перепроверить через
  `--mutant <id>` — это и есть mutation-guided test generation с
  гарантией: тест засчитывается, только если убивает мутанта. Это сильнейший
  аргумент для позиционирования (§7).
- ACH показывает, что к этому циклу нужен ещё этап **разбора
  эквивалентности**: агент объявляет мутанта неубиваемым, обосновывает это
  и записывает решение. Но запись должна быть машинной, а не комментарием в
  коде (§6.4).
- «Concern-driven» мутанты в Mootant ложатся на плагины и пресеты: например,
  пресет `security`, который убирает проверки прав. Это идея для
  экосистемы, а не для ядра.

### 5.3. LLM для мутантов и тестов

- **LLMorpheus** (F. Tip, J. Bell, M. Schäfer; репозиторий
  `githubnext/llmorpheus`, архивирован 2025-02-03, развивается в
  `neu-se/llmorpheus`). LLM предлагает замены в местах-заглушках, а
  выполняет их модифицированный **StrykerJS**. README предупреждает: *«The
  results of LLMorpheus are non-deterministic»*. Площадку публикации
  (arXiv, TSE?) я не подтвердил.
- **MuTAP**: A. M. Dakhel и др., *Effective test generation using
  pre-trained Large Language Models and mutation testing*, IST 171 (2024),
  107468. Выжившие мутанты добавляются в промпт генерации тестов. Такой
  подход находит до 28% больше ошибочных фрагментов, чем предыдущие.
- **LLM для поиска эквивалентных мутантов**: Z. Tian и др., *Large Language
  Models for Equivalent Mutant Detection: How Far Are We?*, ISSTA 2024
  (distinguished paper). F1 в среднем на 35.69% выше, чем у существующих
  техник; лучше всех — fine-tuned эмбеддинги кода (UniXCoder). Данные:
  3302 пары Java-методов.

**Что это значит для Mootant.** Генерация мутантов через LLM
недетерминирована и ломает стабильные id, кэш и воспроизводимость. Ядру
Mootant лучше оставаться детерминированным. LLM полезна на двух этапах:
написание тестов (уже есть в skill) и разбор выживших (§6.4).

### 5.4. Избыточность, subsumption и достаточные операторы

**Публикации.**

- G. Kaminski, P. Ammann, J. Offutt, *Improving logic-based testing*, JSS
  2013, doi:10.1016/j.jss.2012.08.024. Из семи ROR-мутантов на операцию
  сравнения достаточно трёх. Версию AST 2011 «Better predicate testing»
  поиск не нашёл.
- R. Just, G. Kapfhammer, F. Schweiggert, *Using Non-Redundant Mutation
  Operators and Test Suite Prioritization…*, ISSRE 2012, с. 11–20.
  Безызбыточные наборы COR и ROR уменьшают число мутантов до −37%, в
  среднем больше чем на 25%; для ROR — −57%. Вместе с приоритизацией тестов
  стоимость анализа падает до −65%.
- P. Ammann, M. Delamaro, J. Offutt, *Establishing Theoretical Minimal Sets
  of Mutants*, ICST 2014, с. 21–30. Избыточные мутанты завышают score.
  Предложена минимизация множества мутантов относительно набора тестов.
- B. Kurtz, P. Ammann, J. Offutt, M. Delamaro, M. Kurtz, N. Gökçe,
  *Analyzing the validity of selective mutation with dominator mutants*,
  FSE 2016, с. 571–582. Все рассмотренные selective-подходы на некоторых
  программах плохо проходят по dominator mutation score.
- R. Just, B. Kurtz, P. Ammann, *Inferring Mutant Utility from Program
  Context*, ISSTA 2017, с. 284–294. Полезность мутанта (эквивалентность,
  тривиальность, доминирование) предсказывается по контексту в AST:
  родитель, типы, дети. В техотчёте AUC больше 0.8.

**Что это значит для Mootant.**

- `comparison-operator` реализует именно набор Kaminski–Ammann–Offutt
  (`core/mutators/comparison-operator.ts:6-9`, `shared/get-comparison-plan.ts:113-182`).
  В Stryker его предлагали в issue #4349 (2023, со ссылками на Just et al.
  2012 и Kurtz et al.). Мейнтейнеры ответили, что это «большая фича без
  сроков», и issue закрыт ботом в 2025-м.
- Правила `R*` и `O*` — статическая версия subsumption: «этот мутант
  поглощается другим» или «то же делает другой мутатор». Контекстные
  правила (циклы, логи, компараторы `sort`) — практическая версия mutant
  utility из работы 2017 года.
- `solitary` («грубый мутант убивается любым тестом, который убил мутанта
  внутри») прямой опоры в литературе не имеет. Dominance в этих работах
  определяется динамически, по тестам, и обратное направление там не
  доказывается. Это самая массовая эвристика (1031 пропуск в выборке §2.5),
  и её точность надо измерить (§6.5, «Эмпирическая проверка»).

### 5.5. Эквивалентные мутанты

**Публикации.**

- M. Papadakis, Y. Jia, M. Harman, Y. Le Traon, *Trivial Compiler
  Equivalence…*, ICSE 2015, с. 936–946. TCE отбрасывает больше 7% мутантов
  как эквивалентные и 21% как дубликаты; находит около 30% известных
  эквивалентных. В журнальной версии (Kintis и др., TSE 2018): 7.4% и 5.7%
  эквивалентных для C и Java, 21% и 5.4% дубликатов.
- B. Kushigian, S. Kaufman, R. Featherman, H. Potter, M. Madadi, R. Just,
  *Equivalent Mutants in the Wild: Identifying and Efficiently Suppressing
  Equivalent Mutants for Java Programs*, ISSTA 2024, с. 654–665,
  doi:10.1145/3650212.3680310.
  - В ручном исследовании 1992 мутантов из 7 проектов эквивалентных 215;
    медиана по проектам — 2.97%.
  - Предложен **EMS**: 10 целевых статических анализов (диапазоны значений,
    шаблоны `equals`, контракты стандартной библиотеки), которые подавляют
    эквивалентных мутантов **до генерации**.
  - На 19 проектах EMS нашёл 8776 эквивалентных мутантов за 325 с, а TCE —
    2124 за 2938 ч.
- Документация Stryker прямо признаёт: *«There is no definitive way for
  Stryker to find and ignore them»*
  ([`mutation-testing-elements/docs/equivalent-mutants.md`](https://github.com/stryker-mutator/mutation-testing-elements/blob/master/docs/equivalent-mutants.md)).

**Что это значит для Mootant.**

- EMS — ближайший академический аналог `core/skips`. Это сильная опора для
  позиционирования: «как EMS, но для JS/TS и с объяснением каждого
  пропуска».
- Эквивалентность — меньшая часть проблемы: в EMS 2.97%, у Mootant в
  выборке 2% пропусков. Основная масса шума — избыточность и
  «непродуктивность».
- «TCE для JS» можно примерить через минификатор с constant folding
  (oxc-minifier, terser): сжать исходник и мутант и сравнить результат. Но
  правила Mootant уже закрывают основные тривиальные классы — тождества,
  `void`, дубликаты, — и выход неизвестен. Без эксперимента это не
  рекомендация, а гипотеза.

### 5.6. Higher-order мутанты, предсказание, выборка, pseudo-tested

- **HOM.** Y. Jia, M. Harman, *Higher Order Mutation Testing*, IST 51(10),
  2009, с. 1379–1393. Subsuming HOM труднее убить, чем мутантов первого
  порядка, из которых он собран; такие HOM ищут поиском (greedy, GA,
  hill climbing). Есть и последующая работа о strongly subsuming HOM:
  35–45% меньше мутантов (по фрагменту, не проверено). *Для Mootant — нет.*
  HOM труднее объяснить, они плохо ложатся на «один мутант — один тест» и на
  переключение мутантов.
- **Предсказание.** J. Zhang и др., *Predictive Mutation Testing*,
  ISSTA 2016; расширенная версия — TSE 2019. Классификатор предсказывает
  вердикт без запуска: ускорение до 151.4×, AUC выше 0.8 на большинстве из
  163 проектов. Авторов версии ISSTA я до конца не сверил. *Для Mootant:*
  предсказанный «выживший» — это шум, который философия Mootant не
  допускает. Предсказание годится разве что для **порядка** работы, чтобы
  раньше показать вероятных выживших. Это вопрос раздела 4.
- **Выборка.** R. Gopinath, A. Alipour, I. Ahmed, C. Jensen, A. Groce, *How
  hard does mutation analysis have to be, anyway?*, ISSRE 2015, с. 216–227.
  Небольшая выборка постоянного размера даёт оценку score, статистически
  близкую к полному анализу. *Для Mootant:* выборка оценивает score, но
  не находит конкретные пробелы. Если нужна, то как `--sample N` для очень
  больших репозиториев. Низкий приоритет, в §6 не вынесено.
- **Pseudo-tested methods.** Идея Niedermayr и др. (2016); O. L.
  Vera-Pérez, B. Danglot, M. Monperrus, B. Baudry, *A comprehensive study of
  pseudo-tested methods*, EMSE 24 (2019), с. 1195–1225; движок PIT
  Descartes. «Экстремальный» мутант удаляет тело метода. Если такой мутант
  выживает, метод pseudo-tested, и это одна находка вместо десятков. *Для
  Mootant:* группировать выживших по `scope` (функции) и сообщать «ни один
  тест не проверяет результат `f`» (§6.7).

### 5.7. Сводка: исследование → Mootant

| Идея из исследований и индустрии | В Mootant сейчас | Что сделать |
| --- | --- | --- |
| Мутанты на диффе ревью (Google) | `--since` | Доставка в PR (§6.2) |
| Arid-узлы, подавление по обратной связи (Google) | `core/skips`, `loggers` | Пользовательские паттерны (§6.6), подавления (§6.4) |
| Один мутант на строку (Google) | Нет | Режим показа (§6.7) |
| Продуктивность операторов (Google) | Score мутатора в HTML | Аудит правил (§6.5) |
| Достаточные операторы (Kaminski и др.; Just и др.) | `comparison-operator`, `logical-operator` | Подчеркнуть в документации (§7) |
| Dominator mutants и subsumption (Ammann, Kurtz) | `R*`/`O*` статически; `solitary` эвристически | Измерить `solitary` (§6.5) |
| Подавление эквивалентных до генерации (EMS) | `equivalent`-правила | Подчеркнуть (§7) |
| Проверка типов (Stryker checker, Infection SA, mutmut) | Синтаксические подсказки | Фильтр выживших (§6.1) |
| LLM-тесты под мутантов с гарантией (ACH, MuTAP) | Agent skill и `--mutant` (skill нет в репозитории) | Довести skill (раздел 6), добавить разбор эквивалентности (§6.4) |
| LLM-детектор эквивалентности (ACH, Tian и др.) | Нет | Этап в skill с записью в подавления (§6.4) |
| Pseudo-tested methods (Descartes) | `scope` в JSON | Группировка (§6.7) |
| HOM, PMT, выборка | — | Не делать (§6, отклонённые идеи) |

<!-- CONTINUE-HERE -->
