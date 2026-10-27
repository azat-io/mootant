---
title: condition
description:
  Makes a condition always true or always false, such as the test of an if, a
  ternary or a loop. Tests catch it with an input for each outcome and a check
  of a result that depends on the condition.
shortDescription: Forces a condition to true or false.
example:
  before: 'if (cart.coupon)'
  after: 'if (true)'
keywords:
  - mutation testing
  - conditional expression
  - branch coverage
  - if statement
  - ternary operator
  - boolean negation
  - javascript
  - typescript
---

This mutator makes a condition always true or always false: `if (cart.coupon)`
becomes `if (true)` in one mutant and `if (false)` in another. The `true` mutant
stands for a missing check, and the `false` mutant for a branch that never runs.
Tests catch them with an input for each outcome, such as a cart with a coupon
and one without, and a check of a result that depends on the condition.

## Changes

Mootant forces these conditions to `true` or `false`:

| Code                    | Mutants                              | Where                       |
| ----------------------- | ------------------------------------ | --------------------------- |
| `if (cart.coupon)`      | `if (true)` and `if (false)`         | Test of an `if`             |
| `cart.express ? 15 : 5` | `true ? 15 : 5` and `false ? 15 : 5` | Test of a ternary           |
| `while (page.length)`   | `while (false)`                      | Test of a loop              |
| `!product.inStock`      | `true` and `false`                   | A `!` outside a test        |
| `for (;;)`              | `for (;false;)`                      | A `for` loop without a test |

A loop test also becomes `true` with the
[`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, since
`true` may keep the loop running forever. The same goes for `false` in an `if`
that leaves an endless loop, such as `if (done) break` in `while (true)`.

A comparison, a `&&` or `||` group or a literal, also with `!` in front, gets no
mutant of this mutator, and neither does a `!` on a side of `&&` or `||`. Their
own mutators change them instead:
[comparison-operator](/mutators/comparison-operator),
[logical-operator](/mutators/logical-operator) and the literal mutators, such as
[boolean-literal](/mutators/boolean-literal).

## Kill a surviving mutant

Test the code once with the condition true and once with it false, and check a
result that depends on it. Take this function:

```ts
export function cartTotal(subtotal: number, coupon?: string): number {
  if (coupon) {
    return subtotal - 10
  }
  return subtotal
}
```

Tests that always pass a coupon do not catch `coupon` → `true`: with a coupon,
the condition is already true. A test without a coupon catches it:

```ts
it('charges the full subtotal without a coupon', () => {
  expect(cartTotal(50)).toBe(50)
})
```

With the mutant, `cartTotal(50)` returns 40 instead of 50.

Tests that catch the other changes:

- `coupon` → `false`: a test with a coupon, such as
  `expect(cartTotal(50, 'SAVE10')).toBe(40)`.
- A loop test → `false` and `for (;;)` → `for (;false;)`: a test in which the
  loop body runs and changes the result. A `do...while` body must run at least
  twice.
- `!product.inStock` → `true` and `false` in a `filter()` callback: a list with
  one product in stock and one sold out, and a check of the whole result.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    condition: 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line condition: dev-only warning
if (import.meta.env.DEV) {
  warnAboutPrices(cart)
}
```

Turning this mutator off or ignoring it doesn't bring back the changes that rule
`O19` skips: changes of other mutators that do the same as its `true` or
`false`. For example, [statement-removal](/mutators/statement-removal) still
doesn't remove `applyCoupon(order)` in `if (order.coupon) applyCoupon(order)`,
so that line gets no mutant at all.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                  | Example                                               | Rule                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Comparison, group or literal, left to its own mutator                                   | `code === 'SALE'` → `true`                            | `O1`, owned                     |
| [comparison-operator](/mutators/comparison-operator) gives this value on some inputs    | `stockCount > 0` → `true`                             | `comparison-region`, subsumed   |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)          | `!isMember` → `false`                                 | `O3`, owned                     |
| Makes a loop condition always true                                                      | `page.length` → `true` in `while (page.length)`       | `loop-running`, timeout         |
| May keep a loop running forever                                                         | `!hasMore()` → `false` in `done = !hasMore()`         | `loop-advance`, timeout         |
| Literal test, left to its mutator, such as [boolean-literal](/mutators/boolean-literal) | `true` → `false` in `while (true)`                    | `O7`, owned                     |
| Same as making the loop test `false`                                                    | `stock.isEmpty()` → `true` at the start of `for (;;)` | `O13`, owned                    |
| Type hints show the condition already has this value                                    | `products` → `true` for `products: Product[]`         | `typed-constant`, equivalent    |
| Another `??` mutant gives this value on some inputs                                     | `express ?? false` → `true`                           | `R3`, subsumed                  |
| [method-call](/mutators/method-call) removes the `sort()` call instead                  | `a.featured` → `false` in `sort()`                    | `O12`, owned                    |
| Type hints show the comparison already has this result                                  | `typeof sku === 'string'` → `true`                    | `proven-comparison`, equivalent |
| Same result, assuming a lower limit, such as 0 for a `length`                           | `cart.items.length >= 0` → `true`                     | `lower-bound`, equivalent       |
| The literal already has this truth value                                                | `1` → `true` in `if (1)`                              | `literal-truth`, equivalent     |
| Literal test, taken as written on purpose                                               | `1` → `false` in `if (1)`                             | `constant-test`, noise          |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-running` and `loop-advance`. `R3` comes back when the other mutant
doesn't run, for example because its mutator is off. The other changes stay
skipped.

A returned boolean, such as `return product.inStock`, belongs to
[return-value](/mutators/return-value).
