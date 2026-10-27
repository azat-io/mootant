---
title: regex-flag
description:
  Removes a flag of a regular expression, such as i or g, as if it had been
  forgotten. Tests catch the change with text for which the flag changes the
  result, such as letters in another case for i.
shortDescription: Removes a flag of a regular expression.
example:
  before: '/^save\d+$/i'
  after: '/^save\d+$/'
keywords:
  - mutation testing
  - regular expression
  - regex flags
  - case-insensitive
  - global flag
  - multiline
  - javascript
  - typescript
---

This mutator removes a flag of a regular expression, as if it had been
forgotten: `/^save\d+$/i` becomes `/^save\d+$/`, which no longer matches
`'SAVE10'`. Tests catch these mutants with text for which the flag changes the
result, such as `'SAVE10'` for this `i`, or text with two matches for `g`.

## Changes

Mootant changes the flags of regular expression literals and of `RegExp` calls,
such as `new RegExp('^promo-', 'i')`. A call counts only when its pattern and
any flags are written in it without `${}`. In `mootant list`, a mutant shows the
flags alone, such as `gm` → `m`.

| Code                        | Mutant                     | Without the flag                                            |
| --------------------------- | -------------------------- | ----------------------------------------------------------- |
| `/^save\d+$/i`              | `/^save\d+$/`              | Letters match only in the case written                      |
| `/^SKU-\d+$/m`              | `/^SKU-\d+$/`              | `^` and `$` match only at the start and the end of the text |
| `/<note>.*<\/note>/s`       | `/<note>.*<\/note>/`       | `.` doesn't match a line break                              |
| `name.replace(/\s+/g, '-')` | `name.replace(/\s+/, '-')` | Only the first match is replaced                            |
| `text.match(/#\w+/g)`       | `text.match(/#\w+/)`       | Only the first match is returned, with its groups           |

- Mootant removes `g` only from a regular expression written as the first
  argument of `.replace()` or `.match()`. One in a variable keeps its `g`.
- The `u`, `v`, `y` and `d` flags stay as they are.
- A flag that changes nothing, such as `i` in `/^\d{5}$/i`, stays; see
  [Skipped changes](#skipped-changes).
- With the [`additions`](#additions) option, on in `strict`, Mootant also adds
  `i` and `g`.

## Kill a surviving mutant

Test with text for which the flag changes the result. Take this function:

```ts
export function isCouponCode(code: string): boolean {
  return /^save\d+$/i.test(code)
}
```

A test with the coupon code `'save10'` does not catch `/^save\d+$/i` →
`/^save\d+$/`, because both versions accept it. Test a coupon code in capitals:

```ts
it('accepts a coupon code in capitals', () => {
  expect(isCouponCode('SAVE10')).toBe(true)
})
```

With the mutant, `isCouponCode('SAVE10')` returns `false`.

Text that tells the other changes apart:

- `m` removed: the match on a middle line, such as `'Mug\nSKU-123\nCup'`.
- `s` removed: a line break that `.` must match.
- `g` removed: two or more matches, and an assertion on the whole result.
- `i` added: text in another letter case that the code must reject, such as
  `'sale-10'` for `/^SALE-\d+$/`.
- `g` added: two or more matches, of which the code must replace only the first.

If the code lowercases the text before `/^save\d+$/i`, the `i` changes nothing,
and no test can catch its removal: remove the `i`, or ignore the mutant as
[Configuration](#configuration) shows. The same holds for a `g` that `additions`
adds to a pattern that matches at most once, such as `/^#/`: ignore that mutant.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-flag': 'off',
  },
})
```

With the mutator off, [string-literal](/mutators/string-literal) empties the
flags of a `RegExp` call instead: `'i'` → `''` in `new RegExp('^promo-', 'i')`.

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
export function isCouponCode(input: string): boolean {
  let code = input.trim().toLowerCase()
  // mootant-ignore-next-line regex-flag: the code is lowercased above
  return /^save\d+$/i.test(code)
}
```

With `strict`, `'regex-flag': 'on'` turns `additions` back off; see
[Mutators](/guide/configuration#mutators).

### additions

`false` by default, `true` in `strict`. With it, Mootant also adds `i` to a
regular expression where letter case can matter, and `g` to one in the first
argument of `.replace()`: `/^SALE-\d+$/` → `/^SALE-\d+$/i`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'regex-flag': ['on', { additions: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                | Example                                          | Rule                          |
| ----------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| The flag changes nothing, such as `i` with no letters | `/^\d{5}$/i` → `/^\d{5}$/`                       | `unused-flag`, equivalent     |
| `^` or `$` lets the pattern match only once           | `/\s+$/g` → `/\s+$/` in `.replace()`             | `anchored-global`, equivalent |
| May keep a loop running forever                       | `/^sale-/i` → `/^sale-/` in `prefix = /^sale-/i` | `loop-advance`, timeout       |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. The other changes stay skipped.

The pattern belongs to [regex-pattern](/mutators/regex-pattern).
