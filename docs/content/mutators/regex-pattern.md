---
title: regex-pattern
description:
  Removes an anchor, a lookaround or an alternative of a regular expression,
  makes an optional part required or widens a class to any character. Tests
  catch these mutants with text that the two patterns match differently.
shortDescription: Changes one part of a regular expression pattern.
example:
  before: '/^\d{5}$/'
  after: '/\d{5}$/'
keywords:
  - mutation testing
  - regular expressions
  - regex
  - regex testing
  - regex anchors
  - lookahead
  - javascript
  - typescript
---

This mutator changes one part of a regular expression: `/^\d{5}$/` becomes
`/\d{5}$/`, which also matches `'A12345'`. It removes an anchor, a lookaround or
an alternative, makes an optional part required, or widens a class to any
character. Tests catch these mutants with text that the two patterns match
differently, such as `'A12345'`.

## Changes

Mootant changes regular expression literals and the pattern of a `RegExp` call
written as a string or a template. `mootant list` shows only the part that
changed, such as `\d` → `[^]` or `^` → `(empty)`.

| Change                             | Code                      | Mutant              |
| ---------------------------------- | ------------------------- | ------------------- |
| Remove `^`, `$`, `\b` or `\B`      | `/^\d{5}$/`               | `/\d{5}$/`          |
| Remove a lookahead or a lookbehind | `/\d+(?=%)/`              | `/\d+/`             |
| Remove an alternative              | `/^(?:SAVE\|FREE)\d{2}$/` | `/^(?:FREE)\d{2}$/` |
| Make an optional part required     | `/-?\d+/`                 | `/-\d+/`            |
| Make an optional part required     | `/,\s*/`                  | `/,\s+/`            |
| Widen a class to any character     | `/^[A-Z]{3}-\d{4}$/`      | `/^[^]{3}-\d{4}$/`  |
| Widen an escape to any character   | `/^\d{5}$/`               | `/^[^]{5}$/`        |

Where Mootant changes less:

- It removes alternatives from a list of more than eight only with the
  [`largeAlternations`](#largealternations) option.
- It doesn't widen a `.` or a class that already matches any character, such as
  `[\s\S]`.
- In a template with `${}`, such as ``new RegExp(`^${prefix}-\\d+$`)``, it
  removes only the `^` at the start and the `$` at the end.

The [`classMembers`](#classmembers), [`negations`](#negations) and
[`quantifiers`](#quantifiers) options, on in `strict`, add finer changes, such
as `\d` → `\D`.

## Kill a surviving mutant

Test the pattern with text that the original and the mutant treat differently.
Take this function:

```ts
export function isZipCode(code: string): boolean {
  return /^\d{5}$/.test(code)
}
```

A test that checks `'12345'` does not catch `/^\d{5}$/` → `/\d{5}$/`, because
both patterns match it. Check a code with a letter in front:

```ts
it('rejects a ZIP code with a letter in front', () => {
  expect(isZipCode('A12345')).toBe(false)
})
```

With the mutant, `isZipCode('A12345')` returns `true` instead of `false`.

Most changes make the pattern match more, as this one does, so test text it must
reject. For the others:

- An alternative removed: a test for each, such as `'SAVE10'` and `'FREE10'`.
- An optional part made required: text without it, such as `'10'` for `/-?\d+/`.
- Either of these inside a negative lookaround: text the lookaround rejects,
  such as `'SAVE10'` for `/^(?!SAVE|FREE)\w+$/`.
- With `classMembers`: text with each member of a class and each end of a range,
  such as `A` and `Z` for `[A-Z]`.
- With `quantifiers`: repeats at each bound and one past it, such as 4, 5 and 6
  digits for `\d{5}`, and an assertion on the matched text, since `.test()` may
  return `true` for both.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-pattern': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line regex-pattern: log text only
logger.info(`Search: ${query.replace(/\s+/g, ' ')}`)
```

With `strict`, `'regex-pattern': 'on'` turns the options below back off; see
[Mutators](/guide/configuration#mutators).

### classMembers

`false` by default, `true` in `strict`. With it, Mootant removes a member of a
class and narrows a range by one character at either end: `/[,;]\s*/` →
`/[;]\s*/`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-pattern': ['on', { classMembers: true }],
  },
})
```

### largeAlternations

`false` by default, `true` in `strict`. With it, Mootant also removes
alternatives from a list of more than eight:
`/^(?:AT|BE|DE|DK|ES|FR|IT|NL|PL)$/` → `/^(?:BE|DE|DK|ES|FR|IT|NL|PL)$/`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-pattern': ['on', { largeAlternations: true }],
  },
})
```

### negations

`false` by default, `true` in `strict`. With it, Mootant negates a class or an
escape and turns `\.` into `.`: `/^\d{5}$/` → `/^\D{5}$/`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-pattern': ['on', { negations: true }],
  },
})
```

### quantifiers

`false` by default, `true` in `strict`. With it, Mootant narrows a quantifier,
such as `+` to one repeat and `*` to `?`, and moves each bound by one:
`/^\d{5}$/` → `/^\d{6}$/`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-pattern': ['on', { quantifiers: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                     | Example                                                                                 | Rule                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| Removes a capturing group, which may renumber later groups | `/(\d+)%\|FREE/` → `/FREE/`                                                             | `regex-capturing-group`, noise |
| List of more than eight alternatives                       | `/^(?:AT\|BE\|DE\|DK\|ES\|FR\|IT\|NL\|PL)$/` → `/^(?:BE\|DE\|DK\|ES\|FR\|IT\|NL\|PL)$/` | `large-alternation`, noise     |
| Class already matches any character                        | `/<!--[\s\S]*?-->/g` → `/<!--[^]*?-->/g`                                                | `any-character`, equivalent    |
| Wildcard next to the anchor already runs to the edge       | `/\n[\s\S]*$/` → `/\n[\s\S]*/`                                                          | `edge-wildcard`, equivalent    |
| With `g` or `y`, may loop forever on an empty match        | `/\d+/g` → `/\d*/g` with `quantifiers`                                                  | `empty-match`, timeout         |
| Same code as another mutant                                | `/\d{1,2}%/` → `/\d%/` with `quantifiers`                                               | `duplicate`, duplicate         |
| Would not compile or would merge two tokens                | `/(\d)\1?0/` → `/(\d)\10/`                                                              | `invalid-regex`, invalid       |
| May keep a loop running forever                            | `/^sale-/i` → `/sale-/i` in `prefix = /^sale-/i`                                        | `loop-advance`, timeout        |

The [`timeouts`](/guide/configuration#timeouts) setting brings back
`empty-match` and `loop-advance`, and the
[`largeAlternations`](#largealternations) option brings back
`large-alternation`; `strict` turns on both. The other changes stay skipped.

The flags belong to [regex-flag](/mutators/regex-flag).
