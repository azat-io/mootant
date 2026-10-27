---
title: bitwise-operator
description:
  Swaps a bitwise or shift operator, such as & for |, and drops the | 0 that
  cuts the fraction off a number. Tests catch these mutants with values for
  which the two versions differ, such as flags that lack a bit of the mask.
shortDescription: Swaps a bitwise or shift operator, or drops a | 0.
example:
  before: 'flags & mask'
  after: 'flags | mask'
keywords:
  - mutation testing
  - bitwise operator
  - bitwise mutation
  - bit flags
  - bit shift
  - integer truncation
  - javascript
  - typescript
---

This mutator swaps a bitwise or shift operator, as if the code used the wrong
one: `flags & mask` becomes `flags | mask`. When `|` has the number 0 on its
right, it drops `| 0` instead, as if the code didn't cut off the fraction:
`cents | 0` becomes `cents`. Tests catch these mutants with values for which the
two versions differ, such as flags that lack a bit of the mask.

## Changes

### Swap the operator

Each operator becomes one other operator:

| Code                  | Mutant                 |
| --------------------- | ---------------------- |
| `options & EXPRESS`   | `options \| EXPRESS`   |
| `options \| EXPRESS`  | `options & EXPRESS`    |
| `options ^ GIFT_WRAP` | `options \| GIFT_WRAP` |
| `1 << level`          | `1 >> level`           |
| `cents >> 1`          | `cents << 1`           |
| `hash >>> 0`          | `hash >> 0`            |

Mootant adds parentheses where the new operator would group the code
differently: `options | mask ^ extra` becomes `options & (mask ^ extra)`.

### Drop `| 0`

When the right side of `|` is the number 0, Mootant drops `| 0` instead:
`(items / perBox) | 0` becomes `(items / perBox)`, which keeps the fraction.

## Kill a surviving mutant

Check the result with values for which the two versions differ. Take this
function:

```ts
export const GIFT_WRAP = 1
export const EXPRESS = 2

export function hasExpress(options: number): boolean {
  return (options & EXPRESS) !== 0
}
```

A test that checks only an order with express shipping does not catch
`options & EXPRESS` → `options | EXPRESS`: both versions return `true` for that
order. Check an order without express shipping:

```ts
it('returns false for an order without express shipping', () => {
  expect(hasExpress(GIFT_WRAP)).toBe(false)
})
```

With the mutant, `hasExpress(GIFT_WRAP)` returns `true`, as it does for every
order: `options | EXPRESS` is never 0.

The reverse swap, `options | EXPRESS` → `options & EXPRESS`, needs options other
than `EXPRESS`: `1 | 2` is 3, `1 & 2` is 0.

Values that tell the other changes apart:

- `options ^ GIFT_WRAP` → `options | GIFT_WRAP`: options with gift wrap.
- `1 << level` → `1 >> level`: a level from 1 to 31.
- `cents >> 1` → `cents << 1`: a whole number other than 0, such as 10.
- `hash >>> 0` → `hash >> 0`: a negative whole number, such as -1.
- `(items / perBox) | 0` → `(items / perBox)`: a division with a remainder.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'bitwise-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line bitwise-operator: random id
let cartId = (Math.random() * 2 ** 32) >>> 0
```

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                     | Example                                     | Rule                           |
| ---------------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| `<<` or `>>` by 0, or `^` with 0, gives the same result    | `cents >> 0` → `cents << 0`                 | `identity-operand`, equivalent |
| May keep a loop running forever                            | `size << 1` → `size >> 1`                   | `loop-advance`, timeout        |
| Same code as another mutant                                | `cents \| 0` → `cents` in `cents \| 0 \| 0` | `duplicate`, duplicate         |
| Vue would read the new `&…` as an HTML character reference | `options\|mask` → `options&mask`            | `template-text`, invalid       |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. The other changes stay skipped.

Compound assignments, such as `options |= mask`, belong to
[assignment-operator](/mutators/assignment-operator), and `~options` to
[unary-operator](/mutators/unary-operator).
