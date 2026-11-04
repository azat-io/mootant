# Статическое ревью критического пути вердикта (BUG-900…BUG-949)

> Коммит 170ec52. Метод: чтение кода и рассуждение о контрактах, точечные
> проверки гипотез (фикстуры в `/home/user/projects/static/vt/*`, юнит-тесты
> воспроизведения в `/home/user/wt/bug-repros/test/repros/BUG-9xx.test.ts`,
> ветка `experiment/bug-repros`). Файлы других агентов
> (`instrumentation.md`, `verdicts.md`, `skips.md`, `cache-since.md`,
> `cli-env.md`) до раздела «Сравнение» не читались.
>
> Фикстуры — маленькие проекты на Vitest 5.0.5 и `node:test` с пакетом
> `mootant-0.1.0-170ec52.tgz`; «нестабильность» в них смоделирована счётчиком
> запусков файла (`.runs`), чтобы сбой случался ровно в одном юните. Оракул —
> физическое применение мутации и обычный `vitest run` / `node --test`.

## Найденные дефекты (сводка)

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-900 | Isolated-юнит, в котором из-за постороннего сбоя (таймаут теста, не достигшего мутанта, или упавший suite-хук) не выполнились тесты, достигающие мутанта, считается «файлом без улик» → ложный `Survived`/`NoCoverage` без диагностики | high | подтверждён | `core/run/read-isolated-unit.ts:46-106`, `adapters/vitest/runner.ts:886-888,630-637` | фикстуры `abandon`, `hook`; `test/repros/BUG-900.test.ts` |
| BUG-901 | Падение воркера (`crash`) или ошибка загрузки тест-файла (`load-error`) в isolated-юните — всегда `Killed`, без проверки достижения мутанта и без повтора; `load-error`-убийство ещё и кэшируется → ложный `Killed`, переживающий следующие прогоны | medium | подтверждён | `core/run/read-isolated-unit.ts:42-44,75-83`, `core/cache/create-run-cache.ts:313-318` | фикстуры `crash`, `loaderr`, `loadcache`; `test/repros/BUG-901.test.ts` |
| BUG-902 | Вне `--fast` один нестабильный провал теста в dry run приписывается инструментированию: файл выбрасывается с `instrumentation-break`, все его мутанты `Error`, exit 1, кэш не сохраняется | medium | подтверждён | `core/run/run-dry-phase.ts:161-170,195-203,275-296,385-421` | фикстура `flakydry`; `test/repros/BUG-902.test.ts` |
| BUG-903 | Тест, загружающий модуль вычисляемым `import()`, не попадает в dry run (`vitest related`); если модуль импортирует статически другой, слабый тест, мутант молча получает `Survived` | medium | подтверждён (ограничение задокументировано, следствие — нет) | `adapters/vitest/run-dry.ts:225-247`, `core/run/rank-mutant-files.ts:28-59` | фикстура `dynimport` |
| BUG-904 | Локальная привязка с именем `globalThis` (параметр, `let`, `var`) скрывает все сайты в своей области: проверка `globalThis.__mootant?.hit()` читает её, мутанты никогда не включаются → ложный `NoCoverage` (или `TypeError` и `instrumentation-break`, если значение `undefined`) | low | подтверждён | `core/instrument/get-site-check.ts:11-13` | фикстура `shadow`; `test/repros/BUG-904.test.ts` |
| BUG-905 | Текст замены (плагин-мутатор) не проверяется на разбираемость ни при генерации, ни при переключении; файл с синтаксической ошибкой ломает загрузку тест-файла до вычисления сайтов, а `findBrokenFiles` при пустом покрытии объявляет сломанными **все** переключённые файлы → все мутанты прогона `Error` с ложным «Tests fail with the switched X» | medium | подтверждён | `core/generate/group-replacement.ts:233-236`, `core/instrument/create-switched-files.ts:74-94`, `core/run/run-dry-phase.ts:505-517` | фикстура `badplugin`; `test/repros/BUG-905.test.ts` |


## Разбор находок

### BUG-900 — прерванный isolated-юнит засчитывается как «пройденный файл»

**Контракт.** `RunStatus` (`types/run/run-status.d.ts:7-8`): «`Survived`: every
test of the test files that cover it passed in a fresh module graph, and one of
them reached it». Порядок файлов и правило решения — `decideEvidence`
(`core/run/decide-evidence.ts:17-35`): файл с уликой `'none'` считается
«done without one», и мутант становится `Survived`, как только все файлы
«done» и хотя бы один юнит достиг мутанта.

**Дефект.** `readIsolatedUnit` (`core/run/read-isolated-unit.ts:46-106`)
возвращает `null` (→ `'none'` в `getUnitEvidence`,
`core/run/get-unit-evidence.ts:19-21`) в трёх ситуациях, когда юнит **не
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
(`apply-isolated-result.ts:77-82` пишет только не-`null`), и следующий прогон
выполнит этот файл снова.

**Направление исправления.** Улика `'none'` допустима, только если все тесты
файла из dry run (`analysis.fileTests`) выполнились или юнит остановлен
bail-ом после убийства. Иначе юнит неполон: повторить один раз как
`missing` (`apply-isolated-result.ts:93-113`), при повторе — `Error` с
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
достигли его в dry run (`core/run/rank-mutant-files.ts:33-37`). Тест-файл,
загружающий модуль вычисляемым спецификатором (``import(`../src/${name}`)``
без статического расширения, `import(path.join(dir, file))` — типично для
тестов плагинов/фикстур по списку), не попадает ни в dry run, ни в
isolated-юниты. (Шаблон со статическим расширением, ``import(`../src/${name}.js`)``,
Vite превращает в glob, и такой тест выбирается — уточнение агента verdicts.) Если тот же модуль
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
отбрасывает нелитеральные (`core/run/read-test-imports.ts:57-62`): тест-файлы
с вычисляемым `import()` можно добавлять в dry run явно (поле `files`
запроса) или предупреждать о них; опция «dry run по всем тест-файлам».

### BUG-904 — затенённый `globalThis` прячет сайты мутантов

Проверка сайта — `globalThis.__mootant?.hit("id")`
(`core/instrument/get-site-check.ts:11-13`); `validateReplacement` и
`isValuePosition` не смотрят, связано ли имя `globalThis` в области сайта
(`core/generate/validate-replacement.ts:49-84`). Внутри функции с параметром
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

### BUG-905 — одна неразбираемая замена выбрасывает весь прогон

Гарантия «replacement — выражение (или оператор) своего синтаксического
класса» для мутаторов плагинов не проверяется:

- `groupReplacement` читает текст замены (`readText`), и если он не
  разбирается ни в одном контексте, просто оборачивает его в скобки
  (`core/generate/group-replacement.ts:233-236`: `readings.length === 0 →
  return true`), а не отвергает; `addReplacement`
  (`core/generate/collect-candidates.ts:266-367`) проверяет узел
  (`validateReplacement`), но не текст. `mootant list` показывает такой мутант
  как обычный (`a + b -> a +`).
- `instrumentFile`/`createSwitchedFiles` не разбирают результат
  (`core/instrument/create-switched-files.ts:74-94`; проверка компиляции есть
  только для Svelte/Vue).
- В dry run тест-файл падает при загрузке до вычисления любого сайта
  (`covers: []`), и `findBrokenFiles` при пустом множестве делает вывод «сломаны
  все» (`core/run/run-dry-phase.ts:516`: `broken.size === 0 ? new Set(related)`).

**Воспроизведение.** `/home/user/projects/static/vt/badplugin`: плагин `acme`
с мутатором, который для `a + b` в `src/math.js` пишет `a +`; второй файл
`src/other.js` со своими тестами. `mootant run --no-cache` → `error 4`: все
мутанты обоих файлов, у `src/other.js` — «Tests fail with the switched
src/other.js and pass without it», хотя он ничего не ломал. Юнит-тест
`test/repros/BUG-905.test.ts`: (1) `createSwitchedFiles` принимает
неразбираемый текст без диагностики; (2) `runDryPhase` с отказом загрузки без
покрытия в одном тест-файле выбрасывает и невиновный файл.

**Вероятность.** Встроенные мутаторы, судя по коду, строят тексты корректно
(это проверяют агенты с fuzz); риск — в публичном плагинном API (модель ESLint
предполагает сторонние мутаторы) и в будущих ошибках встроенных. Цена — весь
прогон в `Error` с неверной диагностикой. **Направление:** отвергать
неразбираемый текст как ошибку мутатора в `groupReplacement`/`addReplacement`;
разбирать переключённый текст в `createSwitchedFiles` (oxc дешёв) и давать
`instrument-error` одному файлу; в `findBrokenFiles` при пустом покрытии
сужать подозреваемых до `DryFile.dependencies` упавших тест-файлов.

## Как решается вердикт: проверенные пути

### Что считается «покрыто»

- Мутант действует **только** через проверку своего сайта: хост — условное
  выражение или `if` с вызовом `hit(id)` (`core/instrument/render-mutant-range.ts:85-95`),
  `hit` возвращает `true` лишь для активного id (`core/runtime/install-mutant-runtime.ts:40-53`).
  Пока сайт не вычислен, код с активным мутантом исполняется так же, как без
  него, поэтому запуск мутанта только в тест-файлах, вычислявших его сайт в dry
  run (`core/run/rank-mutant-files.ts:33-37`), корректен для
  детерминированных тестов. Нарушают это нетестовые пути загрузки (BUG-903) и
  затенённый `globalThis` (BUG-904).
- Покрытие попытки — сайты, вычисленные, пока попытка активна
  (`adapters/vitest/runner.ts:1135-1147`); для одновременных (concurrent) попыток
  сайт засчитывается всем — переоценка, безопасная для isolated-пути.
- **Static.** Сайты, вычисленные вне попыток (загрузка тест-файла и его
  импортов, setup-файлы, `beforeAll`/`afterAll`, промежутки между тестами), идут
  в `DryFile.covers` (`runner.ts:524-525,1135-1147`) → `loadCovers`
  (`core/run/read-dry-run.ts:41-54`) → путь `isolated`, причина `static`
  (`core/run/classify-mutants.ts:101-103`), файлы — загружавшие мутанта
  (`rank-mutant-files.ts:33`), мутант активен с начала загрузки
  (`runner.ts:548-553`). Batch-путь static-мутантов не берёт — верно, он
  включает мутанта только внутри попытки.
- **Setup-файлы** исключены из мутации (`core/run/select-run-files.ts:55-59`,
  список — `AdapterSession.listTestFiles`), их импорты мутируются и считаются
  static.
- **Вне воркеров** (`globalSetup`): main-процесс пишет вычисленные сайты в
  `outside` (`adapters/vitest/start-vitest-session.ts:134-136`), такие мутанты
  без убийства получают `Error` (`core/run/mark-outside-mutants.ts:17-52`), а
  любой `Error` валит прогон (`cli/report/build-run-report.ts:151-156`) — score
  нельзя «почистить», исключив их.
- Код, исполняемый в нестандартном test environment до создания раннера,
  `__mootant` не видит (рантайм ставит раннер,
  `adapters/vitest/runner.ts:256`): такие сайты не покрываются и не
  попадают в `outside` → `NoCoverage` (гипотеза по чтению, не проверялась).

### Fast mode: когда batch-kill принимается

Kill принимается, если попытка мутанта упала **и достигла** его
(`core/run/classify-try.ts:39-43`), а контрольные попытки до и после прошли
(`core/run/apply-batch-result.ts:305-358`); hit-limit — так же; time-limit —
нужна хорошая контрольная до и подтверждение с удвоенными границами и половиной
воркеров (`core/run/run-batch-phases.ts:67-90`, `core/run/plan-batch.ts:68-70`).
Выживших batch не решает: все перепроверяются на isolated-пути
(`run-batch-phases.ts:91-97`), так что batch даёт только ложные убийства, но
не ложные выживания. Механизм ложного убийства: код мутанта встречает
состояние, созданное исходным кодом раньше в том же процессе — в контрольной
попытке или в **предыдущих тестах файла**, которые в batch-юните идут без
мутанта (`types/adapter/batch-plan.d.ts:3-7`). Это задокументировано
(«A kill may be false», `docs/content/guide/cli.mdx:49`) и отчёт об этом
предупреждает. Фикстура `/home/user/projects/static/vt/fastkill` (один тест
регистрирует имя, другой ищет его через ту же `normalize`): по умолчанию
`killed 2, survived 3` (40%), с `--fast` — `killed 4, survived 1` (80%) и
строка «3 kills and timeouts come from batch tries and may be false». Оракул
(физическая мутация) совпадает с режимом по умолчанию. Дефектом не считаю:
поведение заявлено и видно в отчёте.

Синтезированная попытка зависшего batch-юнита помечается `reached: true`
(`adapters/vitest/run-batch.ts:61-75`), но записи теста пишутся только в конце
теста (`runner.ts:1112-1131`), поэтому у неё никогда нет контрольной «до» →
`doubtful` → isolated. Жёстко заданный `reached` безвреден.

### Таймауты и hit limit

- Hit limit считает **все** вычисления сайтов, после превышения каждый `hit`
  бросает до сброса (`install-mutant-runtime.ts:40-44`) — проглоченная ошибка
  не спасает бесконечный цикл; проверка лимита юнита идёт раньше убийств
  (`core/run/read-isolated-unit.ts:31-38`). Достичь лимита без достижения
  мутанта детерминированный код не может (лимит ≥ 100× dry run).
- Бюджет isolated-юнита — сумма бюджетов тестов и загрузки
  (`core/run/plan-isolated.ts:16-45`), а дедлайн каждого теста — дедлайн всего
  юнита (`adapters/vitest/runner.ts:853`): отдельный тест может быть
  намного медленнее «своих» `3×d + 250` мс. Dry run меряет с включённым
  покрытием (медленнее) — запас в пользу мутанта.
- «Честный медленный мутант» становится `Timeout`, только если замедление
  превышает бюджет и в подтверждающем прогоне с удвоенным бюджетом
  (`core/run/get-unit-evidence.ts:22-28`, `plan-isolated.ts:23`). Это
  заявленная семантика (`docs/content/guide/configuration.mdx:429-434`).
- Зависание без достижения мутанта засчитывается так же, как с ним: `hang` не
  проверяет `reached` (`read-isolated-unit.ts:39-41`), но требует двух зависаний
  подряд. Надёжно различить нельзя (запись теста, где воркер завис, не пишется),
  поэтому подтверждение — разумный компромисс; на перегруженной машине
  возможен ложный `Timeout` (гипотеза, не проверялась).
- Обратный вопрос «может ли зависание стать Survived»: само зависание — нет
  (watchdog → `hang`); но таймаут теста, **не** достигшего мутанта, обрывает
  юнит и приводит к ложному `Survived` — BUG-900.

### Кэш (только влияние на вердикт)

- Решение по кэшированным уликам — то же правило `decideEvidence`, что и для
  свежих (`core/cache/apply-cached-units.ts:18-50`,
  `core/cache/apply-cached-batch.ts:29-55`): файлы до первого кэшированного
  убийства без записи всё равно запускаются, файлы после — отбрасываются;
  эквивалентно свежему прогону при неизменных входах.
- Batch-kill из кэша — только после кэшированных проходов всех тестов, которые
  batch попробовал бы раньше, или если это был первый тест мутанта
  (`apply-cached-batch.ts:66-139`) — консервативно (проходы тестов других
  файлов не влияют на результат, но требуются).
- Не хранятся timeout, error и crash (`core/cache/create-run-cache.ts:313-318`);
  **хранятся** убийства `load-error`, `stray-error` и обычные убийства из одной
  попытки — сбой окружения при загрузке закрепляется (BUG-901), нестабильный
  тест — тоже (общий риск, без отдельного ID).

## Проверенные инварианты (выдержали проверку)

1. Покрытие по сайтам корректно для детерминированного кода (см. выше); выбор
   файлов isolated-пути не теряет убивающие файлы, если тест-файл попал в dry
   run.
2. Вердикт не зависит от разбиения на раунды, числа воркеров и порядка
   завершения юнитов: первый по рангу файл с уликой решает, ожидающие файлы
   (без улик, `confirming`, `retrying`) задерживают более поздние
   (`core/run/decide-evidence.ts:17-35`); ранг не зависит от длительностей
   (`core/run/rank-mutant-files.ts:19-22`). Кэш использует то же правило.
3. Достижение в isolated-юните кумулятивно и согласовано между ядром
   (`read-isolated-unit.ts:45-47`), раннером Vitest (bail, `runner.ts:889-891`)
   и `node:test` (`adapters/node-test/preload/create-try-tracker.ts:150-152,167-178`):
   падение до первого достижения убийством не считается.
4. Batch-путь не порождает `Survived`; убийства — только с достижением и
   двумя хорошими контрольными (см. выше).
5. Static-мутанты (загрузка, setup, suite-хуки, промежутки) никогда не идут в
   batch и включаются с начала загрузки.
6. Без активного мутанта переключённый код семантически совпадает с исходным
   для встроенных мутаторов: `isValuePosition` отвергает цели присваивания,
   операнды `delete`, идентификаторы под `typeof`, callee/tag с `this` и
   `eval`, quasi тегированных шаблонов, звенья опциональной цепочки,
   сокращённые свойства и методы, атрибуты и дети JSX
   (`core/syntax/is-value-position.ts:50-203`); директивы, спецификаторы
   модулей и типы не входят в дерево (`core/tree/index-tree.ts:88-136`);
   объявления не бывают block-хостами (`core/generate/get-replacement-kind.ts:6-25`),
   тело метки не заменяется (`core/generate/validate-replacement.ts:68-74`);
   ASI у начала оператора закрыт `;` (`core/instrument/find-statement-starts.ts:62-111`);
   все хосты в скобках — приоритет операторов не важен. Исключение — BUG-904.
   Вывод имени функции: я проверил только случай, когда **исходный** текст
   хоста — анонимная функция в инициализаторе (встроенные мутаторы так не
   делают), и пропустил случай, когда анонимной функцией становится **замена**
   (logical-operator оставляет операнд `function () {}`: у физического мутанта
   имя выводится, у переключённого — нет). Его нашёл агент instrumentation
   (BUG-103), см. «Сравнение».
7. Дедупликация сравнивает полный мутированный текст
   (`core/generate/deduplicate-candidates.ts:32-49`) — склеивает только
   текстуально равные программы.
8. Ошибочный узел замены (не выражение/оператор, не та позиция) — ошибка
   мутатора и пропуск, а не мутант (`core/generate/collect-candidates.ts:286-304`).
9. Score: `(Killed + Timeout) / (… + Survived [+ NoCoverage])`, `Ignored` и
   `Error` исключены, но любой `Error` делает прогон неуспешным
   (`core/run/compute-score.ts:12-19`, `cli/report/build-run-report.ts:151-156`).
10. В `--fast` нестабильные тесты ловятся двумя попытками dry run, и их мутанты
    уходят на isolated (`core/run/read-dry-run.ts:75-81`,
    `core/run/run-dry-phase.ts:190-251`).
11. Vitest принудительно запускается с `isolate: true` и пулом forks
    (`adapters/vitest/configure-project.ts:36-55`) — кэш модулей между
    тест-файлами не влияет на покрытие static-кода.

## Отсутствующие гарантии и неявные предположения

- **Тесты детерминированы.** В режиме по умолчанию нет ни контрольных
  попыток, ни повтора: нестабильный тест, упавший после достижения мутанта, —
  `Killed`, и это кэшируется. Опции «подтвердить убийство повтором» нет.
  (Общая проблема инструментов, у Stryker так же.)
- **Окружение надёжно.** Посторонний сбой юнита трактуется то как отсутствие
  улик (BUG-900), то как убийство (BUG-901), то как поломка инструментирования
  (BUG-902); признака «юнит неполон» в контракте `IsolatedFacts`
  (`types/adapter/isolated-result.d.ts:7-74`) нет.
- **Связь тест → модуль статическая** (BUG-903): вычисляемые `import()`,
  `createRequire` (нативная загрузка — оригинальный код), дочерние процессы и
  воркеры (задокументировано: оригинальный код) не дают покрытия.
- **Текст замены валиден** (BUG-905) и **`globalThis` не затенён** (BUG-904).
- **Позиции в переключённом коде не важны тестам.** Карта исходников не
  строится (`core/instrument/instrument-file.ts:44`, плагин отдаёт
  `map: null`, `adapters/vitest/create-mootant-plugin.ts:49`), многострочные
  замены сдвигают строки последующего кода; тесты, сверяющие `error.stack`,
  `fn.toString()` или номера строк вызывающего кода, упадут уже в dry run и
  выкинут файл как `instrumentation-break` (гипотеза, не проверялась).
- **`dangerouslyIgnoreUnhandledErrors` не учитывается:** isolated-путь
  убивает по необработанной ошибке после достижения
  (`core/run/classify-try.ts:34-38`), даже если проект их игнорирует и обычный
  прогон проходит (гипотеза, низкая).
- **Пропущенная контрольная попытка считается хорошей**
  (`core/run/apply-batch-result.ts:351-358` не смотрит `skipped`): batch-kill
  принимается, если контрольная после мутанта «пропустила себя» (низкая).

## Мелкие наблюдения (без ID)

- Порог сравнивается с округлённым до 0,01 score
  (`core/run/compute-score.ts:28-30`, `cli/report/build-run-report.ts:154-155`):
  15999/20000 = 79,995% даёт `80` и проходит `--threshold 80` (проверено
  вычислением).
- После BUG-902 второй нестабильный провал в повторном dry run обрывает весь
  прогон сообщением «Tests still fail with mootant's switched files after the
  files that broke them were dropped» (`core/run/run-dry-phase.ts:309-319`).

