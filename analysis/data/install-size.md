# Размер установки и число зависимостей: StrykerJS и Mootant

Сырые данные для разделов 3 и 7. Замер выполнен 2026-11-04.

## Окружение

- Linux 6.18.44 x86_64, 4 vCPU (Intel Xeon @ 2.10GHz), 15 GiB RAM, файловая
  система с блоком 4 KiB. Машина общая, сеть идёт через прокси, поэтому время
  установки шумное.
- Node.js v22.23.4, npm 10.9.9.
- Версии из реестра на дату замера: `@stryker-mutator/core` 10.1.1,
  `@stryker-mutator/vitest-runner` 10.1.1,
  `@stryker-mutator/typescript-checker` 10.1.1, `vitest` 5.1.0,
  `typescript` 7.0.2 (npm сам доставляет его как peer последней версии).
- Mootant 0.1.0 из `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`, коммит
  `170ec52`. В реестре сейчас лежит только заглушка `mootant@0.0.0` из двух
  файлов, поэтому ставился локальный tarball.

## Методика

Каждый сценарий ставился в отдельный пустой каталог в
`/home/user/projects/research/` после `npm init -y`. Использовались флаги
`--no-audit --no-fund --loglevel=error`.

- **cold**: 3 прогона, у каждого свой новый пустой `--cache`.
- **warm**: 2 прогона с кэшем, который заполнили холодные прогоны.
- Сценарии «поверх проекта» начинались с копии `package.json`,
  `package-lock.json` и `node_modules` базового проекта (`vitest@5` или
  `vitest@5 typescript`). Время в них учитывает только второй `npm i`.
- Размер измерялся через `du -sh node_modules` (на диске) и
  `du -sh --apparent-size`.
- Пакеты считались тремя способами: записи `node_modules/*` в
  `node_modules/.package-lock.json`, `find … -name package.json` (как в
  задании) и `npm ls --all --parseable | sort -u`. Первый и третий совпали во
  всех сценариях.
- Чистая добавка инструмента считалась скриптом. Он сравнивает
  `.package-lock.json` сценария и базового проекта и суммирует `du -sk` для
  каждого добавленного пути (скрипт `delta.mjs` лежал в scratchpad; его логика
  описана здесь).

Скрипт замера: `install-size.sh` из scratchpad сессии. Его логика описана выше,
а сырой вывод приведён в конце файла.

## Итог

### Чистая добавка к проекту, где уже стоит Vitest 5

Основная цифра для сравнения: пользователь Vitest ставит инструмент в
существующий проект.

| Что добавили                                                        | Пакетов | На диске | Cold install, медиана (min–max) | Warm install, медиана (min–max) |
| ------------------------------------------------------------------- | ------: | -------: | ------------------------------- | ------------------------------- |
| `mootant` (tgz) поверх `vitest@5`                                   |   **5** | **11.8 MB** | 10.6 s (9.3–10.8)            | 5.6 s (5.3–5.9)                 |
| `@stryker-mutator/core` + `vitest-runner` поверх `vitest@5`         |     168 |  61.5 MB | 14.7 s (12.9–15.8)              | 6.4 s (6.2–6.6)                 |
| то же + `typescript-checker` поверх `vitest@5 typescript`           |     169 |  62.0 MB | 15.5 s (14.0–16.8)              | 8.5 s (8.3–8.6)                 |
| `mootant` (tgz) поверх `vitest@5 typescript`                        |       5 |  11.8 MB | 10.9 s (10.1–11.6)              | 6.2 s (5.9–6.5)                 |

Из этих цифр вычтен артефакт npm 10.9.9: любой повторный `npm i` поверх
готового дерева доставляет musl-варианты бинарников
`@rolldown/binding-linux-x64-musl` (20.2 MB) и `lightningcss-linux-x64-musl`
(9.6 MB). Проверка: в копии базового проекта `npm i` без новых пакетов
сообщил `added 2 packages` и поставил оба musl-пакета. На оба инструмента
артефакт влияет одинаково. С ним сырые суммы такие: Mootant +41.6 MB / 7
пакетов, Stryker +91.3 MB / 170 пакетов.

### Абсолютные значения в пустом каталоге

| Сценарий                                                                                       | Пакетов | `du -sh` | apparent | `find package.json` | Cold, медиана (min–max) | Warm, медиана |
| ---------------------------------------------------------------------------------------------- | ------: | -------: | -------: | ------------------: | ----------------------- | ------------- |
| `vitest@5` (база)                                                                              |      35 |    40 MB |    39 MB |                  38 | 7.9 s (7.9–8.0)         | 2.3 s         |
| `vitest@5 typescript` (база)                                                                   |      37 |    71 MB |    68 MB |                  41 | 8.8 s (8.8–9.4)         | 3.5 s         |
| `@stryker-mutator/core @stryker-mutator/vitest-runner` (npm сам ставит peer `vitest`)          |     203 |   102 MB |    73 MB |                 231 | 15.6 s (14.8–16.1)      | 6.5 s         |
| то же + `@stryker-mutator/typescript-checker` (npm сам ставит peer `typescript@7.0.2`)         |     206 |   133 MB |   102 MB |                 235 | 19.4 s (16.4–20.8)      | 8.3 s         |
| `mootant` (tgz), без Vitest: optional peers npm не ставит                                      |       6 |    12 MB |   7.1 MB |                   6 | 9.4 s (9.1–11.2)        | 5.4 s         |

### Из чего состоит добавка

**Mootant** (6 пакетов без Vitest): `mootant` 6.3 MB, `oxc-parser` 2.9 MB,
`@oxc-parser/binding-linux-x64-gnu` 2.1 MB, `@eslint-community/regexpp`
0.5 MB, `@oxc-project/types` 0.1 MB (в проекте с Vitest он уже есть через
rolldown) и `lilconfig` (< 0.1 MB).

**StrykerJS** (168 пакетов поверх Vitest). Самые крупные: `rxjs` 11.4 MB,
`zod` 8.2 MB, `caniuse-lite` 4.3 MB, `weapon-regex` 3.8 MB,
`@stryker-mutator/core` 3.1 MB, `underscore` 2.6 MB, `ajv` 2.5 MB и
`@stryker-mutator/instrumenter` 1.5 MB. Кроме них поставлено 43 пакета
`@babel/*` (Babel 8). `typescript-checker` в TS-проекте добавляет 0.5 MB. В
пустом проекте он тянет ещё peer `typescript`: 30.5 MB, из которых 26.9 MB
приходится на `@typescript/typescript-linux-x64`.

## Наблюдения

1. **Mootant лёгкий по зависимостям**: 5–6 пакетов против 168–169 у
   StrykerJS. На диске это примерно в 5 раз меньше: 11.8 MB против 61.5 MB.
2. **Время установки Mootant съедают optional peers, а не пакеты.** В холодном
   кэше `npm i` локального tarball скачал 64 записи метаданных общим размером
   102.8 MB. Это packuments `vite` (39 MB), `playwright` (17 MB), `@types/node`
   (11 MB), `svelte` (4.8 MB) и других пакетов. Сами зависимости Mootant из
   реестра (`oxc-parser`, `regexpp`, `lilconfig`) ставятся за 1.1–1.3 s
   (3 прогона). Контрольный эксперимент с перепакованным tarball, cold, по
   3 прогона:

   | Вариант `package.json`                                     | Cold install          | Кэш после установки |
   | ---------------------------------------------------------- | --------------------- | ------------------- |
   | Как в артефакте (4 optional peers)                         | 9.4 s (9.1–11.2)      | ~103 MB             |
   | Без `devDependencies`, peers как есть                      | 8.1 s (7.7–9.0)       | 101 MB              |
   | Только optional peer `vitest`                              | 8.2 s (8.2–8.7)       | 95 MB               |
   | Без `peerDependencies` и `peerDependenciesMeta`            | **3.2 s (2.9–3.4)**   | 8.1 MB              |

   Даже один optional peer `vitest` заставляет npm 10 разрешить граф его
   optional peers (`@vitest/browser-*`, `playwright`, `webdriverio`, `jsdom`,
   `happy-dom` и т. д.) и скачать их метаданные. В тёплом кэше разница
   меньше: около 5.5 s против примерно 2–3 s. Предполагаю, что при установке
   опубликованного `mootant` из реестра будет то же самое, потому что манифест
   тот же. Это гипотеза: проверить её нельзя, пока 0.1.0 не опубликован.
3. **Одна функция — один файл видна и в пакете.** `node_modules/mootant`
   состоит из 1434 файлов (609 `.js`, 822 `.d.ts`). Их apparent size 1.7 MB,
   а на диске из-за блоков по 4 KiB они занимают 6.4 MB. Tarball весит
   648 KB. Если склеить `dist` в несколько чанков (типы можно собрать в один
   `.d.ts`), пакет на диске станет примерно в 3–4 раза меньше и быстрее
   распакуется. Это оценка, а не замер.
4. `package.json` внутри артефакта содержит `devDependencies` (≈50 записей).
   На установку они не влияют: варианты «как есть» и «без devDependencies» в
   таблице выше дают одинаковое время в пределах шума. В релизе их, видимо,
   должен убирать скрипт `ci:clear` (`clear-package-json`). Я не проверял,
   запускался ли он для этого артефакта.
5. Для StrykerJS в пустом проекте npm сам ставит peer `vitest` (это видно в
   `node_modules`) и peer `typescript` последней версии, 7.0.2.

## Сырые данные

```text
node v22.23.4 npm 10.9.9 date 2026-11-04T03:42:51+00:00
machine: 4 vCPU, 15Gi RAM
flags: --no-audit --no-fund --loglevel=error; cold = fresh --cache dir per run; warm = cache populated by previous runs
=== SCENARIO baseline-vitest: npm i -D vitest@5 (base: empty)
TIME baseline-vitest cold run=1 seconds=7.891272587
TIME baseline-vitest cold run=2 seconds=7.929789272
TIME baseline-vitest cold run=3 seconds=7.967181882
TIME baseline-vitest warm run=1 seconds=2.270335015
TIME baseline-vitest warm run=2 seconds=2.347209557
METRIC baseline-vitest disk=40M diskKB=40892 apparent=39M lock_packages=35 find_package_json=38 npm_ls_parseable=35
VERSIONS baseline-vitest: `-- vitest@5.1.0
=== SCENARIO baseline-vitest-ts: npm i -D vitest@5 typescript (base: empty)
TIME baseline-vitest-ts cold run=1 seconds=8.767153052
TIME baseline-vitest-ts cold run=2 seconds=8.774149678
TIME baseline-vitest-ts cold run=3 seconds=9.408388817
TIME baseline-vitest-ts warm run=1 seconds=3.046247908
TIME baseline-vitest-ts warm run=2 seconds=3.963520359
METRIC baseline-vitest-ts disk=71M diskKB=72160 apparent=68M lock_packages=37 find_package_json=41 npm_ls_parseable=37
VERSIONS baseline-vitest-ts: +-- typescript@7.0.2 `-- vitest@5.1.0
=== SCENARIO stryker: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner (base: empty)
TIME stryker cold run=1 seconds=16.146879965
TIME stryker cold run=2 seconds=15.613304496
TIME stryker cold run=3 seconds=14.823828124
TIME stryker warm run=1 seconds=5.890124517
TIME stryker warm run=2 seconds=7.146999249
METRIC stryker disk=102M diskKB=103924 apparent=73M lock_packages=203 find_package_json=231 npm_ls_parseable=203
VERSIONS stryker: +-- @stryker-mutator/core@10.1.1 `-- @stryker-mutator/vitest-runner@10.1.1
=== SCENARIO stryker-tsc: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker (base: empty)
TIME stryker-tsc cold run=1 seconds=16.378645571
TIME stryker-tsc cold run=2 seconds=19.401143849
TIME stryker-tsc cold run=3 seconds=20.770618991
TIME stryker-tsc warm run=1 seconds=7.376984471
TIME stryker-tsc warm run=2 seconds=9.284642503
METRIC stryker-tsc disk=133M diskKB=135720 apparent=102M lock_packages=206 find_package_json=235 npm_ls_parseable=206
VERSIONS stryker-tsc: +-- @stryker-mutator/core@10.1.1 +-- @stryker-mutator/typescript-checker@10.1.1 `-- @stryker-mutator/vitest-runner@10.1.1
=== SCENARIO stryker-on-vitest: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner (base: size-baseline-vitest)
TIME stryker-on-vitest cold run=1 seconds=12.895234936
TIME stryker-on-vitest cold run=2 seconds=14.689865184
TIME stryker-on-vitest cold run=3 seconds=15.842031182
TIME stryker-on-vitest warm run=1 seconds=6.236265690
TIME stryker-on-vitest warm run=2 seconds=6.624019650
METRIC stryker-on-vitest disk=132M diskKB=134448 apparent=103M lock_packages=205 find_package_json=233 npm_ls_parseable=205
VERSIONS stryker-on-vitest: +-- @stryker-mutator/core@10.1.1 +-- @stryker-mutator/vitest-runner@10.1.1 `-- vitest@5.1.0
=== SCENARIO stryker-tsc-on-vitest-ts: npm i -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker (base: size-baseline-vitest-ts)
TIME stryker-tsc-on-vitest-ts cold run=1 seconds=14.026633756
TIME stryker-tsc-on-vitest-ts cold run=2 seconds=15.496706595
TIME stryker-tsc-on-vitest-ts cold run=3 seconds=16.767051607
TIME stryker-tsc-on-vitest-ts warm run=1 seconds=8.343427567
TIME stryker-tsc-on-vitest-ts warm run=2 seconds=8.618783531
METRIC stryker-tsc-on-vitest-ts disk=163M diskKB=166244 apparent=132M lock_packages=208 find_package_json=237 npm_ls_parseable=208
VERSIONS stryker-tsc-on-vitest-ts: +-- @stryker-mutator/core@10.1.1 +-- @stryker-mutator/typescript-checker@10.1.1 +-- @stryker-mutator/vitest-runner@10.1.1 +-- typescript@7.0.2 `-- vitest@5.1.0
=== SCENARIO mootant-on-vitest: npm i -D mootant-0.1.0-170ec52.tgz (base: size-baseline-vitest)
TIME mootant-on-vitest cold run=1 seconds=10.849995149
TIME mootant-on-vitest cold run=2 seconds=9.268842613
TIME mootant-on-vitest cold run=3 seconds=10.564425644
TIME mootant-on-vitest warm run=1 seconds=5.273345621
TIME mootant-on-vitest warm run=2 seconds=5.893153912
METRIC mootant-on-vitest disk=82M diskKB=83548 apparent=75M lock_packages=42 find_package_json=45 npm_ls_parseable=42
VERSIONS mootant-on-vitest: +-- mootant@0.1.0 `-- vitest@5.1.0
=== SCENARIO mootant-alone: npm i -D mootant-0.1.0-170ec52.tgz (base: empty)
TIME mootant-alone cold run=1 seconds=9.058686512
TIME mootant-alone cold run=2 seconds=9.421388328
TIME mootant-alone cold run=3 seconds=11.249815184
TIME mootant-alone warm run=1 seconds=5.303480934
TIME mootant-alone warm run=2 seconds=5.468766282
METRIC mootant-alone disk=12M diskKB=12208 apparent=7.1M lock_packages=6 find_package_json=6 npm_ls_parseable=6
VERSIONS mootant-alone: `-- mootant@0.1.0
=== SCENARIO mootant-on-vitest-ts: npm i -D mootant-0.1.0-170ec52.tgz (base: size-baseline-vitest-ts)
TIME mootant-on-vitest-ts cold run=1 seconds=10.097185808
TIME mootant-on-vitest-ts cold run=2 seconds=11.618575047
TIME mootant-on-vitest-ts cold run=3 seconds=10.855986735
TIME mootant-on-vitest-ts warm run=1 seconds=5.877517887
TIME mootant-on-vitest-ts warm run=2 seconds=6.479345970
METRIC mootant-on-vitest-ts disk=113M diskKB=114816 apparent=104M lock_packages=44 find_package_json=48 npm_ls_parseable=44
VERSIONS mootant-on-vitest-ts: +-- mootant@0.1.0 +-- typescript@7.0.2 `-- vitest@5.1.0
DONE 2026-11-04T03:50:39+00:00

# Mootant dependencies only, from the registry (cold, separate cache per run)
deps-only cold run=1 1.330450349
deps-only cold run=2 1.101930417
deps-only cold run=3 1.149528848

# Repacked tarball variants (cold, separate cache per run)
nopeers cold run=1 3.194664085 s; cache=8.1M
nopeers cold run=2 3.378095022 s; cache=8.1M
nopeers cold run=3 2.936746617 s; cache=8.1M
vitestonly cold run=1 8.207228090 s; cache=95M
vitestonly cold run=2 8.152357881 s; cache=95M
vitestonly cold run=3 8.683612273 s; cache=95M
nodev cold run=1 8.126455851 s; cache=101M
nodev cold run=2 7.695863819 s; cache=101M
nodev cold run=3 8.981075990 s; cache=101M

# Added packages over the vitest@5 project (from .package-lock.json, du -sk)
size-mootant vs size-baseline-vitest: added 7, 41.6 MB
   20.2 MB  @rolldown/binding-linux-x64-musl@1.2.16   (npm re-install artefact)
    9.6 MB  lightningcss-linux-x64-musl@1.33.0        (npm re-install artefact)
    6.3 MB  mootant@0.1.0
    2.9 MB  oxc-parser@0.156.0
    2.1 MB  @oxc-parser/binding-linux-x64-gnu@0.156.0
    0.5 MB  @eslint-community/regexpp@4.12.2
    0.0 MB  lilconfig@3.1.4
size-stryker-on-vitest vs size-baseline-vitest: added 170, 91.3 MB (same two artefacts included)
size-stryker (empty dir, vitest auto-installed) vs size-baseline-vitest: added 168, 61.5 MB
   11.4 MB rxjs@7.8.2; 8.2 MB zod@4.6.7; 4.3 MB caniuse-lite; 3.8 MB weapon-regex@2.0.6;
    3.1 MB @stryker-mutator/core@10.1.1; 2.6 MB underscore@1.13.8; 2.5 MB ajv@8.20.0; 43 x @babel/*
size-stryker-tsc vs size-stryker: added 3, 31.0 MB
   26.9 MB @typescript/typescript-linux-x64@7.0.2; 3.6 MB typescript@7.0.2; 0.5 MB @stryker-mutator/typescript-checker@10.1.1

# npm re-install artefact check: copy of size-baseline-vitest, plain `npm i` (no new packages)
added 2 packages -> lightningcss-linux-x64-musl, @rolldown/binding-linux-x64-musl
```
