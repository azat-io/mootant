# Данные и скрипты раздела 1 (архитектура)

Всё пересчитывается из исходников коммита `170ec52` одной командой из корня
репозитория:

```sh
npm i --prefix /home/user/tools-arch dependency-cruiser madge typescript@5 \
  oxc-parser@0.156.0 jscpd@4 @hpcc-js/wasm-graphviz esbuild@0.25
bash analysis/architecture/scripts/run-all.sh
```

Скрипты только читают репозиторий и пишут в `analysis/architecture/data/` и два
SVG-файла в этом каталоге. Полные графы `data/depcruise*.json` (по 2 МБ) не
коммитятся (см. `.gitignore`), рядом лежат их сжатые снимки `*.json.gz`.

## Скрипты (`scripts/`)

| Файл                                   | Что делает                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depcruise.config.cjs`                 | Конфиг dependency-cruiser с правилами слоёв (`core ↛ cli`, `core ↛ adapters`, `adapters ↛ cli`, `vitest ↮ node-test`, `types` только типы, циклы) |
| `depcruise-tests.config.cjs`           | Граф `test/ → исходники`                                                                                                                          |
| `analyze-graph.mjs`                    | Fan-in/fan-out, агрегаты по папкам, одиночные импортёры, SCC, охват входов, Mermaid всех папок                                                    |
| `code-style-metrics.mjs`               | Строки кода / JSDoc / импортов по файлам и папкам (парсер oxc)                                                                                    |
| `helper-folders.mjs`                   | Импортёры хелперов, семейства по именам, цепочки приватных хелперов, «всегда вместе»                                                              |
| `mermaid-views.mjs`                    | Читаемые Mermaid-графы слоёв и подпапок ядра                                                                                                      |
| `extra-metrics.mjs`                    | Видимость типов, файлы без теста-двойника, кандидаты G1, тесты на исходник, замыкания мутаторов, использование `SyntaxHelpers`                    |
| `facade-closures.mjs`                  | Замыкания мутаторов с учётом зависимостей через `context.syntax`                                                                                  |
| `simulate-grouping.mjs`                | Симуляция правила группировки §6.3 (`EXTENDED=1` — расширенный вариант)                                                                           |
| `dot-to-svg.mjs`                       | dot → SVG через Graphviz в wasm                                                                                                                   |
| `startup-bench.sh`, `preload-bench.sh` | Замер старта CLI и preload `node:test`: dist против бандла                                                                                        |
| `madge-tsconfig.json`                  | Минимальный tsconfig для madge (проектный наследует пакет, которого нет без `node_modules`)                                                       |
| `run-all.sh`                           | Всё по порядку                                                                                                                                    |

## Данные (`data/`)

| Файл                                                             | Содержимое                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `summary.json`                                                   | Сводка: топ fan-in/fan-out, SCC, охват входов                        |
| `files.tsv`                                                      | Fan-in/fan-out каждого файла (значения и типы отдельно)              |
| `folders.tsv`, `folder-edges.tsv`                                | Агрегаты и рёбра по папкам                                           |
| `single-importer.tsv`                                            | Файлы с одним импортёром                                             |
| `madge-circular.txt`                                             | Циклы по данным madge (перепроверка `scc.txt`)                       |
| `scc.txt`                                                        | Сильно связные компоненты                                            |
| `reach.tsv`                                                      | Охват точек входа                                                    |
| `style-files.tsv`, `style-areas.tsv`, `style-summary.json`       | Метрики стиля                                                        |
| `helpers.tsv`, `helper-families.txt`                             | Хелперные папки, семейства                                           |
| `merge-candidates-private-helpers.tsv`                           | Кандидаты правила G1 (< 40 строк кода, один импортёр в той же папке) |
| `test-importers-per-source.tsv`, `sources-without-test-twin.txt` | Связь тестов и исходников                                            |
| `types-visibility.tsv`                                           | Типы `types/` по видимости                                           |
| `mutator-closures.tsv`, `mutator-closures-with-facade.tsv`       | Замыкания мутаторов                                                  |
| `syntax-helpers-usage.tsv`                                       | Кто в ядре вызывает каждый метод `SyntaxHelpers`                     |
| `grouping-simulation*.json`, `grouping-map*.tsv`                 | Результат симуляции правила группировки                              |
| `layers.mmd`, `core.mmd`, `folders.mmd`                          | Mermaid                                                              |
| `folders-archi.dot`, `folders-src-archi.dot`                     | Граф папок для Graphviz                                              |
| `startup-bench.txt`                                              | Сырые замеры старта                                                  |
| `jscpd-summary.json`                                             | Отчёты jscpd                                                         |

## Прочее

- `folders-archi.svg`, `folders-src-archi.svg` — графы папок (с `types/` и без).
- `repro-plugin-skip-rule/` — воспроизведение ARCH-4 (плагин со своим
  `skip.rule`).
- `experiments/treeshake/` — проверка, что rolldown удаляет неиспользуемые
  экспорты при `preserveModules`.

## Линтер

Скрипты — инструменты анализа, а не код продукта. Prettier проекта они проходят
(`*.md`, `*.json`, `*.js` проверены), а строгий ESLint проекта — нет: 465
замечаний, в основном `id-length`, `unicorn/name-replacements`, `func-style` и
`perfectionist/sort-objects`. Отключить его для файла целиком нельзя: конфиг
запрещает неограниченный `eslint-disable`
(`eslint-comments/no-unlimited-disable`). Если ветка анализа проходит
`pnpm test:js`, каталог `analysis/` нужно исключить на время прогона:
`eslint --ignore-pattern 'analysis/**' .`.
