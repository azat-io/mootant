# Раздел 6: баги опыта пользователя, CI и агентов

> Диапазон ID: BUG-650…BUG-699. Коммит `170ec52`, пакет
> `mootant-0.1.0-170ec52.tgz`, Node.js 22.23.4, Vitest 5.1.0, npm 10.9.9.
> Проекты: `/home/user/projects/ux/*`. Подробности и контекст —
> `analysis/06-ux-and-agents.md`. Пересечения с другими разделами отмечены.

| ID | Описание | Серьёзность | Статус | Где в коде | Как воспроизвести |
| --- | --- | --- | --- | --- | --- |
| BUG-650 | Пункт главного меню сайта «Agent skill» ведёт на `/agent-skill`, такой страницы нет (404) | medium | подтверждён | `docs/components/Header.astro:15`; маршруты — `docs/pages/*` (нет `agent-skill`), `docs/public/_redirects` | `ls docs/pages docs/content/guide`; `grep -rn agent-skill docs` — одна ссылка, ни страницы, ни редиректа |
