# Инструментирование (mutant switching): корректность

> Раздел 2 анализа, подраздел «Инструментирование». Коммит 170ec52
> (`/home/user/wt/base`, эксперименты — worktree `/home/user/wt/instrument`,
> ветка `experiment/instrument`, dist скопирован из сборки base). Диапазон ID:
> BUG-100…BUG-199. Node 22.23.4 (плюс 22.12.0 и 20.19.0 для node:test),
> Vitest 5.0.5, Vite 8.3.5, oxc-parser 0.156.0, vue 3.5.44, svelte 5.57.3.

## Итог

Ядро переключения (`core/instrument/*`, `core/generate/validate-replacement.ts`,
`core/syntax/is-value-position.ts`) спроектировано очень аккуратно: все
известные ловушки mutant schemata (потеря `this` у callee, short-circuit
optional chaining, `delete`/`typeof`, цели присваивания, директивы, ASI,
метки, `super`, генераторы, async, деструктуризация, JSX, шаблоны Vue/Svelte,
`import.meta.glob`) закрыты явными проверками, и это подтверждается
эмпирически. На корпусе из 123 867 мутантов (1 466 файлов, 9 проектов,
`--preset strict`) switched-текст каждого файла компилируется V8, у каждого
мутанта ровно один сайт, структурный аудит не нашёл ни одной цели в
«чувствительной» позиции. Тест-сьюты на switched-коде без runtime и с
`active=null` дали ровно те же результаты, что на оригинале (ufo 487 тестов,
defu 23, фикстуры Vue и Svelte). Активация мутанта через runtime совпала с
физическим применением по каждому тесту на всех 322 проверенных мутантах
(ufo 200, Vue 70, Svelte 52) и на 1 105 мутантах ловушек — кроме узкого
класса с выводом имени функции (BUG-103).

Найденные проблемы лежат на краях, но две из них реальны для популярного кода:
(1) регулярное выражение, начинающееся с `<!--`, попадает в switched-тексте
сразу после `(` и из-за ошибки лексера oxc (Vite 8/rolldown) модуль не
разбирается — файл теряет все мутанты (BUG-106, medium; 3 исходных файла
корпуса — парсер и препроцессор компилятора Svelte и `escapeHtml.ts` Vue — и
один тестовый);
(2) защитная сетка dry run слишком грубая — провал, не достигший ни одного
сайта, объявляет сломанными **все** файлы прогона (BUG-100, medium);
(3) размер switched-текста растёт квадратично с размером литерала (BUG-104,
medium; таблица сущностей компилятора Svelte: 41 КБ → 92 МБ);
(4) нет source map — номера строк в stack trace неверны у 43 % строк кода
Mootant (BUG-102, low); (5) проверка сайта не гигиенична к привязке
`globalThis` (BUG-101, low; независимо найдено как BUG-904); (6)
NamedEvaluation (BUG-103, low).

## Таблица находок

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-100 | Если упавшие в dry run тесты (или незагрузившиеся тест-файлы) не достигли ни одного сайта, `instrumentation-break` получают **все** switched-файлы прогона: ложная диагностика у невиновных файлов, все мутанты `Error`, exit 1. Триггеры: нестабильный тест/хук до вызова кода, ошибка трансформации, исключение в самой проверке сайта (BUG-101) | medium | подтверждён | `core/run/run-dry-phase.ts:505-517` (строка 516), `:275-296`, `:385-421` | `test/repros/BUG-100.test.ts`; `test/repros/BUG-100/run.sh` (фикстуры collateral, flaky) |
| BUG-101 | Проверка `globalThis.__mootant?.hit(id)` читает ближайшую привязку `globalThis`: параметр/переменная с таким именем → мутант никогда не включается и не покрывается (ложный `NoCoverage`), `undefined` → `TypeError`, `const globalThis = …` с сайтами в инициализаторе → TDZ `ReferenceError` при загрузке модуля | low | подтверждён | `core/instrument/get-site-check.ts:11-13` | `test/repros/BUG-101.test.ts`; trap t15/t16; фикстура collateral (BUG-100) |
| BUG-102 | Switched-текст сдвигает строки (многострочные replacement'ы вставляются рядом с оригиналом) и колонки, source map не строится, Vitest-плагин возвращает `map: null` (для Vite это «позиции не менялись»), node:test отдаёт текст как есть → stack trace указывает не туда; тест, читающий номер строки тестируемого кода, падает в dry run → все мутанты файла `Error` | low | подтверждён | `core/instrument/instrument-file.ts:44,51-76`, `adapters/vitest/create-mootant-plugin.ts:49`, `adapters/node-test/preload/create-source-switcher.ts:54-56` | `test/repros/BUG-102.test.ts`; `test/repros/BUG-102/run.sh` |
| BUG-103 | Вывод имени (NamedEvaluation) не работает через `?:`: при активном мутанте logical-operator, оставляющем анонимную функцию/класс в инициализаторе (`let g = flag \|\| function () {}` → `function () {}`), `g.name === ''`, а у физически применённого мутанта `'g'` | low | подтверждён | `core/instrument/render-mutant-range.ts:91-95` | `test/repros/BUG-103.test.ts`; trap t07 (9 из 59 мутантов) |
| BUG-104 | Размер switched-текста (и отчёта `list --json`) квадратичен по числу элементов литерала: replacement'ы `object-property`/`array-element` — весь литерал без одного элемента. Svelte `entities.js` (41 КБ, `--preset strict`): switched 92 МБ, `list --json --verbose` 419 МБ, 3,9 ГБ RSS | medium | подтверждён | `core/instrument/render-mutant-range.ts:85-95`, `core/instrument/create-switched-files.ts:74-104`, `core/mutators/object-property.ts`, `core/mutators/array-element.ts` | `test/repros/BUG-104.test.ts`; `analysis/tools/instrument/switch-size.mjs` |
| BUG-106 | Литерал регулярного выражения, начинающийся с `<!--` (вырезание HTML-комментариев), в switched-тексте стоит сразу после `(`; oxc (0.156–0.157, им разбирают модули Vite 8/rolldown) в режиме `unambiguous` читает `(/<!--` как HTML-комментарий → «HTML comments are not allowed in modules», тест-файлы не загружаются, все мутанты файла `Error` (`instrumentation-break`). Триггер — и оригинал (`/<!--[\s\S]*?-->/g`), и replacement `regex-pattern` (`/^(?:-?>)+\|<!--\|…/` → `/<!--\|…/`) | medium | подтверждён | `core/instrument/render-mutant-range.ts:91-95`; апстрим — лексер oxc | `test/repros/BUG-106.test.ts`; `test/repros/BUG-106/run.sh`; I1: vuejs/core `packages/shared/src/escapeHtml.ts`, svelte `compiler/phases/1-parse/index.js`, `compiler/preprocess/index.js` |

Bug-prompts (medium): `analysis/bug-prompts/BUG-100.md`,
`analysis/bug-prompts/BUG-104.md`, `analysis/bug-prompts/BUG-106.md`.
Остальные — low, промпты не требуются.

Пересечения с другими разделами (независимые подтверждения): BUG-101 ≈
BUG-904 (`static-review.md`); BUG-100 — обобщение BUG-902 (нестабильный провал
приписывается инструментированию) и BUG-905 (непарсящийся replacement плагина
ломает все файлы): у всех трёх общая строка `run-dry-phase.ts:516` как
причина «все файлы».

## Как устроено переключение (что проверялось)

- Выражение: `(c1 ? (r1) : c2 ? (r2) : (original))`, где `c = globalThis.__mootant?.hit("<id>")`
  (`core/instrument/render-mutant-range.ts:91-95`, `get-site-check.ts:11-13`).
  Перед выражением, начинающим statement списка, ставится guard `;` (Vue — `{}`)
  (`find-statement-starts.ts:62-111`).
- Statement: `{ if (c1) {r1} else if (c2) {r2} else {original} }`
  (`render-mutant-range.ts:85-90`). Вложенные диапазоны хостятся в
  original-ветке внешнего (`group-mutant-ranges.ts:15-57`); пересекающиеся
  диапазоны → `instrument-error` файла.
- Новых функций, областей видимости и объявлений switch не вводит, поэтому
  `this`, `arguments`, `super`, `new.target`, `yield`, `await`, hoisting,
  TDZ и метки сохраняются по построению; это и подтвердили ловушки.
- Допустимость цели: `validateReplacement` (`core/generate/validate-replacement.ts:49-84`)
  требует выражение в value-позиции (`core/syntax/is-value-position.ts:50-61`:
  не цель записи, не имя, не shorthand/метод/JSX-форма, не операнд
  `delete`/`typeof x`, не callee/tag с `this` и не `eval`, не short-circuit
  элемент цепочки) или statement в statement-позиции, но не тело метки.
  Нарушение — диагностика `Mutator "<id>" …` и skip `invalid-target`
  (`core/generate/collect-candidates.ts:286-305`).
- Из дерева исключены директивы, спецификаторы модулей, аргументы
  `import.meta.glob`, enum, декораторы, типы (`core/tree/index-tree.ts:15-136`);
  макросы Vue и руны Svelte закреплены (`core/syntax/find-compiler-pins.ts:40-74`);
  обработчики Vue — member path не трогается.
- Блочные мутанты в корпусе: `statement-removal` (replacement `;`) и
  `condition` для `for (;;)`/меток (replacement — копия всего цикла с `false`).

## Методика и объём проверки

Все скрипты — `analysis/tools/instrument/`, сырые данные —
`analysis/data/instrument/` (крупное — `/home/user/projects/instrument/`).
Switched-тексты строятся собственным `instrumentFile` Mootant из dist, мутанты —
CLI `mootant list --json --verbose` (тот же конфиг и пресет, что у
пользователя), компиляторы Vue/Svelte — те же загрузчики, что в
`core/run-mutants.ts:390-393`.

1. **Ловушки (trap-run.mjs).** 21 модуль (`analysis/data/instrument/trap-modules/`),
   1 105 мутантов (strict). Для каждого модуля: original vs switched без
   runtime vs switched с `active=null` (каждый вариант в свежем worker,
   TS/JSX через `transformWithOxc`), и для каждого мутанта: switched с
   `active=X` (реальный `installMutantRuntime` из dist) vs физически
   применённый X (сырой replacement без скобок). Охват: Annex B hoisting,
   `var`, TDZ `let`/`class`, completion values `eval`, директивы и
   strict/sloppy `this`, `arguments` (mapped/unmapped), `with`, direct/indirect
   `eval`, `new Function`, callee с `this` (`obj.m()`, `(obj.m)()`, `obj?.m()`,
   `obj.m?.()`, `obj[k]()`, `this.#p()`), tagged templates и `String.raw`,
   optional chaining (все позиции), `delete`, `typeof undeclared`, имена
   функций/классов, классы (`super()`, `super.x`, `new.target`, static blocks,
   приватные поля, `#x in o`, геттеры/сеттеры), генераторы и async-генераторы,
   `yield*`, `for await`, `try/finally` с `return`, ASI без точек с запятой,
   деструктуризация с дефолтами (порядок, ленивость), короткое замыкание и
   логические присваивания с побочными эффектами, порядок вычисления, метки и
   `switch` с fall-through, `export default`, `import.meta.url`, JSX
   (фрагменты, spread, key), TS (parameter properties, `as`, `satisfies`, `!`,
   generics, enum, legacy-декораторы), объектные литералы с `__proto__`,
   методами с `super` и computed keys, регулярные выражения с флагами `u`/`v`,
   затенение `globalThis`, `using` (с понижением oxc до ES2022). Результат: (а) 0 расхождений без активного
   мутанта, кроме t16 (BUG-101); (б) расхождения только в t07 (BUG-103) и
   t15/t16 (BUG-101).
2. **I1 + структурный аудит (i1-check.mjs)** — switched-текст парсится oxc,
   проходит `transformWithOxc` и компилируется V8 (`vm.SourceTextModule`/
   `vm.Script`); у каждого id ровно один сайт; каждый физически применённый
   мутант парсится; аудит контекста каждого мутанта в AST оригинала
   (this-callee, tag, `eval`, `delete`, `typeof x`, цель записи, short-circuit
   элемент, директива, метод/shorthand/JSX-форма, NamedEvaluation, блок не в
   statement-позиции, тело метки, `super()`-statement, привязки `globalThis`).

   | Корпус (strict) | Файлов | Мутантов | Ошибок parse/transform/compile/сайтов/raw | Аудит |
   | --- | ---: | ---: | --- | --- |
   | Mootant `core`, `adapters`, `cli` | 650 | 35 262 | 0/0/0/0/0 | 1 NamedEvaluation (`core/run/create-run-state.ts:97`) |
   | azat-io/eslint-plugin-perfectionist (`rules`, `utils`, `index.ts`) | 248 | 10 146 | 0/0/0/0/0 | — |
   | unjs/ufo `src` | 6 | 1 095 | 0/0/0/0/0 | — |
   | unjs/defu `src` | 2 | 64 | 0/0/0/0/0 | — |
   | expressjs/express (`lib`, `index.js`, CJS) | 7 | 1 225 | 0/0/0/0/0 | 1 NamedEvaluation (`lib/response.js:914`) |
   | ljharb/qs `lib` (CJS) | 5 | 1 735 | 0/0/0/0/0 | — |
   | pmndrs/zustand `src` (TS/TSX) | 12 | 553 | 0/0/0/0/0 | — |
   | vuejs/core (reactivity, shared, runtime-core, runtime-dom, compiler-core, compiler-sfc) | 162 | 28 805 | 1/1/0/0/0 — `shared/src/escapeHtml.ts` (BUG-106) | 2 NamedEvaluation (`runtime-core/src/hydrationStrategies.ts:7,9`) |
   | sveltejs/svelte `packages/svelte/src` без `entities.js` | 374 | 44 982 | 3/3/0/0/— — `compiler/phases/1-parse/index.js`, `compiler/preprocess/index.js`, `internal/server/renderer.test.ts` (BUG-106) | 1 NamedEvaluation (`compiler/state.js:150`) |
   | svelte `compiler/phases/1-parse/utils/entities.js` | 1 | 4 462 | switched 92 МБ — не разбирался (BUG-104) | |
   | ловушки и пробные файлы (`src/traps`, `src/t`, регулярные выражения с `u`/`v`) | 21 | 1 104 | 0 (одна ошибка compile — `(?i:)` в самой фикстуре, Node 22 его не знает; после удаления 0) | 9 NamedEvaluation, 2 `globalThis` |
   | **Итого (без ловушек)** | **1 466** | **123 867** | **4 файла не разбираются (все — BUG-106), 0 compile, 0 сайтов, 0 raw** | **5 NamedEvaluation** |

   Для runtime-core Vue и Svelte проверка разбора каждого физически
   применённого мутанта отключена (`--raw no`): `parseSync` на каждый мутант
   держал до 6 ГБ RSS, а два первых прогона были убиты OOM-killer'ом общей
   машины.

3. **I2 (project-diff.mjs i2)** — весь тест-сьют проекта обычным Vitest без
   Mootant: оригинал; все мутированные файлы заменены switched-текстом без
   runtime; то же с runtime `active=null` (через `NODE_OPTIONS=--import`).
   Сравнение по-тестово.

   | Проект | Тестов | Мутантов захощено | Расхождения (без runtime / null) |
   | --- | ---: | ---: | --- |
   | unjs/ufo | 487 | 1 095 | 0 / 0 |
   | unjs/defu | 23 | 64 | 0 / 0 |
   | Vue-фикстура (`Cart.vue`, шаблон + script setup, @vue/test-utils) | 5 | 70 | 0 / 0 |
   | Svelte-фикстура (`Counter.svelte` с рунами, `tally.svelte.js`) | 4 | 52 | 0 / 0 |

4. **I3 (project-diff.mjs i3)** — для выборки мутантов: `vitest related` по
   мутированному файлу при физически применённом мутанте vs switched-файлы с
   `active=X`, установленным до загрузки модулей. Расхождение
   перепроверяется повтором обеих сторон.

   | Проект | Мутантов | Убиты физически | Убиты switched | Расхождений |
   | --- | ---: | ---: | ---: | ---: |
   | unjs/ufo (seed 7, 14 мутаторов, в среднем 467 тестов на прогон) | 200 | 151 | 151 | 0 |
   | Vue-фикстура (все, из них 27 в шаблоне) | 70 | 55 | 55 | 0 |
   | Svelte-фикстура (все: компонент с рунами и `.svelte.js`) | 52 | 35 | 35 | 0 |
   | **Итого** | **322** | **241** | **241** | **0** |

   Совпадение — по каждому тесту (не только «убит/выжил»).

5. **node:test** — фикстуры `nt-cjs` (CJS-модуль, импортируемый из ESM-теста
   именованными импортами; на Node 22.23.4 с `registerHooks`, 22.12.0 и
   20.19.0 с `register()`) и `nt-ts` (TS через встроенный type stripping
   Node 22.23): вердикты `mootant run` совпали с физическим применением всех
   15 мутантов `nt-ts`; в `nt-cjs` 5/5 убиты на всех трёх версиях, именованные
   экспорты CJS не теряются (гипотеза о cjs-module-lexer на пути `register()`
   не подтвердилась).

6. **I4 (i4-determinism.mjs)** — два `list` подряд: идентичные id, тексты и
   порядок (992 мутанта); обратный порядок путей: идентичные id и порядок.
   Запуск из подкаталога в проекте без конфига даёт другие id (992 из 992):
   корень = cwd (`core/config/prepare-run.ts:133`), display path входит в
   хэш (`core/identity/create-mutant-id.ts:61-73`). Это задокументировано
   (`docs/content/guide/configuration.mdx:126-130`: «Without a configuration
   file, the current directory is the root»), поэтому не баг, но ловушка:
   `--mutant <id>` и кэш (`node_modules/.cache/mootant` в корне) из другого
   каталога не находятся. В проектах с конфигом id стабильны.

### Как перезапустить

Нужен собранный Mootant с `node_modules` (по умолчанию
`MOOTANT_ROOT=/home/user/wt/instrument`: worktree 170ec52, `pnpm install
--frozen-lockfile --ignore-scripts`, dist из `pnpm run build`). Проекты —
с установленными `mootant` (tgz), `vitest@5.0.5`, `vite@8.3.5`.

```bash
T=analysis/tools/instrument
# ловушки: original/switched/null и active=X vs физический X
node $T/trap-run.mjs <project> out.json src/traps/t01-hoist.cjs …   # TRAP_WORK=<каталог внутри проекта> для TS-декораторов
# I1 + аудит (большие корпуса — по частям, --raw no экономит память)
node --expose-gc --max-old-space-size=3072 --experimental-vm-modules $T/i1-check.mjs <root> out.json <paths…> [--preset strict] [--raw no]
# I2 / I3 (файлы проекта меняются на месте и восстанавливаются)
node $T/project-diff.mjs --project <dir> --paths src --out i2.json --mode i2
node $T/project-diff.mjs --project <dir> --paths src --out i3.json --mode i3 --sample 200 --seed 7 [--mirror test]
# вердикты mootant run против физического применения (по строкам i3)
node $T/compare-verdicts.mjs i3.json mootant-run.json out.json
# I4, сдвиг строк, размер switched-текста
node $T/i4-determinism.mjs <root> out.json <sub-dir> <paths…>
node $T/line-shift.mjs <root> out.json <paths…>
(cd <project> && PRESET=strict node $T/switch-size.mjs <file>)
```

## Подробности по находкам

### BUG-100 — один провал без улик выбрасывает все файлы

`findBrokenFiles` (`core/run/run-dry-phase.ts:505-517`) берёт файлы мутантов,
чьи сайты достигли упавшие тесты (`tries[0].covers`) и незагрузившиеся
тест-файлы (`file.covers`); если таких нет — `new Set(related)`, то есть все
switched-файлы. Затем `recoverFromFailures` (`:275-296`) удаляет их все с
сообщением «Tests fail with the switched <file> and pass without it».
«Реальность» провала проверяется одним прогоном без switched-файлов
(`checkRealFailures`, `:385-421`), поэтому и нестабильный провал считается
вызванным инструментированием (это BUG-902).

Воспроизведение на реальном Vitest (`test/repros/BUG-100/run.sh`):

- collateral: `src/env.js` с `const globalThis = …` (его switched-текст бросает
  при загрузке, BUG-101) и невиновный `src/price.js` с тестами →
  `dropped: ["src/env.js","src/price.js"]`, 14/14 мутантов `Error`;
- flaky: `test/format.test.js` падает при загрузке только в первый раз (как
  тест, которому не досталось порта) → `dropped: ["src/format.js","src/price.js"]`,
  12/12 `Error`. Повторный запуск без сбоя: 9 Killed, 3 Survived.

Последствие для пользователя: весь прогон (на больших проектах — часы)
заканчивается `Error` у всех мутантов, exit 1, кэш не сохраняется, а
диагностика ложно обвиняет конкретные файлы. Насколько часто: требуется
провал, не дошедший до кода мутантов, — падение `beforeAll` (БД, порт,
сеть), ошибка загрузки тест-файла, ошибка трансформации switched-модуля
(макросы плагинов, непарсящийся replacement плагина — BUG-905). На
интеграционных сьютах это реалистично.

Направление исправления: при пустом наборе улик — сперва повторить те же
тест-файлы с теми же switched-файлами (нестабильность → предупреждение), при
повторе — бисекция по switched-файлам, которые импортирует упавший
тест-файл.

### BUG-101 — затенение `globalThis`

Проверка сайта — текст `globalThis.__mootant?.hit("id")`
(`core/instrument/get-site-check.ts:11-13`); идентификатор разрешается
лексически. Ловушки: параметр `globalThis` с объектом → 4 мутанта из 4 не
включаются (физически убиваются: `{"r":[5]}` vs `{"r":[7]}` и т. п.); модульная
`const globalThis = typeof window !== 'undefined' ? window : {…}` → switched
без runtime падает при загрузке `ReferenceError: Cannot access 'globalThis'
before initialization` (оригинал работает). Аудит корпусов: 0 привязок
`globalThis` в 1 300 файлах — редкость (встречается в полифил-коде, напр.
README пакета `globalthis` предлагает `var globalThis = require('globalthis')()`).
Исправление: вставка в начало файла не поможет — модульная `const
globalThis` всплывает, и любое обращение к ней до объявления даёт TDZ.
Надёжнее обращаться к runtime без разрешения идентификатора, например
`({}).constructor.__mootant?.hit(id)` (неперечислимое свойство конструктора
`Object`: только обращения к свойствам, ни одного идентификатора, который
можно затенить) или хотя бы распознавать привязку `globalThis` в
файле при инструментировании и для такого файла использовать другую проверку
либо давать диагностику вместо молчаливого `NoCoverage`.

### BUG-102 — нет source map

`instrumentFile` прямо документирует «No source map is made»
(`core/instrument/instrument-file.ts:44`); плагин Vitest отдаёт
`{ code: switched, map: null }` (`adapters/vitest/create-mootant-plugin.ts:49`),
что Vite трактует как «позиции не изменились»; node:test отдаёт switched-текст
с маркером (`adapters/node-test/preload/create-source-switcher.ts:54-56`).
Колонки сдвигаются на каждой строке с сайтом; строки — после каждого
многострочного replacement (object-property, logical-operator, array-element,
missing-await, method-call, condition для `for(;;)`). На коде Mootant
(`line-shift.mjs`, recommended): у 333 из 650 файлов (51 %) код сдвинут вниз,
43 % строк оригинала в stack trace получают неверный номер, медиана сдвига
10 строк, максимум `core/run-mutants.ts`: 713 → 2 395 строк (+1 682).
Последствия: (1) тест, который проверяет номер строки (логгеры с
местом вызова, утилиты stack trace, инструменты отладки) падает в
instrumented dry run → `instrumentation-break`, все мутанты файла `Error`
(фикстура `BUG-102/run.sh`: 15/15 `Error`); (2) сообщения упавших тестов в
`--verbose` указывают не на те строки. Вердикты остальных тестов не страдают.

### BUG-103 — NamedEvaluation

`let g = cond ? function () {} : x` не даёт функции имени (у условного
выражения нет NamedEvaluation), а `let g = (function () {})` даёт. Поэтому при
активном мутанте, чей replacement — анонимная функция/класс/стрелка в
позиции именования (инициализатор, `=`/`||=`/`&&=`/`??=`, значение свойства,
поле класса, дефолт параметра), имя теряется. Мутатор — `logical-operator`
(выбрасывание левого операнда). Встречаемость: 1 в Mootant
(`core/run/create-run-state.ts:97`, `input.report ?? (() => {})`), 1 в express
(`lib/response.js:914`), 0 в остальных корпусах. Влияет только на тесты,
читающие `.name` (снимки компонентов без displayName, DI по имени).
Исправление: для таких слотов рендерить ветку как `({ [name]: r })[name]` или
не создавать такие мутанты; без активного мутанта поведение не меняется
(оригинал внутри `(…)` сохраняет имя — проверено ловушками).

### BUG-104 — квадратичный размер

См. `analysis/bug-prompts/BUG-104.md`. Замеры (`switch-size.mjs`):

| Файл | Пресет | Мутантов | `list --json --verbose` | switched | `transformWithOxc` | RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| svelte `entities.js` (41 289 Б) | strict | 4 462 | 418,8 МБ | 92,1 МБ (×2231) | 13,1 с | 3,9 ГБ |
| то же | recommended | 2 231 | 0,8 МБ | 0,17 МБ (×4,1) | 0,4 с | 0,1 ГБ |
| массив из 1000 вызовов `fnN()` (40,7 КБ) | recommended | 2 000 | 36,3 МБ | 9,0 МБ | 1,4 с | 0,5 ГБ |

Весь `packages/svelte/src` под strict: `list --json` 238 МБ, `--verbose`
461 МБ, 86 с, 3 ГБ RSS (близко к пределу длины строки V8 ≈ 512 МБ, после
которого `JSON.stringify` бросает). Отдельно для раздела производительности:
`list` одного `entities.js` занимает 50–56 с даже под recommended —
генерация мутантов нелинейна на больших литералах.

### BUG-106 — `(/<!--` и лексер oxc

Switched-текст всегда берёт replacement и original в скобки
(`core/instrument/render-mutant-range.ts:91-95`). oxc в режиме
`sourceType: 'unambiguous'` (так модули разбирают Vite 8 и rolldown, и так же
`core/parser/parse-file.ts:77`) в файле с `import`/`export` читает скобку,
за которой сразу идёт литерал `/<!--…/`, как HTML-комментарий и сообщает
«HTML comments are not allowed in modules». Минимальные случаи
(oxc-parser 0.156.0 и 0.157.0): `const a = (/<!--x/g)\nexport {}` — ошибка;
`(c ? (/<!--x/g) : 1)` — ошибка; `/<!--x/g`, `f(/<!--x/g)`, `(0, /<!--x/g)`,
`(c ? /<!--x/g : 1)` и тот же код с `sourceType: 'module'` — разбираются. То
есть это ошибка oxc, но Mootant сам создаёт единственную форму, в которой она
проявляется: в исходниках регулярное выражение обычно стоит после `=` или
как аргумент вызова.

Триггеры в корпусе: исходные `/<!--[^]*?-->|<script…>/g` в
`packages/svelte/src/compiler/phases/1-parse/index.js:15` и
`compiler/preprocess/index.js:254,256`; в vuejs/core —
`packages/shared/src/escapeHtml.ts:48`, где исходное
`/^(?:-?>)+|<!--|-->|--!>|<!-$/g` не начинается с `<!--`, но replacement
`regex-pattern` без первой альтернативы — начинается. Тот же шаблон есть в
`packages/server-renderer/src/helpers/ssrRenderSlot.ts:139` Vue
(`/<!--[^]*?-->/gm`, в корпус не входил). На Vitest 5 + Vite 8:
`RolldownError: Parse failure … HTML comments are not allowed in modules`,
все мутанты файла `Error` с ложной формулировкой «Tests fail with the
switched … and pass without it» (фикстура `BUG-106/run.sh`: 9/9 `Error`).
Если упавшие тест-файлы не успели достичь ни одного сайта, BUG-100 выбросит
и все остальные файлы прогона. Обход в Mootant: не брать в скобки ветки, где
они не нужны (литералы, вызовы, члены — в ветке `?:` скобки нужны только
последовательности), плюс проверка разбора switched-текста в
`createSwitchedFiles`; и сообщить об ошибке в oxc.

## Отсутствующие гарантии и неявные предположения

1. **Switched-текст не проверяется на синтаксическую корректность.**
   `createSwitchedFiles` (`core/instrument/create-switched-files.ts:74-104`)
   проверяет только компиляцию Svelte/шаблона Vue. Корректность держится на
   том, что replacement'ы встроенных мутаторов — выражения/операторы, а
   `groupReplacement` (`core/generate/group-replacement.ts:170-196`) обрамляет
   скобками там, где это нужно. Для плагинных мутаторов непарсящийся текст
   (`needsParentheses` возвращает true, когда текст не парсится, и просто
   оборачивает его) уходит в switched-файл и через BUG-100 ломает весь прогон
   (BUG-905). Эмпирически для встроенных мутаторов — 0 ошибок на 124 тыс.
   мутантов, кроме BUG-106 (4 файла из 1 466, где switched-текст не
   разбирается из-за ошибки oxc). Дёшево было бы парсить switched-текст тем же
   парсером в `createSwitchedFiles` и отбрасывать (с диагностикой) мутанты,
   ломающие разбор, — это закрыло бы и BUG-106, и BUG-905.
2. **«Replacement того же синтаксического класса».** Для блочных мутантов
   switch оборачивает replacement в `{…}`, а физическое применение и отчёт —
   нет: объявление `let`/`function` в replacement плагина имеет разную
   область видимости в switch и в показанном пользователю диффе.
   Встроенные блочные replacement'ы — `;` или копия цикла, проблем нет.
3. **Эквивалентность «switch ≡ физическое применение»** опирается на
   предположения, нарушения которых Mootant не обнаруживает: имя функции не
   читается (BUG-103); `Function.prototype.toString` не сравнивается (switched-
   код виден в исходнике функции — сериализация функций в воркеры/браузер,
   хэши по исходнику); номера строк не читаются (BUG-102); привязка
   `globalThis` не затенена (BUG-101); код мутанта выполняется в процессе
   теста (дочерние процессы и воркеры исполняют оригинал — задокументировано в
   `docs/content/guide/compatibility.mdx:57,74`, сайты там не считаются →
   `NoCoverage` у реально проверенного кода); тесты не читают исходники с
   диска (физическая мутация меняет файл, switch — нет).
4. **Компиляторы и плагины, читающие код «как написано».** Закреплены только
   макросы Vue и руны Svelte (`core/syntax/find-compiler-pins.ts:40-74`) и
   аргументы `import.meta.glob` (`core/syntax/is-module-call.ts:20`). Макросы
   сторонних плагинов, требующие статических литералов (`definePage`
   unplugin-vue-router, Lingui `t({ message })`, FormatJS `defineMessages`),
   не защищены — гипотеза H1 ниже.
5. **Нет бюджета размера** switched-текста (BUG-104).
6. **Сетка безопасности dry run покрывает только наблюдаемые изменения** и
   работает с точностью до файла; при отсутствии улик — до всего прогона
   (BUG-100).
7. **Счётчик хитов имеет побочный эффект** (исключение после `hitLimit`,
   `core/runtime/install-mutant-runtime.ts:40-53`), его может проглотить
   `try/catch` пользователя. Вердикт тем не менее решается по счётчику
   (`core/run/classify-try.ts:26-28`, `core/run/read-isolated-unit.ts:31-38`),
   так что ложного `Survived` это не даёт — гарантия есть.
8. **`globalThis.__mootant` перечислимо** (`Reflect.set`,
   `install-mutant-runtime.ts:22`): тесты, проверяющие утечки глобалов через
   `Object.keys(globalThis)`, увидят лишнее свойство в dry run. Гипотеза,
   практического примера на Vitest/node:test не найдено.

## Гипотезы (не подтверждены)

- **H1. Макросы плагинов отвергают switched-аргументы.** Попытка на
  `@vitejs/plugin-react` 6.2.1 + `babel-plugin-formatjs` 13.0.10
  (`/home/user/projects/instrument/formatjs`): в этой конфигурации Babel-плагин
  не применялся к `.js`, switched-код прошёл, вердикты нормальные — гипотеза
  не подтвердилась для этой связки. Проверить: проекты с `definePage`
  (unplugin-vue-router) или Lingui-макросами в Vitest-конфиге.
- **H2. Тесты с `Object.keys(globalThis)`** — см. п. 8.

## Отрицательные результаты (что выдержало проверку)

- Все ловушки из задания, кроме имён функций (см. «Методика», п. 1).
- `typeof undeclared`, `delete`, optional chaining, callee с `this`, tag,
  `eval`, цели присваивания, директивы, блок вне statement-позиции, тело
  метки, `super()`: аудит 123 867 мутантов — 0 нарушений.
- Директивы (`'use strict'`, `'use client'`) не мутируются и не оборачиваются
  (`core/tree/index-tree.ts:129-130`).
- ASI: guard `;` перед каждым выражением, начинающим statement списка; на
  корпусах без точек с запятой (Mootant, perfectionist, Vue core, zustand) —
  0 ошибок разбора, связанных с ASI (единственные ошибки разбора — BUG-106).
- `super()`: statement-removal его не создаёт; parameter properties и поля
  TS остаются корректными.
- Шаблоны Vue (27 мутантов шаблона, включая обработчики событий) и Svelte:
  I2/I3 без расхождений.
- node:test: CJS из ESM, Node 20.19/22.12 (`register()`) и 22.23
  (`registerHooks`), type stripping — без расхождений с физическим
  применением.
- Регулярные выражения с флагами `u`/`v` (класс-сеты, `\q{}`, lookbehind):
  все мутанты компилируются V8.
- Инвалидация кэша трансформаций при переключении instrumented/plain dry run
  (`adapters/vitest/run-dry.ts:54-63,107-109`).

## Что не проверено

- `using`/`await using` (Node 22 их не поддерживает, без транспиляции не
  исполнить); Vitest с esbuild (Vite 6/7) вместо oxc; Windows-пути.
- Полный I2 на собственном тест-сьюте Mootant и на perfectionist (машина была
  перегружена соседними агентами, load average 25–33).
