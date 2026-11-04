# Эксперименты раздела 7: совместимость и надёжность

Сырые журналы к `analysis/07-compat-and-release.md`. Дата: 2026-11-04.

## Окружение

- Linux 6.18.44 x86_64, 4 vCPU (Intel Xeon @ 2.10GHz), 15 GiB RAM. Машина общая:
  параллельно шли замеры других агентов, поэтому времена здесь не сравниваются,
  важны только вердикты и коды выхода.
- Пакет: `/home/user/artifacts/mootant-0.1.0-170ec52.tgz` (коммит 170ec52).
- Node: 22.23.4 (по умолчанию, npm 10.9.9), 24.22.1 (`/opt/node24`, npm
  11.19.1), а также скачанные с nodejs.org с проверкой `SHASUMS256.txt`:
  18.20.8, 20.19.0, 22.12.0, 26.13.0.
- Пакетные менеджеры: npm 10.9.9 и 10.8.2 (Node 20), pnpm 12.16.1, yarn 1.22.22,
  yarn 4.10.3 (через corepack, `COREPACK_NPM_REGISTRY`), bun 1.4.4.
- Все фикстуры лежат в `/home/user/projects/release/`. Исходник у всех один:
  `src/discount.js` из README (две функции, 12 мутантов). Тесты — четыре
  эквивалентных теста для Vitest или для `node:test`.

Эталонный результат на npm + Node 22.23.4 + Vitest 5.1.0: `killed 6`,
`survived 5`, `no coverage 1`, score 50% (covered 54.55%).

## M1. Матрица Node и раннеров

| Node    | Vitest 5.1.0 (`vt-npm`)                      | `node:test` (`nt20`)      |
| ------- | -------------------------------------------- | ------------------------- |
| 18.20.8 | не проверял (см. M9)                         | падение со стеком, см. M9 |
| 20.19.0 | работает: тот же вердикт, без предупреждений | работает: 6/5/1           |
| 22.12.0 | работает: 6/5/1                              | работает                  |
| 22.23.4 | работает: 6/5/1                              | работает                  |
| 24.22.1 | работает: 6/5/1                              | работает                  |
| 26.13.0 | работает: 6/5/1                              | работает                  |

На Node 20.19.0 Mootant без возражений запускает Vitest 5.1.0, хотя у Vitest
`engines` `^22.12.0 || ^24.0.0 || >=26.0.0`. Документация говорит, что Node 20
работает только с `node:test`. В коде проверки нет.

Команда (для каждой версии):

```sh
export PATH=/home/user/projects/release/node/node-v20.19.0-linux-x64/bin:$PATH
cd /home/user/projects/release/vt-npm && TMPDIR=$PWD/tmp20 npx mootant run src
cd /home/user/projects/release/nt20 && TMPDIR=$PWD/tmp npx mootant run src
```

## M2. TypeScript-конфиг на Node 20.19.0

- Без jiti:
  `Error: Cannot load mootant.config.ts: TypeScript configuration files need Node.js 22.18 or later, or the jiti package.`,
  exit 1. Так и написано в документации.
- После `npm i -D jiti@2` конфиг загружается. Кэш jiti пишется в
  `$TMPDIR/jiti/nt20-mootant.config.98349b6e.mjs`, то есть по умолчанию в общий
  `/tmp/jiti`, а не в проект.

## M3. Отравление кэша jiti (подтверждено)

1. На Node 20.19.0 с jiti запустил `mootant list src` с
   `TMPDIR=/home/user/projects/release/nt20/tmpj`. jiti создал файл
   `tmpj/jiti/nt20-mootant.config.98349b6e.mjs` с хвостом
   `/* v9-797fb8b049fad55a */`.
2. Заменил тело файла на CommonJS-код, который пишет
   `/home/user/projects/release/nt20/POISONED.txt` и отключает другой мутатор.
   Хвост оставил прежним.
3. Повторный `mootant list src` исполнил подложенный код: `POISONED.txt` =
   `jiti cache body executed`, число мутантов сменилось с 10 на 11. Исходный
   `mootant.config.ts` при этом не менялся.

Первая попытка с ESM-телом (`import …`) дала
`Error: Cannot load mootant.config.ts: Unexpected token '{'`. Значит, и
повреждённая запись кэша jiti ломает загрузку конфига.

## M4. Поиск конфига выше проекта (подтверждено)

```text
/home/user/projects/release/e4/workspace/mootant.config.js   <- пишет EXECUTED.txt
/home/user/projects/release/e4/workspace/child/              <- проект без конфига
/home/user/projects/release/e4/workspace/vt/                 <- копия vt-npm без конфига
```

`HOME=/root`, проект лежит вне домашнего каталога, поэтому lilconfig идёт до
`/`.

- `mootant list src` в `child`: конфиг родителя исполнился (`EXECUTED.txt`:
  `parent config executed, cwd=…/child`). Пути в отчёте стали
  `child/src/discount.js`, то есть корень сместился в родителя. Шапка отчёта не
  говорит, какой конфиг загружен.
- `mootant run src` в `vt`:
  `Error: No supported test runner found in /home/user/projects/release/e4/workspace. Install one (vitest, node-test) or set run.runner in the configuration.`,
  exit 1. Vitest стоит в `vt/node_modules`, но его ищут от смещённого корня.

## M5. BOM в `package.json` (подтверждено)

`package.json` с UTF-8 BOM (`printf '\xef\xbb\xbf{…}'`):

- Node импортирует ESM-модуль пакета (поле `type` читается), `npm pkg get name`
  → `"bom-proj"`.
- `mootant list src` →
  `Error: Cannot load package.json: Unexpected token '﻿', "﻿{"name":""... is not valid JSON`.

Достаточно BOM в любом `package.json` на пути от рабочего каталога до домашнего
(или до `/`).

## M6. Кэш вердиктов: повреждение, версия, подмена

Фикстура `e6` (копия `vt-npm` и два файла с `process.env.API_TOKEN`).

| Сценарий                                   | Результат                                                          |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Файл обрезан до 100 байт                   | Молча проигнорирован и перезаписан валидным JSON, exit 0           |
| `version: 2` внутри `run-v3.json`          | Проигнорирован, «Reused …» нет                                     |
| Тёплый прогон                              | `Reused cached verdicts for 11 of 12 mutants`                      |
| 5 записей `Survived` переписаны в `Killed` | `killed 11, survived 0, score 91.67% (covered 100%)`, тесты не шли |
| То же с `--no-cache`                       | `killed 6, survived 5, score 50%`                                  |
| Два прогона одновременно (`--html`)        | Оба exit 0, кэш — валидный JSON (16 записей), отчёт целый          |

## M7. Секреты в кэше и отчётах (подтверждено)

`API_TOKEN=hunter2-SECRET-VALUE`, тест сравнивает `header(token)` с
`'Bearer ' + token`.

- `node_modules/.cache/mootant/run-v3.json`: поле `message` у убитых мутантов —
  `expected 'hunter2-SECRET-VALUE' to be 'Bearer hunter2-SECRET-VALUE' // Object.is equality`.
- `.mootant/report.html`: та же строка в `texts`.
- `--json` и `--json --verbose`: значения нет (0 вхождений). Вывод в терминал:
  тоже нет.
- Если тест читает переменную только под мутантом (фикстура `src/conf.js`), в
  `inputs` кэша пишется пара `["API_TOKEN", "066df8da…5003892"]`. Это несолёный
  SHA-256 значения: `printf %s "$API_TOKEN" | sha256sum` даёт тот же хэш.

## M8. Прерывание прогона (подтверждено для режима без TTY)

`TMPDIR` указывал на каталог фикстуры, чтобы не смешиваться с другими агентами.

| Адаптер   | Как прервал                                  | Код выхода | Процессы через 5 с | Что осталось в `TMPDIR`                                                                   |
| --------- | -------------------------------------------- | ---------- | ------------------ | ----------------------------------------------------------------------------------------- |
| Vitest    | SIGINT группе процессов (как Ctrl+C)         | 130        | 0                  | `mootant-IMCsmB/` (plan, out, env, beat) и `<id>/ssr/` от Vite                            |
| Vitest    | SIGINT только процессу mootant               | 130        | 0                  | то же                                                                                     |
| node:test | `timeout -s INT 5 node …/mootant.js run src` | 124        | 0                  | `mootant-oKPCeL/` со `switched/0.json` (исходник с мутантами), `plan.json`, `out/0.jsonl` |

Обычный прогон оставляет `TMPDIR` пустым в обоих адаптерах. Режим с TTY
(обработчик спиннера с `process.exit(130)`) сам проверить не смог:
автоматическая проверка прав запретила отправку сигналов группе процессов на
общей машине. Его независимо проверил агент раздела CLI:
`data/cli/sig-vt-hang-INT-group-tty.txt` и `sig-vt-hang-TERM-pid-tty.txt` — exit
130 и 143, живых процессов нет, в `TMPDIR` осталось 2 каталога (`mootant-*` и
каталог Vite), 11 файлов. Это совпадает с выводом по коду.

## M9. Node 18.20.8 (ниже `engines`)

- `mootant list src` →
  `Error: Object.keys.toSorted is not a function or its return value is not iterable`,
  exit 1.
- `mootant run src` → необработанный
  `TypeError: [(...C.keys(...))].filter(...).toSorted is not a function` со
  стеком из `dist/cli/create-run-progress.js:153`.

Понятного сообщения «нужен Node 20.19+» нет.

## M10. Пакетные менеджеры

| Сценарий                                                                | Результат                                                                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 10.9.9, `npm i -D <tgz> vitest@5`                                   | 6/5/1, exit 0                                                                                                                                      |
| pnpm 12.16.1, `pnpm add -D <tgz> vitest@5`                              | 6/5/1; peer связан: `mootant@file…_vitest@5.1.0_vite@8.3.5_`                                                                                       |
| pnpm 12 workspace: mootant в корне (`-w`), vitest только в `packages/a` | 6/5/1. pnpm создал два экземпляра mootant, с peer и без                                                                                            |
| yarn 1.22.22                                                            | Сначала `Cannot find package 'vite'`: yarn 1 не ставит peer vitest. После `yarn add -D vite@8` — 6/5/1                                             |
| yarn 4.10.3, PnP, Vitest                                                | 6/5/1, exit 0                                                                                                                                      |
| yarn 4.10.3, PnP, `node:test`                                           | **0 killed, 0 survived, 12 no coverage**, exit 0, одно предупреждение `config-overridden` про `.pnp.loader.mjs`                                    |
| bun 1.4.4 install + `bunx mootant` (Node по shebang)                    | 6/5/1, exit 0                                                                                                                                      |
| bun 1.4.4, `bunx --bun mootant` (рантайм Bun)                           | Вердикты те же, `summary.passed: true`, но **exit 1** (с кэшем — exit 0)                                                                           |
| npm workspaces (hoisted), запуск из `packages/a` без конфига            | Корень = `packages/a`, кэш в `packages/a/node_modules/.cache`                                                                                      |
| то же с `mootant.config.js` в корне монорепо                            | Корень = корень монорепо, пути `packages/a/…`, кэш в корне                                                                                         |
| `npx --package=<tgz> mootant run src` без локальной установки (Vitest)  | `Error: mootant and the project load different copies of Vitest (none, …/node_modules/vitest); install mootant as a devDependency of the project.` |

## M11. Vitest 4.1.12 при снятой проверке версии

В копии пакета в фикстуре `vt4` в `dist/adapters/vitest/detect-vitest.js`
условие `=== "5"` заменено на `["4","5"].includes(…)`. Результат:
`Error: Cannot read properties of undefined (reading 'logger')` и
`[vitest-pool-runner]: Timeout waiting for worker to respond`, exit 1. Одного
расширения проверки версии мало: интеграция с пулом и раннером Vitest 5
несовместима с Vitest 4.

## M12. Публикация: что увидит npm

`clear-package-json` (clean-publish 7) на `package.json` из 170ec52 удаляет
только `scripts` и `devDependencies`. `npm publish --dry-run --no-git-checks` на
Node 24.22.1 (npm 11.19.1) печатает:

```text
npm warn Unknown cli config "--git-checks". This will stop working in the next major version of npm.
npm warn publish npm auto-corrected some errors in your package.json when publishing.  Please run "npm pkg fix" to address these errors.
npm warn publish errors corrected:
npm warn publish "bin[mootant]" script name bin/mootant.js was invalid and removed
npm warn publish "repository" was changed from a string to an object
npm warn publish "repository.url" was normalized to "git+https://github.com/azat-io/mootant.git"
npm notice package size: 639.6 kB
npm notice unpacked size: 1.8 MB
npm notice total files: 1434
```

Строка про `bin` пугает, но это ложная тревога. В
`@npmcli/package-json/lib/normalize.js` (`normalizePackageBin`) сообщение
печатается, когда путь `./bin/mootant.js` нормализуется в `bin/mootant.js`, и
запись остаётся. Проверка: в манифесте tarball из `npm pack` стоит
`"bin":{"mootant":"bin/mootant.js"}`, а `repository` нормализован в
`git+https://github.com/azat-io/mootant.git`.

## M13. Данные о скачиваниях (npm registry search API, 2026-11-03)

`https://registry.npmjs.org/-/v1/search?text=<pkg>&size=3`, поле
`downloads.weekly`. `api.npmjs.org`, `www.npmjs.com` и `2025.stateofjs.com` из
этой сессии недоступны (403 или DNS), поэтому разбивки по версиям нет.

| Пакет                                 | Версия  | Скачиваний в неделю |
| ------------------------------------- | ------- | ------------------: |
| `vitest`                              | 5.1.0   |         171 070 982 |
| `jest`                                | 30.5.2  |          61 364 548 |
| `mocha`                               | 12.0.3  |          15 502 722 |
| `ava`                                 | 8.3.0   |             624 767 |
| `@rstest/core`                        | 0.12.6  |             232 195 |
| `@vitest/browser`                     | 5.1.0   |          20 379 131 |
| `bun-types`                           | 1.4.4   |          30 526 824 |
| `tsx`                                 | 4.23.15 |         132 274 871 |
| `@stryker-mutator/core`               | 10.1.1  |           5 726 937 |
| `@stryker-mutator/vitest-runner`      | 10.1.1  |           4 131 900 |
| `@stryker-mutator/jest-runner`        | 10.1.1  |             757 881 |
| `@stryker-mutator/tap-runner`         | 10.1.1  |             197 089 |
| `@stryker-mutator/mocha-runner`       | 10.1.1  |              33 792 |
| `@stryker-mutator/karma-runner`       | 10.1.1  |              11 339 |
| `@stryker-mutator/jasmine-runner`     | 10.1.1  |               1 596 |
| `@stryker-mutator/typescript-checker` | 10.1.1  |           1 042 536 |

Даты релизов из `npm view <pkg> time`: Vitest 3.0.0 — 2025-01-16, 4.0.0 —
2025-10-22, 5.0.0 — 2026-09-03. Последние патчи: 4.1.12 — 2026-10-15, 3.2.7 —
2026-07-06. Jest 30.0.0 — 2025-06-10, 30.5.2 — 2026-09-18. `@rstest/core` 0.12.0
— 2026-09-17, версия 1.0 ещё не вышла. `@stryker-mutator/vitest-runner@10.1.1`:
peer `vitest >=2.0.0`, `engines.node

> =22.0.0`.

Команда для разбивки по версиям, когда `api.npmjs.org` будет доступен:

```sh
curl -s https://api.npmjs.org/versions/vitest/last-week \
  | jq '.downloads | to_entries | group_by(.key | split(".")[0])
        | map({major: (.[0].key | split(".")[0]), weekly: (map(.value) | add)})'
```

## M14. Зависший воркер Vitest без совместимого `ps` (подтверждено)

Фикстура `hang` (копия `vt-npm`). У мутанта `flag -> false` условие ложно, и код
доходит до `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)`. Это
блокирует поток воркера навсегда и не грузит CPU:

```js
export function wait(flag) {
  if (flag) {
    return 'done'
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
  return 'never'
}
```

Тест: `expect(wait(true)).toBe('done')`.

| Окружение                                                           | Время   | Код выхода               | Вердикты                                           |
| ------------------------------------------------------------------- | ------- | ------------------------ | -------------------------------------------------- |
| Обычный `ps` (procps)                                               | 6.5 s   | 0                        | killed 1, survived 1, **timeout 1**, no coverage 4 |
| `ps` подменён в `PATH` скриптом, который пишет ошибку и выходит с 1 | > 100 s | 124 (убит `timeout 100`) | вывода нет, после dry run прогон не продвинулся    |

Команды:

```sh
cd /home/user/projects/release/hang
TMPDIR=$PWD/tmp timeout 120 npx mootant run src --no-cache
printf '#!/bin/sh\necho "ps: unsupported option" >&2\nexit 1\n' > nops/ps && chmod +x nops/ps
PATH=$PWD/nops:$PATH TMPDIR=$PWD/tmp timeout 100 npx mootant run src --no-cache
```

Стаб моделирует образы без `procps` (`node:*-slim` на Debian) и BusyBox `ps` в
Alpine, у которого, насколько я знаю, нет `-p`. Что именно отвечает `ps` в этих
образах, не проверял: Docker в сессии нет. После прерывания осиротевших
процессов фикстуры не осталось (`ps -eo … | grep release/hang` пусто).

## M15. Один и тот же `mootant.config.ts` на разных Node (подтверждено)

Фикстура `nt20`, jiti 2 установлен в проект.

| Конфиг                                               | Node 22.23.4 (нативный strip, jiti не используется)                                         | Node 22.12.0 (jiti) |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `enum Mode { Off = 'off' }` …                        | `Error: Cannot load mootant.config.ts: TypeScript enum is not supported in strip-only mode` | загружается         |
| `import { helper } from './helper'` (без расширения) | `Error: … Cannot find module '…/nt20/helper' imported from …/mootant.config.ts`             | загружается         |

Обновление Node с 22.17 на 22.18+ ломает такой конфиг, даже если jiti
установлен: load-typescript-config.ts:16-18 при `process.features.typescript`
сразу идёт в нативный `import()`.
