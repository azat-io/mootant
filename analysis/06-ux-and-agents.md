# Раздел 6. Опыт пользователя и агентов

> Коммит `170ec52` (main), версия `0.1.0`, пакет
> `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`. Дата проверки 2026-11-04.
> Машина: 4 vCPU, 15 ГБ RAM, общая с другими агентами (load average 3–6).
> Node.js 22.23.4 (и 24.22.1 для проверки кэша), npm 10.9.9, pnpm 10.28.0,
> Vitest 5.1.0 (последняя на дату проверки), Chromium из Playwright.
> Артефакты раздела — `analysis/ux/`, баги — `analysis/bugs/ux.md`
> (BUG-650…), промпты — `analysis/bug-prompts/BUG-65x.md`. Проекты, на которых
> всё проверялось, лежат вне репозитория: `/home/user/projects/ux/*`.

## Коротко

1. **Новый пользователь не может установить Mootant.** `npm install -D
   mootant` ставит заглушку 0.0.0 без `bin`, `npx mootant run src` падает с
   `could not determine executable to run`. Установки из GitHub тоже нет
   (нет `dist/`). Всё остальное в разделе проверено на собранном tarball.
2. **Skill, на котором построено позиционирование, отсутствует.** `npx skills
   add azat-io/mootant` отвечает «No skills found» (exit 1), пункт меню сайта
   «Agent skill» ведёт на несуществующую страницу. Нужен один файл
   `skills/mootant/SKILL.md`; черновик `analysis/ux/SKILL.draft.md` проверен
   CLI `skills`: находится и ставится.
3. **Когда Mootant установлен, первый опыт хороший.** Ноль конфигурации,
   понятный текстовый отчёт с диффом и тестовым файлом, отличный офлайн
   HTML-отчёт, перепроверка мутанта по id за 4 с. Шероховатости: подсказка
   `re-check one: mootant run src --mutant 69kd` не запускается как
   напечатана (`command not found` без `npx`), игнор-комментарий не умеет
   выключить один мутант, `.mootant/` не игнорируется git автоматически.
4. **CI собирается, но кэш вердиктов в нём не работает**: ключ кэша включает
   mtime файла пакета, а `npm ci` ставит файлы с текущим временем
   (независимое подтверждение BUG-407 в сценарии GitHub Actions). Нет
   форматов для аннотаций, SARIF и Markdown-сводки; при ошибке `--json` не
   печатает JSON; код выхода 1 означает и «порог не пройден», и «упало».
   Прототип конвертера и workflow: `analysis/ux/mootant-github.mjs`,
   `analysis/ux/mootant-workflow.yml`.
5. **`--json` удобен скриптам, но дорог агенту**: 136 токенов на мутант в
   отчёте `run`, 86 — в `list`. TOON на этих данных **длиннее** JSON
   (+19–20 %), потому что объекты мутантов неоднородны. Предложенный
   построчный формат `--format agent` короче JSON на 60–62 %.
6. **MCP-сервер сейчас не нужен.** Его единственная настоящая выгода —
   тёплый процесс для быстрых перепроверок — достижима в CLI, а цена
   сопровождения для одного мейнтейнера высока.

## 6.1. Журнал первого запуска

Проект `/home/user/projects/ux/first-run` создан с нуля: `npm init`, Vitest
5.1.0, TypeScript, 5 модулей и 4 тестовых файла с типичными слабостями: нет
граничного значения (`getDiscount(150)`, но не `100`), `toBeTruthy()` вместо
точного значения, проверка только длины массива ошибок, нет теста на повтор
после ошибки, модуль `src/format.ts` без тестов, `console.log` в коде.
`npm test`: 12 тестов, 0,8 с. Путь — строго по readme и
`docs/content/guide/getting-started.mdx`. Все выводы сохранены в
`analysis/ux/first-run/`.

### Шаг 1. Установка (readme.md:77-78, getting-started.mdx:65-69)

```text
$ npm view mootant
mootant@0.0.0 | Proprietary | deps: none | versions: 2
OIDC trusted publishing setup package for mootant
dist-tags: latest: 0.0.0                  (0.0.0-stage и 0.0.0 от 2026-10-10)

$ npm install -D mootant                   # в package.json: "mootant": "^0.0.0"
$ npx mootant run src
npm error could not determine executable to run          # exit 1
```

В `mootant@0.0.0` два файла: `package.json` без `bin` и README «This package is
created solely for the purpose of setting up OIDC trusted publishing… DO NOT
USE THIS PACKAGE». `npm install -D github:azat-io/mootant` ставит исходники
без `dist/` (в `package.json` нет `prepare`), и `npx mootant --version` падает
с `ERR_MODULE_NOT_FOUND …/mootant/dist/cli/index.js`. Дальше использован
tarball: `npm install -D …/mootant-0.1.0-170ec52.tgz` — 5 с, 6,4 МБ в
`node_modules/mootant`, три прямые зависимости.

`mootant --help` хорош: команды, все флаги с пояснениями и значениями по
умолчанию. Мелочи: `mootant` без команды печатает справку с кодом 0;
`mootant run --help` — общая справка, а не по `run`; на `mootant lst` нет
подсказки «did you mean list»; неизвестная опция выводит сообщение
`node:util parseArgs` как есть, с непарной кавычкой и советом про `--`
(`cli/parse-arguments.ts:327-329`).

### Шаг 2. Первый `list`

`npx mootant list src` — 1 с, 79 мутантов в 5 файлах, по строке на мутант:
`10:7 comparison-operator total >= 100 -> total > 100 69kd`
(`analysis/ux/first-run/01-list-tty.txt`). `--skipped` добавляет 56
пропущенных изменений с категорией, правилом и причиной, например
`22:3 statement-removal console.log('displayName called') -> ; noise
log-message — it only removes a log message`
(`analysis/ux/first-run/01b-list-skipped.txt`). Пользователь сразу видит,
почему мутантов меньше, чем возможных изменений.

Разобрал вручную подозрительный пропуск `user.name || user.email` → `??`
(noise, nullish-swap): `name: string` не может быть nullish, поэтому `??`
совпадает с уже существующим мутантом `→ user.name` (pcxz). Пропуск
корректен, но текст причины («differ here only on falsy values that the
nullishSwap option does not count») этого не объясняет.

### Шаг 3. Первый `run`

`npx mootant run src` в терминале (эмуляция TTY через `script`, 100 колонок):
22,7 с (старт 1,2 с, dry run 1,3 с, изолированные прогоны 20,2 с) против 0,8 с
у `vitest run`. Итог: killed 28, survived 39, no coverage 12, score 35,44 %
(covered 41,79 %), затем список пяти файлов с худшим score и секции
`survived` и `no coverage` по файлам. У каждого мутанта — позиция, мутатор,
короткий id, дифф и `test: test/price.test.ts`. В конце:
`re-check one: mootant run src --mutant 69kd`
(`analysis/ux/first-run/02-run-tty.txt`).

Отчёт читается без документации. Запнулся в трёх местах:

- **Подсказка перепроверки не запускается как напечатана.** Скопированная
  `mootant run src --mutant 69kd` даёт `bash: mootant: command not found`:
  пакет стоит локально, а строка собирается без `npx`
  (`cli/report/format-command.ts:77`, `cli/report/format-run-text-report.ts:173`).
  То же в поле `recheck` JSON и в блоке «Run it again» HTML-отчёта
  (`cli/html/client/render-mutant-panel.ts:197`). Документация в этом месте
  пишет `npx mootant run src --mutant q31p` (getting-started.mdx:115), то есть
  инструмент и документация расходятся. Агент из `skill-session.ansi` тоже
  вызывает `mootant run src --mutant q31p780qv6yk` без `npx` (BUG-652).
- **Модуль без тестов не получает подсказки, куда писать тест.** У 8
  мутантов `src/format.ts` (no coverage) нет ни строки `test:`, ни
  `testFiles` в JSON, хотя имя файла по соглашению проекта очевидно
  (`test/format.test.ts`). Предупреждение `never-served` объясняет причину, но
  не следующий шаг.
- **Время.** 22,7 с на 5 крошечных файлов (в 28 раз дольше обычного прогона
  тестов) не мешает, но пользователь заранее не знает, сколько займёт его
  проект: прогноз есть только внутри раунда («~25s left in round»). Причины и
  ускорения — в разделе 4.

Что стоит сохранить: ноль конфигурации; раннер найден сам; `never-served`
объясняет, почему у `format.ts` 0 %; повторный прогон без изменений — 1,1 с
(«67 cached»); после правки теста перезапускаются только затронутые мутанты
(21 из 67, 6,3 с).

### Шаг 4. HTML-отчёт

`npx mootant run src --html` → `.mootant/report.html`, 361 КБ, один файл.
Открыт в headless Chromium (Playwright, `deviceScaleFactor: 2`), скриншоты —
`analysis/ux/first-run-*.png` (обзор, файлы, мутанты, мутаторы, тесты, файл
`src/price.ts`, мутант `69kd`, тёмная тема, ширина 390 px). Ошибок в консоли
нет, сетевых запросов нет, горизонтальной прокрутки на мобильной ширине нет
(`analysis/ux/first-run-browser-log.txt`).

Отчёт — сильная сторона проекта: «Look at these first» по файлам от худшего
score, код файла с мутантами на месте, у мутанта — изменение, «Where to add a
test» с покрывающим тестом и строкой, соседние мутанты той же строки и
пропущенные изменения («Left out here»), кнопка копирования
игнор-комментария. Замечания:

- В панели мутанта самое нужное — «Where to add a test» и «Run it again» —
  ниже описания мутатора, времени и списков соседей: при высоте окна 860 px
  панель прокручивается на 1695 px
  (`first-run-mutant-panel-scrolled-light.png`). Команда в «Run it again»
  обрезана по ширине («$ mootant run src --mu») и тоже без `npx`.
- Нет ссылки на страницу мутатора с разделом «Kill a surviving mutant», хотя
  такие разделы есть у всех 20 мутаторов.
- `git status` после первого `--html` показывает `?? .mootant/`. Readme
  просит добавить каталог в `.gitignore` (readme.md:98), но инструмент мог бы
  сам класть `.mootant/.gitignore` с `*`, как pytest делает для
  `.pytest_cache` (`cli/html/write-html-report.ts:10-16` создаёт только
  каталог).

### Шаг 5. Исправление выжившего мутанта

По getting-started.mdx:97-118 добавил тест на границу:

```ts
it('gives orders of exactly 100 10% off', () => {
  expect(getDiscount(100, false)).toBe(10)
})
```

`npx mootant run src --mutant 69kd` — 4,0 с: dry run только одного тестового
файла (7 тестов), `killed 1, survived 0, score 100%`
(`analysis/ux/first-run/05-recheck-tty.txt`). Цикл из документации работает
ровно как описан. Соседний мутант `total >= 100 → total >= 99` (x223) этим
тестом не убивается — нужен ещё `getDiscount(99, false)`; страница мутатора
это объясняет («the boundary and right next to it»), getting-started — нет.

### Шаг 6. Цикл агента на том же проекте

Прошёл цикл так, как его прошёл бы агент по черновику skill
(`analysis/ux/SKILL.draft.md`): `--json`, тесты на 10 выживших, одна
перепроверка с десятью `--mutant`.

- Перепроверка 10 мутантов одной командой — 10,8 с; 8 убиты, 2 выжили
  (`analysis/ux/first-run/08-recheck-batch.json`).
- `8yjn` (`percent <= 0 → percent < 0` в `applyDiscount`) эквивалентен: при
  `percent = 0` обе ветки возвращают `total`. Агент должен это распознать, а
  не писать тест.
- `vjfx` (удаление `lastError = error` в `retry`) выжил, хотя тест проверял
  `await expect(retry(task)).rejects.toThrow('down')`. Физическое применение
  мутанта подтвердило вердикт: в Vitest 5.1.0
  `expect(Promise.reject(undefined)).rejects.toThrow('down')` **проходит**, как
  и синхронный `expect(() => { throw undefined }).toThrow('down')`;
  `rejects.toThrow(Error)` и `rejects.toMatchObject({ message: 'down' })`
  падают. Mootant нашёл слабую проверку, о которой автор теста не подозревал.
  Хороший пример для документации и skill.
- Игнор-комментарий для эквивалентного `8yjn`
  (`// mootant-ignore-next-line comparison-operator: …`) выключил и два
  убиваемых мутанта той же строки (`qra1`, `m37n`, к тому моменту уже убитые
  новыми тестами): все три стали `Ignored`. Выключить один мутант нельзя,
  комментарий работает на уровне мутатора и строки
  (`docs/content/mutators.md:84-113`). Агент, который «аккуратно игнорирует
  эквивалентный мутант», молча прячет соседей.

Итог шага: score 35,44 % → 50 % за один проход агента, два вопроса к
документации (эквивалентные мутанты, гранулярность игнора) и один к
инструменту (подсказка без `npx`).

### Сводка «спотыканий»

| ID | Где | Что | Серьёзность |
| --- | --- | --- | --- |
| U-01 | установка | `npm install -D mootant` ставит заглушку 0.0.0, `npx mootant` — `could not determine executable to run`; установки из GitHub тоже нет (BUG-653) | critical |
| U-02 | skill | `npx skills add azat-io/mootant` — «No skills found», exit 1 (BUG-651); пункт меню «Agent skill» → 404 (BUG-650) | high |
| U-03 | отчёт | `re-check one:`, JSON `recheck` и «Run it again» печатают `mootant …` без `npx` → `command not found` при копировании (BUG-652) | medium |
| U-04 | игнор | Нельзя выключить один мутант: комментарий выключает все мутанты мутатора на строке, включая убиваемые | medium |
| U-05 | отчёт | Для модуля без тестов нет предложенного тестового файла (`testFiles` пуст) | low |
| U-06 | git | `.mootant/` не игнорируется автоматически, отчёт с исходниками виден в `git status` | low |
| U-07 | HTML | «Where to add a test» и «Run it again» ниже описаний; команда обрезана; нет ссылки на «Kill a surviving mutant» | low |
| U-08 | CLI | справка без подкоманд, нет «did you mean», сырое сообщение `parseArgs` | low |
| U-09 | доки | getting-started не говорит, что границу убивают два значения (`100` и `99`), и ничего не говорит об эквивалентных мутантах | low |
| U-10 | ожидания | Нет оценки времени до запуска: 22,7 с на 5 файлов при 0,8 с у тестов | low |

### Нужна ли команда `init`

**Нет, до 1.0 не нужна.** Аргументы:

- StrykerJS начинается с `npm init stryker@latest`
  (`stryker-js/docs/getting-started.md:20-36`): мастер ставит плагин раннера
  (`@stryker-mutator/vitest-runner` и др.), спрашивает репортёры и пишет
  `stryker.config.mjs`. Там без мастера нужно знать имена плагинов и
  обязательные поля — init окупается.
- cargo-mutants обходится без init: «Just run `cargo mutants` in a Rust source
  directory» (`cargo-mutants/book/src/getting-started.md:3-4`), конфиг
  `.cargo/mutants.toml` необязателен.
- Mootant ближе к cargo-mutants: раннер определяется сам, пресет по умолчанию
  `recommended`, конфиг необязателен. На первом запуске конфиг ни разу не
  понадобился: единственный обязательный ввод — путь, а без него сообщение
  уже подсказывает формат (`mootant run needs paths, such as "mootant run
  src".`, `core/run-mutants.ts:184`).

Что `init` дал бы на практике — три действия, каждое дешевле сделать без новой
команды:

| Что сделал бы `init` | Альтернатива без `init` |
| --- | --- |
| записать `run.paths` | при пустых путях подсказать найденные каталоги (`src`, `lib`, `include` из `tsconfig`) в тексте ошибки |
| добавить `.mootant` в `.gitignore` | писать `.mootant/.gitignore` с `*` при создании каталога (S) |
| положить CI-workflow и поставить skill | страница «CI» с готовым workflow и строка `npx skills add` в getting-started |

Если `init` всё же появится, он должен быть неинтерактивным и идемпотентным
(как `npx skills init`), с флагами `--ci github` и `--skill`, а не мастером
с вопросами.

## 6.2. CI (GitHub Actions)

### Что проверено

Черновик workflow — `analysis/ux/mootant-workflow.yml`: `--since` на PR,
полный прогон на `main`, кэш вердиктов, аннотации, сводка, липкий комментарий
в PR, артефакт с JSON и HTML. `actionlint` (wasm 2.0.6) замечаний не нашёл;
флаги `gh pr comment --edit-last --create-if-none` сверены с `gh 2.89.0`.
На GitHub workflow не запускался: доступа на запись к репозиторию у этой
сессии нет. Локально проверены все части, которые зависят от Mootant.

#### `--since` и глубина клона

Локальный remote с веткой `feature` (меняет `src/price.ts`), `main`,
ушедшим вперёд после ответвления (меняет `src/slug.ts`), и merge-ref
`refs/pull/1/merge`, как его создаёт GitHub. Клоны — теми же командами, что у
`actions/checkout` (`analysis/ux/ci-since-check.txt`):

| Checkout | `--since` | Результат |
| --- | --- | --- |
| по умолчанию (`fetch-depth: 1`) | `origin/main` | `Error: --since: unknown git revision "origin/main".` |
| `fetch-depth: 1` + `git fetch --depth=1 origin main` | `origin/main` | `… have no common commit; a shallow clone may need "git fetch --deepen".` |
| `fetch-depth: 2` | `origin/main` | unknown revision (ветка base не скачана) |
| `fetch-depth: 2` | `HEAD^1` | работает: 5 мутантов только из изменений PR |
| `fetch-depth: 0` | `origin/main` | работает: те же 5 мутантов; изменения `main` после ответвления не попали |

Выбор строк по merge base работает правильно. Неудобно другое: самая частая
ошибка в CI — `unknown git revision` — не подсказывает лекарство
(`core/git/get-merge-base.ts:33-35`), а документация говорит только «fetch the
base branch with enough history» (getting-started.mdx:132-134,
cli.mdx:111-112) без YAML. Приём `fetch-depth: 2` + `--since HEAD^1` (первый
родитель merge-коммита — верхушка base) нигде не описан, а он избавляет от
клона всей истории.

Прогон PR целиком: `npx mootant run src --since origin/main --threshold 80
--json > mootant.json` — 6,6 с, 5 мутантов на изменённых строках, score 20 %,
`passed: false`, exit 1 с корректным JSON. Если в PR тесты падают и без
мутантов, stdout пуст, ошибка в stderr, exit 1. Шаг-конвертер должен это
различать (в workflow — `[ -s mootant.json ]`), иначе `JSON.parse` падает.

#### Кэш между прогонами

Кэш — один файл `node_modules/.cache/mootant/run-v3.json`
(`core/cache/get-cache-path.ts:13-21`; в JSDoc там ещё `run-v2.json`), пути
внутри относительны корню (`core/cache/get-portable-path.ts:13-15`), записи
живут 30 дней (`core/cache/prune-cache-entries.ts:6-11`). Ключ окружения
(`core/cache/get-environment-key.ts:70-88`) включает версию Mootant, **штамп
сборки = `mtimeMs` файла `dist/core/cache/prepare-run-cache.js`**
(`core/cache/prepare-run-cache.ts:164`), хэши файлов окружения (конфиг
раннера, `.env`, lockfile), настройки, **мажорную версию Node**, платформу и
архитектуру. Эксперименты (`analysis/ux/ci-cache-check.txt`):

| Сценарий | Переиспользовано |
| --- | --- |
| повторный прогон в том же каталоге | 67 из 67 |
| проект скопирован в другой каталог `cp -r` (новые mtime у файлов пакета) | 0 |
| `npm ci` → прогон → сохранить кэш → `npm ci` → восстановить кэш → прогон (как `actions/cache`) | **0** |
| то же, но после каждого `npm ci` — `touch -d 1985-10-26` на файлах `node_modules/mootant` | 67 из 67 |
| pnpm, переустановка из того же store | mtime сохраняется (жёсткие ссылки) → кэш жив |
| pnpm, новый store | новый mtime → кэш сброшен |
| тот же каталог, Node 22 → Node 24 → снова Node 22 | 0, затем снова 0: на мутант хранится одна запись, и она перезаписывается |

Вывод: **с `npm ci` кэш вердиктов в CI не работает никогда.** npm 10 ставит
файлам время установки (проверено и на `vitest`, и на `mootant`), штамп
сборки меняется, ключ окружения меняется, все записи недействительны.
Относительные пути, сделанные ровно для переноса кэша, не помогают. Это
BUG-407 из `bugs/cache-since.md` (там medium); раздел 7
(`07-compat-and-release.md`, 7.4.5) называет это «мелочью». В сценарии CI я бы
поднял серьёзность до high: readme обещает «Mootant caches verdicts between
runs. In CI, check changed lines…», а полный прогон `main` на каждом пуше
идёт с нуля. С pnpm и кэшированным store проблема почти не видна — возможно,
поэтому её не заметили в самом проекте. Второе наблюдение: кэш хранит одну
запись на мутант, поэтому матрица Node 22/24 с общим кэшем или переключение
версий Node локально каждый раз сбрасывает всё; в ключ `actions/cache` нужно
включать мажорную версию Node (в черновике workflow — `node22`). До
исправления BUG-407 в черновике стоит обходной шаг после `npm ci`:
`find node_modules/mootant -exec touch -d '1985-10-26T08:15:00Z' {} +`
(проверен: 67 из 67 после повторного `npm ci`).

Прерванный прогон не сохраняет ни одного вердикта (BUG-418 в
`bugs/cache-since.md`, low; повторено здесь: SIGINT через 12 с, exit 130, файла
кэша нет, следующий прогон снова тестирует все 67 мутантов). В CI это важнее,
чем локально: `timeout-minutes` убивает задачу, и вся работа длинного прогона
пропадает. StrykerJS сохраняет частичные результаты при прерывании
(`stryker-js/docs/incremental.md:47`, «Interrupted runs»).

#### Аннотации, сводка, комментарий

В коде нет ни одного формата для CI: поиск `::error`, `::warning`, `sarif`,
`GITHUB_ACTIONS`, `GITHUB_STEP_SUMMARY`, `reviewdog`, `junit` в `cli/`,
`core/`, `adapters/`, `types/` ничего не находит. Прототип конвертера
`analysis/ux/mootant-github.mjs` (130 строк) делает из `--json`:

- аннотации `::warning file=…,line=…,col=…,title=…::<дифф и подсказка>` — до 10
  на тип, остальное через `::notice` уходит в сводку: GitHub показывает 10
  предупреждений и 10 ошибок на шаг и 50 аннотаций на задачу
  ([actions/toolkit, problem-matchers](https://github.com/actions/toolkit/blob/457303960f03375db6f033e214b9f90d79c3fe5c/docs/problem-matchers.md));
- Markdown для `$GITHUB_STEP_SUMMARY` и липкого комментария (таблица счётчиков,
  по мутанту `<details>` с диффом, тестовым файлом и командой перепроверки);
- SARIF 2.1.0 для `github/codeql-action/upload-sarif` (code scanning, без
  лимита аннотаций, с `partialFingerprints` по id мутанта);
- rdjson для reviewdog (комментарии в ревью PR).

Результат на PR из эксперимента — `analysis/ux/ci/` (`annotations.txt`,
`comment.md`, `mootant.sarif`, `mootant.rdjson`). Чтобы этот шаг не писал
каждый пользователь, достаточно встроить два формата: `--format github`
(аннотации и сводка, когда `GITHUB_ACTIONS=true`) и `--sarif <file>`.

Для PR из форков у `GITHUB_TOKEN` нет права записи, комментарий не
опубликуется; в черновике шаг помечен `continue-on-error`, полноценное
решение — отдельный workflow на `workflow_run`, который берёт артефакт. Это
стандартная проблема, но её стоит описать в документации.

#### Порог, коды выхода, время

`--threshold` и `passed` работают как описано (cli.mdx:59-68): при score ниже
порога exit 1 и полный JSON. Но exit 1 означает и «тесты падают без
мутантов», и «плохой аргумент», и «ошибка git» (`cli/run-mutation.ts:79-89`,
`cli/index.ts:15-19`), а JSON в этих случаях не печатается. Скрипт CI и агент
различают эти случаи только по пустому stdout. У cargo-mutants коды разные:
0 — всё поймано, 1 — ошибка использования, 2 — есть пропущенные мутанты, 3 —
таймауты, 4 — тесты падают без мутантов (`cargo-mutants/book/src/exit-codes.md`).

Для PR с `--since` время определяется стартом раннера и dry run затронутых
тестовых файлов, а не числом мутантов: 6,6 с на 5 мутантов в маленьком
проекте; на самом Mootant один dry run `core/text` занимает 4 мин 37 с (8393
теста, `/home/user/scratch/dogfood/run-text.err`). Если на изменённых строках
нет мутантов, раннер не стартует вовсе (`core/run-mutants.ts:241`) — это
хорошо, и это стоит упомянуть в документации. Бюджета времени («остановиться
через N минут и сохранить сделанное») нет.

Для логов и артефакта нужны и текст, и JSON, а `--json` заменяет текст.
Сейчас это два прогона (второй берёт вердикты из кэша, но снова делает старт
и dry run) или конвертер. Настройка `run.json: 'mootant.json'` по образцу
`run.html` решила бы это без второго прогона.

### Сравнение со Stryker и cargo-mutants

| Возможность | Mootant 0.1.0 | StrykerJS | cargo-mutants |
| --- | --- | --- | --- |
| Только изменённое | `--since <ref>`: строки от merge base, незакоммиченные и неотслеживаемые файлы включены | `mutate` с диапазонами строк `file:10-20` (`configuration.md:441`), `--incremental` | `--in-diff <file>` по готовому диффу (`in-diff.md`) |
| Кэш между прогонами | `node_modules/.cache/mootant`, сбрасывается после `npm ci` (BUG-407) | `reports/stryker-incremental.json`, можно коммитить или кэшировать; частичное сохранение при прерывании | кэша нет; `--iterate` пропускает пойманные ранее по `mutants.out` (`iterate.md`) |
| Шардирование | нет | нет | `--shard k/n`, `slice` и `round-robin`, пример матрицы (`shards.md`) |
| Машиночитаемый вывод | `--json` в stdout, HTML со встроенным JSON | `json` по схеме mutation-testing-elements | каталог `mutants.out`: `mutants.json`, `outcomes.json`, дифф и лог на мутант, `caught.txt`/`missed.txt` (`mutants-out.md`) |
| Хостинг отчётов и бейдж | нет | Stryker Dashboard: отчёты по веткам и модулям, бейдж (`configuration.md:169-194`) | нет |
| Аннотации в PR | нет | встроенных нет | встроенных нет |
| Коды выхода | 0 / 1 | 1 при `score < break` | 0, 1, 2, 3, 4, 5, 6, 70 |
| Ошибка в машиночитаемом виде | stdout пуст | — | `outcomes.json` |

Чего Mootant не хватает для CI, по убыванию пользы: работающий в CI кэш
(BUG-407), формат GitHub и SARIF, JSON в файл рядом с текстом, ошибка в JSON
и различимые коды выхода, сохранение частичных результатов, документация с
готовым workflow, шардирование (`--shard k/n`; нужен детерминированный
порядок id, он есть), экспорт в схему mutation-testing-elements — он дал бы
Stryker Dashboard и бейдж без своего сервиса.

## 6.3. Agent skill

### Статус: skill отсутствует, команда из документации падает

```text
$ cd /home/user/projects/ux/skill-check        # пустой каталог
$ npx -y skills@1.7.6 add azat-io/mootant       # 3,7 с, exit 1
•  claude-code_2-1-318_agent  Agent detected — installing non-interactively
o  Source: https://github.com/azat-io/mootant.git
o  No skills found
—  No valid skills found. Skills require a SKILL.md with name and description.
```

То же с `--list --full-depth` (рекурсивный поиск по всему репозиторию до
глубины 5). Лог — `analysis/ux/skills-add-output.txt`.

Где искал skill и не нашёл:

- `main` (`170ec52`) и `analysis/2026-11` на GitHub: в деревьях
  (`gh api repos/azat-io/mootant/git/trees/<ref>?recursive=1`) нет `SKILL.md`
  и каталога `skills/`; файлы со словом skill — только
  `docs/components/Skill.astro` и `docs/components/skill-session.ansi`. Других
  веток, тегов и релизов нет.
- История git (`git log --all -- '*SKILL*' 'skills/*'`): пусто.
- npm: в `mootant-0.1.0-170ec52.tgz` (1434 файла) ничего про skill нет,
  `files` в `package.json` — только `bin` и `dist`. На npm — заглушка 0.0.0.
- Отдельного репозитория со skill для Mootant у автора нет. Из 54 публичных
  репозиториев azat-io skill-ы есть в `azat-io/ghostwriter`
  (`skills/ghostwriter/SKILL.md`, 477 строк, со своим валидатором и
  eval-тестами) и `azat-io/ai-config` (7 общих skill-ов разработки), но ни
  один не про Mootant. `ghostwriter` — готовый образец раскладки, которой
  автор уже пользуется, вместе с инструкцией в readme (`npx skills add
  azat-io/ghostwriter --skill ghostwriter`).

Кроме того, в шапке сайта ссылка «Agent skill» ведёт на `/agent-skill`
(`docs/components/Header.astro:15`), но такой страницы нет: маршруты — только
`docs/pages/index.astro`, `404.astro`, `mutators/…`, `guide/[slug]` (5 страниц
из `docs/content/guide`), редиректов в `docs/public/_redirects` нет
(BUG-650).

### Что должно лежать в репозитории

CLI `skills` (vercel-labs/skills 1.7.6) клонирует репозиторий и ищет
`SKILL.md` (`src/skills.ts:204-370`): в корне, в `skills/` до трёх уровней
вложенности, в `skills/.curated|.experimental|.system`, в каталогах агентов
(`.agents/skills`, `.claude/skills`, …), в путях из `skills.sh.json` и
`.claude-plugin/*.json`, а если ничего не нашлось — рекурсивно до глубины 5
(`src/skills.ts:339`). Файл принимается, если во frontmatter есть строковые
непустые `name` и `description` (`src/skills.ts:80-140`). По формату Agent
Skills `name` — до 64 символов, строчные буквы, цифры и дефисы, совпадает с
именем каталога; `description` — до 1024 символов: что делает skill и когда
его брать; необязательные `license`, `compatibility`, `metadata`,
`allowed-tools`; тело короче 500 строк, подробности — в файлах рядом.

Достаточно `skills/mootant/SKILL.md`, как в `azat-io/ghostwriter`.
Проверено: репозиторий с одним этим файлом (= `analysis/ux/SKILL.draft.md`)
находится командой `npx skills add <repo> --list` («Found 1 skill …
mootant») и ставится `npx skills add <repo> -y` в
`./.agents/skills/mootant/SKILL.md` с симлинком `.claude/skills/mootant` и
записью в `skills-lock.json`.

Рекомендуемая раскладка:

```text
skills/mootant/
  SKILL.md                 # рабочий цикл, ~130 строк, 1,7 тыс. токенов
  references/
    json-report.md         # поля --json (сейчас cli.mdx:114-141 и types/report/slim-run-report.d.ts)
    mutators/<id>.md       # разделы «Kill a surviving mutant» из docs/content/mutators/*.md
```

Разделы «Kill a surviving mutant» есть у всех 20 мутаторов и занимают
218–360 токенов каждый (o200k), 6,1 тыс. на все 20: агенту хватит прочитать
один файл на мутатор. Их стоит генерировать из `docs/content/mutators/*.md`
при сборке, чтобы не вести два текста, и проверять в CI так же, как
`ghostwriter` проверяет свой skill (`scripts/lib/skill-validation.js`:
frontmatter, имя = каталог, меньше 500 строк, ссылки).

### Задуманный рабочий цикл

Цикл из `docs/components/skill-session.ansi` и getting-started.mdx:136-145:
агент запускает `mootant run src --json`, читает мутант (`file`, `line`,
`after`, `testFiles`, `recheck`), дописывает тест в
`test/discount.test.ts`, запускает `mootant run src --mutant q31p780qv6yk` и
видит `killed 1`. Для одного простого мутанта он понятен, и данных хватает:
дифф, тестовый файл с числом покрывающих тестов, один покрывающий тест с
именем и строкой, готовая команда перепроверки, стабильный id. На
`first-run` этот цикл поднял score с 35 % до 50 % за один проход (6.1, шаг 6).

Чего агенту не хватает, в порядке важности:

1. **Самого skill.** Без него агент не знает про `--json`, `--mutant`,
   эквивалентные мутанты и правила (не трогать исходники, не ослаблять тесты).
2. **Работающей команды.** `recheck` = `mootant run src --mutant …` без
   `npx` → `command not found` в Bash-инструменте агента (BUG-652). В
   `skill-session.ansi` агент запускает именно так.
3. **Правила для эквивалентных мутантов.** Ни документация, ни отчёт не
   помогают решить «писать тест или игнорировать», а игнор выключает и
   соседей (U-04). Нужен игнор одного мутанта и раздел про эквивалентность в
   skill.
4. **Подсказки, как убить.** Ссылки на «Kill a surviving mutant» нет ни в JSON,
   ни в HTML, агент её не найдёт. Хватит поля `docs` или `references/` в
   skill.
5. **Файла для нового теста**, когда у модуля нет тестов (U-05), и **команды
   запуска покрывающего теста** (`npx vitest run test/price.test.ts -t "…"` или
   `node --test …`): сейчас агент собирает её сам и для `node:test` легко
   ошибается.
6. **Быстрой перепроверки.** 4 с на мутант в маленьком проекте, но на
   больших — старт раннера и dry run покрывающих файлов на каждую
   перепроверку (на самом Mootant полный dry run `core/text` — 4,5 минуты).
   Пачка `--mutant a --mutant b …` помогает, тёплый процесс помог бы сильнее
   (6.5).
7. **JSON при ошибке.** Устаревший id даёт `Unknown mutant id`, падение
   тестов — текст в stderr; агенту приходится разбирать оба потока.
8. **Предупреждений о ловушках в тестах.** Пример с `rejects.toThrow('down')`,
   который проходит при `throw undefined`, показывает частый у агентов
   результат «тест написан, но ничего не проверяет». В skill это одна строка:
   проверять тип и сообщение ошибки (`toThrow(Error)`,
   `toMatchObject({ message })`).

### Черновик skill

`analysis/ux/SKILL.draft.md` (129 строк, 1,7 тыс. токенов o200k): frontmatter
по формату Agent Skills, подготовка (версия, зелёные тесты, маленькая
область, `.gitignore`), поиск мутантов через `--json` с разбором кодов выхода,
решение «тест / эквивалентный / no coverage / error» с предупреждением о
гранулярности игнора, таблица «мутатор → какой тест убивает», правила
написания теста (включая ловушку `toThrow('text')`), подтверждение через
`recheck` с `npx`, отчёт пользователю. Опирается только на существующие
флаги: `run`, `--json`, `--verbose`, `--mutant` (повторяемый), `--since`.
После исправления BUG-652 из шага 4 уйдёт оговорка про `npx`; после R9 —
оговорка про гранулярность игнора.

## 6.4. `--json` как интерфейс для агентов

### Размер в токенах

Токены посчитаны `js-tiktoken` 1.0.21 словарями `o200k_base` и `cl100k_base`.
Это **приближение**: у Claude свой токенизатор, абсолютные числа будут другими,
но соотношения форматов на таком тексте (код, пути, JSON) сохраняются.
Скрипты — `analysis/ux/tokens/*.mjs`, результаты —
`analysis/ux/tokens/*-measure.json`, образцы — `analysis/ux/tokens/sample-*`.

**Прогон `run` на `first-run`** (79 мутантов, 50 к действию: 38 survived,
12 no coverage):

| Формат | Символов | o200k | cl100k | к `--json` |
| --- | ---: | ---: | ---: | ---: |
| `--json` (по умолчанию, только к действию) | 21 015 | 6 816 | 6 617 | 100 % |
| `--json --all` | 25 170 | 8 166 | 7 983 | 120 % |
| `--json --verbose` (только к действию) | 44 491 | 13 798 | 13 565 | 202 % |
| `--json --verbose --all` | 67 673 | 20 883 | 20 606 | 306 % |
| TOON от `--json` | 23 008 | 8 154 | 8 050 | 120 % |
| TOON от `--json --verbose --all` | 73 888 | 24 682 | 24 499 | 362 % |
| TOON, табличная форма после «сплющивания» мутантов | 6 488 | 2 584 | 2 499 | 38 % |
| текстовый отчёт (не TTY) | 8 218 | 2 815 | 2 772 | 41 % |
| компактный v1 (строки диффа) | 11 484 | 3 910 | 3 854 | 57 % |
| **компактный v2 (`--format agent`, ниже)** | 7 965 | **2 731** | 2 702 | **40 %** |

**`list` по `core` самого Mootant** (16 279 мутантов в 410 файлах; из
`/home/user/artifacts/list-core-skipped-170ec52.json` и `list core --json
--verbose` на копии исходников `170ec52`, id совпали):

| Формат | Символов | o200k | к `list --json` |
| --- | ---: | ---: | ---: |
| текстовый `list core` | 1 650 741 | 456 691 | 33 % |
| `list --json` | 5 006 311 | 1 401 715 | 100 % |
| то же с отступами (как выдаёт `jq .`) | 7 083 566 | 2 056 754 | 147 % |
| `list --json --verbose` | 8 864 493 | 2 541 737 | 181 % |
| `list --json --skipped` | 14 499 077 | 4 115 204 | 294 % |
| TOON от `list --json` | 5 287 655 | 1 670 383 | 119 % |
| TOON, разделитель — табуляция | 5 320 214 | 1 732 523 | 124 % |
| TOON, табличная форма после «сплющивания» | 2 295 784 | 804 765 | 57 % |
| компактный v1 | 3 018 228 | 928 133 | 66 % |
| **компактный v2** (точные тексты из `--verbose`) | 1 564 682 | **533 630** | **38 %** |

Выводы:

- В среднем `--json` стоит **136 токенов на мутант к действию** (`run`) и **86
  на мутант** (`list`). Отчёт `run` по проекту с тысячей выживших — больше
  100 тыс. токенов, `list` по `core` (1,4 млн) не помещается ни в один
  контекст. Агенту нужен не только короткий формат, но и дробление по
  файлам; его даёт путь к файлу в аргументах, и skill должен об этом сказать.
- **TOON на данных Mootant длиннее минифицированного JSON** на 19–20 %. Его
  выигрыш — таблицы однородных объектов, а мутанты неоднородны
  (необязательные `scope`, `focus`, `test`, `testFiles`, вложенные массивы
  `before`/`after`), поэтому TOON пишет каждое поле с ключом и отступом.
  Только после ручного «сплющивания» в однородные строки он выигрывает 43 %
  у JSON — и всё равно уступает построчному формату, который группирует
  мутанты по файлу и строке: на 5 % у `run` и на 51 % у `list` (с 805 тыс. до
  534 тыс. токенов). Переходить на TOON смысла нет.
- Текстовый отчёт уже почти так же компактен, как v2, но в нём короткие id (4
  символа, со временем могут стать неоднозначными), нет имени и строки
  покрывающего теста и есть выравнивание пробелами.

### Структура: что лишнее

Слим-отчёт (`cli/report/slim-run-report.ts:27-106`) уже хорошо обрезан: нет
смещений, null-полей, описаний мутаторов, списков всех покрывающих тестов.
Лишнего мало:

- `recheck` повторяет одинаковый префикс у каждого мутанта
  (`mootant run src --mutant <id>`, ~12 токенов): хватит шаблона в корне.
- `before` повторяется у каждого мутанта одной строки: в `core` в среднем 2,3
  мутанта на строку с мутантами.
- В `summary` — `duration`, `totalWarnings`, `totalTests`, `totalFiles`;
  мелочь, ~40 токенов на отчёт.

### Структура: чего не хватает

| Чего нет | Зачем агенту | Как добавить |
| --- | --- | --- |
| JSON при ошибке (cli.mdx:125-126; `--mutant zzzz --json` → пустой stdout, `Error: Unknown mutant id "zzzz".`, exit 1 — `analysis/ux/first-run/09-json-edge-cases.txt`) | различить «порог не пройден», «тесты падают без мутантов», «неизвестный id» без разбора stderr | `{"error": {"code": "baseline-failed", "message": …, "tests": [...]}}` в stdout при `--json`, разные коды выхода |
| работающая команда | `recheck` без `npx` не запускается (BUG-652) | префикс по менеджеру пакетов или массив `recheckArgs` |
| файл для нового теста | у `src/format.ts` нет `testFiles` | `newTestFile: "test/format.test.ts"` по шаблону имён существующих тестов |
| команда покрывающего теста | быстрый прогон своего теста до перепроверки | `testCommand` от адаптера: `vitest run <file> -t <name>` / `node --test --test-name-pattern …` |
| строка покрывающего теста у `node:test` | у Vitest `test.line` есть, у `node:test` поля нет (проверено на `/home/user/projects/ux/node-test-run`) | строка из `node:test` reporter (`test:pass`/`test:fail` несут `line`) |
| как убить | раздел «Kill a surviving mutant» | `docs: "https://mootant.org/mutators/<id>#kill-a-surviving-mutant"` или `references/` в skill |
| `original`/`replacement` в слим-отчёте | точное изменение без сравнения строк, когда на строке несколько одинаковых подстрок | вернуть два коротких поля (есть в `--verbose`) |
| почему выжил | все покрывающие тесты прошли — но какие значения видел код | значения в точке мутации у покрывающих тестов (`observed: total = [150, 50]`) — идея, L |
| типы отчёта в пакете | `import type { SlimRunReport } from 'mootant'` невозможен: `.d.ts` лежат в `dist/types/report`, но `exports` их не открывает, `core/index.ts` не реэкспортирует | реэкспорт типов и JSON Schema рядом со `schemaVersion` |

**Стабильность id** хорошая: id — SHA-256 от пути, области, мутатора, исходного
и заменяющего текста и порядкового номера среди одинаковых
(`core/identity/create-mutant-id.ts:51-73`), без строк и столбцов. Правка
теста или другой функции id не меняет; меняет переименование файла или
функции, правка самого выражения и появление такого же мутанта выше в той же
области. Агенту, который правит только тесты, этого достаточно. Короткий id
текстового отчёта — кратчайший уникальный префикс (`--mutant` принимает от 4
символов, `core/identity/resolve-mutant-ids.ts`), поэтому агенту надо брать
полный id из JSON.

### Предлагаемый компактный формат: `--format agent`

Построчный формат для LLM; `--json` остаётся для скриптов. Образцы —
`analysis/ux/tokens/sample-compact-v2-first-run.txt` и
`sample-compact-v2-list-core.txt`, генератор — `analysis/ux/tokens/formats.mjs`
(`compactRun2`, `compactList2`).

```text
mootant run · vitest 5.1.0 · recommended · mode isolated · score 36.71% (covered 43.28%) · killed 29 timeout 0 survived 38 nocov 12 errors 0 · passed true
recheck: npx mootant run src --mutant <id>
legend: id :col mutator status [tests=N]  original → replacement; extend = test files to add a test to; near = covering test to start from
warning: src/format.ts No test loaded src/format.ts through the test runner's transform: …

src/price.ts
10|  if (total >= 100) {
  x223xjw7z7bp :7 comparison-operator survived tests=4  total >= 100 → total >= 99
    extend: test/price.test.ts
    near: test/price.test.ts:6 "getDiscount > gives large orders 10% off"
25|  if (percent <= 0) {
  8yjn206d0brh :7 comparison-operator survived tests=1  percent <= 0 → percent < 0
    near: test/price.test.ts:34 "applyDiscount > applies a percent"
```

Правила:

1. Шапка — одна строка: команда, раннер, пресет, режим, счётчики, `passed`.
   Затем `recheck:` — шаблон команды один раз (с префиксом менеджера
   пакетов), затем диагностики, по строке на каждую.
2. Пустая строка и путь файла относительно корня.
3. `<строка>|<исходная строка>` — один раз на строку кода с мутантами; длинная
   строка обрезана вокруг изменения с `…`, как сейчас в `before`.
4. Мутант: `<полный id> :<столбец> <мутатор> <статус> [tests=N]
   <original> → <replacement>`; пустой текст — `∅`, перевод строки — `⏎`;
   длинный текст обрезается посередине.
5. С отступом: `extend:` (тестовые файлы, если отличаются от предыдущего
   мутанта), `near:` (покрывающий тест), `! <сообщение>` для `Error`.
6. С `--all` убитые — одной строкой: `<id> <строка>:<столбец> <мутатор>
   killed by <файл>`.
7. Порядок — как в JSON (файл, каноничный порядок мутантов), чтобы диффы между
   прогонами были читаемыми.

Экономия: −60 % токенов к `--json` на `run`, −62 % на `list`; одна строка на
мутант удобна для `grep`, `head` и чтения по частям. Риски: второй формат
надо держать в синхроне с JSON (генерировать из той же слим-модели) и
закрепить тестами-снапшотами; полей меньше, чем в JSON, поэтому скрипты
должны и дальше читать `--json`.

## 6.5. MCP-сервер

**Вывод: сейчас не делать; вернуться после 1.0, когда устоится формат отчёта,
и делать тонкой обёрткой над теми же функциями, что и CLI.**

Что MCP дал бы сверх CLI + skill:

| Возможность | CLI + skill сегодня | Что добавит MCP | Можно ли без MCP |
| --- | --- | --- | --- |
| Типизированный вызов | агент собирает строку команды, читает stdout, stderr и код выхода | схема входа, ошибка как `isError` с текстом | да: JSON-ошибка при `--json` и разные коды выхода |
| Тёплое состояние между перепроверками | каждая `--mutant` — новый старт раннера и dry run (4 с здесь, минуты на больших проектах) | долгоживущий процесс держит Vite и Vitest, перезапускает только изменённый тестовый файл | да: `mootant run --watch` или демон — это свойство процесса, а не протокола |
| Длинные прогоны | Bash-инструмент агента ограничен таймаутом (здесь 2–10 мин) | уведомления о прогрессе, пара `start_run` / `get_run` | частично: фоновый запуск и `--json` в файл |
| Справка по мутатору | агент должен найти страницу | ресурс `mootant://mutators/<id>` | да: `references/` в skill |
| Агенты без shell | не работает | работает | нет, но такой агент не запустит и тесты |

Инструменты, если делать: `list_mutants(paths, since?, file?)`,
`run_mutants(paths, since?, ids?)` → компактный отчёт из 6.4, `recheck(ids)`,
`explain_mutant(id)` → дифф, покрывающие тесты, файл для теста, раздел «Kill a
surviving mutant» и убитые мутанты той же строки как образец; ресурс с
последним отчётом.

Цена: новая точка входа и протокол, спецификация которого за 2024–2026 годы
сменила несколько ревизий; `@modelcontextprotocol/sdk` тянет десятки
зависимостей против трёх у Mootant (`@eslint-community/regexpp`, `lilconfig`,
`oxc-parser`) — или свой JSON-RPC поверх stdio; проверка в нескольких
клиентах (Claude Code, Codex, Cursor, VS Code); своя модель безопасности
(клиент разрешает вызов инструмента, инструмент запускает пользовательские
тесты). Для одного мейнтейнера это L на первую версию и постоянная стоимость
дальше.

Главный реальный выигрыш MCP — тёплый процесс для быстрых перепроверок — не
требует MCP. Его стоит сделать в CLI (`--watch` или переиспользование dry run
между перепроверками), и тогда MCP-обёртка над ним станет M.

## 6.6. Документация

Что хорошо: getting-started короткий и проводит по циклу «запуск → выживший →
тест → перепроверка»; у каждого мутатора есть «Kill a surviving mutant»;
`mutators.md` честно объясняет категории пропусков и пределы эвристик;
CLI-справочник полон. Сверка примеров «Kill a surviving mutant» с реальными
мутантами сделана в разделе 2 (`bugs/cli-env.md`: 21 из 21 совпали).

Чего не хватает и что неочевидно — правки по приоритету:

| # | Правка | Почему | Приоритет | Трудоёмкость |
| --- | --- | --- | --- | --- |
| D1 | До публикации 0.1.0 — плашка «ещё не на npm» и установка из исходников в readme и getting-started; после публикации — убрать | U-01: документированная установка не работает | critical | S |
| D2 | Страница `/agent-skill` (установка, что делает, пример сессии, ограничения) или убрать пункт меню; в getting-started — `--skill mootant` и как проверить установку | BUG-650, BUG-651 | high | S (после появления skill) |
| D3 | Страница «CI»: готовый workflow (`fetch-depth: 0` или `2` + `HEAD^1`), кэш с ключом по ОС, Node и lockfile, аннотации и сводка, комментарий в PR и ограничение форков, артефакт HTML, `timeout-minutes`; честно: пока кэш сбрасывается после `npm ci` | 6.2: каждая из этих деталей ломает первый CI | high | S |
| D4 | FAQ: `--fast` (когда брать: локальная разведка; почему не для порога в CI; его убийства кэшируются отдельно, и обычный прогон их не берёт — `core/cache/apply-cached-batch.ts:10-29`, `apply-cached-units.ts:5-18`); кэш (где лежит, что его сбрасывает: версия Mootant, переустановка пакета, мажор Node, lockfile, конфиг; чем `--no-cache` отличается от удаления каталога; когда `--incremental` устаревает); «сколько это займёт» | на эти вопросы сейчас отвечает только код; на `first-run` `--fast` — 20,3 с против 38,6 с без него, отчёт предупреждает «39 kills and timeouts come from batch tries and may be false», но когда это допустимо, документация не говорит (`analysis/ux/first-run/10-fast.stdout.txt`) | medium | S |
| D5 | Эквивалентные мутанты: как распознать, что делать, гранулярность игнора (комментарий выключает весь мутатор на строке) | U-04, шаг 6 | medium | S |
| D6 | Указатель правил пропуска: все правила (`O1…O19`, `R2…R6`, `solitary`, `comparison-region`, `log-message`, …) с категорией, флагом `heuristic`, примером и ссылкой на страницу мутатора; как вернуть (`coarseMutants`, `timeouts`, опции) | `--skipped` печатает правило кодом, а описание есть только в таблицах страниц мутаторов; на самом Mootant 5476 из 16 195 пропусков — эвристика `solitary` | medium | M |
| D7 | Миграция со Stryker: таблица `mutate` → пути и `run.paths`, `thresholds.break` → `threshold`, `coverageAnalysis: perTest` → по умолчанию, `incremental` → кэш и `--incremental`, `// Stryker disable next-line X: reason` → `// mootant-ignore-next-line x: reason` с соответствием имён мутаторов (таблица из раздела 3), репортёры → `--html`/`--json`; чего нет (дашборд, проверка типов, раннеры кроме Vitest 5 и `node:test`) | пользователи придут со Stryker | medium | M |
| D8 | Troubleshooting: «Tests fail without mutants», `never-served`, `unknown git revision` в CI, `command not found` у подсказки, кэш не переиспользуется в CI, неподдерживаемые пулы и режимы Vitest, загрузчики `node:test` | сейчас эти сообщения ведут в никуда | medium | S |
| D9 | «Как писать тест на выжившего»: обе стороны границы, точные значения вместо `toBeTruthy`, тип ошибки вместо одного сообщения (`rejects.toThrow('x')` проходит при `throw undefined`) | шаги 5–6 | low | S |
| D10 | Мелкие расхождения: `hero-output.ansi` — `vitest 5.0.4`, `recheck-output.ansi` — `vitest 5.0.5`; JSDoc `get-cache-path.ts:11` — `run-v2.json`, а файл `run-v3.json` | косметика | low | S |

## 6.7. Рекомендации

Шкала: S — до часа, M — до дня, L — несколько дней, XL — больше недели.

| # | Рекомендация | Решает | Приоритет | Трудоёмкость |
| --- | --- | --- | --- | --- |
| R1 | Опубликовать 0.1.0 на npm; до этого — D1 | U-01, BUG-653 | critical | S (+ релизный процесс) |
| R2 | Положить `skills/mootant/SKILL.md` (черновик готов) и `references/` из документации мутаторов; проверка skill в CI; страница `/agent-skill` | U-02, BUG-650, BUG-651 | high | M |
| R3 | Штамп сборки — хэш содержимого или идентификатор, вшитый при сборке, а не `mtime` (BUG-407) | кэш в CI | high | S |
| R4 | `recheck` и подсказки с префиксом менеджера пакетов (`npx`, `pnpm exec`, `yarn`, `bunx`) | BUG-652 | medium | S |
| R5 | При `--json` — JSON и при ошибке; коды выхода: 1 — ошибка, 2 — порог не пройден (или по образцу cargo-mutants) | агенты и CI | medium | S |
| R6 | `--format github` (аннотации + `$GITHUB_STEP_SUMMARY`) и `--sarif <file>`; основа — `analysis/ux/mootant-github.mjs` | 6.2 | medium | M |
| R7 | `run.json` / `--json-file <path>`: JSON в файл рядом с текстом | двойной прогон в CI | medium | S |
| R8 | `--format agent` (6.4) | токены агента −60 % | medium | M |
| R9 | Игнор одного мутанта: `mootant-ignore-next-line <id>` или мутатор с заменой | U-04 | medium | M |
| R10 | Сохранять кэш по ходу прогона (BUG-418) | прерывания и `timeout-minutes` | medium | M |
| R11 | Быстрая перепроверка: `--watch` или переиспользование dry run покрывающих файлов, пока они не менялись | цикл агента на больших проектах | medium | L |
| R12 | `newTestFile` для модулей без тестов, `testCommand`, ссылка на «Kill a surviving mutant» в JSON и HTML | цикл агента | low | S |
| R13 | `.mootant/.gitignore` с `*` | U-06 | low | S |
| R14 | Экспорт типов отчёта из `mootant` и JSON Schema | интеграции | low | S |
| R15 | `--shard k/n` | большие проекты в CI | low | M |
| R16 | Экспорт в схему mutation-testing-elements (бейдж и Stryker Dashboard) | хостинг отчётов | low | M |
| R17 | MCP-сервер — после R11 и 1.0 | 6.5 | nice | M после R11, иначе L |

### R1. Опубликовать 0.1.0

- **Проблема.** Документированная установка не работает ни у человека, ни у
  агента.
- **Чем подтверждено.** `npm view mootant`; `npm install -D mootant && npx
  mootant run src` → `could not determine executable to run` (6.1, шаг 1);
  раздел 7 (`07-compat-and-release.md`, п. 1).
- **Польза.** Без неё остальное в этом разделе недоступно пользователю.
- **Риски.** Опубликованная 0.1.0 закрепит формат конфига и JSON
  (`schemaVersion: 3`) в ожиданиях пользователей; плашка «early development»
  уже есть.
- **Как проверить.** В пустом каталоге: `npm init -y && npm i -D vitest@5
  mootant && npx mootant --version` печатает `mootant/0.1.0`.

### R2. Skill в репозитории

- **Проблема.** Обещанный skill не устанавливается; пункт меню ведёт на 404.
- **Чем подтверждено.** `npx skills add azat-io/mootant` → «No skills found»
  (`analysis/ux/skills-add-output.txt`); `docs/components/Header.astro:15`.
- **Польза.** Главное отличие проекта начинает работать; агент получает
  правила (не трогать исходники, эквивалентные мутанты, `npx`) и экономит
  контекст за счёт `references/` по мутаторам.
- **Риски.** Skill надо держать в синхроне с CLI: флаги, поля JSON и тексты
  мутаторов. Снимается генерацией `references/` из документации и проверкой
  в CI (frontmatter, ссылки, `npx skills add . --list`).
- **Как проверить.** `npx skills add azat-io/mootant --list` показывает
  `mootant`; агент на `docs/demo` по фразе «fix the surviving mutants in src»
  убивает `q31p` и подтверждает это через `--mutant`.

### R3. Штамп сборки без mtime

- **Проблема.** Кэш вердиктов не переживает `npm ci`, поэтому в CI его нет
  совсем.
- **Чем подтверждено.** `analysis/ux/ci-cache-check.txt`: 0 из 67 после `npm
  ci` с восстановленным кэшем, 67 из 67 после `touch -d` на файлах пакета;
  код — `core/cache/prepare-run-cache.ts:164`; BUG-407.
- **Польза.** Полный прогон `main` и PR с общими тестовыми файлами берут
  вердикты из кэша, как обещает readme.
- **Риски.** Штамп нужен, чтобы пересборка неопубликованной версии не брала
  старые вердикты. Хэш собранного кода или идентификатор, вшитый в сборку
  через `define`, сохраняет это свойство; читать все файлы `dist` на каждом
  прогоне — лишние миллисекунды, поэтому лучше вшивать идентификатор.
- **Как проверить.** Сценарий из `ci-cache-check.txt` без `touch`: после
  второго `npm ci` — «Reused cached verdicts for 67 of 79 mutants».

### R5. JSON и коды выхода при ошибке

- **Проблема.** При `--json` ошибка печатается текстом в stderr, stdout пуст;
  exit 1 у всех неудач.
- **Чем подтверждено.** cli.mdx:125-126; `cli/run-mutation.ts:79-89`; прогон PR
  с упавшим тестом (6.2) и конвертер, падающий на пустом файле.
- **Польза.** Агент и скрипт CI различают «порог не пройден», «тесты падают
  без мутантов», «неизвестный id», «ошибка git» без разбора текста.
- **Риски.** Смена кодов выхода ломает тех, кто проверяет `$? -eq 1`; до 1.0
  это допустимо, но должно попасть в changelog.
- **Как проверить.** `mootant run src --mutant zzzz --json` печатает
  `{"error":{"code":"unknown-mutant",…}}` и выходит с кодом, отличным от
  порогового; тест в `test/cli`.

### R8. `--format agent`

- **Проблема.** 136 токенов на мутант к действию; отчёт большого проекта не
  помещается в контекст; TOON не помогает.
- **Чем подтверждено.** Таблицы 6.4.
- **Польза.** −60 % токенов, построчное чтение, один шаблон команды.
- **Риски.** Второй формат вывода; держать его в той же слим-модели и под
  снапшот-тестами.
- **Как проверить.** Снапшот на `docs/demo`; размер на `first-run` ≤ 45 % от
  `--json`; агент из R2 проходит цикл, читая только этот формат.

### R9. Игнор одного мутанта

- **Проблема.** Игнор эквивалентного мутанта выключает убиваемых соседей.
- **Чем подтверждено.** 6.1, шаг 6: `8yjn`, `qra1`, `m37n` — все `Ignored`.
- **Польза.** Агент и человек могут честно пометить эквивалентный мутант, не
  теряя остальные; score не завышается за счёт скрытых мутантов.
- **Риски.** Игнор по id ломается при правке выражения (id меняется) — это
  скорее плюс: устаревший игнор всплывёт. Нужна диагностика «игнор не нашёл
  мутанта».
- **Как проверить.** `// mootant-ignore-next-line 8yjn: …` → `8yjn` Ignored,
  `qra1` и `m37n` остаются в прогоне.

### R11. Быстрая перепроверка

- **Проблема.** Каждая перепроверка — старт раннера и dry run покрывающих
  файлов: 4 с на крошечном проекте, минуты на больших.
- **Чем подтверждено.** `05-recheck-tty.txt` (старт 1,2 с + dry run 0,7 с из
  2,3 с); dry run `core/text` — 4 мин 37 с.
- **Польза.** Цикл агента «тест → перепроверка» становится интерактивным;
  отсюда же дешёвый MCP.
- **Риски.** Изоляция: долгоживущий процесс должен сбрасывать граф модулей и
  глобальное состояние так же, как сейчас между мутантами; нужна проверка
  эквивалентности вердиктов с холодным прогоном (раздел 4).
- **Как проверить.** Вторая перепроверка без изменений в тестовом файле идёт
  без dry run и даёт те же вердикты, что холодный прогон на наборе фикстур.

## 6.8. Что не проверено и отрицательные результаты

- Workflow не запускался на GitHub: проверены синтаксис (`actionlint`), шаги
  Mootant и конвертера локально, флаги `gh`. Лимиты аннотаций взяты из
  документации actions/toolkit, не измерены.
- Сайт mootant.org недоступен из этой сессии (хост вне разрешённых),
  поэтому навигация проверена только по исходникам `docs/`.
- Токенизатор Claude не использован: числа — o200k/cl100k как приближение.
- Агентный цикл пройден мной вручную по черновику skill, а не отдельным
  агентом с установленным skill; эвалов (как в `ghostwriter`) нет.
- Гипотеза «TOON сократит отчёт» опровергнута: +19–20 % к JSON на
  неоднородных мутантах.
- Подозрение на ложный пропуск `||` → `??` (nullish-swap) в `user.ts` не
  подтвердилось: замену покрывает оставленный мутант `→ user.name`.
- Выживший `vjfx` сначала выглядел как ложный survived; физическое
  применение мутанта показало, что вердикт верен, а тест слаб (поведение
  `toThrow` в Vitest при `throw undefined`).
