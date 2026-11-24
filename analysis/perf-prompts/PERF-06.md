# PERF-06: быстрый путь ширины строки для печатного ASCII в текстовых отчётах (BUG-702)

> Самодостаточный промпт для отдельной сессии Claude Code в репозитории
> azat-io/mootant. Ранг 6 из 12 в `analysis/04-performance.md` §4.4 (ветка
> `analysis/2026-11`). Выигрыш: измерен: ×1,24 ± 0,10 на текстовом
> `mootant list core` (7,78 ± 0,36 → 6,28 ± 0,45 с, hyperfine, 5 прогонов).
> Риск для вердиктов: нет. Трудоёмкость: S. Прототип: diff
> `analysis/experiments/perf-display-width-ascii-fast-path.diff`. Тип:
> реализация. Замерено на коммите 170ec52; код сверен с `main` на bd7af11.

## Контекст

Чтобы выровнять колонки, текстовые отчёты меряют ширину текста в колонках
терминала. Её считает `getDisplayWidth`
(`cli/terminal/get-display-width.ts:31-38`):

1. снимает цветовые коды (`stripAnsi`, `cli/terminal/strip-ansi.ts:7-36`);
2. режет текст на графемы через `Intl.Segmenter` (`splitGraphemes`, `:22`,
   `:61-63`);
3. каждую графему проверяет двумя Unicode-регэкспами (`getGraphemeWidth`,
   `:47-52`, шаблоны `:10-11` и `:17`).

Почти весь вывод — печатный ASCII (`0x20–0x7E`), а для него ширина всегда
равна длине строки. Ни один такой символ не входит ни в `Emoji_Presentation`,
ни в диапазоны `WIDE_PATTERN` и не относится к `Cc`, `Cf` или `Mn`. Никакие
два из них не склеиваются в графему: правилам UAX #29 для этого нужны
не-ASCII символы или пара CR LF. При этом сегментатор и оба регэкспа всё
равно работают на каждый символ.

**Горячий путь — текстовый `mootant list` по большому каталогу.** Вызов идёт
так: `cli/run-list.ts:31-37` → `formatTextReport`
(`cli/report/format-text-report.ts:45-108`) → `formatFileGroups`
(`cli/report/format-file-groups.ts:111-173`). На каждую строку-мутанта, а с
`--skipped` и на каждый пропуск, ширина меряется много раз:

- `formatChange` (`cli/diff/format-change.ts:89-117`) меряет разделитель
  ` → ` (`:96-97`). Оригинал и замену он режет на графемы сам, минуя
  `getDisplayWidth` (`:110-114`). Обе стороны меряет `fits` (`:170-176`), а
  сторону шире 60 колонок (`:15`) подрезает `growContext`, вызывая `fits`
  многократно (`:283-331`);
- `formatFileGroups` меряет изменение (`:148`) и колонки места, мутатора и
  хвоста (`:132-133`, `:196-204`), а затем каждую колонку ещё раз в
  `padToWidth` (`:154`, `:159-161`);
- `cutToWidth` меряет причину пропуска (`:169`) и путь файла
  (`cli/terminal/format-by-file.ts:61`);
- в конце `formatHeader` заново меряет каждую строку тела
  (`cli/report/format-header.ts:46`).

**Что зависит от окружения.**

- Вне терминала ширина равна `Infinity`
  (`cli/terminal/get-text-style.ts:26-29`), и `cutToWidth` выходит после
  первого замера (`cli/terminal/cut-to-width.ts:24`).
- Без `--color`, `FORCE_COLOR` или `CI` вывод без цветов
  (`cli/terminal/create-colors.ts:110-128`).
- На Linux и macOS отчёт печатает `→` и `…`
  (`cli/terminal/get-symbols.ts:43-61`), кроме `TERM=linux` — там `->` и
  `...` (`cli/terminal/is-unicode-supported.ts:10-14`). Строки с `→` и `…` и
  после правки идут старым путём: разделитель, изменение (оба замера) и
  строки тела в `formatHeader`. Замер окна снят именно в этом режиме
  (`TERM=xterm-256color`).
- Таб старый путь считает за 0 колонок (`Cc`, `:17`). Быстрый путь таб не
  берёт, поэтому так и останется.

**Где не горячо** (по коду, не мерилось):

- Текстовый `run` печатает только Survived, NoCoverage и Error
  (`cli/report/format-run-text-report.ts:67-75`, `:149-168`; дальше —
  `cli/diff/mark-diff.ts:109-112`, `cli/diff/format-diff.ts:137-216`).
  Это десятки строк, а сам прогон идёт минуты.
- Строку прогресса (`cli/create-run-progress.ts:158`, `:172-202`) спиннер
  перерисовывает раз в 80 мс (`cli/terminal/create-spinner.ts:10`).
- HTML и JSON ширину не считают, а точки стенда `analysis/bench`
  (`m-cold`…`m-since`) пишут JSON, так что их правка не ускорит.
- `list` на подмножествах стенда занимает 0,3–0,4 с (§4.5.6).

**Актуальность на `main` (bd7af11).** Задача не сделана:
`cli/terminal/get-display-width.ts` и `strip-ansi.ts` с 170ec52 не менялись.
Вызывающих по-прежнему 15 файлов в `cli/`; `cli/create-run-progress.ts` и
`cli/diff/*` были среди них уже в 170ec52. С тех пор в них поменялись две
вещи: импорт типа `Color` после переименования `cli/terminal/colors.ts` →
`create-colors.ts` (c04e6f5) и новая функция `describeRound` в
`create-run-progress.ts` (bc6adec), которая ширину не считает.

Jest-адаптер и node:test задача не задевает. `core/` и `adapters/` ничего не
импортируют из `cli/`, кроме типа в `types/cli/text-style.d.ts:1`, а текст
отчёта одинаков для всех адаптеров. Для замера важно, что `core/` вырос с 410
до 427 файлов `.ts` (без `.d.ts`). Поэтому `mootant list core` на main даёт
другие абсолютные числа, и базой нужно брать main без правки.

**Польза узкая**: выигрыш виден только на текстовом `list` по каталогам с
тысячами мутантов. В синтезе анализа сказано: «выигрыш измерен (−19 %), но
польза мала: текстовый list на 16 тыс. мутантов — редкий сценарий»
(`analysis/data/synthesis/synthesis.json`). Правка при этом — 12 строк без
риска для вердиктов.

## Доказательства

**Измерено** в эксклюзивном окне 2026-11-04, шаг 07:39–07:40 UTC, сразу после
`test:unit` того же окна; чужих нагрузок не было (§4.5.1). Машина — 4 vCPU
Intel Xeon 2.1 GHz, 15 GB RAM, Node v22.23.4, hyperfine 1.18.0 (§4.1).
Команда (`analysis/bench/window.sh:19-23`): hyperfine `--warmup 1 --runs 5`,
`cd <дерево> && TERM=xterm-256color node bin/mootant.js list core > /dev/null`.
База — дерево на 170ec52, изменение — 170ec52 с diff прототипа.

Hyperfine мерил саму команду, без обвязки стенда, поэтому счётчик — wall
hyperfine. Правило §4.5.1 (elapsed GNU time для точек короче ~30 с) ввели
из-за квантования обвязки, к этому замеру оно не относится. Сырые данные —
`analysis/experiments/display-width-ab.json`.

| сборка | wall, mean ± σ, с | медиана, с | min–max, с | CPU user + sys, с |
|---|---|---|---|---|
| база (170ec52) | 7,782 ± 0,356 | 7,796 | 7,247–8,158 | 9,30 + 0,36 = 9,66 |
| быстрый путь | 6,283 ± 0,449 | 6,326 | 5,607–6,797 | 7,93 + 0,28 = 8,21 |

Итог: ×1,24 ± 0,10 по hyperfine, −19 % wall, −15 % CPU. Пик памяти не
снимался.

- **Эквивалентность прототипа** (`analysis/experiments/perf-display-width.md`).
  Вывод `list core` на 170ec52 (17 098 строк) совпал байт в байт (`cmp`).
  Прошли тесты `test/cli/terminal` и `test/cli/report` (37 файлов, 230
  тестов), `eslint` и `prettier --check`.
- **CPU до окна, под чужой нагрузкой.** User + sys, 5 чередующихся пар,
  медианы: 9,28 → 7,64 с (`analysis/experiments/perf-display-width-ab-cpu.txt`).
- **Профиль** (`analysis/bench/smoke/profile-list-core.md`) — смоук при load
  average ~30, его цифры годятся только как доли. На 170ec52
  `node --cpu-prof bin/mootant.js list core` шёл 16,12 с wall,
  `--json --skipped` — 9,08 с. Из 15 846 мс выборки `splitGraphemes` (в dist
  — `o`, `dist/cli/terminal/get-display-width.js:12` (170ec52)) занял 6 449 мс
  self (40,7 %), весь модуль — 43,1 %, `format-text-report.js` инклюзивно —
  47,4 %, листинг `list-file-mutants.js` — 34,7 %, GC — 9,2 %. В
  JSON-варианте модуль ширины — 11 мс. «38–43 %» в §4.4 — по двум профилям;
  второй (через `analysis/tools/prof/top-self.mjs`) в ветке не сохранён.
- **Догфудинг** (`analysis/00-baseline.md:138-160`; 170ec52, `TERM=linux`).
  Текстовый `list core` — 7,70 / 7,15 / 7,49 с, `--json --skipped` — 2,63 с;
  16 279 мутантов в 410 файлах. После правки в окне текст — 6,28 с против
  2,6 с у JSON (замеры в разных условиях). Остаток — «остальное
  форматирование», его не профилировали (§4.3).
- **Проверка при подготовке промпта** (2026-11-22; Node 22.23.4, ICU 78.3,
  Unicode 17.0). Скрипт сравнил быстрый путь со старым кодом dist 170ec52.
  Строки: каждый код 0x00–0xFF по отдельности, все пары печатных ASCII и
  200 000 случайных строк из печатных ASCII, табов, `\n`, DEL, SGR- и
  не-SGR-кодов, `é`, `→`, `大`, `🎉`. Расхождений нет. Строку из 95 печатных
  ASCII `Intl.Segmenter` делит на 95 графем.

**Прогноз (не измерено).** На main выигрыш близок к ×1,24: код ширины тот
же, вырос только `core/`. С `TERM=linux` выигрыш больше, потому что `->` и
`...` — ASCII. На `run` и точках стенда выигрыша нет.

## Что сделать

**Шаг 0. Подготовка.** Ветка анализа лежит только в origin:

```bash
git fetch origin main '+refs/heads/analysis/2026-11:refs/remotes/origin/analysis/2026-11'
git diff bd7af11 origin/main --stat -- cli/terminal/ test/cli/terminal/   # пусто — промпт верен
mkdir -p /tmp/perf06; A=origin/analysis/2026-11
git show $A:analysis/experiments/perf-display-width-ascii-fast-path.diff > /tmp/perf06/ascii-fast-path.diff
git show $A:analysis/experiments/perf-display-width.md > /tmp/perf06/perf-display-width.md
git show $A:analysis/bench/lib/cpuprofile-top.mjs > /tmp/perf06/cpuprofile-top.mjs   # для шага 4
git switch -c perf/ascii-display-width origin/main
git worktree add --detach ../mootant-perf06-base origin/main   # база: тот же коммит без правки
pnpm install --frozen-lockfile && (cd ../mootant-perf06-base && pnpm install --frozen-lockfile)
```

**Шаг 1. Перенести diff:** `git apply /tmp/perf06/ascii-fast-path.diff`. На
bd7af11 `git apply --check` проходит без конфликтов, руками ничего переносить
не нужно. Diff (+12/−2, только `cli/terminal/get-display-width.ts`) добавляет
константу с JSDoc, быстрый путь в начало `getDisplayWidth` и фразу о нём в её
JSDoc:

```ts
const PRINTABLE_ASCII_PATTERN = /^[\u{20}-\u{7E}]*$/u

export function getDisplayWidth(text: string): number {
  let plain = stripAnsi(text)
  if (PRINTABLE_ASCII_PATTERN.test(plain)) {
    return plain.length
  }
  let width = 0
  let graphemes = splitGraphemes(plain) // дальше как было
```

Цветовые коды снимаются до проверки. Не-SGR-последовательность `stripAnsi`
оставляет как `ESC[` и финальный символ (`strip-ansi.ts:24-27`). `ESC` в
диапазон не входит, так что такая строка идёт старым путём. Так же идут табы,
управляющие символы, DEL и любой не-ASCII.

**Шаг 2. Тесты** в `test/cli/terminal/get-display-width.test.ts`. Обе ветки
уже покрыты: `'abc'` на `:11`, CJK и эмодзи на `:12-15`. Добавь эталон
старого пути со своим сегментатором, чтобы он не зависел от будущих правок
`splitGraphemes`, и три теста в `describe('getDisplayWidth', …)`. `stripAnsi`
импортируй из `../../../cli/terminal/strip-ansi`. Логику тестов при
подготовке промпта прогнал скрипт на обоих путях, перебор пар занимает
~0,2 с. Стиль под ESLint и Prettier не проверялся; JSDoc помощникам допиши в
стиле файла.

```ts
let ascii = Array.from({ length: 0x80 }, (_, code) => String.fromCodePoint(code))
let segmenter = new Intl.Segmenter()

function measureByGraphemes(text: string): number {
  return Array.from(segmenter.segment(stripAnsi(text)), ({ segment }) =>
    getGraphemeWidth(segment),
  ).reduce((sum, width) => sum + width, 0)
}

  it('counts every ASCII character and pair as the grapheme path does', () => {
    let pairs = ascii.flatMap(first => ascii.map(second => `${first}${second}`))
    expect(ascii.map(getDisplayWidth)).toStrictEqual(ascii.map(measureByGraphemes))
    expect(pairs.map(getDisplayWidth)).toStrictEqual(pairs.map(measureByGraphemes))
  })

  it('gives controls and DEL no columns at the edges of printable ASCII', () => {
    expect(['', '\u{1F}', ' ', '~', '\u{7F}', 'a\tb'].map(getDisplayWidth)).toStrictEqual([0, 0, 1, 1, 0, 2])
  })

  it('measures colored and mixed text as the grapheme path does', () => {
    let texts = ['\u{1B}[31mabc\u{1B}[39m', '\u{1B}[2Kabc', 'a\u{1B}b', 'ab\u{1B}[31', 'x -> y',
      'x → y', 'e\u{301}', 'a\u{FE0F}', '1\u{FE0F}\u{20E3}', '大 abc']
    expect(texts.map(getDisplayWidth)).toStrictEqual(texts.map(measureByGraphemes))
  })
```

Убедись, что тесты падают на неверном диапазоне: `\u{7F}` вместо `\u{7E}`,
`\u{1F}` вместо `\u{20}` или с табом в классе. Затем верни правильный
диапазон и запусти
`pnpm vitest run test/cli/terminal test/cli/report test/cli/diff --coverage.enabled=false`.

**Шаг 3.** Собери оба дерева: `pnpm build` здесь и в `../mootant-perf06-base`.
Проверь эквивалентность и сними замер по разделам ниже. Потом удали `dist/` в
клоне (см. «Ограничения»).

**Шаг 4 (необязательно, только по профилю).** После шага 1 сними профиль:

```bash
for term in linux xterm-256color; do rm -rf /tmp/perf06/prof-$term
  TERM=$term node --cpu-prof --cpu-prof-dir=/tmp/perf06/prof-$term bin/mootant.js list core > /dev/null; done
node /tmp/perf06/cpuprofile-top.mjs --top 15 --focus cli/report/format-header.js,cli/diff/format-change.js,cli/terminal/get-display-width.js,core/files/list-file-mutants.js /tmp/perf06/prof-linux /tmp/perf06/prof-xterm-256color
```

Если в топе self-времени остаются функции
`dist/cli/terminal/get-display-width.js`, есть две правки, не меняющие
результат. Каждую делай отдельным коммитом, со своим тестом эквивалентности и
своим A/B. Оставляй правку, только если она даёт ещё ≥ 5 % сверх шага 1 и
интервалы mean ± σ не пересекаются.

- **(a) Тот же быстрый путь в `splitGraphemes`.** Для печатного ASCII
  возвращай `[...text]`. Это ускорит прямые вызовы `format-change.ts:110-114`,
  `cut-to-width.ts:27` и `mark-diff.ts:109-112`. Тест: для всех пар ASCII
  результат совпадает с сегментами `Intl.Segmenter`.
- **(b) Символы отчётов в классе:** `…`, `→`, `●`, `▲`, `✖`, `✔` из
  `getSymbols(true)` (`\u{2026}`, `\u{2192}`, `\u{25CF}`, `\u{25B2}`,
  `\u{2716}`, `\u{2714}`). Каждый — одна кодовая единица UTF-16 шириной 1.
  При подготовке промпта проверено, что любые пары из них и печатных ASCII
  делятся на две графемы шириной 2, так что длина по-прежнему равна ширине.
  Тест: каждый символ отдельно и в паре с каждым символом ASCII совпадает с
  эталоном шага 2, а символ с `U+FE0F` после него идёт старым путём и даёт 2.
  Пробуй (b), только если после шага 1 `TERM=linux` быстрее
  `TERM=xterm-256color` больше чем на 5 %: это грубая оценка того, что
  вернёт (b).

Не делай:

- Не сегментируй ASCII-участки отдельно: графема может перейти границу.
  `'a\u{FE0F}'` старый путь считает за 2 (`WIDE_PATTERN` ловит `U+FE0F`,
  `:11`), а по частям выйдет 3; то же с keycap `1\u{FE0F}\u{20E3}`.
- Не заводи глобальный кэш ширин и не перестраивай `formatHeader` и
  `formatFileGroups`: это отдельные задачи со своим A/B.
- Не меняй, что снимает `stripAnsi`: это меняет вывод.

**Шаг 5.** Сообщение коммита — как у прототипа:
`perf: count printable ascii width without grapheme splitting`. В PR приложи
таблицу замера с условиями и итоги проверок. После этого удали
`../mootant-perf06-base` (`git worktree remove`), `/tmp/perf06` и tarball'ы.

## Инвариант: вердикты не меняются

**Почему не могут.** Ширину считает только текстовое форматирование в
`cli/`. Вердикты, id, кэш, JSON и HTML строятся в `core/` и `adapters/`, а
те из `cli/` ничего не импортируют:

```bash
grep -rlE "get-display-width" --include=*.ts cli core adapters types | grep -v '^cli/'  # пусто
grep -rnE "from '(\.\./)+cli/" core adapters                                         # пусто
```

Этого мало для отчёта, поэтому дальше — процедура. Шаги 1–2 проверяют вывод,
шаг 3 формальный, но обязательный. Узкие ширины отдельно гонять не нужно:
функция возвращает то же на любом входе, а форматтеры с конечной шириной
покрыты `test/cli/report` и `test/cli/diff`.

```bash
C=$(git rev-parse --show-toplevel); B=$(realpath "$C/../mootant-perf06-base"); O=/tmp/perf06/out
mkdir -p "$O"; unset CI FORCE_COLOR NO_COLOR   # оба дерева собраны (pnpm build)
```

1. **JSON `list` побайтно.** Ширины в нём нет, так что шаг проверяет, что в
   остальном сборки одинаковы:

   ```bash
   (cd "$B" && node bin/mootant.js list core --json --verbose --skipped > "$O/base-core.json")
   (cd "$C" && node bin/mootant.js list core --json --verbose --skipped > "$O/change-core.json")
   cmp "$O/base-core.json" "$O/change-core.json" && echo "JSON same"
   ```

2. **Текст `list core` побайтно, восемь вариантов:** символы Unicode или
   ASCII, с цветом или без, с пропусками или без. Запиши и число строк.

   ```bash
   for term in xterm-256color linux; do for flags in plain --skipped --color '--skipped --color'; do
     args=${flags#plain}; name=$term$(echo "$args" | tr -d ' ')
     (cd "$B" && TERM=$term node bin/mootant.js list core $args > "$O/base-$name.txt")
     (cd "$C" && TERM=$term node bin/mootant.js list core $args > "$O/change-$name.txt")
     cmp "$O/base-$name.txt" "$O/change-$name.txt" && echo "same $name: $(wc -l < "$O/base-$name.txt") lines"
   done; done
   ```

3. **Вердикты на фикстуре `vitest-units` из ветки анализа.** На 170ec52 в ней
   76 мутантов: Killed 58, Survived 13, Timeout 1, NoCoverage 4. Прогон идёт
   около 30–40 с на занятой машине; это грубая оценка, не замер
   (`analysis/experiments/prototypes.md`). Поставь в фикстуру tarball'ы обеих
   сборок и сравни `run --json --all --verbose` по id.

   Формат сверен с main: `id` — `types/report/list-report-mutant.d.ts:103`;
   `killedBy`, `killedIn`, `status` — `types/report/run-report.d.ts:57`,
   `:70`, `:96`; `listed`, `command` и `schemaVersion: 4` — `:259`, `:298`,
   `:293`. На node:test и Jest отдельно проверять не нужно: адаптеры `cli/` не
   трогают. Vitest ставь 5.1.0: в npm 10.9.9 установка 5.0.5 падает в
   arborist (`edgesOut`).

   ```bash
   (cd "$B" && pnpm pack --pack-destination /tmp/perf06/base-pack) && (cd "$C" && pnpm pack --pack-destination /tmp/perf06/change-pack)
   for s in base change; do d=/tmp/perf06/fx-$s; rm -rf "$d"; mkdir -p "$d"
     git -C "$C" archive origin/analysis/2026-11 analysis/experiments/perf-fixtures/vitest-units | tar -x -C "$d" --strip-components=4
     (cd "$d" && npm install -D --ignore-scripts --no-audit --no-fund --save-exact vitest@5.1.0 /tmp/perf06/$s-pack/*.tgz > /dev/null \
       && printf 'node_modules\ntmp\n' > .gitignore && git init -q && git add -A && git -c user.name=f -c user.email=f@localhost commit -qm fixture \
       && node node_modules/mootant/bin/mootant.js run src --no-cache --concurrency 3 --json --all --verbose > run.json); done
   node /tmp/perf06/compare-verdicts.mjs /tmp/perf06/fx-base/run.json /tmp/perf06/fx-change/run.json   # 0 differ
   ```

   Скрипт ниже сохрани как `/tmp/perf06/compare-verdicts.mjs`, он проверен на
   синтетических отчётах. Версия с `--strict` (ещё убивший тест и причина) —
   `analysis/tools/compare-verdicts.mjs` из ветки анализа.

   ```js
   // Compares two `mootant run --json --all --verbose` reports by mutant id:
   // status and the test file of the verdict. Exit code 1 on any difference.
   import { readFileSync } from 'node:fs'

   let read = file => {
     let report = JSON.parse(readFileSync(file, 'utf8'))
     if (report.command !== 'run' || report.listed !== 'all') {
       throw new Error(`${file}: expected the report of mootant run --json --all --verbose`)
     }
     return new Map(report.mutants.map(mutant => [mutant.id, mutant]))
   }
   let verdict = mutant =>
     mutant === undefined ? '(missing)' : `${mutant.status} ${mutant.killedIn ?? mutant.killedBy?.file ?? '-'}`
   let [base, change] = process.argv.slice(2).map(read)
   let ids = [...new Set([...base.keys(), ...change.keys()])].toSorted()
   let differences = ids.filter(id => verdict(base.get(id)) !== verdict(change.get(id)))
   for (let id of differences) console.log(`${id}: ${verdict(base.get(id))} -> ${verdict(change.get(id))}`)
   console.log(`${ids.length} mutants, ${differences.length} differ`)
   process.exitCode = differences.length === 0 ? 0 : 1
   ```

   Если расхождение всё же есть, прогони базу второй раз и сравни её саму с
   собой. Если база расходится и сама с собой, это шум фикстуры (например,
   Timeout), а не правка: код, который решает вердикты, правка не меняет.

4. **Тест-сьют Mootant** зелёный полностью (см. «Критерий готовности»).

## Как измерить выигрыш

Мерить на тихой машине: перед стартом load average ниже 0,5, других тяжёлых
задач нет. Оба дерева собраны одной версией Node, обозначения те же, что в
разделе об инварианте. Счётчик — wall hyperfine по самой команде, 1 прогрев и
5 прогонов (не меньше 3), как в окне. Пик RSS — по `/usr/bin/time`.

```bash
R=/tmp/perf06/bench; mkdir -p "$R"; unset CI FORCE_COLOR NO_COLOR
{ node --version; node -p process.versions.icu; hyperfine --version; nproc; uptime
  git -C "$B" rev-parse --short HEAD; git -C "$C" log -1 --format='%h %s'; } | tee "$R/conditions.txt"
for term in xterm-256color linux; do
  hyperfine --warmup 1 --runs 5 --export-json "$R/text-$term.json" \
    -n "base $term" "cd $B && TERM=$term node bin/mootant.js list core > /dev/null" \
    -n "change $term" "cd $C && TERM=$term node bin/mootant.js list core > /dev/null"
done
hyperfine --warmup 1 --runs 5 --export-json "$R/json.json" \
  -n "base json" "cd $B && node bin/mootant.js list core --json > /dev/null" \
  -n "change json" "cd $C && node bin/mootant.js list core --json > /dev/null"   # контроль
node -e 'for (let f of process.argv.slice(1)) { let r = require(f).results; console.log(f, r.map(x =>
  `${x.command}: ${x.mean.toFixed(3)} ± ${x.stddev.toFixed(3)} s (median ${x.median.toFixed(3)}), CPU ${(x.user + x.system).toFixed(2)} s`).join("; "),
  `x${(r[0].mean / r[1].mean).toFixed(2)}`) }' "$R"/*.json
for i in 1 2 3; do for t in "$B" "$C"; do (cd "$t" && TERM=xterm-256color /usr/bin/time -f "$t %e s %M KB" node bin/mootant.js list core > /dev/null); done; done
```

Запиши wall (mean ± σ и медиану), user + sys, пик RSS (`%M`), число строк
вывода (шаг 2 инварианта) и условия из `conditions.txt`. По желанию сними ту
же пару с `--skipped`: строк там вдвое больше, плюс причины. Нет hyperfine —
подойдёт чередующийся цикл `/usr/bin/time -f '%e %U %S %M'`, по 5 прогонов на
сторону. Hyperfine гоняет команды не вперемешку, поэтому при пограничном
результате повтори A/B в обратном порядке.

**Успех:**

- с `TERM=xterm-256color` правка быстрее базы минимум на 10 % (×1,10),
  интервалы mean ± σ не пересекаются, user + sys ниже. Ориентир — ×1,24 ± 0,10
  на 170ec52;
- `TERM=linux` записан (по прогнозу выигрыш там больше);
- контроль `--json` совпадает с базой в пределах σ; если нет, машина шумит, и
  замер надо повторить;
- пик RSS не вырос.

Точки стенда (`analysis/bench/run.sh`) не нужны: они пишут JSON.

## Риски и границы

- **Вердикты.** Риска нет (см. изоляцию выше). Откат — убрать константу и
  проверку в начале `getDisplayWidth`.
- **Вывод.** Эквивалентность доказана только для печатного ASCII. Главный
  риск — опечатка в диапазоне. Если в класс попадут `\u{7F}`, таб или
  `\u{1F}`, DEL, таб и управляющие символы получат ширину 1 вместо 0, и
  колонки сдвинутся. Это ловят перебор и границы из шага 2.
- **Не-ASCII текст** (CJK, эмодзи) получает одну лишнюю проверку регэкспом.
  Это O(n), рядом с сегментацией незаметно, но на таком выводе не мерилось.
- **Выигрыш зависит от окружения.** В Unicode-режиме строки со стрелкой и
  многоточием остаются на старом пути (шаг 4 (b)). На корректность это не
  влияет.
- **ICU и Node.** Ни в одной версии Unicode печатный ASCII не был
  `Emoji_Presentation`, `Cc`, `Cf` или `Mn` и не склеивался в графемы. Если
  это изменится, перебор шага 2 поймает расхождение на ICU машины с тестами.
  CI проекта — на Node 24 (`.github/actions/install-tools/action.yml:9`),
  замеры сняты на 22.23.4.
- **Эквивалентный мутант по построению.** Если условие быстрого пути
  заменить на `false`, результат не изменится. Догфудинг Mootant на
  `cli/terminal` покажет такой мутант как Survived. Это ожидаемо, убивать его
  тестом на время не надо. Мутантов границ диапазона убивают тесты шага 2.
- **Публичный API** не затронут: `cli/` не входит в `exports`
  (`package.json:24`).

## Связанные промпты

- **BUG-702** — та же находка в списке багов (`analysis/02-bugs.md`,
  `analysis/bugs/perf.md`). Отдельного промпта в `analysis/bug-prompts/` нет.
- С этой задачей не пересекается ни один из остальных: они меняют
  планировщик, кэш, адаптеры и процессы в `core/` и `adapters/`, а PERF-06 —
  только `cli/terminal/get-display-width.ts` и его тест. Общих файлов и точек
  замера нет, порядок любой. Это [PERF-01](PERF-01.md) (параллельные юниты
  одного тест-файла), [PERF-02](PERF-02.md) (полный кэш без запуска раннера),
  [PERF-03](PERF-03.md) (места тестов только в dry run, BUG-703),
  [PERF-04](PERF-04.md) (префорк), [PERF-05](PERF-05.md) (кэш компиляции V8),
  [PERF-07](PERF-07.md) (выжившие без барьеров раундов),
  [PERF-08](PERF-08.md) (кэш и калибровка тайм-аутов, BUG-752),
  [PERF-09](PERF-09.md) (порядок тест-файлов), [PERF-10](PERF-10.md)
  (node:test без процесса на юнит), [PERF-11](PERF-11.md) (отсев
  некомпилирующихся мутантов) и [PERF-12](PERF-12.md) (выборка).
- `analysis/experiments/tests-terminal-gaps.diff` (раздел 5) добавляет тесты в
  другие файлы `test/cli/terminal/`. На main `git apply --check` проходит,
  конфликта нет.

## Критерий готовности

- **Тесты.** В `test/cli/terminal/get-display-width.test.ts` есть тесты шага 2
  (или равноценные в стиле проекта): перебор символов и пар 0x00–0x7F против
  `Intl.Segmenter`; границы `\u{1F}`, пробел, `~`, `\u{7F}`, таб и пустая
  строка; SGR- и не-SGR-коды и смешанный текст. На неверном диапазоне они
  падают, на правильном проходят. У каждой правки шага 4, если она сделана,
  есть свой тест эквивалентности.
- **Эквивалентность: 0 расхождений** — `cmp` JSON
  `list core --json --verbose --skipped`, `cmp` восьми текстовых вариантов
  `list core`, `compare-verdicts.mjs` на `vitest-units`.
- **Выигрыш.** Текстовый `list core` (`TERM=xterm-256color`, stdout в
  `/dev/null`) быстрее main без правки минимум на 10 %: hyperfine, 1 прогрев
  + 5 прогонов, mean ± σ (медиана), интервалы не пересекаются. В PR есть
  таблица с CPU, `TERM=linux`, контролем `--json`, пиком RSS и условиями.
- `pnpm test` полностью зелёный (включая 100% coverage, `test:js`,
  `test:types`, `test:usage`, `test:spelling`).
- Изменены только `cli/terminal/get-display-width.ts` и его тест. Формат
  вывода, JSON, id и типы не меняются, JSDoc обновлён.

## Ограничения

- Скорость не покупается вердиктами: любое расхождение вердиктов с базой —
  блокер, а не компромисс. Здесь блокер и любое отличие вывода.
- Соблюдай стиль проекта: TypeScript, ESM, «одна функция — один файл», JSDoc
  на каждую функцию, `let` вместо `const` там, где так принято в проекте,
  строгий ESLint (`@azat-io/eslint-config`), cspell, knip. Прототип прошёл
  `eslint` на 170ec52 с `@azat-io/eslint-config` 2.102.0. На main стоит
  2.105.0, поэтому проверь `pnpm test:js`. Новые константы не экспортируй:
  knip отметит их как неиспользуемые экспорты.
- Не ломай публичный API (`exports` в `package.json`, типы в `types/`, формат
  конфига) без явной необходимости; если без этого нельзя — опиши компромисс.
- Сообщения коммитов — Conventional Commits (commitlint).
- Нужен pnpm 12. `pnpm-workspace.yaml` использует `configDependencies`, в CI
  стоит `latest-12` (`.github/actions/install-tools/action.yml:14`), а pnpm 10
  с репозиторием не работает.
- После `pnpm build` команда `pnpm test` даёт ложные ошибки `test:astro`.
  Причина: `tsconfig.json` включает `**/*.ts` и исключает только
  `test/fixtures` и `coverage`, поэтому в программу попадает `dist/`, а с ним
  через `types/html/inline-script.d.ts:1` — типы `vite/client`. Отсюда
  порядок: тесты шага 2 → сборка и замеры → `rm -rf dist` → полный
  `pnpm test`.
- Тесты, которые зависят от окружения и с задачей не связаны:
  - тесты в `test/cli/run-list.test.ts` и `test/cli/run-mutation.test.ts`
    ждут `●` и `→` (например, `test/cli/run-list.test.ts:167`, `:172`) и
    падают при `TERM=linux`;
  - «skips test files it cannot read»
    (`test/adapters/node-test/score-node-test.test.ts:98`) падает под root;
  - при заданном `NODE_OPTIONS` покрытие ветвей
    `adapters/node-test/start-node-test-session.ts:119`, `:167` меньше 100%.

  Поэтому запускай `env -u NODE_OPTIONS TERM=xterm-256color pnpm test:unit`.
- В коммит не входят tarball'ы, `/tmp/perf06`, скрипты сравнения и worktree
  базы.
