---
title: comparison-operator
description:
  Moves the boundary of a comparison, such as >= to >, swaps its operator or
  makes its result constant. Tests catch these mutants with values at the
  boundary and right next to it.
shortDescription: Moves the boundary of a comparison or swaps its operator.
example:
  before: 'total >= 50'
  after: 'total > 50'
keywords:
  - mutation testing
  - comparison operator
  - relational operator
  - boundary value testing
  - off-by-one error
  - javascript
  - typescript
---

This mutator moves the boundary of a comparison, as if the code were off by one:
`total >= 50` becomes `total > 50`. Its other mutants swap the operator, make
the result `true` or `false`, or move a number by one. Tests catch these mutants
with values at the boundary and right next to it, such as totals of 49, 50
and 51.

## Changes

### Swap the operator or make the result constant

Each comparison gets two or three mutants:

| Code                    | Mutants                                           |
| ----------------------- | ------------------------------------------------- |
| `price < budget`        | `price <= budget`, `price != budget`, `false`     |
| `price <= budget`       | `price < budget`, `price == budget`, `true`       |
| `price > budget`        | `price >= budget`, `price != budget`, `false`     |
| `price >= budget`       | `price > budget`, `price == budget`, `true`       |
| `price === oldPrice`    | `price <= oldPrice`, `price >= oldPrice`, `false` |
| `price !== oldPrice`    | `price < oldPrice`, `price > oldPrice`, `true`    |
| `tier === 'gold'`       | `true`, `false`                                   |
| `code in coupons`       | `true`, `false`                                   |
| `value instanceof Date` | `true`, `false`                                   |

Mootant swaps `===`, `!==`, `==` and `!=` only when one side is known to be a
number, such as a `number` parameter or a numeric literal, and the other side is
not known to be anything else. Otherwise they get `true` and `false`.

Mootant doesn't make the other swaps, such as `price > budget` for
`price < budget`: for numbers other than `NaN`, the tests that catch these
mutants also catch them.

### Move a number by one

When only one side of `<`, `<=`, `>` or `>=` is a number written in the code,
such as `50` or `-1`, Mootant moves it by one in place of `true` or `false`:

| Code                     | Mutant                  |
| ------------------------ | ----------------------- |
| `price < 5`              | `price < 4`             |
| `weight <= 20`           | `weight <= 21`          |
| `quantity > 10`          | `quantity > 11`         |
| `total >= 50`            | `total >= 49`           |
| `skus.indexOf(sku) > -1` | `skus.indexOf(sku) > 0` |

A named constant doesn't count: `quantity > LIMIT` gets `false`.

Mootant skips some of these changes in common code, such as `i < items.length` →
`i != items.length` in a loop condition, `items.length > 0` →
`items.length != 0`, and `true` or `false` for a comparison inside `&&` or `||`.
See [Skipped changes](#skipped-changes).

## Kill a surviving mutant

Test the comparison at its boundary and right next to it on both sides. Take
this function:

```ts
export function shippingCost(total: number): number {
  return total >= 50 ? 0 : 5
}
```

The mutant `total >= 50` → `total > 50` survives a test that uses a total
of 100. A test at the boundary catches it:

```ts
it('ships orders of exactly 50 for free', () => {
  expect(shippingCost(50)).toBe(0)
})
```

With the mutant, a total of 50 costs 5.

Values that catch the other mutants:

- `total >= 50` → `total == 50`: a total above 50, such as 51.
- `total >= 50` → `total >= 49`: a total equal to the new number, 49.
- `price < budget`: a price below the budget, one equal to it and one above it.
- `tier === 'gold'`, `in` and `instanceof`: one true case and one false case.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'comparison-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line comparison-operator: sampling
let sampled = Math.random() < 0.01
```

When this mutator is off, or its mutants on a line are ignored, most changes
that other mutators leave to it come back, such as `50` → `51` in `total >= 50`
and `true` and `false` for `return total >= 50` from
[return-value](/mutators/return-value). A change that this mutator would make
too stays skipped, such as `50` → `51` in `total > 50`.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                                    | Example                                                   | Rule                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)                            | `price < budget` → `false`                                | `O3`, owned                     |
| Makes a loop condition always true                                                                        | `index <= last` → `true`                                  | `loop-running`, timeout         |
| Same result, assuming a lower limit, such as 0 for a `length`                                             | `items.length > 0` → `items.length != 0`                  | `lower-bound`, equivalent       |
| Type hints show the comparison already has this result                                                    | `typeof price === 'number'` → `true`                      | `proven-comparison`, equivalent |
| May keep a loop running forever                                                                           | `packed >= quantity` → `packed == quantity` in `done = …` | `loop-advance`, timeout         |
| Compares two objects, such as dates, by identity                                                          | `start <= now` → `start == now`                           | `reference-equality`, noise     |
| Same result for equal values in `a > b ? a : b`                                                           | `price > minPrice` → `price >= minPrice`                  | `min-max-idiom`, equivalent     |
| Ends the loop at the same point                                                                           | `i !== boxes` → `i < boxes`                               | `one-way-counter`, equivalent   |
| [method-call](/mutators/method-call) removes the `sort()` call instead                                    | `a.price > b.price` → `false`                             | `O12`, owned                    |
| [boolean-literal](/mutators/boolean-literal) or [condition](/mutators/condition) makes the loop never run | `stock >= target` → `true` in `if (…) break`              | `O13`, owned                    |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-running`, `loop-advance` and `one-way-counter`. The other changes
stay skipped.

A `switch` matches its `case` labels without a comparison operator, so this
mutator leaves it alone. [number-literal](/mutators/number-literal) and
[string-literal](/mutators/string-literal) change the labels with their
`caseTests` option, on in `strict`.
