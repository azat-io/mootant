# Инструментирование (mutant switching): корректность

> Раздел 2 анализа, подраздел «Инструментирование». Коммит 170ec52.
> Диапазон ID: BUG-100…BUG-199. Работа в процессе — файл пополняется по ходу.

## Статус работы

- [x] Чтение кода core/instrument, core/generate/validate-replacement.ts,
      core/syntax/is-value-position.ts, core/tree/index-tree.ts, адаптеров.
- [x] Фикстуры-ловушки (14 модулей, 812 мутантов): original vs switched
      без runtime vs active=null; active=X vs физически применённый X.
- [ ] I1 на корпусе (core/ Mootant + внешние проекты).
- [ ] I2/I3 на реальном проекте с тестами.
- [ ] I4 детерминизм.

## Предварительные находки

- Вывод имени функции (NamedEvaluation) теряется при активном мутанте
  logical-operator, оставляющем анонимную функцию/класс (`let g = flag ||
  function () {}` → физически `g.name === 'g'`, в switched `''`). 9 мутантов из
  59 в t07-names. Подтверждено trap-run.
