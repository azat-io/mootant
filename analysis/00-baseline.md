# 00. Базовая линия

> Исследуемый коммит: `170ec52` (`main`, «docs: move readme reference to guide
> pages»). Все прогоны — в отдельных git worktree от этого коммита
> (`/home/user/wt/base`, `/home/user/wt/dogfood`), не в ветке анализа.

## Машина и окружение

| Параметр | Значение |
| --- | --- |
| CPU | 4 vCPU, Intel Xeon @ 2.10GHz (облачная VM Firecracker) |
| RAM | 15 GiB, без swap |
| ОС | Linux 6.18.44 |
| Node.js | v22.23.4 (в CI проекта — Node 24, `.github/actions/install-tools/action.yml`) |
| pnpm | 12.16.1 (локально поставлен в `/home/user/tools`; системный pnpm 10.28 не читает `configDependencies` из `pnpm-workspace.yaml` — `pnpm --version` внутри репозитория зависает) |
| Пользователь | root |
| `TERM` | `linux` (влияет на тесты, см. ниже) |
| Инструменты замеров | hyperfine 1.18.0, GNU time 1.9 |

Облачная машина шумная, а с ~04:10–04:30 UTC на ней параллельно работали
субагенты анализа. Цифры этого файла сняты до этого момента, если не сказано
иное.

Побочное наблюдение об окружении: `npm i -D vitest@5.0.5` в npm 10.9.9
падает с `Cannot read properties of null (reading 'edgesOut')`. Это ошибка
arborist в `#loadPeerSet` при разборе peer-зависимости
`@vitest/browser-playwright@5.1.0`. `npm i -D vitest@5` (5.1.0) ставится
нормально. Ошибка не в Mootant, но в неё может упереться новый пользователь,
который фиксирует ту же версию Vitest, что в lockfile проекта.

## Установка и сборка

| Шаг | Время | Результат |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 9,4 с (тёплый store) | OK |
| `pnpm run build` | 13,0 с | OK |
| `pnpm exec astro sync` | 3,7 с | OK |

Замечание: `pnpm install` без `--ignore-scripts` запускает `simple-git-hooks`
и ставит хук `commit-msg` (`pnpm exec commitlint -e`) в **общий** `.git/hooks`
всех worktree. В рабочей копии без `node_modules` такой хук ломает любой
коммит. CI ставит зависимости с `--ignore-scripts`
(`.github/actions/install-dependencies/action.yml`), поэтому там проблемы нет.

## `pnpm test` по скриптам

Каждый `test:*` запускался отдельно и последовательно
(`analysis/bench/baseline-tests.sh`), машина в это время была свободна.

| Скрипт | Время, с | Результат |
| --- | ---: | --- |
| `test:astro` | 57,0 | **FAIL**: 14 ошибок `ts(2322)` в `docs/components/*.astro` |
| `test:css` | 2,2 | OK |
| `test:format` | 22,3 | OK |
| `test:js` | 119,4 | OK |
| `test:packages` | 5,1 | OK |
| `test:spelling` | 8,8 | OK |
| `test:types` | 46,6 | OK |
| `test:unit` | 251,8 | **FAIL**: 5 из 10 491 тестов (637 файлов) |
| `test:usage` | 3,2 | OK |
| **Сумма** | **516,4** | |

Для сравнения: прогон `Test` в CI на том же коммите
([run 41621621794](https://github.com/azat-io/mootant/actions/runs/41621621794))
зелёный, все джобы идут параллельно, около 5,5 минут.

### Что падает и почему

1. **4 теста CLI зависят от `TERM` машины** (подтверждено).
   `test/cli/run-list.test.ts` («prints the text report…», «prints diagnostics
   to stderr…») и `test/cli/run-mutation.test.ts` («shows the flags in the
   header…», «prints the diagnostics, then the text report…») ожидают символы
   Unicode (`●`, `→`, `▲`), а `cli/terminal/is-unicode-supported.ts:13` при
   `TERM=linux` выбирает ASCII (`*`, `->`, `!`). С `TERM=xterm-256color` все
   четыре проходят. Тесты не фиксируют окружение, поэтому падают в Docker и на
   Linux-консоли. Серьёзность: low (тестовая гигиена).
2. **`test/adapters/node-test/score-node-test.test.ts:102` («skips test files
   it cannot read») падает под root** (подтверждено частично). Тест делает
   `chmod 000` и ждёт, что файл нельзя прочитать, но root читает любой файл.
   Под непривилегированным пользователем проверить не удалось: у `nobody` нет
   прав на запись в `node_modules/.vite-temp`. Серьёзность: low.
3. **`test:astro`: 14 ошибок типов SVG-компонентов** (`Property 'class' does
   not exist on type 'IntrinsicAttributes'`, `Type 'string' is not assignable to
   type 'SvgComponent'`) в Breadcrumbs, Compatibility, Header, HeaderTools,
   ReportPreview, Search, Why. В CI (Node 24) этот же коммит проходит. Это
   гипотеза: ошибки зависят от окружения (Node 22 и Node 24 или порядок
   генерации типов `astro sync`). Проверка: запустить `pnpm test:astro` под
   Node 24. Серьёзность: low (только сайт документации).
4. Coverage-пороги (100%) в этом прогоне не проверились: при упавших тестах
   Vitest не строит отчёт (`coverage.reportOnFailure` по умолчанию `false`).
   Повторный прогон — в разделе 5.

### Наблюдения по CI проекта

Из 15 последних прогонов workflow `Test` на `main` (№ 69–83) 7 перезапускались
вручную (attempt 2–3: № 70, 71, 73, 75, 76, 79, 80). Причина каждый раз — **cancelled**-джоб на шаге `Checkout` или
`Install Tools` после 7–11 минут ожидания: JS, Packages, Types, Usage, Format
([пример](https://github.com/azat-io/mootant/actions/runs/41513393651)). Это
не нестабильность тестов, а инфраструктура. Гипотеза: `step-security/harden-runner`
с `egress-policy: block` блокирует нужный хост или зависает. Проверить по
логам `Harden Runner` в отменённых джобах.

Видны и прогоны, упавшие при первой попытке на `JS`, `Astro`, `Spelling` и
`Types`, например
[41434087408](https://github.com/azat-io/mootant/actions/runs/41434087408).
Это настоящие ошибки, которые следующий коммит с тем же сообщением исправил.

## Догфудинг: Mootant на самом себе

### `mootant list core`

| Команда | Время (3 прогона) | Пиковая RSS |
| --- | --- | --- |
| `mootant list core` (текст) | 7,70 / 7,15 / 7,49 с | ~245 МБ |
| `mootant list core --json --skipped` | 2,63 с | ~277 МБ |

- **16 279 мутантов в 410 файлах**, 0 ignored, 0 ошибок.
- **16 195 кандидатов пропущено**, из них 5 904 по эвристическим правилам. По
  категориям: subsumed 8 229, owned 6 612, noise 830, timeout 296, equivalent
  226, duplicate 2.
- Топ правил пропуска: `solitary` 5 476, `O3` 3 010, `O1` 2 527, `O4` 1 537,
  `O19` 925, `case-label` 489, `R2` 411, `R6` 362, `R4` 191,
  `comparison-region` 186.
- Мутанты по мутаторам: logical-operator 3 308, string-literal 2 984,
  comparison-operator 2 533, object-property 1 555, condition 1 465,
  number-literal 679, return-value 621, boolean-literal 574, array-element 560,
  statement-removal 523, method-call 399, arithmetic-operator 342,
  optional-chaining 293, regex-pattern 199, missing-await 102,
  unary-operator 68, assignment-operator 64, regex-flag 7, update-operator 3.
- **Странность:** текстовый `list` в ~2,8 раза медленнее JSON-варианта, хотя
  JSON дополнительно собирает пропущенных кандидатов. Около 5 секунд из 7,5
  уходит на форматирование текста на 16 тысяч строк. Разбор в разделе 4.

### `mootant run core/text`

Команда: `node bin/mootant.js run core/text --json --all --verbose` в
`/home/user/wt/dogfood`, параллелизм по умолчанию (Vitest `maxWorkers`).
**Прогон не завершился за 42 минуты.** В 04:27 UTC его остановил внешний
лимит фоновой задачи: я неверно задал таймаут. JSON-отчёт пишется только в
конце, поэтому вердиктов нет. Ход прогона восстановлен по выводу прогресса в
stderr и по рабочему каталогу `/tmp/mootant-4WyyZs`.

| Фаза | Что происходило | Длительность |
| --- | --- | ---: |
| старт → dry run | 03:45:4x → ~03:50:2x | — |
| dry run | **8 393 теста из 10 491**: `core/text` импортируется почти везде | **4 м 37 с** |
| раунд 1 | 544 мутанта, 544 запуска тест-файлов | 57,7 с |
| раунд 2 | 109 выживших, 109 запусков | **13 м 57 с** |
| раунд 3 | 94 выживших, 188 запусков | 2 м 29 с |
| раунд 4 | 81 выживший, 314 запусков | **13 м 49 с** |
| раунд 5 | ≥ 71 запуск, прерван | > 6 мин |

Нагрузка: до ~04:10 машина была почти свободна. Потом субагенты подняли load
average до 4–7. Длительности раундов 3–5 поэтому завышены, раунда 2 — в
меньшей степени.

Что видно уже сейчас (подробный разбор — в разделе 4):

1. **Подтверждение выживших стоит почти всё время прогона.** Первый проход по
   всем 544 мутантам занял минуту, а добивание ~100 выживших — более получаса.
   Выживший должен пройти **все** покрывающие тест-файлы. Раунды растут как 1,
   1, 2, 4, 8 файлов на мутанта (`core/run/run-isolated-rounds.ts:9-28`), и
   каждый раунд — отдельный запуск Vitest.
2. **Хвост из-за последовательных юнитов одного тест-файла.** В раунде 2 у 85
   мутантов единственным оставшимся файлом был
   `test/core/generate/generate-file-mutants.test.ts`. Контракт адаптера
   запрещает запускать один тест-файл дважды одновременно
   (`types/adapter/adapter-session.d.ts`, `runIsolated`). Поэтому 85 юнитов
   шли друг за другом по 10–13 с, около 15 минут на одном ядре, пока
   остальные воркеры простаивали. Таймаут каждого такого юнита — 290 с.
3. **Dry run выбирает почти весь тест-сьют**, если мутируемый модуль —
   общий хелпер. У `core/text` 8 393 теста дают 4,6 минуты ещё до первого
   мутанта.
4. **Тёплый кэш не отменяет dry run** (подтверждено). В
   `core/run-mutants.ts` dry run (`:411`) выполняется всегда, а кэш
   подготавливается (`:444`) и применяется (`:489`) только после него.
   Повторный прогон без изменений стоит не меньше старта и полного dry run.
   Проверка на мини-фикстуре `/home/user/projects/coord/warm` (3 теста, один
   длится 1,5 с; 11 мутантов): холодный прогон 8,4 с (start 0,4, dry run 1,9,
   isolated 6,1), тёплый 2,2 с (start 0,4, **dry run 1,8**, isolated 0,0, «10
   cached»). На `core/text` это означало бы ~5 минут при полном кэше. Замеры
   на реальных проектах — в разделе 4.
5. **Остаток после убийства процесса.** Воркеры Vitest не остались (`ps`
   чистый), а рабочий каталог `/tmp/mootant-4WyyZs` остался на диске.
   `core/run/create-work-directory.ts` удаляет его в `finally` у
   `runMutants`, но при SIGTERM или SIGKILL без обработчика `finally` не
   выполняется. Разбор — в разделе 2.
6. Тест-сьют самого Mootant оставляет в `/tmp` файлы
   `mootant-render-<hash>.txt`. Их пишет фикстура
   `test/fixtures/equivalence/shared/test/render.test.ts:14` и не удаляет.
   За один `test:unit` и один догфудинг накопилось 26 файлов.

Догфудинг `core/regex` и `core/run` перенесён в эксклюзивное окно замеров
раздела 4: на занятой машине его время ничего бы не показало. Результаты —
в разделе 4 и в разделе 5.
