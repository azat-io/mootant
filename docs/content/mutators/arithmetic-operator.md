---
title: arithmetic-operator
description:
  Swaps the operator of a calculation, such as * for /, and drops the right side
  of a + that may join strings. Tests catch these mutants with values for which
  the two versions differ, such as a price of 10 and a quantity of 3.
shortDescription: Swaps an arithmetic operator or drops the right side of a +.
example:
  before: 'price * quantity'
  after: 'price / quantity'
keywords:
  - mutation testing
  - arithmetic operator
  - arithmetic mutation
  - math operators
  - string concatenation
  - javascript
  - typescript
---

This mutator swaps the operator of a calculation, as if the code used the wrong
one: `price * quantity` becomes `price / quantity`. When a `+` may join strings,
it drops the right side instead, so `name + sku` becomes `name`. Tests catch
these mutants with values for which the two versions differ, such as a price of
10 and a quantity of 3.

## Changes

### Swap the operator

Each operator becomes one other operator:

| Code                  | Mutant                |
| --------------------- | --------------------- |
| `subtotal + shipping` | `subtotal - shipping` |
| `paid - total`        | `paid + total`        |
| `price * quantity`    | `price / quantity`    |
| `total / count`       | `total * count`       |
| `items % perBox`      | `items * perBox`      |
| `side ** 2`           | `side * 2`            |

Mootant swaps `+` for `-` only when one side is known to be a number, such as a
`number` parameter or a numeric literal, and the other side is not known to be
anything else. In plain JavaScript, `total + 1` still becomes `total - 1`.

### Drop the right side

Any other `+` may join strings, so Mootant drops its right side:

| Code                                | Mutant |
| ----------------------------------- | ------ |
| `name + sku`, both strings          | `name` |
| `a + b` in JavaScript with no types | `a`    |

Error messages get no drop, and a string literal on the right, such as
`' (sale)'`, is left to [string-literal](/mutators/string-literal); see
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the result with values for which the two versions differ. Take this
function:

```ts
export function lineTotal(price: number, quantity: number): number {
  return price * quantity
}
```

A test that buys one item does not catch `price * quantity` →
`price / quantity`, because `10 * 1` and `10 / 1` are both 10. Buy more than
one:

```ts
it('multiplies the price by the quantity', () => {
  expect(lineTotal(10, 3)).toBe(30)
})
```

With the mutant, `lineTotal(10, 3)` returns about 3.33 instead of 30.

Values that tell the other changes apart, for finite numbers:

- `+` and `-`: a right side other than 0.
- `*` and `/`: a left side other than 0 and a right side other than 1 and -1.
- `items % perBox` → `items * perBox`: whole numbers with a left side other
  than 0. Fractions may give the same result: `0.5 % 1` and `0.5 * 1` are both
  0.5.
- `side ** 2` → `side * 2`: a side other than 0 and 2. With 3, `side ** 2` is 9
  and `side * 2` is 6.
- A dropped right side, such as `name + sku` → `name`: a non-empty string or a
  number other than 0 on the right, and an assertion on the whole result.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'arithmetic-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line arithmetic-operator: random jitter
let delay = base + Math.random() * 100
```

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                         | Example                                     | Rule                           |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| Text of an error message, such as in `new Error()`                                             | `'Unknown ' + id` → `'Unknown '`            | `error-message`, noise         |
| Delay of a timer, made of literals                                                             | `1000 * 60` → `1000 / 60`                   | `timer-delay`, noise           |
| May keep a loop running forever                                                                | `index + 1` → `index - 1`                   | `loop-advance`, timeout        |
| 1 or -1 on the right gives the same result                                                     | `price * 1` → `price / 1`                   | `identity-operand`, equivalent |
| 0 on the right of a number gives the same result                                               | `price + 0` → `price - 0`                   | `numeric-identity`, equivalent |
| [string-literal](/mutators/string-literal) empties the string instead, except in a timer delay | `name + ' (sale)'` → `name`                 | `O11`, owned                   |
| [unary-operator](/mutators/unary-operator) removes the `-` instead                             | `price - -discount` → `price + -discount`   | `O14`, owned                   |
| Same code as another mutant                                                                    | `base + sep` → `base` in `base + sep + sep` | `duplicate`, duplicate         |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. The other changes stay skipped.

Compound assignments, such as `total += price`, and updates, such as `count++`,
belong to [assignment-operator](/mutators/assignment-operator) and
[update-operator](/mutators/update-operator).
