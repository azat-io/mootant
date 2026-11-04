# Кэш вердиктов, `--incremental` и `--since` (раздел 2, BUG-400…BUG-499)

> Исследуемый коммит: `170ec52` (main). Пакет:
> `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`, Vitest 5.0.5, Vite 8.3.5,
> Node 22.23.4 (и 24 из `/opt/node24` для проверки смены версии), git 2.43.0.
> Фикстуры: `/home/user/projects/cache/*`, скрипты:
> `analysis/tools/cache/*.sh`, сырые отчёты: `analysis/data/cache/*.json`.
> Работа в процессе — файл дополняется по ходу.

## Как устроен кэш (кратко, по коду)

Это основа для оценки находок: что именно входит в ключ, а что нет.

1. **Файл.** `<root>/node_modules/.cache/mootant/run-v3.json`
   (`core/cache/get-cache-path.ts:13`, версия формата —
   `core/cache/cache-version.ts:6`). `root` — каталог конфига mootant или cwd
   (`core/config/prepare-run.ts:133`). Чтение стартует до dry run
   (`core/run-mutants.ts:377`), ключи строятся после dry run
   (`core/run-mutants.ts:442-459`), запись — в конце
   (`core/run-mutants.ts:515-530`).
2. **Ключ окружения** (`core/cache/get-environment-key.ts:70-87`): версия
   формата кэша, версия mootant из `package.json`, «штамп сборки» = `mtimeMs`
   файла `dist/core/cache/prepare-run-cache.js`
   (`core/cache/prepare-run-cache.ts:164`), версии инструментатора и рантайма,
   имя/версия адаптера и версия раннера, хэши «файлов окружения», настройки
   раннера от адаптера, лимиты (`timeout`, `hitLimit`), мутаторы с опциями,
   `settings` и пресет, **мажорная** версия Node, `platform`, `arch`. Файлы
   окружения: `CacheInputs.files` адаптера + первый найденный вверх по дереву
   lockfile (`core/cache/find-lockfile.ts:23-38`) + `package.json` корня + в
   корне `.env*`, `tsconfig*.json`, `jsconfig*.json`
   (`core/cache/prepare-run-cache.ts:121-128`).
3. **Ключ тестового файла** (`core/cache/get-test-file-keys.ts:41-66`): ключ
   окружения, переносимый путь теста, проект, хэши самого теста и **всех его
   зависимостей из текущего dry run**, хэши значений переменных окружения,
   прочитанных тестом по имени (`*` — если тест перечислял все).
4. **Ключ записи** (`core/cache/create-run-cache.ts:216-234`): слот =
   digest(id мутанта, путь теста, проект, `isolated`/`batch`, id теста); ключ =
   digest(слот, хэш текста мутируемого файла, `static`, ключ тестового файла).
   Инкрементальный ключ = digest(слот, digest региона мутанта, `static`, ключ
   тестового файла **без мутируемых файлов**). Id мутанта не содержит позиций:
   путь, scope, мутатор, исходный текст, замена, номер вхождения
   (`core/identity/create-mutant-id.ts:61-73`).
5. **Проверка при чтении** (`core/cache/create-run-cache.ts:265-297`): ключ
   совпал (или, с `--incremental`, совпал инкрементальный ключ), тест батча ещё
   есть в dry run, «лишние» входы, прочитанные прогоном мутанта сверх dry run
   (файлы и переменные), не изменились.
6. **Что хранится** (`core/cache/create-run-cache.ts:307-366`): только
   `Killed` (кроме `crash`) и `Survived`, и только если прогон сообщил свои
   входы. `Timeout` и `Error` не кэшируются никогда.
7. **Когда кэш не сохраняется**: любая error-диагностика в прогоне — даже
   ошибка разбора в одном несвязанном файле (`core/run-mutants.ts:517-520`,
   `core/cache/save-run-cache.ts:64-69`); файл окружения изменился во время
   прогона — `mtime >= start` и другое содержимое
   (`core/cache/save-run-cache.ts:70-93`).
8. **Когда кэш молча выключен** (`prepareRunCache` возвращает `null`, никакой
   диагностики, `totalCached: null`): у адаптера нет `cacheInputs`; **любой**
   файл окружения имеет `mtime >= start` — без сравнения содержимого
   (`core/cache/prepare-run-cache.ts:138-141`); ни у одного тестового файла нет
   ключа (`core/cache/prepare-run-cache.ts:184-186`), например при
   нестандартном test environment Vitest (`adapters/vitest/runner.ts:1070-1073`).
9. **Зависимости тестового файла (Vitest):** модули, вычисленные воркером,
   `require.cache`, файлы, прочитанные через `node:fs` **внутри root**
   (`adapters/shared/track-inputs.ts:31-37`), snapshot-файлы
   (`adapters/vitest/worker/list-dependencies.ts:32-48`), транзитивное
   замыкание по графу модулей Vite без виртуальных модулей и без
   `node_modules` (`adapters/vitest/collect-dependencies.ts:76-155`,
   `adapters/vitest/get-module-file.ts:17-20`), плюс цепочка `tsconfig.json`
   каждого каталога (`adapters/shared/list-tsconfig-files.ts:17-42`). Файлы
   окружения Vitest: зависимости конфига, `.env*` из `envDir`, `globalSetup` и
   то, что для него вычислил главный процесс, путь кастомного environment
   (`adapters/vitest/get-cache-inputs.ts:128-162`); настройки — фиксированный
   список (`adapters/vitest/get-cache-inputs.ts:76-114`).
10. **Зависимости (node:test):** загруженные модули, `require.cache`, файлы,
    прочитанные через `node:fs` внутри root, `<file>.snapshot`, цепочка
    `package.json`, `tsconfig.json` при tsx
    (`adapters/node-test/collect-node-dependencies.ts:30-74`); в настройках —
    полная версия Node, флаги, `NODE_OPTIONS`
    (`adapters/node-test/get-node-cache-inputs.ts:41-77`).

Ключевое свойство, которое делает кэш в целом надёжным: dry run выполняется
всегда, и список зависимостей каждого теста берётся из **текущего** dry run.
Поэтому новый файл, который тест начал загружать (новый модуль из
`import.meta.glob`, новый `__mocks__`, новый setup-файл), меняет список и ключ.
Устаревание возможно только для входов, которые **никогда** не попадают в
список: виртуальные модули, `node_modules`, чтения вне root, главный процесс,
дочерние процессы и воркеры, настройки Vitest вне списка.

## Таблица находок

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| -- | -------- | ----------- | ------ | ---------- | ----------------- |
| BUG-401 | `--since` теряет изменённые строки файла, если в том же диффе есть изменённая или новая символьная ссылка на него: обе записи `git diff` сводятся к одному real path, и `Map.set` второй записи (строки текста ссылки, обычно `{1}`) затирает первую. Выбираются не те строки, мутанты на реально изменённых строках молча пропускаются. Порядок записей — по пути в диффе, поэтому баг проявляется, только если путь ссылки сортируется после пути цели | low | подтверждён | `core/git/read-changed-lines.ts:83-93` (`files.set` без слияния), `core/git/read-changed-lines.ts:127-134` | `test/repros/BUG-401.test.ts` в `experiment/bug-repros` (2 падающих теста); сценарий `symlinks` в `analysis/tools/cache/s-since.sh` |

## Матрица сценариев

## Отрицательные результаты

## Отсутствующие гарантии

## `--since`: результаты сценариев

Скрипт: `analysis/tools/cache/s-since.sh` (использует `mootant list --since`,
который выбирает мутантов тем же кодом, что `run`: `core/list-mutants.ts` →
`readChangedLines` → `selectChangedMutants`). Логи:
`analysis/data/cache/since-part{1,2,3}.log`, `since-shallow.log`. Исходник
фикстуры — 6 строк вида `export const a = (x: number) => x > 1`, по мутанту
на строку, поэтому выбранные строки читаются напрямую.

| Сценарий | Ожидание | Факт | Итог |
| -------- | -------- | ---- | ---- |
| `git mv` без правок, закоммичено | ничего (строки не менялись) | ничего | ок, по правилу «изменённые строки» |
| `git mv` + правка строки 3 | строка 3 | 3 | ок |
| `mv` без `git add` | как у `git mv` | **весь файл** (новый путь — неотслеживаемый) | несогласованность, см. BUG-405 |
| staged строка 2 + unstaged строка 5 + новый неотслеживаемый файл | 2, 5; новый файл целиком | 2, 5; целиком | ок |
| неотслеживаемый файл в каталоге из `.gitignore` | документация: «untracked files» | не выбран | расхождение с документацией (в коде описано верно), BUG-405 |
| удалена строка 3 из 6 | строки 2 и 3 (вокруг разрыва) | 2, 3 | ок |
| удалена последняя строка | строка 5 | 5 | ок |
| ветка с merge из main, main ушёл вперёд | только изменения ветки (строка 2) | 2 | ок |
| shallow clone `--depth 1`, `--since HEAD~1` | подсказка про shallow | `unknown git revision "HEAD~1"` без подсказки | low, BUG-406 |
| CI: PR-ветка `--depth 1` + `fetch --depth 1 origin main` | ошибка с подсказкой | `no common commit; ... "git fetch --deepen"` | ок |
| то же после `--deepen` | строка 5 | 5 | ок |
| несуществующий ref | понятная ошибка, exit 1 | `unknown git revision`, exit 1; c `--json` stdout пуст | ок (JSON при ошибке — тема CLI) |
| пробел, кириллица, `"`, `\`, TAB, ведущий `-` в имени | строка 4 во всех файлах | 4 во всех | ок |
| файл с NUL (git считает бинарным) | весь файл | весь файл | ок |
| изменены только тесты | ничего (по документации) | ничего | ок по документации (но см. «Отсутствующие гарантии») |
| detached HEAD | изменения после merge base | ок | ок |
| `git worktree` | строка 6 | 6 | ок |
| незавершённый merge (UU), конфликт разрешён в рабочем дереве | строка 3 | 3 | ок |
| изменён файл-цель символьной ссылки | строка 5 цели | 5 | ок |
| ссылка перенаправлена на файл, в котором изменена строка 4 | строка 4 | **строка 1, строка 4 потеряна** | **BUG-401** |
| `diff.noprefix`, `diff.mnemonicPrefix`, `diff.algorithm=patience`, `color.diff=always`, `diff.relative`, `diff.external`, `core.quotePath=true` | строка 2 | 2 при каждой настройке | ок |
| изменения внутри submodule | ? | не выбраны никогда (`--ignore-submodules`), хотя файлы submodule входят в `src` | по коду намеренно; в документации не сказано (BUG-405) |
