---
title: boolean-literal
description:
  Flips true to false and false to true, as in a flag or a default value. Tests
  catch it with a case where the literal decides the result, such as a call that
  relies on a default.
shortDescription: Flips true to false and false to true.
example:
  before: 'let freeShipping = false'
  after: 'let freeShipping = true'
keywords:
  - mutation testing
  - boolean literal
  - boolean mutation
  - true and false
  - default values
  - javascript
  - typescript
---

This mutator flips a boolean literal, as if a flag or a default were set the
wrong way: `let freeShipping = false` becomes `let freeShipping = true`. Tests
catch it with a case where the literal decides the result, such as a call of
`shippingCost()` that relies on the default `express = false`.

## Changes

Each `true` becomes `false`, and each `false` becomes `true`:

| Code                                | Mutant                              |
| ----------------------------------- | ----------------------------------- |
| `let freeShipping = false`          | `let freeShipping = true`           |
| `let options = { giftWrap: true }`  | `let options = { giftWrap: false }` |
| `applyCoupon(cart, true)`           | `applyCoupon(cart, false)`          |
| `function quote(express = false) {` | `function quote(express = true) {`  |
| `while (true)`                      | `while (false)`                     |

Mootant leaves alone a literal in a comparison, such as `true` in
`inStock === true`. It also leaves alone the two results of one condition, as in
`inStock ? true : false` or in `if (inStock) { return true }` before
`return false`; see [Skipped changes](#skipped-changes).

## Kill a surviving mutant

Write a test in which the literal decides the result. Take this function:

```ts
export function shippingCost(express = false): number {
  return express ? 15 : 5
}
```

The mutant `express = false` → `express = true` survives tests that always pass
`express`, such as `shippingCost(true)` and `shippingCost(false)`: they never
use the default. Call the function without the argument:

```ts
it('uses standard shipping by default', () => {
  expect(shippingCost()).toBe(5)
})
```

With the mutant, `shippingCost()` returns 15 instead of 5.

Literals in other places need other tests:

- `let soldOut = false` that a loop may set: test a cart with nothing sold out.
- `while (true)`: check a result of the loop, which `while (false)` never runs.
- `true` in `applyCoupon(cart, true)`: check a result that `false` would change.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'boolean-literal': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line boolean-literal: debug output only
let verbose = false
```

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                | Example                                                                     | Rule                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| Same result as a `true` or `false` of another mutator                                 | `true` → `false` in `inStock ? true : false`                                | `O19`, owned               |
| Literal in a comparison, left to [comparison-operator](/mutators/comparison-operator) | `true` → `false` in `inStock === true`                                      | `O4`, subsumed             |
| Left to a finer mutant of the condition                                               | `true` → `false` in `price < 10 ? true : false`                             | `R5`, subsumed             |
| May keep a loop running forever                                                       | `true` → `false` in `paid = true` inside `while (!paid)`                    | `loop-advance`, timeout    |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)        | `false` → `true` in `if (vip \|\| false)`                                   | `O3`, owned                |
| Makes a loop condition always true                                                    | `false` → `true` in `do { send() } while (false)`                           | `loop-running`, timeout    |
| [logical-operator](/mutators/logical-operator) swaps `\|\|` for `??` instead          | `true` → `false` in `let send = receipt \|\| true` with `receipt?: boolean` | `R7`, subsumed             |
| [method-call](/mutators/method-call) removes the `sort()` call instead                | `true` → `false` in a `sort` comparator                                     | `O12`, owned               |
| Operand of `void`, whose value is always `undefined`                                  | `true` → `false` in `void true`                                             | `void-operand`, equivalent |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance` and `loop-running`. `R5` and `R7` come back when the finer
mutant doesn't run: its mutator is off or ignored on that line. The other
changes stay skipped.
