# Раздел 6: баги опыта пользователя, CI и агентов

> Диапазон ID: BUG-650…BUG-699. Коммит `170ec52`, пакет
> `mootant-0.1.0-170ec52.tgz`, Node.js 22.23.4, Vitest 5.1.0, npm 10.9.9.
> Проекты: `/home/user/projects/ux/*`. Контекст — `analysis/06-ux-and-agents.md`.
> Сюда не вошли находки, у которых уже есть ID в других разделах; они
> перечислены в конце со ссылками.

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-650 | Пункт главного меню сайта «Agent skill» ведёт на `/agent-skill`, такой страницы нет (404 на каждом визите по ссылке) | medium | подтверждён | `docs/components/Header.astro:15`; маршруты — `docs/pages/*` (нет `agent-skill`), `docs/public/_redirects` (нет редиректа), `astro.config.ts` (`srcDir: './docs'`) | `ls docs/pages docs/content/guide`; `grep -rn agent-skill docs` — одна ссылка, ни страницы, ни редиректа |
| BUG-651 | Документированная установка skill `npx skills add azat-io/mootant` (getting-started.mdx:142, `docs/components/Skill.astro:39`) падает: в репозитории нет ни одного `SKILL.md` | high | подтверждён | нет файла `skills/mootant/SKILL.md`; обещание — `docs/content/guide/getting-started.mdx:136-145`, `docs/components/Skill.astro:22-41`, `package.json:4` (`description`) | в пустом каталоге `npx -y skills@1.7.6 add azat-io/mootant` → «No skills found … Skills require a SKILL.md with name and description», exit 1 (`analysis/ux/skills-add-output.txt`) |
| BUG-652 | Команды перепроверки печатаются без запускателя пакетов: `re-check one: mootant run src --mutant 69kd`, поле `recheck` в JSON, «Run it again» и подсказка на обзоре HTML. При локальной установке (как велит документация) скопированная строка даёт `mootant: command not found`; документация в том же месте пишет `npx mootant …`, а `skill-session.ansi` показывает агента, вызывающего `mootant` без `npx` | medium | подтверждён | `cli/report/format-command.ts:77` (`['mootant', command, …]`; JSDoc там же обещает «the line can be copied and run»), `cli/report/format-run-text-report.ts:173`, `cli/report/build-run-report.ts:101-104`, `cli/html/client/render-mutant-panel.ts:197`, `cli/html/client/unpack-run-report.ts:68-71`, `docs/components/skill-session.ansi` | `npm i -D vitest@5 <mootant>`; тесты; `npx mootant run src`; скопировать строку `re-check one:` в bash → `bash: mootant: command not found` |
| BUG-653 | Документированная установка `npm install -D mootant` ставит заглушку `mootant@0.0.0` (OIDC trusted publishing, «DO NOT USE THIS PACKAGE», без `bin`); `npx mootant run src` → `npm error could not determine executable to run`. Установка из GitHub тоже не работает: нет `dist/` и `prepare` | critical | подтверждён | `readme.md:77-78`, `docs/content/guide/getting-started.mdx:65-69`; `package.json` (`files: ["./bin", "./dist"]`, нет `prepare`) | `npm view mootant` → `latest: 0.0.0`; в пустом проекте `npm install -D mootant && npx mootant run src` → exit 1 |

## Находки с ID в других разделах (не дублирую)

- BUG-407 (`bugs/cache-since.md`, medium): штамп сборки из `mtimeMs` сбрасывает
  кэш после переустановки. Здесь — независимое подтверждение в сценарии
  GitHub Actions: `npm ci` → прогон → сохранить `node_modules/.cache/mootant` →
  `npm ci` → восстановить → 0 из 67 вердиктов; после `touch -d` на файлах
  пакета — 67 из 67; с pnpm из того же store кэш жив, из нового — нет
  (`analysis/ux/ci-cache-check.txt`). Предлагаю серьёзность high: с `npm ci`
  кэш вердиктов в CI не работает никогда, а readme обещает кэш для CI.
- BUG-418 (`bugs/cache-since.md`, low): прерванный прогон не сохраняет
  вердиктов. Повторено (SIGINT через 12 с, exit 130, файла кэша нет). В CI с
  `timeout-minutes` это теряет всю работу длинного прогона.
- `--json` при ошибке не печатает JSON и код выхода 1 у всех неудач —
  документировано (`docs/content/guide/cli.mdx:125-126`), поэтому это не баг,
  а рекомендация R5 в `06-ux-and-agents.md`.
