# Раздел 6. Опыт пользователя и агентов

> Черновик, заполняется по ходу работы (2026-11-04). Исследуемый коммит
> `170ec52` (main), версия `0.1.0`, собранный пакет
> `/home/user/artifacts/mootant-0.1.0-170ec52.tgz`. Машина: 4 vCPU, 15 ГБ RAM,
> Node.js 22.23.4, npm 10.9.9, Vitest 5.1.0 (последняя на дату проверки).
> Артефакты раздела — `analysis/ux/`. Баги — `analysis/bugs/ux.md`.

## 6.1. Журнал первого запуска

Проект `/home/user/projects/ux/first-run` создан с нуля: `npm init`, Vitest
5.1.0, TypeScript, 5 модулей (`src/price.ts`, `src/slug.ts`, `src/user.ts`,
`src/retry.ts`, `src/format.ts`) и 4 тестовых файла с типичными слабостями
(нет граничного значения, `toBeTruthy`, проверка только длины массива ошибок,
нет теста на повтор после ошибки, модуль без тестов вовсе). `npm test` — 12
тестов зелёные.

### Шаг 1. Установка по readme

Readme и `getting-started.mdx:65-69` велят выполнить `npm install -D mootant`,
затем `npx mootant run src`.

```text
$ npm view mootant
mootant@0.0.0 | Proprietary | deps: none | versions: 2
OIDC trusted publishing setup package for mootant
dist-tags: latest: 0.0.0          (опубликовано 2026-10-10, версии 0.0.0-stage и 0.0.0)

$ npm install -D mootant          # ставит "mootant": "^0.0.0"
$ npx mootant run src
npm error could not determine executable to run          (exit 1)
```

В пакете `mootant@0.0.0` два файла: `package.json` без `bin` и README «This
package is created solely for the purpose of setting up OIDC trusted
publishing… **DO NOT USE THIS PACKAGE**». Обходного пути нет:
`npm install -D github:azat-io/mootant` ставит исходники без `dist/` (в
`package.json` нет `prepare`), и `npx mootant` падает с
`ERR_MODULE_NOT_FOUND …/node_modules/mootant/dist/cli/index.js`. Дальше
использован собранный `mootant-0.1.0-170ec52.tgz`
(`npm install -D /home/user/artifacts/mootant-0.1.0-170ec52.tgz`, 5 с, 6,4 МБ в
`node_modules/mootant`, 3 прямые зависимости).

- **U-01 (critical).** Документированная установка не работает: на npm
  опубликована только заглушка 0.0.0. Любой новый пользователь и любой агент со
  skill (который вызывает `npx mootant`) останавливается на первом шаге.
  Сообщение `could not determine executable to run` ничего не говорит о
  причине. Предупреждение readme «Early development. Expect breaking changes»
  не сообщает, что пакет ещё не выпущен. Проверить доступность сайта
  mootant.org, на который ведут ссылки readme, не удалось: хост закрыт сетевыми
  правилами этой сессии.

Мелочи CLI до первого запуска:

- **U-02 (low).** `mootant` без команды печатает справку с кодом 0;
  `mootant run --help` печатает общую справку, а не справку по `run`. Для
  неизвестной опции сообщение берётся из `node:util parseArgs` как есть:
  `Unknown option '--foo'. To specify a positional argument starting with a
  '-', place it at the end of the command after '--', as in '-- "--foo"` —
  непарная кавычка и совет, который здесь не нужен (`cli/parse-arguments.ts:327-329`).
  Опечатка `mootant lst src` даёт `Unknown command 'lst'` без подсказки «did you
  mean list».

<!-- Шаги 2–6 первого запуска дописываются ниже после прогонов (после 04:30 UTC). -->
