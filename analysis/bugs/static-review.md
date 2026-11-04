# Статическое ревью критического пути вердикта (BUG-900…BUG-949)

> Коммит 170ec52. Метод: чтение кода и рассуждение о контрактах, точечные
> проверки гипотез (фикстуры в `/home/user/projects/static/vt/*`, юнит-тесты
> воспроизведения в `/home/user/wt/bug-repros/test/repros/BUG-9xx.test.ts`,
> ветка `experiment/bug-repros`). Файлы других агентов
> (`instrumentation.md`, `verdicts.md`, `skips.md`, `cache-since.md`,
> `cli-env.md`) до раздела «Сравнение» не читались.
>
> Статус документа: в работе.

## Найденные дефекты (сводка)

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-900 | Isolated-юнит, в котором из-за постороннего сбоя (таймаут теста, не достигшего мутанта, или упавший suite-хук) не выполнились тесты, достигающие мутанта, считается «файлом без улик» → ложный `Survived`/`NoCoverage` без диагностики | high | подтверждён | `core/run/read-isolated-unit.ts:46-106`, `adapters/vitest/runner.ts:886-888,630-637` | фикстуры `abandon`, `hook`; `test/repros/BUG-900.test.ts` |
| BUG-901 | Падение воркера (`crash`) или ошибка загрузки тест-файла (`load-error`) в isolated-юните — всегда `Killed`, без проверки достижения мутанта и без повтора; `load-error`-убийство ещё и кэшируется → ложный `Killed`, переживающий следующие прогоны | medium | подтверждён | `core/run/read-isolated-unit.ts:42-44,75-83`, `core/cache/create-run-cache.ts:313-318` | фикстуры `crash`, `loaderr`, `loadcache`; `test/repros/BUG-901.test.ts` |
| BUG-902 | Вне `--fast` один нестабильный провал теста в dry run приписывается инструментированию: файл выбрасывается с `instrumentation-break`, все его мутанты `Error`, exit 1, кэш не сохраняется | medium | подтверждён | `core/run/run-dry-phase.ts:161-170,195-203,275-296,385-421` | фикстура `flakydry`; `test/repros/BUG-902.test.ts` |
| BUG-903 | Тест, загружающий модуль вычисляемым `import()`, не попадает в dry run (`vitest related`); если модуль импортирует статически другой, слабый тест, мутант молча получает `Survived` | medium | подтверждён (ограничение задокументировано, следствие — нет) | `adapters/vitest/run-dry.ts:225-247`, `core/run/rank-mutant-files.ts:61-92` | фикстура `dynimport` |
| BUG-904 | Локальная привязка с именем `globalThis` (параметр, `let`, `var`) скрывает все сайты в своей области: проверка `globalThis.__mootant?.hit()` читает её, мутанты никогда не включаются → ложный `NoCoverage` (или `TypeError` и `instrumentation-break`, если значение `undefined`) | low | подтверждён | `core/instrument/get-site-check.ts:164-166` | фикстура `shadow`; `test/repros/BUG-904.test.ts` |

(Таблица дополняется ниже по мере работы.)

## Разбор находок

### BUG-900 — прерванный isolated-юнит засчитывается как «пройденный файл»

**Контракт.** `RunStatus` (`types/run/run-status.d.ts:7-8`): «`Survived`: every
test of the test files that cover it passed in a fresh module graph, and one of
them reached it». Порядок файлов и правило решения — `decideEvidence`
(`core/run/decide-evidence.ts:154-172`): файл с уликой `'none'` считается
«done without one», и мутант становится `Survived`, как только все файлы
«done» и хотя бы один юнит достиг мутанта.

**Дефект.** `readIsolatedUnit` (`core/run/read-isolated-unit.ts:46-106`)
возвращает `null` (→ `'none'` в `getUnitEvidence`,
`core/run/get-unit-evidence.ts:126-128`) в трёх ситуациях, когда юнит **не
выполнил** тесты файла по причинам, не связанным с мутантом:

1. Тест, не достигший мутанта, превысил таймаут (собственный `testTimeout`
   Vitest или таймер mootant). `classifyTry` даёт `doubtful`
   (`core/run/classify-try.ts:29-33`), цикл идёт дальше, но раннер Vitest после
   любого таймаута ставит `abandoned = true` (`adapters/vitest/runner.ts:886-888`)
   и пропускает все оставшиеся тесты (`adapters/vitest/runner.ts:630-637`).
   Флаг `abandoned` в isolated-режиме ядру не передаётся
   (`adapters/vitest/build-isolated-facts.ts:46-59`, в `IsolatedFacts` такого
   поля нет), поэтому ядро видит «тесты кончились, мутант не достигнут» → `null`.
2. Упал suite-хук (`beforeAll`), не достигнув мутанта: ветка
   `facts.reached && facts.hookError !== null` (`read-isolated-unit.ts:84`)
   не срабатывает, тесты файла не выполнялись → `null`.
3. Suite-хук превысил таймаут без достижения мутанта: `facts.timedOut` →
   `facts.reached ? … : null` (`read-isolated-unit.ts:64-74`).

Во всех трёх случаях файл, который был **первым** в ранжировании и чьи тесты
убили бы мутанта, «закрывается» без улик; решение переходит к следующему файлу.
Если там есть достигнутый проход — `Survived`, если нет — `NoCoverage`. Никакой
диагностики не выдаётся. Повторный прогон (`--mutant`) даёт `Killed`, т. е.
вердикт зависит от случайного сбоя соседнего теста.

Для сравнения: batch-путь обрабатывает те же события консервативно — таймаут
контрольной попытки делает оставшиеся попытки «missing» с повтором в recovery
(`core/run/run-batch-phases.ts:109-138`), упавший хук отправляет мутанты юнита
на isolated-путь (`core/run/apply-batch-result.ts:272-289`). Isolated-путь,
который в режиме по умолчанию — единственный источник вердиктов, этой защиты
лишён.

**Воспроизведение (реальный Vitest 5.0.5, пакет 170ec52).**
Фикстура `/home/user/projects/static/vt/abandon`: `src/math.js`
(`return a + b`), `test/a.test.js` — тест `slow once` (не вызывает `add`,
медленный только во 2-м запуске файла, имитация теста у границы таймаута на
нагруженной машине) и тест `add` (`expect(add(2, 3)).toBe(5)`);
`test/b.test.js` вызывает `add(1, 1)` без проверок.

```bash
cd /home/user/projects/static/vt/abandon
export PATH=/home/user/projects/static/vt/node_modules/.bin:$PATH
rm -f .runs && mootant run --no-cache --verbose
#   survived 1 … src/math.js 2:10 arithmetic-operator y1rm  - return a + b  + return a
#   covered by add (test/a.test.js:18) and 1 more
mootant run --no-cache --mutant y1rm      # killed 1 (повтор, тест уже быстрый)
# Оракул: физическая мутация `return a` + `vitest run` → × add: expected 2 to be 5
```

Фикстура `/home/user/projects/static/vt/hook`: то же, но во 2-м запуске
`test/a.test.js` падает `beforeAll` (`EADDRINUSE`) → `survived 1`.

Фикстура `/home/user/projects/static/nt/hook` — тот же сценарий с упавшим
`before()` под адаптером `node:test`: `survived 1`, оракул (`node --test` с
физической мутацией) — `not ok 1 - add`. Адаптер `node:test` юнит после
таймаута теста не бросает, но упавший хук помечает тесты набора как упавшие без
достижения мутанта → `doubtful` → тот же `null`
(`adapters/node-test/build-isolated-facts.ts:65-82`: `hookError` не
заполняется, раз есть упавшие тесты).

Юнит-тест `test/repros/BUG-900.test.ts` (2 кейса, оба падают на 170ec52 с
`expected 'Survived' not to be 'Survived'`).

**Вероятность в реальных проектах.** Нужен посторонний сбой в первом по рангу
файле: интеграционный тест у границы `testTimeout`, `beforeAll`, поднимающий
сервер/порт/БД, тяжёлый тест под конкуренцией в CI. Для isolated-раундов
mootant запускает столько юнитов параллельно, сколько воркеров, поэтому такие
сбои вероятнее, чем в обычном прогоне. Цена ошибки высокая: ложный `Survived`
не отличим в отчёте от настоящего, агентский skill потратит время на
«недостающий» тест, порог `--threshold` может не пройти. Кэш ложный вердикт не
закрепляет: для прерванного юнита запись не создаётся
(`apply-isolated-result.ts:105-110` пишет только не-`null`), и следующий прогон
выполнит этот файл снова.

**Направление исправления.** Улика `'none'` допустима, только если все тесты
файла из dry run (`analysis.fileTests`) выполнились или юнит остановлен
bail-ом после убийства. Иначе юнит неполон: повторить один раз как
`missing` (`apply-isolated-result.ts:121-141`), при повторе — `Error` с
диагностикой. Альтернатива на стороне адаптера — не бросать isolated-юнит после
таймаута теста, не достигшего мутанта.

### BUG-901 — `crash` и `load-error` всегда убивают мутанта

Зеркало BUG-900: сбой, не связанный с мутантом, засчитывается как **убийство**.

1. `incomplete === 'crash'` → `Killed` (cause `crash`) до любого анализа
   (`core/run/read-isolated-unit.ts:42-44`); поле `reached`, которое адаптер
   Vitest заполняет из уже записанных тестов
   (`adapters/vitest/build-isolated-facts.ts:37`), не используется. «Crash» у
   адаптера Vitest — любой захваченный юнит без end-записи, если его не
   остановил watchdog (`build-isolated-facts.ts:32-36`): OOM-killer, сигнал,
   падение пула. Кэш признаёт, что такие убийства «depend on the load of the
   machine», и не сохраняет их (`core/cache/create-run-cache.ts:143-144,313-318`),
   но в текущем прогоне они без подтверждения становятся `Killed`, без
   диагностики (`cause: "crash"`, `killedBy: null`, `diagnostics: []`).
2. `facts.loadError !== null` → `Killed` (cause `load-error`) тоже без проверки
   `facts.reached` (`read-isolated-unit.ts:75-83`), хотя для хук-ошибок такая
   проверка есть (`read-isolated-unit.ts:84`), а end-запись Vitest сообщает
   `reached` и при ошибке загрузки (`adapters/vitest/runner.ts:933`). Для
   нестатического мутанта загрузка с мутантом и без него детерминированно
   одинакова, пока сайт не вычислен, — значит, ошибка загрузки без `reached`
   вызвана окружением. Такое убийство **кэшируется** (`write` отбрасывает
   только `crash`, `create-run-cache.ts:313-318`) и переиспользуется в
   следующих прогонах, пока не изменятся входы тест-файла.

**Воспроизведение.**

- `/home/user/projects/static/vt/crash`: `test/c.test.js` — тест `dies once`
  (во 2-м запуске файла `process.kill(process.pid, 'SIGKILL')`, `add` не
  вызывает) и тест `add runs` (`add(1, 1)` без проверок).
  `mootant run --no-cache --json --verbose --all` → `"status":"Killed",
  "cause":"crash"`. Оракул (физическая мутация + `vitest run`): `Tests 2 passed`.
- `/home/user/projects/static/vt/loaderr`: верхний уровень `test/c.test.js`
  во 2-й загрузке бросает `connect ECONNREFUSED`, тест `add runs` без проверок →
  `killed 1` (`load-error`), оракул — выжил бы.
- `/home/user/projects/static/vt/loadcache`: то же, но счётчик запусков лежит
  вне проекта (как недоступный сервис — вне входов кэша). Прогон 1 → `killed 1`;
  прогон 2 (файл уже грузится) → `Reused a cached verdict for 1 of 1 mutants`,
  `killed 1`; прогон 3 `--no-cache` → `survived 1`.
- Юнит-тест `test/repros/BUG-901.test.ts` (crash и load-error).

**Вероятность.** Ниже, чем у BUG-900, но растёт на CI с ограниченной памятью и
высокой `concurrency`, у интеграционных тестов с подключением на верхнем
уровне. Ошибка завышает score и закрепляется кэшем (для `load-error`).
**Направление:** считать crash и load-error без `reached` (для нестатического
мутанта) неполным юнитом — повтор как у `missing`, затем `Error`; crash с
`reached` подтверждать повтором, как timeout; не кэшировать `load-error` без
`reached`.

### BUG-902 — нестабильный тест в dry run выдаётся за поломку инструментирования

Вне `--fast` первый провал в инструментированном dry run сразу ведёт к
`checkRealFailures` — перезапуску **без** переключённых файлов
(`core/run/run-dry-phase.ts:161-170,385-421`). Если тест там проходит, файлы,
сайты которых он задел, объявляются сломавшими тесты
(`findBrokenFiles`, `run-dry-phase.ts:505-517`) и выбрасываются с ошибкой
`instrumentation-break` (`run-dry-phase.ts:286-296`). Повторного
инструментированного прогона, который отличил бы «нестабильный тест» от
«инструментирование меняет семантику», нет — в отличие от `--fast`, где упавшие
файлы сначала перезапускаются с инструментированием
(`run-dry-phase.ts:204-213`). Следствия: все мутанты файла — `Error`, сообщение
ложно обвиняет mootant, exit code 1, кэш прогона не сохраняется
(`core/run-mutants.ts:515-526`, `failed` при любой error-диагностике).

**Воспроизведение.** Фикстура `/home/user/projects/static/vt/flakydry`
(тест падает только в первом запуске файла): `mootant run --no-cache` →
`x src/math.js: Tests fail with the switched src/math.js and pass without it;
its mutants are not run. [instrumentation-break]`, `error 1`, `exit=1`.
Юнит-тест `test/repros/BUG-902.test.ts`.

**Направление.** Перед обвинением инструментирования перезапустить упавшие
файлы с инструментированием (как в `--fast`); если проходят — сообщать о
нестабильном тесте (`unrepeatable-test`), а не об `instrumentation-break`.

### BUG-903 — тест с вычисляемым `import()` не выбирается, мутант молча «выживает»

Dry run запускает только тест-файлы, которые Vitest считает связанными с
переключёнными файлами: `vitest.config.related = request.related` →
`getRelevantTestSpecifications()` (`adapters/vitest/run-dry.ts:225-247`). В
Vitest 5.0.5 это `AffectedModulesResolver` — обход графа модулей по `deps` и
`dynamicDeps` трансформаций, т. е. только статических импортов и `import()` с
литералом. Isolated-путь затем запускает мутанта лишь в файлах, которые
достигли его в dry run (`core/run/rank-mutant-files.ts:66-70`). Тест-файл,
загружающий модуль вычисляемым спецификатором (``import(`../src/${name}`)``,
`import(path.join(dir, file))` — типично для тестов плагинов/фикстур по
списку), не попадает ни в dry run, ни в isolated-юниты. Если тот же модуль
статически импортирует другой, слабый тест, мутант получает `Survived` без
какой-либо диагностики (`never-served` не срабатывает, файл ведь отдан).

Документация упоминает только «Tests that load a mutated file only through a
computed `import()` may not be selected»
(`docs/content/guide/compatibility.mdx:56-57`) — без следствия «ложный
`Survived`» и без способа обхода.

**Воспроизведение.** `/home/user/projects/static/vt/dynimport`:
`test/static.test.js` — `add(1, 1)` без проверок; `test/dynamic.test.js` —
``await import(`../src/${name}`)`` и `expect(add(2, 3)).toBe(5)`.
`vitest run` → `2 passed`; `mootant run --no-cache` → `dry run 1 test`,
`survived 1`, `covered by add runs (test/static.test.js:6)`. Оракул
(физическая мутация) — `dynamic.test.js` падает.

**Направление.** `readTestImports` уже разбирает `import()` тест-файлов и
отбрасывает нелитеральные (`core/run/read-test-imports.ts:141-146`): тест-файлы
с вычисляемым `import()` можно добавлять в dry run явно (поле `files`
запроса) или предупреждать о них; опция «dry run по всем тест-файлам».

### BUG-904 — затенённый `globalThis` прячет сайты мутантов

Проверка сайта — `globalThis.__mootant?.hit("id")`
(`core/instrument/get-site-check.ts:164-166`); `validateReplacement` и
`isValuePosition` не смотрят, связано ли имя `globalThis` в области сайта
(`core/generate/validate-replacement.ts:132-167`). Внутри функции с параметром
или локальной переменной `globalThis` проверка читает локальное значение: при
объекте без `__mootant` сайт никогда не включается и не попадает в покрытие →
все мутанты области `NoCoverage`; при `undefined`/`null` исходный код падает с
`TypeError` уже без активного мутанта (→ dry run ломается →
`instrumentation-break`, по рассуждению, не проверялось).

**Воспроизведение.** `/home/user/projects/static/vt/shadow` (`function sum(globalThis, values)`
с тестом `expect(sum({ scale: 2 }, [1, 2])).toBe(6)`): `mootant run` →
`no coverage 4` для `let total = 0 → 1`, удаления присваивания и двух
арифметических мутантов, хотя `let total = 1` даёт 7. Юнит-тест
`test/repros/BUG-904.test.ts` (сравнение с физически применённым мутантом:
ожидалось 7, 0, -6, 1.5 — у переключённого кода всегда 6).

**Вероятность.** Низкая (имя `globalThis` как локальная привязка встречается в
полифилах и UMD-обёртках). **Направление:** при наличии привязки `globalThis` в
файле использовать незатеняемый доступ (например, модульная константа с
уникальным именем в начале файла) или сообщать `instrument-error`.

## Рабочие заметки (черновик, будут сокращены)
