---
title: missing-await
description:
  Removes an await, so the code gets a promise and goes on without waiting for
  it. Tests catch it by checking what the code does with the awaited value or by
  making the awaited call fail.
shortDescription: Removes an await, as if it had been forgotten.
example:
  before: 'await loadCart(id)'
  after: 'loadCart(id)'
keywords:
  - mutation testing
  - missing await
  - async await
  - promises
  - async functions
  - javascript
  - typescript
---

This mutator removes an `await`, as if it had been forgotten:
`await loadCart(id)` becomes `loadCart(id)`, so the code gets a promise instead
of the cart. Tests catch it by checking what the code builds from the awaited
value, such as the cart total, or by making the awaited call fail.

## Changes

What removing the `await` breaks depends on where it stands:

| Where                   | Code                             | Without the `await`                                                           |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| A value the code uses   | `let cart = await loadCart(id)`  | `cart` is a promise, so `cart.total` is `undefined`                           |
| A statement             | `await saveOrder(order)`         | The function goes on before the save ends; its error doesn't reach the caller |
| A condition             | `if (await isInStock(sku))`      | A promise is always truthy, so the branch always runs                         |
| A `return` inside `try` | `return await chargeCard(order)` | A failed payment skips `catch` and reaches the caller                         |

Mootant leaves alone an `await` whose promise the caller also awaits, such as in
`return await fetchCart(id)` or in `let cart = await fetchCart(id)` right before
`return cart`; see [Skipped changes](#skipped-changes). It keeps the mutant
where the `await` affects error handling or cleanup: in a `try` block, in a
`catch` block followed by `finally`, and after a `using` or `await using`
declaration. It never removes the `await` of `for await` or `await using`.

## Kill a surviving mutant

Check what the function does with the awaited result and what it does when the
awaited call fails. Take this function:

```ts
export async function placeOrder(
  id: string,
  save: (id: string) => Promise<void>,
): Promise<string> {
  await save(id)
  return `Order ${id} placed`
}
```

The mutant `await save(id)` → `save(id)` survives a test that lets the save
succeed and checks only the returned message: both versions resolve to
`'Order A-1 placed'`. Make the save fail:

```ts
it('fails when the order is not saved', async () => {
  let save = async () => {
    throw new Error('Database is down')
  }
  await expect(placeOrder('A-1', save)).rejects.toThrow('Database is down')
})
```

With the mutant, `placeOrder('A-1', save)` resolves to `'Order A-1 placed'`
although the save failed.

For an `await` in other places:

- A value the code uses: check the result built from it, such as the cart total.
- A condition: make the awaited value falsy, such as for an item out of stock.
- A `return` inside `try`: make the call fail and check what `catch` returns.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'missing-await': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it. For an `await` statement, also list
[statement-removal](/mutators/statement-removal):

```ts
// mootant-ignore-next-line missing-await, statement-removal: rate limit
await rateLimit()
```

Without `statement-removal`, the line gets `await rateLimit()` → `;`, as it does
when this mutator is off.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                      | Example                                                                                                    | Rule                            |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| The caller awaits the same promise                                                          | `await fetchCart(id)` → `fetchCart(id)` in `return await fetchCart(id)`                                    | `awaited-by-caller`, equivalent |
| May keep a loop running forever                                                             | `await loadPage(cursor)` → `loadPage(cursor)` in `cursor = await loadPage(cursor)` inside `while (cursor)` | `loop-advance`, timeout         |
| Only waits for a timer of `node:timers/promises`                                            | `await setTimeout(500)` → `setTimeout(500)`                                                                | `timer-delay`, noise            |
| Makes the comparison constant, left to [comparison-operator](/mutators/comparison-operator) | `await stockOf(sku)` → `stockOf(sku)` in `(await stockOf(sku)) === 0`                                      | `R8`, subsumed                  |
| Type hints show the value is not a promise                                                  | `await taxRate` → `taxRate`                                                                                | `settled-value`, equivalent     |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)              | `await stockOf(sku)` → `stockOf(sku)` in `(await stockOf(sku)) === 0 && !preorder`                         | `O3`, owned                     |
| Same code as another mutant                                                                 | `await fetchCart(id)` → `fetchCart(id)` in `await await fetchCart(id)`                                     | `duplicate`, duplicate          |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. `R8` comes back when
[comparison-operator](/mutators/comparison-operator) is off or ignored on that
line. The other changes stay skipped.
