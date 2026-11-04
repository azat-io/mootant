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
   окружения и прогон всех тестов. В раннерах Vitest и Jest Stryker выбирает
   тесты по имени через regex (`testNamePattern`), и на Vitest 5 это
   сломалось. С выхода Vitest 5.0.0
   (2026-09-03) до Stryker 10.1.1 (2026-10-23) почти все покрытые мутанты
   получали Survived (issue #6210).
5. **Кэш Mootant по умолчанию строже инкрементального режима Stryker.** Он
   учитывает файлы и переменные окружения, которые прочитали тесты, lockfile
   и major-версию Node. Incremental у Stryker не видит изменений вне
   мутируемых и тестовых файлов.
6. **Установка.** В проект с Vitest Mootant добавляет 5 пакетов и 11.8 MB,
   Stryker — 168 пакетов и 61.5 MB. Холодная установка Mootant всё равно
   длится 9–11 с, из них около 6 с уходит на метаданные optional peers.
   Подробно в [`data/install-size.md`](data/install-size.md).
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
| Сравнения | `EqualityOperator`: `<`→`<=`,`>=`; `<=`→`<`,`>`; `>`→`>=`,`<=`; `>=`→`>`,`<`; `==`↔`!=`; `===`↔`!==` (`equality-operator-mutator.ts:7-16`). Кроме того, `ConditionalExpression` даёт `true`/`false` для любого сравнения (`conditional-expression-mutator.ts:32-50`) | `comparison-operator`: `<`→`<=`,`!=`,`false`; `<=`→`<`,`==`,`true`; числовое `===`→`<=`,`>=`,`false`; `!==`→`<`,`>`,`true`; нечисловое равенство, `in`, `instanceof` → `true`,`false` (`shared/get-comparison-plan.ts:113-182`). Если с одной стороны числовой литерал, константа заменяется сдвигом литерала на 1: `x > 10` → `x > 11` | У Mootant достаточный набор из 3 мутантов на оператор (Kaminski–Ammann–Offutt; Just et al., 2012), у Stryker — 2 замены и 2 константы. Отрицание `<`→`>=` у Stryker по Kaminski–Ammann–Offutt поглощается тремя мутантами этого набора. Сдвиг литерала есть только у Mootant |
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
  Без фильтра типов (§6.1) именно эти мутанты, если они выживут, станут шумом
  в отчёте.
- **Возвращаемое значение.** У Stryker это `ArrowFunction` и `BlockStatement`.
  У Mootant значение по типу из аннотации или из типа возврата функции, иначе
  `undefined` (`docs/content/mutators/return-value.md`). Подсказки типов
  берутся только из того же файла, поэтому для импортированных типов
  подставляется `undefined`. В выборке 42% мутантов `return-value` не
  проходят `tsc`, чаще всего с `TS2322` (например, `undefined` вместо
  `Map<…>`).
- **Вызовы методов.** Список у обоих почти одинаковый, но Mootant мутирует
  только если receiver может быть строкой или массивом. В выборке 178 таких
  мутантов, 141 совпадает со Stryker, и ни один не нарушает типы (0.0%). У
  Stryker 152 мутанта, 1.5% с ошибками типов.
- **Сравнения.** У Stryker из `a < b` получаются `a <= b`, `a >= b`, а через
  `ConditionalExpression` ещё `true` и `false`. У Mootant получаются
  `a <= b`, `a != b`, `false`. Мутант `a != b` убивается только тестом, где
  `a > b` и результат сравнения влияет на проверку. Отрицание `a >= b`
  отличается от оригинала на любом входе, поэтому его убивает любой тест,
  который вообще смотрит на результат. Такой мутант тривиален, а набор
  Mootant сильнее. О том, почему он достаточен, см. §5.4.
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
   `noFallthroughCasesInSwitch`. В менее строгих проектах доля, вероятно,
   ниже; это гипотеза, её проверит прогон на проектах раздела 4.
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
просто останавливается с ошибкой «There were failed tests in the initial
test run» (`packages/core/src/process/3-dry-run-executor.ts:124-140`).
Причину — тесты или инструментирование — Stryker не различает.

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
проверяет раздел 2: моки, symlinks, монорепы.

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
2026-03-12. Отсюда гипотеза: большинство проектов на Vitest пока на 4.x, а
Jest остаётся крупнейшей базой. Проверить её данными не удалось: запрос
скачиваний к api.npmjs.org прокси отклоняет с 403. Как подключать Rstest и Jest через контракт адаптера,
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
около 4 минут на 4048 мутантов. Проверка только выживших дешевле во
столько раз, во сколько выживших меньше, чем всех мутантов (§6.1).

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
   функции. Поэтому type checker запускается **один раз** на каталоге
   `mutants/`, а каждая ошибка относится к мутанту по диапазону строк его
   копии (`src/mutmut/mutation/file_mutation.py:672-710`). Это фильтр до
   запуска тестов, а не только для выживших. У Mootant переключение идёт на
   уровне выражений, без копий функций, поэтому ему проще проверять только
   выживших. → §6.1.
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
- Мутант публикуется как комментарий на ревью, и разработчик может пометить
  его «Not useful». Если целый класс мутантов признан бесполезным, для него
  добавляется правило подавления. Вторую кнопку, «Please fix», я помню по
  статьям, но в найденных фрагментах её нет, так что это не проверено.

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

## 6. Чего не хватает Mootant

Шкалы: приоритет must / should / nice; трудоёмкость S (до часа), M (до
дня), L (несколько дней), XL (больше недели). Прежде чем составить список,
я выбросил слабые и дублирующиеся идеи; что отклонено и почему — в §6.12.

| # | Чего не хватает | Приоритет | Трудоёмкость | Главное доказательство |
| --- | --- | --- | --- | --- |
| 6.1 | Проверка типов выживших мутантов | **must** | M (прототип) / L (project references, TS 7) | 25–29% мутантов на строгом TS не компилируются (§2.5); Infection, mutmut, Stryker |
| 6.2 | Доставка результатов в PR: аннотации, сводка, компактный формат | should | S–M | В коде нет ни одной аннотации; есть у Infection и cargo-mutants, у Google — на ревью |
| 6.3 | Раннеры: Vitest 4 (must), Jest (should) | must / should | L / XL | Только Vitest 5 (вышел 2026-09-03) и `node:test`; у Stryker 7 раннеров и `command` |
| 6.4 | Файл подавлений и режим «только новые выжившие» | should | M | Сейчас только комментарии в коде; у ESLint есть bulk suppressions; «Not useful» у Google; детектор у ACH |
| 6.5 | Аудит эвристик пропуска | should | M | 37% пропусков эвристические, `solitary` — 1031 на выборку; в исследованиях не обоснован |
| 6.6 | Пользовательские паттерны игнорирования | should | M (S для комментариев покрытия) | Есть только `loggers`; ignorers у Stryker, `skip_calls`, `ignoreSourceCodeByRegex`, arid у Google |
| 6.7 | Группировка выживших по функции и «один на строку» | should | S–M | У Google один мутант на строку; pseudo-tested methods |
| 6.8 | Экспорт в mutation-testing-report-schema | nice | M | Dashboard, SonarQube, общий viewer; так делают Mull и Infection |
| 6.9 | `--since` из diff-файла | nice | S | Сейчас нужен локальный merge base; `--in-diff` у cargo-mutants |
| 6.10 | Шардирование `--shard k/n` | nice | M | cargo-mutants |
| 6.11 | Разные коды выхода | nice | S | Сейчас код 1 и для ошибки, и для порога |

### 6.1. Проверка типов выживших (must; M для прототипа, L для полной версии)

- **Проблема.** В TS-проекте Mootant показывает выживших мутантов, которых
  компилятор и так не пропустит:
  - `coupon?.code` → `coupon.code` при `coupon: Coupon | undefined`;
  - удаление обязательного свойства из объекта типа `T`;
  - `'isolated'` → `''`, когда тип — литеральный union;
  - пропущенный `await`, после которого обращаются к свойству результата.

  Тест для таких мутантов не нужен: ошибку уже ловит `tsc`. Агент же
  потратит на них итерации.
- **Чем подтверждено.**
  - §2.5: 1173 из 4048 мутантов `recommended` (29.0%) добавляют ошибку типа
    в своём файле. Хуже всего у `optional-chaining` (30/30),
    `object-property` (94%), `missing-await` (72%), `array-element` (52%) и
    `return-value` (42%).
  - Подсказки типов работают только по тому же файлу
    (`docs/content/mutators/optional-chaining.md`: *«what Mootant can tell
    about a type from the same file»*).
  - Прецеденты: Stryker помечает такие мутанты `CompileError`; Infection
    проверяет только escaped-мутантов, *«ensuring optimal performance»*;
    mutmut делает это через `type_check_command`.
- **Предложение.**
  1. После прогона взять выживших (и, по желанию, непокрытых) мутантов в
     `.ts`/`.tsx`/`.mts`/`.cts` и в `<script lang="ts">`.
  2. Применить каждого в памяти к TS LanguageService, собранному по
     `tsconfig` проекта, и сравнить диагностики изменённого файла с
     исходными. Это ровно метод моего замера; скрипт в приложении.
  3. Мутанту с новой диагностикой дать статус вне score, например `Invalid`,
     с причиной вида `TS2741: Property 'x' is missing…`, и показывать его,
     как сейчас показываются `Ignored`.
  4. TypeScript брать из проекта как optional peer.
  5. Позже добавить проверку зависимых файлов и `tsgo` / TS 7 API, когда он
     станет стабильным: у Stryker это пока эксперимент без групп (#6112).
- **Польза.** Меньше шума в отчёте и в задачах для агента. Пользователи
  Stryker получают то же через checker, который проверяет каждого мутанта:
  в 2023 году прогон с ним шёл в 10 раз дольше, а группировка ускорила
  проверку на 43%. Mootant проверял бы только выживших и потому платил бы
  меньше: при 62 ms на мутанта в один поток 300 выживших — около 20 с. Долю
  выживших среди всех мутантов покажет раздел 4.
- **Риски и компромиссы.**
  - Зависимость от `typescript` в рантайме и от совпадения `tsconfig` со
    сборкой (paths, references, несколько `tsconfig`).
  - Ошибки в других файлах при проверке одного файла не видны. Это
    безопасное направление: Mootant отсеет меньше, но не больше.
  - Мутант, валидный во время выполнения (например, `null` от бэкенда при
    типе «не null»), будет скрыт. mutmut прямо предупреждает об этом. Нужна
    настройка `typecheck: 'off'`.
- **Как проверить.** На 2–3 TS-проектах из раздела 4:
  - доля выживших, которых отсеял фильтр;
  - ручная выборка из 20 отсеянных: все должны быть настоящими ошибками
    `tsc`;
  - накладные расходы меньше 10% времени прогона;
  - для JS-проектов вывод не меняется.

### 6.2. Доставка результатов в PR (should; S–M)

- **Проблема.** `--since` и `--threshold` уже дают сценарий для PR, но
  результат остаётся в логе CI. Ревьюер не видит выживших мутантов рядом с
  кодом.
- **Чем подтверждено.**
  - В `cli/`, `core/` и `adapters/` нет `GITHUB_` и `::warning`.
  - Infection `--logger-github` включается сам в GitHub Actions; cargo-mutants
    пишет аннотации, если задан `$GITHUB_ACTION`.
  - Google доставляет мутантов именно в ревью (§5.1). У Arcmutate PR-интеграция
    — платная функция (§4.1).
  - В ядре Stryker аннотаций нет, так что это ещё и отличие от конкурента.
- **Предложение.** Три небольших вывода:
  1. При `GITHUB_ACTIONS=true` или `--annotations github` — workflow
     commands `::warning file=…,line=…,endLine=…,title=Mootant: <mutator>::<было
     → стало; recheck>`, только для выживших на изменённых строках.
  2. Сводка в Markdown в `$GITHUB_STEP_SUMMARY`: score, счётчики, топ
     выживших с командами перепроверки.
  3. `--format compact` в стиле компилятора
     (`path:line:col: survived <mutator>: <orig> → <repl> [id]`) для problem
     matchers и редакторов, как у mull.
- **Польза.** Мутанты попадают туда, где принимают решения. Это главный
  урок Google и Infection.
- **Риски.** Шум в PR при большом числе выживших: нужен лимит и связка с
  §6.7. У GitHub есть лимиты на число аннотаций на шаг; их надо проверить
  по документации, я не проверял. Вывод не должен ломать `--json`.
- **Как проверить.** Snapshot-тесты вывода; workflow на демо-проекте
  (`docs/demo`) с одним выжившим на изменённой строке; аннотация видна в
  «Files changed».

### 6.3. Раннеры: Vitest 4 (must; L) и Jest (should; XL)

- **Проблема.** Mootant работает только с Vitest 5 и `node:test`
  (`docs/content/guide/compatibility.mdx:43`). Vitest 5.0.0 вышел
  2026-09-03, то есть два месяца назад; 4.0 вышла 2025-10-22 и, вероятно,
  до сих пор основная. Jest, по всей видимости, остаётся крупнейшей базой.
  Оба утверждения — гипотезы, данных о скачиваниях нет.
- **Чем подтверждено.** Таблица §3.4: у Stryker Jest, Mocha, Karma, Jasmine,
  Vitest ≥ 2, Tap, Cucumber и `command`. Даты выхода — из
  `npm view vitest time`. Доли аудитории получить не удалось (api.npmjs.org
  отвечает 403); их должен дать раздел 7.
- **Предложение.**
  1. Vitest 4 через тот же адаптер, если API `TestRunner` и пулов
     совместимы. Проверить это должен раздел 1.
  2. Jest через custom test environment с переключением мутантов в
     runtime, как mixin у Stryker. В Jest свой загрузчик модулей и нет Vite,
     поэтому XL.
  3. Rstest — по мере роста: сейчас 0.12.6.
- **Польза.** Кратный рост аудитории. Без этого остальные преимущества
  видны только пользователям Vitest 5.
- **Риски.** Одному мейнтейнеру тяжело поддерживать несколько раннеров;
  отсюда план контракта адаптера в разделе 1. Опасно потерять корректность
  на чужих моделях изоляции: у Jest она иная.
- **Как проверить.** Одинаковые фикстуры для всех раннеров дают одинаковые
  вердикты (план в разделе 1); прогон на 2 реальных проектах с Vitest 4.

### 6.4. Файл подавлений и «только новые выжившие» (should; M)

- **Проблема.** Принять выжившего мутанта сейчас можно только комментарием
  `mootant-ignore-next-line` в коде (`docs/content/mutators.md:84-113`).
  Неважно, эквивалентный он или «не стоит теста».
  - Код засоряется, каждое такое решение идёт через ревью.
  - Агенту приходится править исходник.
  - Команда, которая внедряет Mootant в legacy-код, не может гейтить CI
    правилом «нет **новых** выживших», не разобрав все старые.
- **Чем подтверждено.**
  - ESLint, по образцу которого построен Mootant, в 9.24 добавил bulk
    suppressions (`--suppress-all`, `--suppress-rule`, `eslint-suppressions.json`)
    ровно для постепенного внедрения правил.
  - Google превращает «Not useful» в правила (§5.1); ACH выделяет разбор
    эквивалентности в отдельный этап (§5.2).
  - У go-mutesting список подавлений по контрольным суммам ломается при
    любой правке (§4.6). Id Mootant стабильны и не содержат смещений
    (`core/identity/create-mutant-id.ts:52-61`), так что эта проблема
    решаема.
- **Предложение.**
  1. Файл `mootant-suppressions.json` с записями
     `id → {reason, category: 'equivalent' | 'unproductive', by: 'human' | 'agent', original, replacement}`.
  2. `--suppress-survivors` записывает текущих выживших как базовую линию,
     `--prune-suppressions` удаляет устаревшие записи.
  3. Подавленные мутанты не входят в score и показываются отдельно, как
     `Ignored`.
  4. Agent skill записывает сюда своё решение «эквивалентен» с
     обоснованием, а не правит код.
- **Польза.** Постепенное внедрение; решения людей и агента становятся
  данными, а не комментариями; задел для аудита правил (§6.5).
- **Риски.** Подавления могут прятать реальные пробелы. Поэтому:
  обязательный `reason`, счётчик подавленных в сводке, prune устаревших. При
  смене scope (переименовали функцию) id меняется, запись осиротеет, и мутант
  снова появится в отчёте; это безопасное направление.
- **Как проверить.** Тесты:
  - подавленный выживший не влияет на score и порог;
  - перенос кода внутри функции сохраняет подавление;
  - переименование функции снимает его;
  - `--prune-suppressions` удаляет записи без мутантов.

### 6.5. Аудит эвристик пропуска (should; M)

- **Проблема.** Mootant честно помечает эвристические пропуски
  (`docs/content/mutators.md:46-54`), но не знает, насколько они точны.
  Ошибка такого правила — главный риск философии «меньше шума»: полезный
  мутант молча пропадает.
- **Чем подтверждено.**
  - §2.5: 1194 из 3248 пропусков (37%) эвристические. Одно правило
    `solitary` выбросило 1031 кандидата, около 14% всех кандидатов выборки.
  - В литературе статическое «грубый мутант поглощается мелким внутри» не
    обосновано (§5.4).
  - Google признаёт, что часть его arid-эвристик неточна (§5.1).
  - Поиск ложных пропусков в конкретном коде — задача раздела 2.
- **Предложение.**
  1. `mootant run --audit-skips <N>` после основного прогона запускает
     случайную (с seed) выборку эвристически пропущенных кандидатов как
     обычных мутантов.
  2. По каждому правилу показывается, сколько кандидатов выжило при убитом
     «владельце» или мелком мутанте: это ложный пропуск.
  3. Мейнтейнер гоняет аудит на бенчмарках раздела 4 и в догфудинге, а
     пользователь может прислать промах правила.
- **Польза.** Утверждение «отсев не теряет полезных мутантов» подкреплено
  цифрами; правила с плохой точностью видны.
- **Риски.** Аудит стоит времени, поэтому только opt-in. Кандидаты должны
  уметь переключаться, как мутанты: сейчас в переключаемый код попадают
  только оставленные, это надо проверить.
- **Как проверить.** Таблица точности по правилам на 2–3 проектах; правило с
  точностью ниже порога (например, ниже 95%) — повод сделать его менее
  агрессивным.

### 6.6. Пользовательские паттерны игнорирования (should; M, а для комментариев покрытия S)

- **Проблема.** В каждом проекте есть свой «arid»-код: `invariant()`,
  `assert()`, метрики и трассировка (`metrics.increment`,
  `performance.mark`), feature flags отладки, сгенерированные файлы. Сейчас
  есть только `loggers` и построчные комментарии.
- **Чем подтверждено.** Stryker: ignorer-плагины, в том числе `angular`.
  cargo-mutants: `skip_calls` (по умолчанию `with_capacity`). Infection:
  `ignore` и `ignoreSourceCodeByRegex`. PIT: `avoidCallsTo`. mutmut уважает
  `# pragma: no cover`. Google: arid-узлы.
- **Предложение.**
  1. `settings.ignoreCalls: ['invariant', 'assert*', 'metrics.*']`, по
     аналогии с синтаксисом `loggers`. Внутри аргументов таких вызовов нет
     мутантов, и сам вызов не удаляется. Пропуск получает категорию
     `noise` и правило вроде `ignored-call`, поэтому виден в `--skipped`.
  2. `settings.coverageIgnores: true`: считать `/* v8 ignore next */`,
     `/* istanbul ignore next */` и `/* c8 ignore start|stop */`
     директивами игнорирования. Команда уже решила этот код не тестировать.
  3. Позже — тип плагина «правило пропуска».
- **Польза.** Меньше построчных комментариев; шум в типовых местах уходит
  одной строкой конфига.
- **Риски.** Можно проигнорировать лишнее. Смягчает то, что каждый такой
  пропуск виден в `list --skipped`.
- **Как проверить.** Фикстуры для каждого паттерна; пропуск виден в
  `--skipped` с правилом; без настройки вывод не меняется.

### 6.7. Группировка выживших: по функции и «один на строку» (should; S–M)

- **Проблема.** Если результат функции не проверяет ни один тест, выживают
  сразу её `return-value`, `statement-removal`, сравнения и литералы. Агент
  и человек получают N находок, у которых одна причина.
- **Чем подтверждено.** Google показывает один мутант на строку (§5.1).
  Работы о pseudo-tested methods показывают, что одна находка на метод
  информативнее (§5.6). В JSON Mootant уже есть `scope`.
- **Предложение.**
  1. В терминале, HTML и slim JSON, если в одном `scope` выжило не меньше
     k мутантов, сворачивать их в одну находку: «в `Cart.total` выжили N
     мутантов — вероятно, ни один тест не проверяет результат».
  2. `--per-line 1` показывает одного мутанта на строку, остальные доступны
     через `--all`.
  3. Счётчики и score не меняются.
- **Польза.** Отчёт и вход агента короче (размер в токенах оценивает
  раздел 6); лучше видны причины.
- **Риски.** Свёрнутые мутанты могут указывать на разные пробелы, поэтому
  раскрытие должно быть в один шаг.
- **Как проверить.** Размер slim JSON до и после на реальном проекте; ни
  один выживший не пропадает из `--all`.

### 6.8. Экспорт в mutation-testing-report-schema (nice; M)

- **Проблема.** Нет бейджа и истории в dashboard, нет импорта в SonarQube,
  нет общего viewer для команд со смешанным стеком.
- **Чем подтверждено.** Schema используют Stryker (JS, .NET, Scala), Mull и
  Infection. Dashboard принимает любой совместимый отчёт; SonarQube
  импортирует его через jq (§3.3).
- **Предложение.** Отдельный экспорт, например `run.report: { schema:
  'path.json' }`. Статусы сопоставляются: Error → RuntimeError, uncovered →
  NoCoverage, ignored и пропущенные → Ignored. Исходники кладутся в отчёт.
  Загрузку в dashboard достаточно описать в документации через `curl`.
- **Польза.** Интеграции без собственной инфраструктуры.
- **Риски.** Это экспорт, а не совместимость, но его придётся поддерживать
  при смене schema.
- **Как проверить.** Валидация по `mutation-testing-report-schema.json`
  (ajv); отчёт открывается в `mutation-test-report-app`.

### 6.9. `--since` из diff-файла (nice; S)

- **Проблема.** `--since` требует ref и merge base в локальном репозитории
  (`docs/content/guide/cli.mdx:111-112`). В CI с shallow-клоном или при
  diff, полученном из API PR, это неудобно.
- **Чем подтверждено.** `--in-diff` у cargo-mutants с отдельными кодами
  выхода, если diff не совпадает с деревом. Разбор unified diff в Mootant
  уже есть (`core/git/parse-unified-diff.ts`), поэтому S.
- **Предложение.** `--diff <file|->`, взаимоисключающий с `--since`.
- **Риски.** Diff от другого дерева. Нужно проверять совпадение «новой»
  стороны и выдавать понятную ошибку.
- **Как проверить.** Фикстуры: валидный diff, diff от другого дерева,
  бинарные файлы, переименования.

### 6.10. Шардирование `--shard k/n` (nice; M)

- **Проблема.** Очень большие проекты в CI упираются в одну машину.
- **Чем подтверждено.** cargo-mutants, включая модель стоимости
  (§4.2). У Stryker шардов нет.
- **Предложение.** Детерминированное разбиение по хешу id мутанта, у
  каждого шарда свой кэш, затем объединение JSON-отчётов.
- **Риски.** Dry run повторяется в каждом шарде; объединение отчётов.
  Спроса пока нет, потому что кэш и `--since` закрывают большую часть
  случаев.
- **Как проверить.** Объединение шардов совпадает с одиночным прогоном.

### 6.11. Разные коды выхода (nice; S)

- **Проблема.** CI и агенты не отличают «инструмент упал» от «score ниже
  порога»: оба дают 1 (`cli/run-mutation.ts:74,93,136`, `cli/index.ts:18`).
- **Чем подтверждено.** cargo-mutants (2 — пропущенные мутанты, 3 —
  таймауты, 4 — baseline, 70 — внутренняя ошибка); gremlins (10 и 11 для
  разных порогов).
- **Предложение.** 1 — ошибка; 2 — не пройден порог; 3 — тесты падают уже
  без мутантов. До 1.0, пока это дёшево.
- **Риски.** Сломаются скрипты, которые проверяют `== 1`; это надо указать в
  changelog.
- **Как проверить.** Тесты CLI на каждый код.

### 6.12. Отклонённые и отложенные идеи

| Идея | Почему не в списке |
| --- | --- |
| Совместимость со Stryker: конфиг, имена мутаторов, плагины | Противоречит позиционированию. Хватит страницы соответствия в документации (§7) |
| Мутаторы `BlockStatement`, `ArrowFunction`, `ObjectLiteral → {}`, `&&` ↔ `\|\|`, отрицание сравнения | Поглощаются мутантами Mootant (§2.2) |
| Date-сеттеры в `method-call` | Узко, пользы не видно; можно сделать плагином |
| Higher-order мутанты | Трудно объяснять, плохо сочетаются с переключением и с циклом «один мутант — один тест» (§5.6) |
| Предсказание вердиктов (PMT) | Предсказанный выживший — шум. Приемлемо только для порядка работы, а это раздел 4 |
| Выборка мутантов | Даёт оценку score, но не конкретные пробелы. Отложено до запросов с очень больших проектов |
| Порог для covered score (Infection) | S, но ценность низкая; вернуться, если попросят пользователи с legacy-кодом |
| Real-time HTML, плагин VS Code через MSP | Агенты важнее IDE; MCP разбирает раздел 6. Вернуться после 1.0 |
| «TCE для JS» через минификатор | Гипотеза без данных; основные тривиальные классы правила уже закрывают (§5.5) |
| LLM-генерация мутантов (LLMorpheus, ACH) | Недетерминирована, ломает стабильные id и кэш. LLM полезна для тестов и разбора, а не для генерации (§5.3) |
| `mootant apply <id>` / `--patch` | Полезно (S), но это мелкая UX-деталь; разумно добавить вместе с §6.7 |

## 7. В чём Mootant уже сильнее и как это подчеркнуть

### 7.1. Сильные стороны с доказательствами

1. **Мутантов меньше, и они точнее, на исследованных операторах.** Набор
   `comparison-operator` — достаточный по Kaminski–Ammann–Offutt
   (`core/mutators/shared/get-comparison-plan.ts:113-182`); в Stryker его
   предлагали и не сделали (#4349). Только у Mootant есть мутаторы
   `number-literal`, `missing-await`, типизированный `return-value`,
   `regex-flag`, побитовые операторы и `||` ↔ `??`. На одном и том же коде
   мутантов на 22% меньше, а совпадает лишь 43% (§2.5).
2. **Каждый пропуск объясним.** `list --skipped` показывает категорию,
   правило, причину и флаг `heuristic` (`docs/content/mutators.md:26-67`);
   в реестре `core/skips/skip-rules.ts` 95 правил. Stryker пришёл к тем же
   фильтрам в 2026 году, но выбрасывает мутантов без следа: *«should not
   exist in your report»*, #4463. По сути это подход EMS (ISSTA 2024), но
   для JS/TS и прозрачный.
3. **Вердикт не зависит от имён тестов и их независимости.**
   - Static-мутанты обрабатываются без особого случая.
   - Dry run отделяет падения из-за инструментирования
     (`core/run/run-dry-phase.ts:116-140`).
   - В `--fast` до и после каждой попытки с мутантом идут контрольные
     попытки (`adapters/vitest/runner.ts:198-200`).
   - Timeout подтверждается повторным прогоном (`core/run/run-isolated-rounds.ts`).

   На vitest-runner Stryker только за 2026 год заведено как минимум пять
   issues о ложных Survived: #6150, #6209, #6210, #6213, #6256 (§3.1); часть
   уже закрыта. Одна из этих ошибок, #6210, обрушила score на Vitest 5.
4. **Кэш по умолчанию безопасный**: он учитывает чтения файлов и переменных
   окружения тестами, lockfile и версии (`core/cache/get-environment-key.ts:59-88`).
   Incremental у Stryker таких изменений не видит (`docs/incremental.md`,
   Limitations).
5. **`--since` есть из коробки**, вместе с незакоммиченными и
   неотслеживаемыми файлами (`core/git/read-changed-lines.ts:55-70`). У
   StrykerJS его нет (#2843).
6. **Цикл для агента.** Стабильные id без смещений
   (`core/identity/create-mutant-id.ts:52-61`), `--mutant <id>`, slim JSON с
   `recheck`, вероятными тестовыми файлами и исходными строками
   (`cli/report/slim-run-report.ts:9-24`). Это то, что Meta ACH и MuTAP
   описывают как mutation-guided test generation (§5.2–5.3).
7. **Нативная поддержка Vitest 5 и `node:test`.** У Stryker Vitest 5 был
   сломан до 10.1.1 (#6210), а `node:test` доступен только через
   tap-runner (PR #6020 открыт).
8. **Лёгкая установка**: 5 пакетов и 11.8 MB против 168 пакетов и 61.5 MB
   (§3.8).
9. **Шаблоны Vue и Svelte.** Mootant мутирует выражения в шаблонах обоих
   фреймворков и проверяет, что шаблон компилируется (`core/instrument/check-vue-compile.ts`,
   `check-svelte-compile.ts`). Stryker мутирует в `.vue` только скрипт.
10. **Шум от зависаний не создаётся вовсе.** Мутанты, которые, вероятно,
    подвесят цикл, в `recommended` не создаются (`timeouts: false`,
    `core/presets/recommended.ts:35`), но в `strict` возвращаются.

### 7.2. Как это подчеркнуть

- **README, раздел «Why Mootant».** Пункт «Filter out noise» сейчас
  абстрактный (`readme.md:58-59`). Его стоит подкрепить проверяемыми
  фактами:
  - «every skipped change is listed with its rule (`mootant list --skipped`)»;
  - «comparison mutants follow the sufficient set from mutation research»;
  - «5 dependencies».

  Цифры против Stryker — «на N% меньше мутантов», «быстрее» — писать **только
  после** раздела 4 и с методикой.
- **Страница документации «Mootant and Stryker».** Фактическая таблица
  соответствий, она же гайд миграции, о котором спрашивает раздел 6:
  - `// Stryker disable next-line X` → `// mootant-ignore-next-line x`;
  - `excludedMutations` → `'off'`;
  - `incremental` → кэш по умолчанию и `--incremental`;
  - `ignoreStatic` → не нужен;
  - `checkers: ['typescript']` → §6.1, когда появится;
  - `--mutate file:lines` → `--since` или `--mutant`;
  - имена мутаторов (таблица §2.1).
- **Страница «Why Mootant skips a mutant».** Категории и исследования за
  ними коротко, с одной ссылкой на каждое: достаточные операторы, EMS,
  arid-узлы Google. Честно описать флаг `heuristic`, а после §6.5 — показать
  точность правил. Это ответ скептику на вопрос «а не теряете ли вы
  мутантов».
- **Позиционирование:** «mutation testing that shows the mutants worth a
  test, explains every one it skips, and lets an agent fix them». Без
  обещаний «no equivalent mutants»: отсев эвристический. Без «TypeScript-aware»,
  пока нет §6.1: подсказки синтаксические.
- **Для агентов:** документировать цикл `run --json` → тест →
  `--mutant <id>` как контракт: поля, коды выхода (§6.11), стабильность id.
  Agent skill должен лежать в репозитории (раздел 6).

## Эмпирическая проверка

> _Заполняется по данным раздела 4 (бенчмарки на реальных проектах: запуски
> Stryker и Mootant)._

Что сюда нужно (предложение для агента раздела 4):

1. Сколько мутантов создаёт каждый инструмент на одних и тех же файлах:
   Stryker с `coverageAnalysis: perTest`, Mootant с `recommended` и
   `strict`. Пересечение считать скриптом из приложения (`stryker-list.mjs` и
   сравнение по диапазону и замене).
2. Какую долю выживших у Stryker Mootant не создаёт (отсеял). Ручной разбор
   выборки из 20–30 мутантов: верно отсеян (эквивалентный, непродуктивный,
   поглощённый) или потерян реальный пробел.
3. Выжившие, которых нашёл только один инструмент, с ручной оценкой
   полезности. Особенно мутаторы, которых нет у Stryker: `number-literal`,
   `missing-await`, `return-value`.
4. Ложные пропуски `solitary`. На `strict` (`coarseMutants: true`)
   посчитать грубых мутантов, которые выжили при убитых мелких мутантах
   внутри.
5. Доля выживших Mootant, которые не проходят `tsc`. Прогнать
   `typecheck-mutants.mjs` только по выжившим; это обоснование §6.1.
6. Время на мутанта и время на «полезного» мутанта, то есть выжившего,
   который после разбора требует теста.

## 9. Источники

**StrykerJS и Stryker-экосистема**

- Исходники: <https://github.com/stryker-mutator/stryker-js/tree/8f24ef0be3a2119fc44ac48bfce58930ab2c9032>.
  Мутаторы: `packages/instrumenter/src/mutators/*`; instrumenter:
  `transformers/babel-transformer.ts`, `util/syntax-helpers.ts`;
  планировщик: `packages/core/src/mutants/{mutant-test-planner,incremental-differ}.ts`;
  раннеры: `packages/*-runner/src`; checker:
  `packages/typescript-checker/src`.
- Документация в репозитории: `docs/configuration.md`, `docs/incremental.md`,
  `docs/typescript-checker.md`, `docs/disable-mutants.md`, `docs/plugins.md`,
  `docs/vitest-runner.md`, `docs/tap-runner.md`, `docs/jest-runner.md`,
  `docs/config-file.md`.
- Issues и PR:
  [#2843](https://github.com/stryker-mutator/stryker-js/issues/2843),
  [#3137](https://github.com/stryker-mutator/stryker-js/issues/3137),
  [#3496](https://github.com/stryker-mutator/stryker-js/issues/3496),
  [#3900](https://github.com/stryker-mutator/stryker-js/pull/3900),
  [#4349](https://github.com/stryker-mutator/stryker-js/issues/4349),
  [#4463](https://github.com/stryker-mutator/stryker-js/issues/4463),
  [#5765](https://github.com/stryker-mutator/stryker-js/issues/5765),
  [#6004](https://github.com/stryker-mutator/stryker-js/issues/6004),
  [#6010](https://github.com/stryker-mutator/stryker-js/pull/6010),
  [#6012](https://github.com/stryker-mutator/stryker-js/pull/6012),
  [#6020](https://github.com/stryker-mutator/stryker-js/pull/6020),
  [#6073](https://github.com/stryker-mutator/stryker-js/issues/6073),
  [#6099](https://github.com/stryker-mutator/stryker-js/pull/6099),
  [#6112](https://github.com/stryker-mutator/stryker-js/issues/6112),
  [#6144](https://github.com/stryker-mutator/stryker-js/issues/6144),
  [#6209](https://github.com/stryker-mutator/stryker-js/issues/6209),
  [#6210](https://github.com/stryker-mutator/stryker-js/issues/6210),
  [#6213](https://github.com/stryker-mutator/stryker-js/issues/6213),
  [#6248](https://github.com/stryker-mutator/stryker-js/issues/6248),
  [#6256](https://github.com/stryker-mutator/stryker-js/issues/6256).
  Номера #6099 и #6112 взяты из CHANGELOG и поиска; страницы этих PR я не
  открывал.
- Блог и dashboard (`stryker-mutator/stryker-mutator.github.io`):
  `blog/2022-09-06-announcing-incremental-mode.mdx`,
  `blog/2023-02-17-announcing-faster-typescript-checker.mdx`,
  `blog/2023-05-04-announcing-realtime-reporting-for-stryker.mdx`,
  `blog/2025-11-07-vscode-plugin.mdx`, `docs/General/dashboard.md`.
- mutation-testing-elements: `docs/supported-mutators.md`,
  `docs/static-mutants.md`, `docs/equivalent-mutants.md`,
  `docs/mutant-states-and-metrics.md`, `docs/sonarqube-integration.md`,
  `packages/report-schema/src/mutation-testing-report-schema.json` (3.9.0).
- Mutation Server Protocol: npm `mutation-server-protocol@0.4.1`, `dist/schema.d.ts`.

**Другие инструменты**

- PIT: <https://github.com/hcoles/pitest-site> (`quickstart/*.markdown`,
  `pages/faq.markdown`, `pages/weak_tests.markdown`).
- cargo-mutants: <https://github.com/sourcefrog/cargo-mutants/tree/main/book/src>
  (`in-diff.md`, `pr-diff.md`, `shards.md`, `baseline.md`, `exit-codes.md`,
  `iterate.md`, `ci.md`, `mutants-out.md`, `skip_calls.md`, `goals.md`,
  `using-results.md`, `timeouts.md`), `examples/workflows/in-diff.yml`.
- mutmut: <https://github.com/boxed/mutmut/blob/main/README.rst>.
- cosmic-ray: <https://github.com/sixty-north/cosmic-ray/tree/master/docs/source>
  (`concepts.rst`, `how-tos/filters.rst`).
- Infection: <https://github.com/infection/site/tree/master/src/guide>
  (`command-line-options.md`, `static-analysis-integration.md`,
  `profiles.md`, `usage.md`, `index.md`).
- mull: <https://github.com/mull-project/mull/tree/main/docs>
  (`HowMullWorks.rst`, `IncrementalMutationTesting.rst`).
- gremlins: <https://github.com/go-gremlins/gremlins/tree/main/docs/docs/usage>;
  go-mutesting: <https://github.com/avito-tech/go-mutesting>.
- ESLint bulk suppressions: <https://eslint.org/blog/2025/04/eslint-v9.24.0-released/>.

**Исследования.** Проверены по поисковой выдаче; полные тексты недоступны
из сессии.

- Petrović, Ivanković. State of Mutation Testing at Google. ICSE-SEIP 2018.
  doi:10.1145/3183519.3183521. PDF:
  <https://research.google.com/pubs/archive/46584.pdf>.
- Petrović, Ivanković, Fraser, Just. Practical Mutation Testing at Scale: A
  view from Google. IEEE TSE 2021. arXiv:2102.11378;
  <https://homes.cs.washington.edu/~rjust/publ/practical_mutation_testing_tse_2021.pdf>.
- Petrović, Ivanković, Fraser, Just. Does mutation testing improve testing
  practices? ICSE 2021, с. 910–921. arXiv:2103.07189.
- Foster, Gulati, Harman и др. Mutation-Guided LLM-based Test Generation at
  Meta. FSE 2025 Companion. arXiv:2501.12862. Блог Meta:
  <https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/>;
  InfoQ, 2026-01-06: <https://www.infoq.com/news/2026/01/meta-llm-mutation-testing>.
- Harman, O'Hearn, Sengupta. Harden and Catch for Just-in-Time Assured
  LLM-Based Software Testing: Open Research Challenges. FSE 2025.
  arXiv:2504.16472.
- Beller и др. What It Would Take to Use Mutation Testing in Industry — A
  Study at Facebook. ICSE-SEIP 2021, с. 268–277. arXiv:2010.13464.
- Kaminski, Ammann, Offutt. Improving logic-based testing. JSS 2013.
  doi:10.1016/j.jss.2012.08.024.
- Just, Kapfhammer, Schweiggert. Using Non-Redundant Mutation Operators and
  Test Suite Prioritization to Achieve Efficient and Scalable Mutation
  Analysis. ISSRE 2012, с. 11–20.
- Ammann, Delamaro, Offutt. Establishing Theoretical Minimal Sets of Mutants.
  ICST 2014, с. 21–30. doi:10.1109/ICST.2014.13.
- Kurtz, Ammann, Offutt, Delamaro, Kurtz, Gökçe. Analyzing the validity of
  selective mutation with dominator mutants. FSE 2016, с. 571–582.
  doi:10.1145/2950290.2950322.
- Just, Kurtz, Ammann. Inferring Mutant Utility from Program Context.
  ISSTA 2017, с. 284–294. doi:10.1145/3092703.3092732.
- Papadakis, Jia, Harman, Le Traon. Trivial Compiler Equivalence. ICSE 2015,
  с. 936–946. Kintis и др. Detecting Trivial Mutant Equivalences via
  Compiler Optimisations. TSE 2018.
- Kushigian, Kaufman, Featherman, Potter, Madadi, Just. Equivalent Mutants
  in the Wild. ISSTA 2024, с. 654–665. doi:10.1145/3650212.3680310.
- Tian и др. Large Language Models for Equivalent Mutant Detection: How Far
  Are We? ISSTA 2024. arXiv:2408.01760.
- Dakhel и др. Effective test generation using pre-trained Large Language
  Models and mutation testing (MuTAP). IST 171 (2024) 107468. arXiv:2308.16557.
- LLMorpheus: <https://github.com/githubnext/llmorpheus> (архив), новая
  версия — `neu-se/llmorpheus`. Площадку статьи не подтвердил.
- Jia, Harman. Higher Order Mutation Testing. IST 51(10), 2009, с. 1379–1393.
- Zhang и др. Predictive Mutation Testing. ISSTA 2016; расширенная версия —
  TSE 2019.
- Gopinath, Alipour, Ahmed, Jensen, Groce. How hard does mutation analysis
  have to be, anyway? ISSRE 2015, с. 216–227. doi:10.1109/ISSRE.2015.7381815.
- Vera-Pérez, Danglot, Monperrus, Baudry. A comprehensive study of
  pseudo-tested methods. EMSE 24 (2019), с. 1195–1225.
  doi:10.1007/s10664-018-9653-2.

**Что проверить не удалось**

- Полные тексты статей: из сессии недоступны arxiv.org, research.google,
  dblp.org и сайты университетов. Цифры взяты из аннотаций и фрагментов, а
  расхождения отмечены в тексте: число инженеров у Google, число мутантов у
  ACH, ROR «3 из 7» против «4» в одном из вторичных источников.
- Сайт stryker-mutator.io недоступен. Вместо него читал исходники сайта в
  GitHub.
- Скачивания npm (api.npmjs.org отвечает 403), поэтому доли аудитории
  раннеров не посчитаны.
- Ошибки Stryker, описанные в issues (#6209, #6213, #6256 и др.), я не
  воспроизводил: брал их статус и описания.

## Приложение: скрипты статических замеров

Как воспроизвести замеры §2.5:

1. Скопировать `core/` и `types/` из `170ec52` вместе с `package.json` и
   `tsconfig.json` в `<dir>/project`.
2. В `<dir>` выполнить
   `npm i -D typescript@5.9 @azat-io/typescript-config@1 @types/node@24 oxc-parser@0.156.0 @eslint-community/regexpp@4.12.2 lilconfig@3.1.4 @stryker-mutator/instrumenter@10.1.1 /home/user/artifacts/mootant-0.1.0-170ec52.tgz`.
3. Список мутантов Mootant: `cd project && ../node_modules/.bin/mootant list core/text core/regex core/git core/cache core/run --json --verbose > list.json`.
   С `--skipped` получаются пропуски, с `--preset strict` — набор `strict`.
4. Список мутантов Stryker: `node stryker-list.mjs <dir>/project stryker.json core/text core/regex core/git core/cache core/run`.
5. Проверка типов: `node typecheck-mutants.mjs <dir>/project list.json out.json`;
   для Stryker передать `stryker.json`.
6. Пересечение: `python3 -I overlap.py list.json stryker.json`.

Машина общая, поэтому скрипты запускались с `nice`. Время проверки типов
(около 61–63 ms на мутант) — порядок величины, а не бенчмарк.

<details>
<summary><code>typecheck-mutants.mjs</code></summary>

```js
// Type-checks every mutant of a `mootant list --json --verbose` report in memory,
// the way @stryker-mutator/typescript-checker does it without grouping: apply one
// mutant to its file, ask the language service for the diagnostics of that file,
// and compare them with the diagnostics of the unmutated file.
//
// Usage: node typecheck-mutants.mjs <projectDir> <list.json> <out.json>
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let [projectDir, listFile, outFile] = process.argv.slice(2)
let require = createRequire(path.join(projectDir, '..', 'package.json'))
let ts = require('typescript')

let configPath = path.join(projectDir, 'tsconfig.json')
let config = ts.getParsedCommandLineOfConfigFile(
  configPath,
  // Same overrides as @stryker-mutator/typescript-checker (issue 391)
  { allowUnreachableCode: true, noUnusedLocals: false, noUnusedParameters: false },
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => console.error(d.messageText) },
)
let files = new Map(config.fileNames.map(f => [path.resolve(f), { version: 0, text: null }]))
let overrides = new Map()
let host = {
  getScriptFileNames: () => [...files.keys()],
  getScriptVersion: f => String(files.get(path.resolve(f))?.version ?? 0),
  getScriptSnapshot: f => {
    let abs = path.resolve(f)
    let text = overrides.has(abs) ? overrides.get(abs) : ts.sys.readFile(abs)
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
  },
  getCurrentDirectory: () => projectDir,
  getCompilationSettings: () => config.options,
  getDefaultLibFileName: o => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
}
let service = ts.createLanguageService(host, ts.createDocumentRegistry())

let key = d => `${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
let diagnose = abs => [
  ...service.getSyntacticDiagnostics(abs),
  ...service.getSemanticDiagnostics(abs),
].map(key)
let multiset = list => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map())
let newDiagnostics = (base, now) => {
  let left = new Map(base)
  let added = []
  for (let k of now) {
    let n = left.get(k) ?? 0
    if (n > 0) left.set(k, n - 1)
    else added.push(k)
  }
  return added
}

let report = JSON.parse(readFileSync(listFile, 'utf8'))
let byFile = new Map()
for (let m of report.mutants) {
  if (!byFile.has(m.file)) byFile.set(m.file, [])
  byFile.get(m.file).push(m)
}
let results = []
let started = Date.now()
for (let [file, mutants] of byFile) {
  let abs = path.resolve(projectDir, file)
  let original = readFileSync(abs, 'utf8')
  let entry = files.get(abs)
  if (!entry) {
    for (let m of mutants) results.push({ id: m.id, mutator: m.mutator, file, status: 'outside-project' })
    continue
  }
  overrides.delete(abs)
  entry.version++
  let base = multiset(diagnose(abs))
  for (let m of mutants) {
    let text = original.slice(0, m.start) + m.replacement + original.slice(m.end)
    if (original.slice(m.start, m.end) !== m.original) {
      results.push({ id: m.id, mutator: m.mutator, file, status: 'offset-mismatch' })
      continue
    }
    overrides.set(abs, text)
    entry.version++
    let added = newDiagnostics(base, diagnose(abs))
    results.push({
      id: m.id,
      mutator: m.mutator,
      file,
      line: m.line,
      original: m.original,
      replacement: m.replacement,
      status: added.length > 0 ? 'CompileError' : 'ok',
      errors: added.slice(0, 3),
    })
  }
  overrides.delete(abs)
  entry.version++
}
let elapsed = Date.now() - started
let summary = {}
for (let r of results) {
  let s = (summary[r.mutator] ??= { total: 0, CompileError: 0 })
  s.total++
  if (r.status === 'CompileError') s.CompileError++
}
let total = results.length
let errors = results.filter(r => r.status === 'CompileError').length
let codes = {}
for (let r of results) for (let e of r.errors ?? []) {
  let c = e.split(':')[0]
  codes[c] = (codes[c] ?? 0) + 1
}
writeFileSync(outFile, JSON.stringify({ total, errors, elapsedMs: elapsed, typescript: ts.version, summary, codes, results }, null, 1))
console.log(`typescript ${ts.version}: ${errors}/${total} mutants (${((100 * errors) / total).toFixed(1)}%) add a type error in their file; ${elapsed} ms (${(elapsed / total).toFixed(1)} ms/mutant)`)
for (let [m, s] of Object.entries(summary).sort((a, b) => b[1].CompileError - a[1].CompileError))
  console.log(`  ${m.padEnd(22)} ${String(s.CompileError).padStart(4)} / ${String(s.total).padStart(4)}  (${((100 * s.CompileError) / s.total).toFixed(1)}%)`)
console.log('top TS codes:', Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 10))
```

</details>

<details>
<summary><code>stryker-list.mjs</code></summary>

```js
// Lists the mutants StrykerJS 10 generates for a set of files, using its
// instrumenter directly (no test runner), in the shape typecheck-mutants.mjs reads.
// Usage: node stryker-list.mjs <projectDir> <out.json> <dir>...
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

let [projectDir, outFile, ...dirs] = process.argv.slice(2)
let require = createRequire(path.join(projectDir, '..', 'package.json'))
let { Instrumenter } = await import(require.resolve('@stryker-mutator/instrumenter'))

let walk = dir =>
  readdirSync(dir).flatMap(name => {
    let full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
let fileNames = dirs
  .flatMap(d => walk(path.resolve(projectDir, d)))
  .filter(f => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
  .sort()
let logger = {
  isTraceEnabled: () => false,
  isDebugEnabled: () => false,
  isInfoEnabled: () => false,
  isWarnEnabled: () => true,
  isErrorEnabled: () => true,
  isFatalEnabled: () => true,
  trace() {},
  debug() {},
  info() {},
  warn: (...a) => console.error('warn', ...a),
  error: (...a) => console.error('error', ...a),
  fatal: (...a) => console.error('fatal', ...a),
}
let instrumenter = new Instrumenter(logger)
let files = fileNames.map(name => ({ name, mutate: true, content: readFileSync(name, 'utf8') }))
let started = Date.now()
let result = await instrumenter.instrument(files, { plugins: null, excludedMutations: [], ignorers: [] })
let elapsed = Date.now() - started
let lineStarts = new Map()
let offsetOf = (file, { line, column }) => {
  if (!lineStarts.has(file)) {
    let text = readFileSync(file, 'utf8')
    let starts = [0]
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
    lineStarts.set(file, starts)
  }
  return lineStarts.get(file)[line] + column
}
let mutants = result.mutants.map(m => {
  let text = readFileSync(m.fileName, 'utf8')
  let start = offsetOf(m.fileName, m.location.start)
  let end = offsetOf(m.fileName, m.location.end)
  return {
    id: m.id,
    mutator: m.mutatorName,
    file: path.relative(projectDir, m.fileName),
    line: m.location.start.line + 1,
    start,
    end,
    original: text.slice(start, end),
    replacement: m.replacement,
    status: m.status ?? 'Pending',
  }
})
let byMutator = {}
for (let m of mutants) byMutator[m.mutator] = (byMutator[m.mutator] ?? 0) + 1
writeFileSync(outFile, JSON.stringify({ summary: { totalFiles: files.length, totalMutants: mutants.length, elapsedMs: elapsed }, byMutator, mutants }, null, 1))
console.log(`stryker instrumenter: ${files.length} files, ${mutants.length} mutants, ${elapsed} ms`)
console.log(Object.entries(byMutator).sort((a, b) => b[1] - a[1]))
```

</details>

<details>
<summary><code>overlap.py</code></summary>

```python
# Overlap of Mootant and Stryker mutants: same file, same source range and the
# same replacement once whitespace, quote style and outer parentheses are ignored.
# Usage: python3 -I overlap.py <mootant-list-verbose.json> <stryker-list.json>
import json
import re
import sys
from collections import Counter

moo = json.load(open(sys.argv[1]))['mutants']
sty = json.load(open(sys.argv[2]))['mutants']


def norm(text):
    text = re.sub(r'\s+', '', text)
    text = text.replace('"', "'").replace('`', "'")
    return re.sub(r'^\((.*)\)$', r'\1', text)


def key(mutant):
    return (mutant['file'], mutant['start'], mutant['end'], norm(mutant['replacement']))


both = {key(m) for m in sty} & {key(m) for m in moo}
print('stryker', len(sty), 'mootant', len(moo), 'exact overlap', len(both))
for name, mutants in (('mootant', moo), ('stryker', sty)):
    total = Counter(m['mutator'] for m in mutants)
    shared = Counter(m['mutator'] for m in mutants if key(m) in both)
    print(name)
    for mutator, count in total.most_common():
        print(f'  {mutator:24} {shared.get(mutator, 0):5}/{count:5}')
```

</details>

