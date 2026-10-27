---
title: return-value
description:
  Replaces the value a function returns with a fixed value that depends on its
  type, such as 0, an empty string, an empty array or undefined. Tests catch it
  with an exact check of the result, for an input where the function returns
  something else.
shortDescription:
  Replaces a returned value with a fixed value picked by its type.
example:
  before: 'cart.items.length'
  after: '0'
keywords:
  - mutation testing
  - return value
  - return statement
  - empty value
  - boolean result
  - promise
  - javascript
  - typescript
---

This mutator makes a function return a fixed value, such as `0`, `''`, `[]` or
`undefined`, in place of its result; type hints decide which.
`return cart.items.length` becomes `return 0`, as if the function lost the count
it computed. Tests catch it with an input for which the function returns
something else, such as a cart with items, and a check of the exact value.

## Changes

### Return a fixed value

In a `return` statement and in an arrow function without braces, the returned
value becomes a fixed value that Mootant picks from type hints:

| Code                | Mutant             | Type                         |
| ------------------- | ------------------ | ---------------------------- |
| `product.name`      | `''`               | String                       |
| `cart.items.length` | `0`                | Number                       |
| `order.cents`       | `0n`               | BigInt                       |
| `cart.items`        | `[]`               | Array                        |
| `hasCoupon(cart)`   | `true` and `false` | Boolean                      |
| `lookup(sku)`       | `undefined`        | Any other, such as an object |

Mootant reads the type from an annotation or from the return type of the
function. When neither is known, the mutant is `undefined`: for `product.name`
in a JavaScript file, or in `products.map(product => product.name)`, where
`product` has no annotation. An `async` function gets the plain value, such as
`0`, not a promise.

The result of a callback of `filter`, `some`, `every` or a `find` method counts
as a boolean: `product.stock` becomes `true` and `false` in
`products.some(product => product.stock)`. A returned comparison, `!`, `&&` or
`||` usually gets neither: Mootant skips one or both when a test that catches
another mutant also catches this change. [Skipped changes](#skipped-changes)
says which come back.

### Remove what a void function does

In a function that returns `void`, or `Promise<void>` when it is `async`, the
mutant `undefined` removes what the returned expression does:

- `addToCart(cart, product)` → `undefined` in an arrow function that returns
  `void`, so the product is never added.
- `this.loading` → `undefined` in `async whenReady(): Promise<void>`, so the
  function no longer waits for `this.loading`.

### Return a resolved promise

A function that returns `Promise<T>` without `async` gets a promise resolved
with a fixed value that Mootant picks from `T`:

| Code               | Mutant                    | Return type                |
| ------------------ | ------------------------- | -------------------------- |
| `fetchStock(sku)`  | `Promise.resolve(0)`      | `Promise<number>`          |
| `fetchProduct(id)` | `Promise.resolve(null)`   | `Promise<Product \| null>` |
| `loadCart(id)`     | `Promise.resolve(void 0)` | `Promise<Cart>`            |

`void 0` is `undefined`.

### Skip a value with a finer mutant inside

In `recommended`, a returned value with a finer mutant inside, such as
`price * quantity`, gets no mutant of this mutator, unless it is a boolean. The
same goes for a returned local variable, or a property of it, when its initial
value or a later assignment holds a finer mutant, such as `sum` after
`let sum = 0`.

This skip rests on a guess: a test that catches `price / quantity` also catches
`0`. The guess can fail: for a function that sums a list, a test with an empty
list catches `0` → `1` in `let sum = 0`, but not `sum` → `0`. The
[`coarseMutants`](/guide/configuration#coarsemutants) setting brings these
mutants back.

## Kill a surviving mutant

Check the exact value that the function returns, with an input for which it
returns something other than the mutant's value. Take this function:

```ts
interface Cart {
  items: string[]
}

export function itemCount(cart: Cart): number {
  return cart.items.length
}
```

A test with an empty cart does not catch `cart.items.length` → `0`, because the
function returns 0 for an empty cart too. Test it with items in the cart:

```ts
it('counts the items in the cart', () => {
  expect(itemCount({ items: ['book', 'pen'] })).toBe(2)
})
```

With the mutant, `itemCount` returns 0 instead of 2.

Checks for the other mutants:

- `''`, `0n`, `[]` and `undefined`: an input with another result, and `toBe` or
  `toEqual`. `toBeDefined()` catches only `undefined`.
- `true` and `false`: one test for each result. For the callback of `some()`,
  test a list with a product in stock and one whose products are all sold out.
- `Promise.resolve(…)`: `await` the result and check its value.
- `undefined` in a `void` function: check what the removed call does, such as
  the product that `addToCart` adds.
- `undefined` for a promise in an `async` function: check that the function
  rejects when that promise rejects.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'return-value': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
export function requestId(): string {
  // mootant-ignore-next-line return-value: trace id, only logged
  return crypto.randomUUID()
}
```

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                 | Example                                 | Rule                      |
| ---------------------------------------------------------------------- | --------------------------------------- | ------------------------- |
| Removes code that has a finer mutant inside                            | `price * quantity` → `0`                | `solitary`, subsumed      |
| Same result as a `true` or `false` of another mutator                  | `!product.stock` → `false`              | `O19`, owned              |
| Another mutant gives this value on some inputs                         | `cart.total >= 50` → `true`             | `R6`, subsumed            |
| [method-call](/mutators/method-call) removes the `sort()` call instead | `a.price - b.price` → `0` in `sort()`   | `O12`, owned              |
| Returned logging call, such as `console.log()`                         | `console.log(cart.total)` → `undefined` | `logging-call`, noise     |
| Value without an effect in a `void` function                           | `cart.total` → `undefined`              | `void-result`, equivalent |
| Same code as another mutant                                            | `cart.express ?? false` → `false`       | `duplicate`, duplicate    |

Changes that come back:

- `solitary`, with the [`coarseMutants`](/guide/configuration#coarsemutants)
  setting, on in `strict`.
- `solitary` and `R6`, when the other mutant doesn't run, for example because
  its mutator is off.
- `logging-call`, when [`loggers`](/guide/configuration#loggers) leaves out the
  logger.

The other changes stay skipped.

A returned literal, such as `'free'`, belongs to its literal mutator, here
[string-literal](/mutators/string-literal).
