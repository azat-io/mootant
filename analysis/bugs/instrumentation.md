# Инструментирование (mutant switching): корректность

> Раздел 2 анализа, подраздел «Инструментирование». Коммит 170ec52.
> Диапазон ID: BUG-100…BUG-199. Черновик — пополняется по ходу работы.

## Сводка (черновик)

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-100 | Если упавшие в dry run тесты не дошли ни до одного сайта, `instrumentation-break` получают **все** switched-файлы прогона (ложная диагностика у невиновных файлов, все мутанты `Error`) | medium | подтверждён | `core/run/run-dry-phase.ts:505-517` (+ `:275-296`) | `test/repros/BUG-100.test.ts`, `test/repros/BUG-100/run.sh` |
| BUG-101 | Проверка сайта `globalThis.__mootant?.hit()` не гигиенична: привязка с именем `globalThis` в области видимости → TDZ/TypeError при загрузке или мутант никогда не включается | low | подтверждён | `core/instrument/get-site-check.ts:11-13` | `test/repros/BUG-101.test.ts`, trap t15/t16 |
| BUG-102 | Switched-текст сдвигает строки и колонки, а Vitest-плагин возвращает `map: null` (Vite считает это тождественным отображением) → неверные номера строк в stack trace; тест, читающий номер строки, роняет dry run → все мутанты файла `Error` | low | подтверждён | `core/instrument/instrument-file.ts:44`, `adapters/vitest/create-mootant-plugin.ts:49` | `test/repros/BUG-102.test.ts`, `test/repros/BUG-102/run.sh` |
| BUG-103 | При активном мутанте logical-operator, оставляющем анонимную функцию/класс в инициализаторе, теряется вывод имени (`g.name` `''` вместо `'g'`), физически применённый мутант имя получает | low | подтверждён | `core/instrument/render-mutant-range.ts:91-95` | `test/repros/BUG-103.test.ts`, trap t07 |

## Отрицательные результаты (пока)

- I1 (switched-текст парсится oxc, проходит transformWithOxc и компилируется
  V8; у каждого мутанта ровно один сайт; физически применённый мутант
  парсится): 0 нарушений на 46 567 мутантах (strict) в 906 файлах — Mootant
  core/adapters/cli (35 262), eslint-plugin-perfectionist (10 146), ufo
  (1 095), defu (64); плюс express 1 225, qs 1 735, zustand 553.
- I2 (весь тест-сьют на switched-файлах без runtime и с active=null): ufo
  487 тестов, defu 23 теста — 0 расхождений.
- Ловушки (14 модулей, 812 мутантов): hoisting/Annex B, TDZ, директивы,
  sloppy/strict `this`, `arguments`, `with`, eval, callee с `this`, приватные
  методы, optional chaining, delete/typeof, классы/`super`/`new.target`/static
  blocks, генераторы/async/for await, ASI, деструктуризация с дефолтами,
  порядок вычисления, labels/switch, TS (parameter properties, `as`,
  `satisfies`, `!`, `<T>x`, enum), геттеры/сеттеры/`__proto__`/computed keys,
  `export default` — расхождений нет, кроме имён функций (BUG-103).
