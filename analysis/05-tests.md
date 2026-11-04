# 5. Тесты самого проекта

> Черновик, заполняется по ходу работы. Коммит `170ec52`. Статический разбор —
> по `git ls-files` (без мусора вроде `test/fixtures/**/node_modules/.vite`).
> Машина: 4 vCPU, во время прогонов load average 20–30 (≈10 агентов), см. §5.3.
> Скрипты: `analysis/tools/tests/`, сырые данные: `analysis/data/tests/`.

## 5.1. Соотношение тест/код: нормально или признак хрупкости

### Объём

| Что | Файлов | Строк | Из них JSDoc | Пустых | «Тело» (без JSDoc, пустых, импортов) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Исходники `core`+`adapters`+`cli` (без `.d.ts`) | 653 | 59 924 | 18 737 (31,3 %) | 3 863 | 34 135 |
| Тесты `test/**/*.test.ts` (без фикстур) | 637 | 81 819 | 4 114 (5,0 %) | 7 331 | 67 345 |
| Хелперы `test/helpers` | 59 | 4 784 | 1 645 (34,4 %) | 381 | 2 565 |
| Фикстуры `test/fixtures` (отслеживаемые) | 277 | 41 531 | — | — | из них 37 626 — `test/fixtures/list` (эталонные JSON) |

Источник: `analysis/tools/tests/line-kinds.mjs`, `analysis/data/tests/line-kinds.txt`.

Цифра «88 тыс. строк тестов на 60 тыс. исходников» (1,47×) занижает
реальное соотношение. Треть строк исходников — JSDoc, в тестах его 5 %. По
«телу» соотношение около **2,0×** (67 тыс. на 34 тыс.). В 10 491 тесте 2 602
объявления `it`/`it.each`: таблицы `it.each` есть в 315 файлах из 637 (840
таблиц). Основной объём тестов — это **данные**: фрагменты исходного кода на
входе и ожидаемые мутанты на выходе. Пример:
`test/core/mutators/comparison-operator.test.ts:21-40`, 921 строка теста на 39
строк мутатора, который делегирует в `core/mutators/shared/get-comparison-plan.ts`.

Распределение не равномерное, а смещено в правильную сторону:

- Медиана отношения «тест / его исходник» по парам — **1,16** (p25 0,85,
  p75 1,67, p90 2,45).
- 25 крупнейших тест-файлов дают 29 % всех строк. Это интеграционные и
  конвейерные тесты: `test/core/generate/generate-file-mutants.test.ts` (4 859
  строк, 987 тестов), `test/adapters/vitest/index.test.ts` (1 921 строка на
  24 строки входа адаптера), `test/adapters/vitest/runner.test.ts` (1 563),
  `test/core/run-mutants.test.ts` (1 179), тесты мутаторов.
- 22 тест-файла (14,5 тыс. строк, 18 % объёма) гоняют конвейер «фрагмент кода →
  мутанты» через хелперы `runMutator`, `generateMutants`, `generateCandidates`
  (`test/helpers/run-mutator.ts`). Ещё 5 файлов идут через точки входа пакета:
  `adapters/*/index.ts`, `cli/index.ts`, `core/index.ts`, `core/runtime/index.ts`.

Для инструмента такого рода 2× — норма. Входы — программы, а у каждого
мутатора и эвристики есть пограничные синтаксические формы. ESLint-правила,
Babel-плагины и мутаторы Stryker покрываются тестами того же характера и
объёма. Сам объём хрупкости не создаёт. Хрупкость создают привязки к
реализации, и их немного. Разбор ниже.

### На что нацелены тесты: приватные хелперы или публичное поведение

Публичный API пакета крошечный: `defineConfig`, `classifyTry`,
`resolveSwitchedText`, адаптеры, CLI, runtime (`core/index.ts:1-38`). Поэтому
«публичное» здесь значит **поверхность модуля-папки**: файл импортируют из
другой папки. «Приватный» хелпер импортируют только из его папки. Каждый
тест-файл классифицирован по своему двойнику (`test/core/x/y.test.ts` →
`core/x/y.ts`) скриптом `analysis/tools/tests/test-coupling.mjs`. Данные по
файлам: `analysis/data/tests/test-subjects.tsv`.

| Класс двойника | Исходных файлов | Тест-файлов | Строк тестов |
| --- | ---: | ---: | ---: |
| Точка входа сборки (`vite.config.ts` `lib.entry`) | 9 | 9 | 4 758 |
| Поверхность папки, ≥ 2 импортёров | 143 | 141 | 12 328 |
| Поверхность папки, 1 импортёр | 114 | 111 | 26 930 |
| Приватный хелпер, ≥ 2 импортёров в папке | 178 | 169 | 10 588 |
| **Приватный хелпер с единственным импортёром** | 208 | 206 | 27 194 |
| Только тесты импортируют | 19 | 1 | 21 |

Итого 375 тест-файлов из 637 (59 %, 37,8 тыс. строк — 46 % объёма)
тестируют приватные хелперы папок. Из них 206 — хелперы с единственным
вызывающим, главные кандидаты на слияние по правилу G1 раздела 1. Это и есть
«стоимость» стиля «одна функция — один файл» для тестов. Но эти тесты устроены
так, что переносу кода почти не мешают (§5.2):

- 444 тест-файла (70 %) импортируют ровно один исходный файл, своего двойника.
  131 — два, 42 — три и больше.
- Тесты хелперов проверяют вход и выход на настоящем разобранном коде, а не на
  моках AST. `test/helpers/create-test-file.ts:72` строит из фрагмента всё, что
  видит мутатор: дерево, области видимости, `syntax`, `hints`. Типичный тест:
  `test/core/syntax/is-timer-delay.test.ts:6-50`, таблица «фрагмент → узел →
  ожидание».

### Моки соседних модулей

| Что | Вызовов | Файлов |
| --- | ---: | ---: |
| `vi.mock`/`vi.doMock` всего | 84 | 48 |
| … модулей проекта | 65 | 35 (5,5 % тест-файлов) |
| … из них соседа из той же папки | 44 | — |
| `vi.spyOn` | 64 | 26 |
| `vi.stubEnv`/`vi.stubGlobal` | 29 | 10 |

Источник: `analysis/tools/tests/mocks.mjs`, список с `path:строка` —
`analysis/data/tests/mocks-and-spies.txt`.

Моки соседей сосредоточены в оркестрации адаптеров и CLI, где они уместны:
граница процесса, запуск Vitest, git.

- `test/adapters/vitest/start-vitest-session.test.ts:29-51` подменяет шесть
  соседей (`detect-vitest`, `check-vitest-copy`, `run-dry`, `run-batch`,
  `run-isolated`, `get-cache-inputs`) и проверяет только связывание.
- `test/adapters/node-test/start-node-test-session.test.ts:17-25` — так же
  (`read-node-runtime`, `run-dry`, `run-isolated`).
- `test/cli/run-mutation.test.ts:22-24` и `test/cli/run-list.test.ts:12`
  подменяют ядро (`core/run-mutants`, `core/list-mutants`) и проверяют, что CLI
  печатает.
- `test/core/run-mutants.test.ts:37-45` и `test/core/list-mutants.test.ts:28-46`
  подменяют `load-config`, `read-changed-lines`, `create-switched-files`,
  `create-mutant-id`, `core-plugin`.

83 из 84 моков записаны типизированной формой `vi.mock(import('…'), …)`, кроме
`vi.doMock('jiti')` в `test/core/config/load-typescript-config.test.ts:97`.
Значит, `tsc` (`pnpm test:types`) ловит устаревший путь мока после переноса
файла. Это сильно удешевляет рефакторинг.

Привязки к деталям реализации, которые не относятся к границам процессов:

1. **Счётчики обращений к внутренним структурам** — защита мемоизации:
   `test/core/syntax/get-collection-class.test.ts:155-178`
   (`vi.spyOn(file.tree.slots, 'get')`, число поисков не растёт),
   `test/core/syntax/is-global-name.test.ts:111-119`
   (`vi.spyOn(file.scopes.bindings, 'values')` → `toHaveBeenCalledExactlyOnceWith`),
   `test/core/syntax/get-match-regex.test.ts:125`,
   `test/core/syntax/get-named-groups-fact.test.ts:379`.
   Они ломаются при любой смене способа кэширования, даже если поведение
   сохранилось. Это осознанная плата за гарантию производительности, и
   держать их стоит. Но в имени теста стоит прямо писать, что это тест
   производительности. Тогда при рефакторинге его будут переписывать, а не
   «чинить».
2. **Шпионы-сквозняки на соседях** для проверки ленивости:
   `test/core/syntax/create-syntax-helpers.test.ts:14-27`
   (`readsRegexStatics`, `solveValueBounds` обёрнуты в `vi.fn(actual)`,
   проверки `not.toHaveBeenCalled()` и `toHaveBeenCalledExactlyOnceWith` на
   `:428-456`).
3. **Внедрение сбоя через мок соседа**:
   `test/core/git/read-changed-lines.test.ts:11-14,146-160` подменяет
   `runGit`, чтобы `git ls-files` вернул код 128. Если `run-git.ts` вольётся в
   `read-changed-lines.ts`, как предлагает раздел 1 (§5.2, семейство «Git»),
   мок перестанет перехватывать вызов. Тест надо будет переписать на
   настоящий сбой, например испорченный `.git/index`.
4. **Внутренности Vitest**: `test/adapters/vitest/runner.test.ts:616-627`
   шпионит за `TestRunner.prototype.onBeforeRunTask/onAfterRunSuite/…` и
   `TestRunner.getSuiteHooks`. Это привязка не к коду проекта, а к
   внутреннему API Vitest 5. Она ломается при обновлении Vitest, и при
   поддержке Vitest 4 или 6 её придётся дублировать.

### Снапшоты и большие ожидаемые строки

- `toMatchInlineSnapshot` — 18 штук в двух файлах:
  `test/cli/report/format-run-text-report.test.ts` (13) и
  `test/cli/report/format-text-report.test.ts` (5). Файловых снапшотов в самих
  тестах нет. Единственный `__snapshots__` лежит в фикстуре
  `test/fixtures/cache/test/__snapshots__/size.test.ts.snap`: это вход
  теста кэша, не снапшот проекта. Снапшоты применены там, где проверяется
  формат текста, и ANSI-коды заменены читаемыми метками (`<92>●<39>`,
  `format-text-report.test.ts:240-247`). Хрупкость к форматированию здесь
  задумана и ограничена отчётами.
- Эталоны `--json` команды `list`: `test/fixtures/list/expected-mutants.json`
  (273 КБ), `expected-mutants-strict.json` (322 КБ), `expected-skipped*.json`
  (244 КБ). Их не правят руками. Скрипт
  `test/fixtures/list/derive-expected-mutants.mjs:1-13` выводит их из ручного
  `expectations.json` и «never imports the implementation». Это настоящий
  оракул, независимый от кода. Цена: любое изменение формата отчёта требует
  перегенерации и ревью диффа на сотни КБ. Плата оправданная.

### Дублирование фикстур и шум

- **Фикстуры почти не дублируются**: 277 файлов, 247 уникальных блобов.
  Повторяются только `vitest.config.ts` (13 одинаковых копий в одну строку),
  `package.json` (7) и четыре пары `src`/`test` между
  `test/fixtures/equivalence` и `test/fixtures/runner` (`around`, `counter`,
  `collect`, `ready`).
- **Копипасты в тестах почти нет**: нормализованных окон по 6 строк,
  встречающихся в трёх и более тест-файлах, всего 12, и это списки импортов и
  перечни типов (`analysis/data/tests/dup-windows-6.txt`). Общий сетап
  вынесен в 59 хелперов `test/helpers` (`create-test-file`,
  `create-fake-adapter`, `create-git-repository`, `run-reference-mutants` и
  другие).
- Шум по строкам: JSDoc 5 % (819 блоков на локальных функциях тестов),
  пустые 9 %, импорты 3,4 %. Это немного.
- Повторяющийся сетап, который стоит вынести: «временный проект» `mkdtemp` +
  `writeFile` + `afterEach(rm)`. `mkdtemp` встречается в 62 тест-файлах,
  своя функция `createProject` — в 11 (например,
  `test/adapters/node-test/score-node-test.test.ts:20-38`,
  `test/adapters/shared/read-test-scripts.test.ts:19-26`), а
  `afterEach(async () => { await rm(…) })` — в 22. Хелпер
  `createTempProject(files)` с очисткой через `onTestFinished` убрал бы
  300–500 строк и случаи «забыли удалить». Трудоёмкость S–M, польза
  умеренная.

**Вывод по §5.1.** Соотношение 1,5× по строкам (≈2× по телу) нормально для
этого проекта и не говорит о хрупкости. Тесты в основном табличные, на
настоящем коде и проверяют вход и выход. Привязка к реализации есть в двух
местах: в моках соседей у оркестраторов адаптеров и CLI (35 файлов) и в
четырёх-пяти тестах производительности, которые считают обращения к
внутренним структурам. Настоящая цена стиля в другом: 206 тест-файлов
нацелены на хелперы с единственным вызывающим. При слиянии их придётся
переносить. Ломаться при этом почти нечему (§5.2).

## 5.2. Влияние на рефакторинг из раздела 1

### Что сломается при слиянии файлов

Я прогнал карты слияния раздела 1
(`analysis/architecture/data/grouping-map.tsv`, консервативный вариант, и
`grouping-map-extended.tsv`) через `analysis/tools/tests/grouping-impact.mjs`.
Для каждого тест-файла скрипт определил, что с ним станет, если исходники
переедут в целевые модули, а тесты останутся как есть:

| Вариант | Не затронуты | Только пути импорта | Импорт-строк править | Мок соседа вливается в модуль субъекта (тест сломается по смыслу) |
| --- | ---: | ---: | ---: | ---: |
| Консервативный (130 файлов → модули) | 498 | 137 | 144 | **2** |
| Расширенный (179 файлов) | 449 | 186 | 198 | **2** |

Два теста, которым не хватит правки пути:

1. `test/core/git/read-changed-lines.test.ts:11` мокает `core/git/run-git.ts`,
   который по карте вливается в `core/git/read-changed-lines.ts`. Внутри
   одного ES-модуля вызов соседней функции через `vi.mock` не перехватить.
   Внедрение сбоя (`:146-160`) надо переписать на настоящий сбой git или
   оставить `run-git.ts` отдельным файлом. Вторая причина держать его отдельно
   — граница процесса.
2. `test/adapters/node-test/preload/preload.test.ts:16` мокает
   `install-module-hooks`, который вливается в `preload.ts`. Это код другого
   процесса (правило K4 раздела 1 его вообще не трогает). Карту стоит
   поправить и оставить `install-module-hooks.ts` отдельным.

Остальные моки соседей (start-vitest-session, start-node-test-session,
run-dry/run-batch/run-isolated) относятся к файлам, которые раздел 1
оставляет по правилам K2/K3/K4. Поэтому рефакторинг по предложенным картам
почти целиком механический: 137–186 тест-файлов меняют один импорт, и это
делается кодмодом. Типизированный `vi.mock(import())` даёт гарантию, что
`pnpm test:types` поймает пропущенный путь.

Что сломается **не механически**:

- **Сужение экспорта**: если функция станет приватной, её тест придётся
  переписать через публичную функцию модуля. Это и есть место, где теряется
  или сохраняется покрытие. Раздел 1 (§6.4) верно предлагает делать это
  отдельным шагом. Ниже — измерение того, сколько поведения при этом
  теряется (§5.2, эксперимент с семейством логирования).
- **Слияние тест-файлов**: перенос `describe`-блоков в один файл — тоже
  механика. Но у тестов есть модульные `let` с состоянием (`let root`, у 15
  файлов) и собственные `afterEach`. Перенос «как есть» в один файл может
  смешать хуки. Безопаснее оборачивать каждый перенесённый файл в свой
  `describe` вместе с его хуками.
- **Тесты производительности** из §5.1 (счётчики `slots.get`,
  `bindings.values`) — только если меняется способ кэширования.

### Эксперимент: сколько поведения держат только тесты-двойники

Вопрос для шага «сузить экспорт»: если влить семейство логирования в
`core/syntax/logging.ts` и сделать приватные хелперы неэкспортируемыми, хватит
ли тестов поверхности семейства, чтобы удержать их поведение? Измерение —
мутантами. Mootant прогнан на пяти приватных хелперах семейства
(`is-logger-name`, `is-console-path`, `find-message-texts`, `is-format-free`,
`is-plain-message`; 68 мутантов) с двумя конфигами Vitest
(`analysis/tools/tests/configs/vitest.family-*.config.ts`):

- **public** — только тесты функций, которые семейство показывает наружу:
  `find-logging-calls`, `is-logging-call`, `is-logger-factory-call`,
  `is-logger-label`, `is-log-message`;
- **full** — те же плюс пять тестов-двойников приватных хелперов.

| Конфиг | Killed | Survived | Score |
| --- | ---: | ---: | ---: |
| public (тесты поверхности) | 55 | 13 | 80,9 % |
| full (+ тесты-двойники) | 64 | 4 | 94,1 % |

**9 мутантов из 68 (13 %) убивают только тесты-двойники.** Если при
сужении экспорта удалить двойники, эти случаи потеряются, хотя 100 %
покрытия по строкам и ветвям, скорее всего, останутся: строки исполняются и
через публичные функции. Покрытие этой потери не покажет. Примеры (данные:
`analysis/data/tests/mutants/run-family-{public,full}.json`):

| Мутант | Кто убивает в full |
| --- | --- |
| `core/syntax/is-logger-name.ts:17` `entry.slice(1)` → `slice(2)` | `is-logger-name.test.ts:21` «rejects blogger with the default loggers» |
| `core/syntax/is-console-path.ts:17` `path.length === 2` → `<= 2` | `is-console-path.test.ts` «rejects console» |
| `core/syntax/is-console-path.ts:21` убрано `&& path[1] === 'console'` | `is-console-path.test.ts` «rejects globalThis.logger.log» |
| `core/syntax/is-format-free.ts:22` `expressions.length > 0` → `>= 0` | `is-format-free.test.ts` «accepts \`a\`» |
| `core/syntax/is-format-free.ts:26` убрано `typeof cooked === 'string' &&` | `is-format-free.test.ts` «rejects a template whose value is unknown» |
| `core/syntax/find-message-texts.ts:20` убрано `&& argument.operator === '+'` | `find-message-texts.test.ts` «finds the texts of 'a' - 'b'» |
| `core/syntax/is-plain-message.ts:21` убрано `argument.operator === '+' &&` | `is-plain-message.test.ts` «rejects 'a' - 1» |

Четыре выживших в **full** — кандидаты в дыры самого семейства. Их ещё нужно
проверить на полном сьюте: их может убить, например,
`generate-file-mutants.test.ts`.

- `core/syntax/is-plain-message.ts:21` убрано `&& isPlainMessage(argument.left)`.
  Нет случая, где у `+` непростой **левый** операнд (`f() + 'a'`). Реальная
  дыра.
- `core/syntax/find-message-texts.ts:20` убрано `argument.type === 'BinaryExpression' &&`.
  Унарный `+x` тоже имеет `operator: '+'`, а `console.log(+x)` нигде не
  проверяется. Реальная, но мелкая дыра.
- `core/syntax/find-message-texts.ts:27` убрано `argument.type === 'Literal' &&`.
  Среди выражений строковое `value` есть только у `Literal`, так что мутант
  эквивалентен. Это сигнал для эвристик (избыточный type guard).
- `core/syntax/is-console-path.ts:21` `path.length === 3` → `<= 3`. Пути длины
  2 уже вернулись на `:17`, у путей длины 0–1 `path[1] !== 'console'`. Мутант
  эквивалентен.

### Стратегия рефакторинга с сохранением 100 % coverage

Для каждого семейства или папки, по одному PR на шаг:

1. **Замер до переноса (мутантами, не покрытием).** Прогнать
   `mootant run <файлы семейства>` с конфигом Vitest, где оставлены только
   тесты поверхности семейства (как `vitest.family-public.config.ts`), и с
   полным. Разница — список случаев, которые держат только тесты-двойники.
   Для семейства логирования прогон занял около 1 минуты при load average 30.
   Трудоёмкость шага S.
2. **Дописать недостающие публичные тесты.** Перенести эти случаи в тест
   публичной функции, например `findLoggingCalls` для «blogger». Повторить
   замер: public должен сравняться с full.
3. **Механический перенос.** Кодмодом перенести функции в целевой модуль, не
   меняя экспорта. Тест-файлы слить, каждый бывший файл обернуть в свой
   `describe` вместе с его хуками и модульными `let`. `pnpm test:types`
   ловит устаревшие пути `vi.mock(import())`. 100 % coverage сохраняется
   автоматически: исполняемые строки те же.
4. **Сужение экспорта отдельным PR.** Удалять `describe` двойника можно,
   только если шаг 1 для него дал ноль уникальных убийств. Покрытие проверит
   `vitest --coverage`, а сохранение поведения — повторный `mootant run` по
   модулю: score не должен упасть. Мутанты сравнивать по
   `(mutator, original, replacement, scope)`, а не по id: id включает путь
   файла и при переносе меняется.
5. Тесты, которые сломаются по смыслу, а не по пути: две позиции из таблицы
   выше. Плюс любые `vi.mock` соседа, если карта слияния изменится. Найти их —
   `analysis/tools/tests/grouping-impact.mjs <checkout> <карта>`.

Риск: на шаге 4 в coverage могут всплыть ветви, достижимые только прямым
вызовом (защитный код). Раздел 1 (§6.4) это уже отмечает. Мутанты из шага 1
заранее показывают, какие это ветви.

## 5.3. Время test:unit

Источники: тихий прогон этапа 0 (`/home/user/scratch/baseline-run1/test:unit.log`,
итоговая строка Vitest; JSON-репортера там не было) и прогон координатора под
нагрузкой `load-1` (`vitest --run --coverage --coverage.reportOnFailure`,
JSON-репортер; `analysis/data/tests/load-1.files.tsv`,
`load-1.tests-top200.tsv`, `load-1.summary.json`; скрипт сводки —
`analysis/tools/tests/vitest-json.mjs`).

| Прогон | Load average | Wall | Разбивка Vitest | Старт воркера (isolate) | Оценка Vitest для `isolate: false` |
| --- | --- | ---: | --- | ---: | ---: |
| quiet (этап 0) | ≈ 0 | 250,8 с | tests 81 %, import 12 %, transform 4 %, worker 3 % | ~128 мс × 637 | ≥ 27 с быстрее |
| load-1 | 29–34 | 1 382 с | tests 71 %, import 18 %, worker 6 %, transform 3 %, environment 1 % | ~1,47 с × 637 | ≥ 311 с быстрее |

**Один файл — это критический путь.** В load-1 сумма длительностей файлов
равна 1 891,6 с. Из них `test/adapters/vitest/index.test.ts` (33 теста)
занимает **1 354,7 с, 71,6 %**, а wall всего прогона — 1 382 с: всё
остальное успело пройти параллельно, пока шёл этот файл. 589 из 637 файлов
идут меньше секунды.

Топ-10 файлов (load-1, секунды; под нагрузкой абсолютные значения раздуты в
3–10 раз, полезно ранжирование):

| # | Файл | с | Тестов | Что внутри |
| ---: | --- | ---: | ---: | --- |
| 1 | `test/adapters/vitest/index.test.ts` | 1 354,7 | 33 | вложенные `runMutants` + настоящий Vitest на фикстурах `test/fixtures/equivalence/*`, `cache*`, эталон с физическими мутантами |
| 2 | `test/adapters/node-test/index.test.ts` | 127,1 | 9 | то же для `node --test` (`test/fixtures/node-test/*`) |
| 3 | `test/core/generate/generate-file-mutants.test.ts` | 101,5 | 987 | property-based проверки генерации, `runProgram` в воркерах |
| 4 | `test/cli/report/format-header.test.ts` | 44,9 | 6 | один тест на 300 000 строк — 44,8 с |
| 5 | `test/cli/index.test.ts` | 23,6 | 14 | приёмка `list` на `test/fixtures/list`, разбор каждого мутанта |
| 6 | `test/cli/html/client/start-report.test.ts` | 17,1 | 21 | happy-dom, отчёт на 1 000 тестов |
| 7 | `test/cli/terminal/get-max-display-width.test.ts` | 13,9 | 3 | один тест на 200 000 текстов |
| 8 | `test/core/instrument/instrument-file.test.ts` | 13,8 | 56 | исполнение программ под каждым мутантом |
| 9 | `test/core/run-mutants.test.ts` | 7,7 | 31 | загрузка компиляторов Svelte/Vue |
| 10 | `test/core/cache/prune-cache-entries.test.ts` | 6,9 | 2 | 200 002 записи кэша |

Медленные тесты (топ по load-1): 17 из 20 самых долгих — в
`test/adapters/vitest/index.test.ts`. Это «verdict equivalence …» (Vue
120 с, Svelte 60 с, default/fast 60 с) и «vitest adapter with the cache …»
(до 75 с). Остальные в топе: «node:test verdict equivalence agrees with
mutants applied by hand» (72,8 с) и «formatHeader handles a body of more
lines than a function takes arguments» (44,8 с). Полный топ-200 —
`analysis/data/tests/load-1.tests-top200.tsv`.

**Медленные фикстуры.** Это интеграционные проекты, которые гоняют
вложенные прогоны Mootant: `test/fixtures/equivalence/*` (14 подпроектов:
`vue`, `svelte`, `stale`, `teardown`, `hang`, `concurrent`, `logging`, …),
`test/fixtures/cache*` (7 проектов), `test/fixtures/node-test/*`. Каждый тест
на них — полный цикл «старт Vitest → dry run → раунды isolated» плюс
эталонный прогон на копии проекта с каждым мутантом. Отсюда 30–120 с на тест
под нагрузкой.

### Что даст больше всего

(уточняется по тихому прогону quiet-2, см. ниже)

1. **Разрезать `test/adapters/vitest/index.test.ts` на 3–4 файла** по
   `describe`: `vitest adapter`, `verdict equivalence`, `vitest adapter with
   the cache`, и, возможно, Vue/Svelte отдельно. Vitest параллелит файлы, но
   не тесты внутри файла. Сейчас этот файл идёт в одном воркере и задаёт wall
   всего `test:unit`. По load-1: остальные 636 файлов дают 537 с суммарно,
   то есть ≈ 180 с на трёх воркерах. Значит, после разреза wall упирается в
   самую длинную часть, а не в 1 355 с. Под нагрузкой ожидаемый выигрыш
   ×2–2,5. В тишине — пропорционально доле этого файла (уточню по quiet-2).
   Трудоёмкость S: перенос `describe` и общих хелперов файла (`runAllPaths`,
   `expectAgreement`, …) в `test/helpers`. Риск: суммарная нагрузка растёт,
   потому что вложенные прогоны идут с `concurrency: 2` одновременно. На
   4 vCPU CI это нормально, на слабой машине стоит держать `maxWorkers`.
2. **`isolate: false` для чистых юнит-тестов.** Сам Vitest оценивает выигрыш
   в ≥ 27 с (11 %) тихо и ≥ 311 с под нагрузкой. Но 35 файлов мокают модули
   проекта, 10 стабят окружение, и есть глобальное состояние раннера (тесты
   `runner.test.ts` чистят `globalThis.__mootant`, `:640-652`). Безопасный
   вариант — два проекта Vitest: `unit` с `isolate: false` для `core/syntax`,
   `core/regex`, `core/hints`, `core/text`, `core/tree`, `core/mutators`
   (≈ 300 файлов без `vi.mock`) и `integration` с изоляцией для остального.
   Трудоёмкость M. Проверка: дважды прогнать `unit` в разном порядке
   (`--sequence.shuffle`), должно быть зелено.
3. **Удешевить «тесты масштаба»**: 300 000 строк → достаточно чуть выше
   лимита аргументов V8 (≈ 120 000 при стандартном стеке), либо явно задать
   таймаут этим тестам. Сейчас один тест — 44,8 с под нагрузкой, в тишине
   доли секунды. На wall в тишине почти не влияет, зато это главный
   источник нестабильности (§5.4).
4. **Не трогать coverage ради скорости**: доля `transform` 3–4 %, v8-coverage
   дёшев. Шардинг (`--shard`) в CI имеет смысл только после п. 1: сейчас
   любой шард, получивший `vitest/index.test.ts`, будет самым долгим.

## 5.4. Нестабильные тесты и зависимость от окружения

Сравнивались тихий прогон этапа 0 (5 падений: 4 из-за `TERM=linux`, 1 из-за
root), load-1 (22 падения в 12 файлах, `TERM=xterm-256color`) и мои прогоны
подмножеств под той же нагрузкой. Каждое падение разобрано до механизма:

| # | Тест | Как падает | Механизм (причина) | Класс |
| ---: | --- | --- | --- | --- |
| 1 | 10 тестов `test/adapters/vitest/index.test.ts` («verdict equivalence …», «… with the cache …», «runs every mutant … isolated», «… fast mode») | `Test timed out in 30000/60000/120000ms` | явные таймауты `}, 30_000)` … `}, 180_000)` (`:529-1919`) на вложенных прогонах Mootant+Vitest; под load 30 тест идёт 30–120 с | таймаут под нагрузкой |
| 2 | `test/adapters/node-test/index.test.ts:344` «node:test verdict equivalence agrees with mutants applied by hand» | `expected false to be true` на `:350` (`expect(original).toBe(true)`), в моём прогоне — таймаут 60 с | **не расхождение вердиктов**: эталонный прогон `node --test` исходной копии фикстуры получает лимит 4 000 мс по стене (`:140`, `test/helpers/run-node-test-reference.ts:150-153`) и под нагрузкой не успевает → `'Timeout'` → `original = false` | таймаут оракула |
| 3 | `test/core/generate/generate-file-mutants.test.ts:4825` «runProgram › observes function f() { return new Promise(() => {}) }» | `expected [ 'hung' ] …` | `test/helpers/run-program.ts:8` `TIME_LIMIT = 1000` мс по стене на запуск программы в воркере; под нагрузкой старт воркера + исполнение > 1 с → `hung` | таймаут хелпера |
| 4 | `test/core/instrument/instrument-file.test.ts:404` «switches function f(text) { … like each mutant applied alone» | ожидали `'hung'` первым элементом | тот же лимит 1 с: на этот раз не успел **эталонный** прогон исходной программы (`:419`), а переключённый успел | таймаут хелпера |
| 5 | `test/adapters/vitest/runner.test.ts:654` «records coverage, stray errors and flips in a dry run with beats» | `2049.9999999999995` вместо `2050` (`:693`) | **плавающая точка, а не нагрузка**: `adapters/vitest/runner.ts:991-997` считает `watch = now + 50 + timeout + hooks`, затем `beatDry(now)` → `watch - now`. Результат точен не для всех `now`. Моделирование: ≈ 1 % при `performance.now()` в 0,1–1 с от старта воркера и ≈ 23 % при 1–10 с, что бывает под нагрузкой. Тот же файл на `:1499` уже округляет (`Math.round(beat.budget / 10) * 10`), а на `:693` — нет | недетерминизм |
| 6–12 | `test/cli/index.test.ts:211` (10,0 с); `test/cli/report/format-header.test.ts:21` (44,8 с); `test/cli/terminal/get-max-display-width.test.ts:17` (13,9 с); `test/core/cache/prune-cache-entries.test.ts:48` (6,5 с); `test/cli/html/client/start-report.test.ts:476` (6,8 с); `test/core/run-mutants.test.ts:822` (5,3 с, загрузка компиляторов Svelte/Vue); `generate-file-mutants.test.ts` «keeps no weak mutant and covers every fault of if (!((((!(y1 > x1) …» (7,4 с) | `Test timed out in 5000ms` | CPU-тяжёлые тесты на дефолтном `testTimeout` 5 с, в тишине с запасом в 1,5–10 раз меньше | таймаут под нагрузкой |
| 13 | `test/adapters/node-test/score-node-test.test.ts:98` «skips test files it cannot read» | `expected 1 to be +0` | `chmod 000` не мешает читать root'у | окружение: uid |
| 14–17 | `test/cli/run-list.test.ts` (2), `test/cli/run-mutation.test.ts` (2) | ASCII `*`, `->`, `!` вместо `●`, `→`, `▲` | `cli/terminal/is-unicode-supported.ts:13`; тесты стабят `NO_COLOR` (`run-list.test.ts:126`, `run-mutation.test.ts:62`), но не `TERM` | окружение: `TERM` |
| 18 | порог coverage: branches 99,98 % < 100 % | `ERROR: Coverage for branches … does not meet global threshold` при **всех зелёных тестах** | `adapters/node-test/start-node-test-session.ts:119,167` — `environment['NODE_OPTIONS'] ?? ''`: если `NODE_OPTIONS` задан в окружении машины, правая ветка недостижима. **Подтверждено**: `start-node-test-session.test.ts` с `NODE_OPTIONS=--use-openssl-ca` → Branch 94,11 % (32/34), Uncovered 119,167; с `env -u NODE_OPTIONS` → 100 % (34/34), 12/12 тестов зелёные в обоих случаях | окружение: `NODE_OPTIONS` |

Где воспроизведено: 1–13 — load-1; 2 и `cli/index.test.ts:211` — ещё и мой
прогон 14 файлов под load 27; 14–17 — этап 0; 18 — §5.4.1 ниже.

Следствие для пользователя-разработчика: на машине с load average выше
≈ 10 `pnpm test` падает в 6–12 тестах, на машине с `NODE_OPTIONS`
(отладчик VS Code через auto-attach, `--max-old-space-size` в CI,
`--use-openssl-ca` за корпоративным прокси) падает порог покрытия, под root
(Docker по умолчанию) падает один тест, на консоли Linux — четыре. Кроме
того, догфудинг Mootant на самом себе под нагрузкой обрывается ещё в dry run.
Мой первый прогон `cli/terminal` закончился сообщением «Tests fail without
mutants; fix them first (2 tests)»: `cli/index.test.ts:211` и
`format-header.test.ts:21` не уложились в 5 с даже в контрольном прогоне без
мутантов (`analysis/data/tests/mutants/run-terminal-attempt1.stderr.txt`).
Инструмент повёл себя верно: тесты действительно падали. Но это показывает,
что «тесты масштаба» на дефолтном таймауте мешают и самому догфудингу.

### 5.4.1. Тесты, зависящие от машины: список и фиксы

| Зависимость | Тесты | Фикс | Трудоёмкость |
| --- | --- | --- | --- |
| `TERM` | `test/cli/run-list.test.ts` «prints the text report…», «prints diagnostics to stderr…»; `test/cli/run-mutation.test.ts` «shows the flags in the header…», «prints the diagnostics, then the text report…» | в `beforeEach` рядом с `vi.stubEnv('NO_COLOR', '1')` (`run-list.test.ts:126`, `run-mutation.test.ts:62`) добавить `vi.stubEnv('TERM', 'xterm-256color')` и `vi.stubEnv('CI', undefined)`. Надёжнее — общий `test.setupFiles` или `test.env` в `vitest.config.ts`, который нормализует `TERM`, `CI`, `NO_COLOR`, `FORCE_COLOR` для всех тестов; тесты, которые проверяют сами переменные (`test/cli/terminal/*.test.ts`), и так стабят их явно | S |
| uid (root) | `test/adapters/node-test/score-node-test.test.ts:98-105` | вместо `chmod 000` — `vi.mock(import('node:fs/promises'), …)` с `readFile`, который отвергает `EACCES` только для `test/a.test.js` (остальные чтения — `importOriginal`). `it.skipIf(process.getuid?.() === 0)` **не подходит**: под root ветка `catch {}` (`adapters/node-test/score-node-test.ts:89-91`) станет непокрытой и упадёт порог 100 % | S |
| `NODE_OPTIONS` | порог branches из-за `adapters/node-test/start-node-test-session.ts:119,167` | в `test/adapters/node-test/start-node-test-session.test.ts` явно задать оба состояния: `vi.stubEnv('NODE_OPTIONS', undefined)` в одном тесте и непустое значение в другом. Проверить на `node-test/index.test.ts` и `get-node-cache-inputs` — они тоже читают `NODE_OPTIONS` (`adapters/node-test/get-node-cache-inputs.ts:69`) | S |
| нагрузка/время | строки 1–12 таблицы выше | (а) `testTimeout: 15_000` глобально или явные таймауты у семи CPU-тяжёлых тестов; (б) уменьшить «тесты масштаба» до 130–150 тыс. элементов (лимит spread в V8 на этой машине — 130 000, проверено); (в) `TIME_LIMIT` в `test/helpers/run-program.ts:8` и лимит 4 000 мс эталона node:test (`test/adapters/node-test/index.test.ts:140`) масштабировать множителем из окружения (`MOOTANT_TEST_TIME_FACTOR`) или поднять до 3–5 с — «зависание» в этих тестах — бесконечный цикл, его ловит любой лимит; (г) `runner.test.ts:693` — сравнивать `Math.round(beat.budget)`, как уже сделано на `:1499` | S–M |
| `/tmp` | `test/fixtures/equivalence/shared/test/render.test.ts:14` и `test/fixtures/node-test/shared/test/render.test.js:16` оставляют `mootant-render-<sha1(url)>.txt` — по файлу на каждую копию фикстуры (эталон копирует проект во временный каталог со случайным именем). Сейчас на машине их 95 | в `finally` добавить `await rm(output, { force: true })` рядом с `rm(lock)` | S |
| пользовательский git-конфиг | `test/helpers/create-git-repository.ts:53-65` фиксирует только `user.*` и `commit.gpgSign`; глобальные `core.hooksPath`, `init.templateDir`, `core.autocrlf` разработчика на тесты влияют (гипотеза, не воспроизводил) | `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` в env `execFileSync` хелпера, как уже сделано в `find-git-root.test.ts:59-61` | S |

## 5.5. Пробелы покрытия: догфудинг мутантами

Порог покрытия — 100 % по строкам, ветвям, функциям и инструкциям
(`vitest.config.ts:9-14`), так что пробелы видны только мутантами.
Догфудинг `core/text` из этапа 0 вердиктов не дал (прерван), полные прогоны
`core/regex` и `core/run` идут в окне замеров раздела 4. Здесь — два
небольших модуля с узким кругом тестов, выбранные по `mootant list` и графу
импортов тестов (`analysis/tools/tests/import-graph.mjs`):

| Модуль | Мутантов | Файлов | Тест-файлов в related (статически) | Почему выбран |
| --- | ---: | ---: | ---: | --- |
| `core/git` | 238 | 7 | 14 | разбор вывода git — классическое место для дыр; узкие покрывающие тесты |
| `cli/terminal` | 301 | 16 | 33 | код, зависящий от окружения (`TERM`, `CI`, `NO_COLOR`), ширина символов |
| семейство логирования `core/syntax` | 68 (5 файлов) | 5 | 10 (свой конфиг) | эксперимент §5.2 |

Отвергнуты: `core/identity` (171) и `core/ignore` (204) — их мутантов
покрывают все тесты генерации, включая
`test/core/generate/generate-file-mutants.test.ts` (100 с на прогон под
нагрузкой; см. раунд 2 догфудинга `core/text` в `00-baseline.md`);
`adapters/shared` (549), `cli/diff` (800) — много мутантов; `core/tree` —
228 тест-файлов в related.

Все прогоны: `/home/user/wt/tests-e` (worktree от `170ec52`),
`TERM=xterm-256color node bin/mootant.js run <пути> --concurrency 2 --json
--all --verbose`, load average машины 25–33 (другие агенты).

**Оговорка о конфиге.** Для `core/git` использован
`vitest.mootant.config.ts`: конфиг проекта без трёх интеграционных
файлов (`test/adapters/vitest/index.test.ts`,
`test/adapters/node-test/index.test.ts`, `test/cli/index.test.ts`). Они
попадают в related через `core/run-mutants.ts` и `core/list-mutants.ts`, но
`--since` не используют, поэтому функции `core/git` не вызывают: на вердикты
это не влияет. При этом они растягивают dry run до десятков минут под
нагрузкой и падают в нём по таймаутам (§5.4).

### `core/git`: 238 мутантов, score 84,45 %

Время 5 мин 10 с (dry run 22 с, 58 тестов; раунды isolated 2 м 19 с + 57 с
+ 67 с + 21 с). Итог: Killed 199, Timeout 2, Survived 37
(`analysis/data/tests/mutants/run-git.json`, список —
`run-git.survivors.tsv`).

Разбор 37 выживших:

| Класс | Число | Примеры |
| --- | ---: | --- |
| **Реальная дыра в тестах** | 14 | `parse-unified-diff.ts:47` удаление `remaining = Number(removed) + count`; `read-changed-lines.ts:77` `--numstat` без `base` |
| Слабая проверка текста ошибки (`toThrow(подстрока)`) | 3 | `find-git-root.ts:22`, `get-merge-base.ts:23`, `read-changed-lines.ts:112`: `stderr.trim()` → `stderr` |
| Эквивалентные по инварианту окружения (git, Node) | 17 | `code !== 0` → `code > 0` (×6), `'utf8'` → `''` в `Buffer.from`, `split('\t', 2)` → `3` |
| Шумовые (размер буфера) | 3 | `run-git.ts:6` `256 * 1024 * 1024`: `256` → `257`, `1024` → `1025` |

**Проверка дыр (подтверждено).** Я написал 61 строку тестов
(`analysis/experiments/tests-git-gaps.diff`: 3 новых теста и 3 правки
существующих) и повторил прогон только по 37 выжившим (`--mutant <id>` ×37,
`run-git-fixed.json`). **14 из 37 погибли** (score модуля 84,45 % → 90,3 %),
сами тесты на исходном коде проходят (`vitest --run test/core/git/`: 25/25).

Главная находка — **тест, который не может упасть по своей причине**.
`test/core/git/parse-unified-diff.test.ts:81-94` («never reads changed lines
as headers») проверяет, что строки ханка, похожие на заголовки, пропускаются
по счётчику. Но строки в нём такие: `'---- a/x'`, `'-@@ -1 +1 @@'`,
`'++++ b/other.ts'`, `'+@@ -7 +7 @@'`. Разборщик не принял бы ни одну из них
за заголовок и без пропуска. `^@@` не совпадает с `-@@`/`+@@`, а
`'++++ b/other.ts'.startsWith('+++ ')` ложно: четвёртый символ `+`, а не
пробел. Двусмысленна только добавленная строка с текстом `++ …` (в диффе
`+++ …`). Поэтому вся логика пропуска по счётчику
(`core/git/parse-unified-diff.ts:29-33,44-47`) не защищена: выживали
удаление `remaining = …`, `+` → `-`, `> 0` → `> 1`, `-= 1` → `-= 2`,
обработка `\ No newline` (×2) и дефолт `removed = '1'` → `''`. Новый тест
«skips the last line of a hunk that looks like a +++ header» (строка
`'+++ b/other.ts'` последней в ханке, после `\ No newline`, и ханк с
опущенным числом удалённых строк) убивает все 7. Последствие бага, который
эти мутанты изображают, — `--since` приписывает строки не тому файлу или
пропускает их, если в ханке добавлена строка с текстом `++ …`.

Остальные подтверждённые дыры:

| Выживший мутант | Что не проверено | Тест, который его убил |
| --- | --- | --- |
| `parse-unified-diff.ts:8` `-\d+` → `-[^]+`; `(?<removed>\d+)` → `[^]+`; `(?<added>\d+)` → `[^]+` | ханк после ханка с `,0`; контекст функции после `@@`, содержащий ` +1 @@` | «reads every hunk of a file after a hunk without removed lines» |
| `read-changed-lines.ts:77` `[...NUMSTAT_OPTIONS, base]` → без `base` | бинарный для git файл (NUL-байт), **закоммиченный** на ветке, а не только изменённый в рабочем дереве (`read-changed-lines.test.ts:66-120`). Без `base` `--numstat` сравнивает рабочее дерево с индексом, и мутанты такого файла выпали бы из `--since` | в том же тесте: `src/blob.ts` с `\0`, изменён коммитом на `feature` |
| `run-git.ts:47` удалён `maxBuffer: MAX_BUFFER` | вывод git больше 1 МиБ (дефолт `execFile`): `--since` на большом PR упал бы с «stdout maxBuffer length exceeded» | «reads output larger than the default buffer of execFile» (`git show` файла 2 МиБ) |
| `run-git.ts:57` у неуспешной команды пропал `stdout` | контракт `runGit` для кода ≠ 0 (`run-git.test.ts:51-56` проверяет только `code` и `stderr`) | `toStrictEqual({ code: 128, stdout: '', stderr: … })` |
| `unquote-git-path.ts:39` `index + 4` → `index + 5` | октальный escape, за которым идёт цифра (`"b/\001\0012.ts"`) | одна строка в `unquote-git-path.test.ts` |

**Эквивалентные мутанты — сигнал для эвристик Mootant.** Ниже реальная
нагрузка на пользователя: 17 из 37 выживших нельзя убить тестом.

1. `x.code !== 0` → `x.code > 0` (6 раз: `find-git-root.ts:16`,
   `get-merge-base.ts:19,33,40,47`, `read-changed-lines.ts:110`). Код выхода
   из `runGit` неотрицателен: `run-git.ts:54-57` кладёт `error.code`, только
   если это число, а сигналы идут в `reject`. У Mootant уже есть решатель
   границ значений: `.length ≥ 0`, `indexOf ≥ -1`
   (`core/syntax/get-value-bound.ts:271`). Но поле объекта, который вернула
   функция проекта, ему не видно. Это мутант того же вида, что `length !== 0`
   → `length > 0`, который Mootant уже отсекает. Отдельная эвристика по имени
   (`code`/`status`/`exitCode`) была бы шумной, так что оставить как есть и
   задокументировать `mootant-ignore` — разумный выбор.
2. `Buffer.from(symbol, 'utf8')` → `Buffer.from(symbol, '')`
   (`unquote-git-path.ts:33`). Node нормализует пустую кодировку в `utf8`
   (проверено: `Buffer.from('é','')` = `c3a9`). То же касается
   `readFile(…, '')` и `toString('')`. Мутант `string-literal` → `''` в
   аргументе-кодировке Node API всегда эквивалентен. **Кандидат в правило
   пропуска**: это дёшево и без ложных пропусков.
3. `field.split('\t', 2)` → `split('\t', 3)` при деструктуризации ровно двух
   элементов (`parse-binary-paths.ts:17`). Лимит больше числа используемых
   элементов ничего не меняет. **Кандидат в правило**: лимит `split` при
   деструктуризации `[a, b] = s.split(x, n)` с `n ≥ 2`.
4. `ESCAPES[next] ?? …` → `||` (`unquote-git-path.ts:42`). Все значения
   константного объекта ненулевые. Это частный случай уже существующих
   рассуждений о falsy-значениях: значения литерального `Record` известны
   статически.
5. Инварианты формата git: `added === '-' && removed === '-'` → один операнд
   (git для бинарных пишет оба `-`); `name.startsWith('"')` → `endsWith`
   (git всегда кавычит путь с `"`); `remaining = 0` → `1` (дифф начинается с
   `diff --git`); снятие якорей регэкспов (`find-git-root.ts:24`
   `/\r?\n$/u` → `/\r?\n/u`; `^` в `HUNK_PATTERN`). Инструмент знать этого не
   может. Это законные выжившие, их место — в `mootant-ignore` с причиной.
6. Шум: `256 * 1024 * 1024` → `257`/`1025` (`run-git.ts:6`). Числовые
   литералы в произведении степеней двойки, задающем лимит размера, — тот же
   класс, что задержки таймеров, которые Mootant уже отсекает (`TIMER_DELAY_SKIP`,
   `core/generate/collect-candidates.ts:244-282`). **Кандидат в правило шума**
   «размерный лимит».

Вопрос к инструменту: три мутанта `stderr.trim()` → `stderr` в тексте
`throw new Error(…)`. Для `console.*` Mootant уже пропускает мутанты текста
сообщения (`find-logging-calls`). Сообщения ошибок пользователь видит, так
что пропускать их наравне с логами не стоит. Но ранжировать ниже — стоит.
Сейчас они идут в общий список выживших наравне с пропуском `maxBuffer`.

## 5.6. Что в тестах сделано хорошо

Без оговорок: тест-сьют Mootant — сильная сторона проекта, лучше, чем у
большинства инструментов этого класса.

1. **Оракулы, не зависящие от реализации.**
   - Эквивалентность вердиктов с физически применёнными мутантами:
     `test/adapters/vitest/index.test.ts:801-855` («agrees with mutants applied
     by hand in the default and fast modes») и такой же блок у node:test. Хелпер
     `test/helpers/run-reference-mutants.ts` копирует проект, применяет
     каждого мутанта текстом и запускает обычный Vitest. Расхождения
     перечислены поимённо и объяснены комментариями (`:830-846`). Это ровно
     та проверка, которую раздел 2 строил отдельно.
   - Инструментирование против применения по одному:
     `test/core/instrument/instrument-file.test.ts:404-432` выполняет программу
     с переключаемым кодом под каждым мутантом и с физически применённым
     мутантом и сравнивает наблюдения.
   - Приёмочный эталон `list --json`: `test/fixtures/list/derive-expected-mutants.mjs`
     выводит ожидаемый отчёт из ручного `expectations.json` и «never imports
     the implementation» (`:1-13`).
2. **Property-based проверка генерации.** `test/helpers/find-weak-mutants.ts`,
   `find-unsound-skips.ts`, `generate-formula.ts`, `get-kill-set.ts`:
   случайные read-once-формулы, их классические альтернативы и сетка входов.
   Проверяется, что выданные мутанты не эквивалентны и не дублируют друг
   друга, а пропуски `equivalent`/`duplicate`/`subsumed`/`owned`
   обоснованы выходами (`test/core/generate/generate-file-mutants.test.ts:3402-3440`).
   ГСЧ детерминирован (`test/helpers/create-random.ts:24`, LCG с
   фиксированным seed), поэтому случаи воспроизводимы и не дают
   нестабильности.
3. **Табличные тесты на настоящем коде.** 840 таблиц `it.each`, фрагменты
   разбираются настоящим парсером (`test/helpers/create-test-file.ts`), моков
   AST нет. Мутаторы тестируются по id через конвейер
   (`test/helpers/run-mutator.ts`), то есть по наблюдаемому поведению, а не по
   внутренним хелперам.
4. **Строгий линт тестов** (`@azat-io/eslint-config`, правила
   `@vitest/eslint-plugin`): `no-conditional-in-test`, `no-conditional-expect`,
   `no-disabled-tests`, `no-focused-tests`, `prefer-each`,
   `require-top-level-describe` и др. В коде нет ни одного `it.skip`/`it.only`
   и всего три условных теста (`it.skipIf`/`it.runIf` на версию Node и наличие
   `fs.glob`).
5. **Типизированные моки** `vi.mock(import('…'))` — 83 из 84. Опечатка в
   пути или переименование ловятся `tsc`.
6. **Настоящие процессы и git, а не моки.** Группы процессов, сигналы, git с
   изоляцией пользовательского конфига (`test/helpers/create-git-repository.ts:53-65`:
   `user.name`, `user.email`, `commit.gpgSign=false`; для теста владения —
   `GIT_CONFIG_GLOBAL=/dev/null`, `test/core/git/find-git-root.test.ts:59-61`).
7. **Регрессии на масштаб**: 300 000 строк в заголовке
   (`test/cli/report/format-header.test.ts:21-29`), 200 000 текстов
   (`test/cli/terminal/get-max-display-width.test.ts:17-22`), 300 000 id
   (`test/cli/report/get-short-id-length.test.ts:24`) — защита от `RangeError`
   при spread большого массива. Намерение правильное, но цена под нагрузкой
   высокая (§5.4).
8. **Порог 100 % по четырём метрикам действительно соблюдается**, и мутанты
   это подтверждают: `core/git` — 84 % «сырого» score, а без эквивалентных и
   шумовых мутантов — 92 %; семейство логирования — 94 % на 10 тестах.
   Найденные дыры тонкие: граничные форматы git и один тест, который не
   проверяет то, что заявляет. Слабых тестов, которые просто «проходят по
   коду» ради покрытия, я не встретил.

### `cli/terminal`: 301 мутант, score 88,7 %

Первая попытка с конфигом проекта оборвалась в dry run: «Tests fail without
mutants; fix them first (2 tests)», оба — таймауты 5 с (§5.4). Вторая — с
`vitest.loaded.config.ts`, где только `testTimeout: 30_000`. Время 12 мин
23 с (dry run 50 с, 260 тестов; шесть раундов isolated), Killed 265,
Timeout 2 (бесконечные циклы в `fit-parts.ts:21,26` пойманы: один — через
`worker-hang`, второй — через лимит вычислений сайтов), Survived 34
(`analysis/data/tests/mutants/run-terminal.json`).

| Класс | Число | Примеры |
| --- | ---: | --- |
| **Реальная дыра** | 8 | `create-spinner.ts:184` после `print()` не запоминается высота кадра; `strip-ansi.ts:13-18` (ESC без `[`, управляющий символ перед `[`, `ESC[` и незакрытый код в конце строки); `wrap-text.ts:16` первое слово шире ширины; `fit-parts.ts:23` равные ранги; `measure-parts.ts:19` часть без ширины и текста |
| Косметика (кадры спиннера) | 6 | `create-spinner.ts:15` `'⠼'`…`'⠏'` → `''`: тест проверяет только первые четыре кадра (`create-spinner.test.ts:126`) |
| Только на Windows | 1 | `get-text-style.ts:32` не передан `platform`: на Linux не убить без подмены `process.platform` |
| Эквивалентные | 18 | см. ниже |
| Шум (граница абсурдного значения) | 1 | `get-text-style.ts:28` `> 0` → `> 1` (терминал шириной в 1 колонку) |

Самая полезная находка:
`cli/terminal/create-spinner.ts:184` (`rows = countTerminalRows(frame, …)`
в `print()`). Без этой строки следующий кадр после напечатанной строки не
стирает предыдущий, и в терминале остаётся «хвост» спиннера. Тест
`create-spinner.test.ts:138-148` проверяет сам `print`, но не следующий кадр
после него.

Эквивалентные мутанты `cli/terminal` — материал для эвристик:

1. `(stream.columns ?? 0) > 0` → `stream.columns > 0` и `(… || 0) > 0`
   (`get-text-style.ts:28`). Сравнение `undefined > 0` и `NaN > 0` ложно, как и
   `0 > 0`, поэтому снятие `?? 0` и замена на `||` ничего не меняют.
   **Доказуемое правило**: `(x ?? k) OP c`, где `k OP c` ложно, а `OP` —
   `<`, `<=`, `>`, `>=`: сравнение с `undefined`/`NaN` тоже ложно.
2. Проверка границы перед чтением, которое само отсекает выход за границу:
   `i + 1 < string.length && string[i + 1] === '['` (`strip-ansi.ts:13-15`).
   Мутанты `<` → `<=`, `<` → `!=`, `i + 1` → `i - 1` эквивалентны:
   `string[length]` — это `undefined`, а не `'['`. **Доказуемое правило**:
   граница индекса, за которой в той же конъюнкции идёт `s[idx] === литерал`.
3. `[]` → `[undefined]` у массива, который только наполняется и
   склеивается `join` (`cut-to-width.ts:32`): `join` пишет `undefined` как
   пустую строку.
4. Дефолт параметра, который сравнивается только с другим литералом:
   `side = 'end'` → `''` (`cut-to-width.ts:23`; используется лишь
   `side === 'start'`).
5. Быстрый путь, совпадающий по результату с общим: `index === -1` →
   `false` (`colors.ts:81`, общий путь со `slice(-1)` даёт ту же строку) и
   `-1` → `1` (`indexOf(…, openCode.length)` не возвращает 1). Статически
   это не доказать, честный выживший.
6. Инварианты домена: `columns === 0` → `<= 0` (`count-terminal-rows.ts:21`),
   `(stream.columns ?? 0) > 0` → `!= 0` (`get-text-style.ts:28`, ширина не
   бывает отрицательной),
   `reopen ?? openCode` → `||` (`colors.ts:68`: `reopen` — непустая
   константа или `undefined`), `part.width ?? 0` → `||`
   (`measure-parts.ts:19`), якоря `^`/`$` в `WIDE_PATTERN` и
   `ZERO_WIDTH_PATTERN` (`get-display-width.ts:11,17`): широкий символ в графеме
   стоит первым, а управляющие и комбинирующие символы не смешиваются в одной
   графеме с видимыми, кроме экзотики.
7. Сброс состояния, который виден только при повторном `start()` после
   `stop()` (`create-spinner.ts:118` ×2, `:171`). Такого сценария в коде нет:
   `cli/create-run-progress.ts:158,408` запускает и останавливает спиннер
   один раз.
