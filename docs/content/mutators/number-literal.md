---
title: number-literal
description:
  Adds one to a number, such as a limit, an index or a rate. Tests catch these
  mutants with inputs for which the old and the new number give different
  results.
shortDescription: Adds one to a number.
example:
  before: 'FREE_SHIPPING_FROM = 50'
  after: 'FREE_SHIPPING_FROM = 51'
keywords:
  - mutation testing
  - number literal
  - numeric literal
  - number mutation
  - off-by-one error
  - javascript
  - typescript
---

This mutator adds one to a number, as if the code were off by one:
`FREE_SHIPPING_FROM = 50` becomes `FREE_SHIPPING_FROM = 51`. Tests catch these
mutants with inputs for which the two numbers give different results, such as an
order total of exactly 50.

## Changes

Each number goes up by 1:

| Code                      | Mutant                    |
| ------------------------- | ------------------------- |
| `FREE_SHIPPING_FROM = 50` | `FREE_SHIPPING_FROM = 51` |
| `TAX_RATE = 0.2`          | `TAX_RATE = 1.2`          |
| `REFUND = -5`             | `REFUND = -4`             |
| `items[items.length - 1]` | `items[items.length - 2]` |
| `Math.min(stock, 10)`     | `Math.min(stock, 11)`     |
| `price.toFixed(2)`        | `price.toFixed(3)`        |
| `PRICE_CENTS = 1999n`     | `PRICE_CENTS = 2000n`     |

Decimals go up by a whole 1 too: `0.2` becomes `1.2`. A minus sign that makes a
number negative counts as part of it, so `-5` becomes `-4`, not `-6`. In
`items[items.length - 1]`, the 1 becomes 2, so the mutant reads the item before
the last one.

Mootant skips some numbers in common code, such as timer delays and `case`
labels. It leaves the numbers of a comparison, such as `10` in `quantity > 10`,
to [comparison-operator](/mutators/comparison-operator). See
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the exact result with input for which the old and the new number give
different results. Take this function, which gives 10% off with a cap of 20:

```ts
export function couponDiscount(total: number): number {
  return Math.min(total * 0.1, 20)
}
```

A test that expects a discount of 10 for an order of 100 catches `0.1` → `1.1`.
It does not catch `20` → `21`: a discount of 10 stays under the cap, so both
versions return 10. Test an order whose discount goes over the cap:

```ts
it('caps the discount at 20', () => {
  expect(couponDiscount(500)).toBe(20)
})
```

With the mutant `20` → `21`, `couponDiscount(500)` returns 21 instead of 20.

Numbers in other places need other tests:

- An index, such as `items.length - 1`: a list whose items differ.
- A default value, such as `quantity = 1`: a call without that argument.
- A rate, such as `TAX_RATE = 0.2`: an amount such as 100, not 0.
- Decimal places, such as `toFixed(2)`: the whole string, checked with `toBe`.
- A `case` label, with `caseTests`: the value of the label, such as `1`.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'number-literal': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line number-literal: analytics sampling
export const SAMPLE_RATE = 0.1
```

When this mutator is off, or its mutants on a line are ignored, a coarser mutant
can come back, such as `return 0` → `;` from
[statement-removal](/mutators/statement-removal).

`['on', options]` merges the options over the
[defaults of the mutator](/guide/configuration#mutators), not over the options
of the preset: with `strict`, `'number-literal': 'on'` turns `caseTests` back
off.

### caseTests

`false` by default, `true` in `strict`. With `true`, Mootant also changes the
numbers of `case` labels, such as `1` → `2` in `case 1:`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'number-literal': ['on', { caseTests: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                                | Example                                                   | Rule                          |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| Literal in a comparison, left to [comparison-operator](/mutators/comparison-operator)                 | `10` → `11` in `quantity >= 10`                           | `O4`, subsumed                |
| [comparison-operator](/mutators/comparison-operator) moves the number by one instead                  | `10` → `11` in `quantity > 10`                            | `shifted-literal`, owned      |
| Delay of a timer, made of literals                                                                    | `1000` → `1001` in `setTimeout(run, 1000)`                | `timer-delay`, noise          |
| Value of a `case` label                                                                               | `1` → `2` in `case 1:`                                    | `case-label`, noise           |
| Same result as a `true` or `false` of another mutator                                                 | `1` → `2` in `express ? 1 : 2`                            | `O19`, owned                  |
| Copies the other branch, as [comparison-operator](/mutators/comparison-operator) does at the boundary | `1` → `2` in `quantity > 6 ? 2 : 1`                       | `R5`, subsumed                |
| Same sign, and `sort()` reads only the sign                                                           | `1` → `2` in `a.price > b.price ? 1 : -1`                 | `comparator-sign`, equivalent |
| [method-call](/mutators/method-call) removes the `slice()` call instead                               | `-1` → `0` in `sku.slice(-1)`                             | `O18`, owned                  |
| Operand of `void`, whose value is always `undefined`                                                  | `0` → `1` in `void 0`                                     | `void-operand`, equivalent    |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)                        | `0` → `1` in `filter(product => product.stock \|\| 0)`    | `O3`, owned                   |
| Key of an object or a class                                                                           | `1` → `2` in `{ [1]: 'Standard' }`                        | `property-key`, noise         |
| Same truth value in a condition                                                                       | `1` → `2` in `while (1)`                                  | `same-truth`, equivalent      |
| Makes a loop condition always true                                                                    | `0` → `1` in `do { … } while (0)`                         | `loop-running`, timeout       |
| May keep a loop running forever                                                                       | `0` → `1` in `attempts = 0` inside `while (attempts > 0)` | `loop-advance`, timeout       |
| [method-call](/mutators/method-call) removes the `sort()` call instead                                | `-1` → `0` in `return -1`                                 | `O12`, owned                  |
| [logical-operator](/mutators/logical-operator) drops the default instead                              | `-1` → `0` in `stock \|\| -1`                             | `O16`, owned                  |
| [logical-operator](/mutators/logical-operator) swaps `\|\|` for `??` instead                          | `-1` → `0` in `limit \|\| -1`                             | `R7`, subsumed                |

The [`timeouts`](/guide/configuration#timeouts) setting brings back
`loop-running` and `loop-advance`, and [`caseTests`](#casetests) brings back
`case-label`; `strict` turns both on. `O4`, `R5` and `R7` come back when the
other mutant does not run, for example when its mutator is off. The other
changes stay skipped.
