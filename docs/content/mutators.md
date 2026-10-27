---
title: Mutators
description:
  The 20 built-in mutators of Mootant, what each one changes in your code, what
  a surviving mutant tells you and why Mootant skips some changes.
keywords:
  - mutation testing
  - mutators
  - mutation operators
  - surviving mutants
  - skipped mutants
  - javascript
  - typescript
---

## Surviving mutants

A surviving mutant means that the tests did not detect its change. Before you
write a test, check that the change matters for the inputs your code can get.
The page of each mutator shows which inputs tell the two versions apart.

Some changes affect nothing a test can see, such as `count++` → `++count` in
`items.forEach(() => count++)`. Ignore such a mutant with a
[comment](#ignore-mutants).

## Skipped changes

Mootant leaves out some changes. To see them, add `--skipped`:

```sh
npx mootant list src --skipped
```

Each skipped change comes with its rule, a reason and one of these categories:

| Category     | The change                                                                        |
| ------------ | --------------------------------------------------------------------------------- |
| `equivalent` | Can't alter what the code does, apart from details such as `undefined` for `null` |
| `noise`      | Touches something Mootant leaves untested on purpose, such as a log message       |
| `timeout`    | Alters a value that decides whether a loop goes on, so it may loop forever        |
| `owned`      | Has the same effect as a mutant that Mootant makes instead                        |
| `subsumed`   | Is caught by any test that catches another mutant                                 |
| `duplicate`  | Gives the same code as an earlier mutant                                          |
| `invalid`    | Would not compile, or sits where Mootant can't switch a mutant on                 |

A category is Mootant's decision, not a proof about your code:

- Some rules rest on a guess, such as a type hint or a method name.
  `mootant list --skipped --json` marks their changes with `"heuristic": true`.
- For a coarse mutant, rule `solitary`, Mootant assumes that a test that catches
  a finer mutant inside also catches the removal. That is likely, not certain.
- Mootant builds all mutants into one copy of your code and turns them on one at
  a time. A few places, such as the operand of `delete`, can't hold that switch.

Settings that bring skipped changes back:

- [`timeouts`](/guide/configuration#timeouts) keeps the `timeout` changes, and
  [`coarseMutants`](/guide/configuration#coarsemutants) the coarse mutants.
  `strict` turns both on.
- [`loggers`](/guide/configuration#loggers) and some mutator options bring back
  other changes.
- Most `subsumed` changes come back when the other mutant does not run, for
  example because its mutator is off. `owned` changes stay skipped.

Code that Mootant never mutates, such as types, enums, decorators and module
paths, doesn't appear in the list at all.

## Turn a mutator off

Set the mutator to `'off'` in `mutators` of the
[configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'string-literal': 'off',
  },
})
```

## Ignore mutants

To ignore the mutants of a mutator on one line, put an ignore comment with its
name above the line, and the reason after a colon:

```ts
// mootant-ignore-next-line string-literal: event name
emitter.emit('change', value)
```

Reports keep ignored mutants with the reason, and the score leaves them out.

Ignoring the finer mutants of a line can bring back a coarse one. Here the line
gets `emitter.emit('change', value)` → `;` from
[statement-removal](/mutators/statement-removal). To keep it out, list both
mutators:

```ts
// mootant-ignore-next-line string-literal, statement-removal: event name
emitter.emit('change', value)
```

Other forms of the comment:

- `mootant-ignore-start` and `mootant-ignore-end` cover the lines between them.
- `mootant-ignore-file` covers the whole file.
- Without mutator names, a comment ignores the mutants of every mutator.
- In a Svelte or Vue template, write an HTML comment:
  `<!-- mootant-ignore-next-line -->`.
