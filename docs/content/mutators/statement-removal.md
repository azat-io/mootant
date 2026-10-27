---
title: statement-removal
description:
  Removes one statement with an effect, such as a call, an assignment, a throw
  or an early return. Tests catch it by checking what the statement changes, not
  only what the function returns.
shortDescription: Removes one statement that has an effect, such as a call.
example:
  before: 'orders.push(order)'
  after: ';'
keywords:
  - mutation testing
  - statement removal
  - statement deletion
  - side effects
  - early return
  - switch fall-through
  - javascript
  - typescript
---

This mutator removes one statement that has an effect, such as a call, an
assignment, a `throw` or an early `return`. `orders.push(order)` becomes `;`, so
the order is never added to `orders`. Tests catch it by checking what the
statement changes, such as the contents of `orders`, not only what the function
returns.

## Changes

### Remove a statement with an effect

Each mutant replaces one statement with the empty statement `;`:

| Statement                              | Example                              |
| -------------------------------------- | ------------------------------------ |
| A call, also an optional one           | `save(order)`, `onChange?.()`        |
| An assignment, `++` or `--`            | `cart.coupon = null`                 |
| `await`, `new` or `delete`             | `delete reserved[sku]`               |
| `void` before a call, `new` or `await` | `void sendReceipt(order)`            |
| `throw`                                | `throw new Error('Unknown country')` |

With the [`jumps`](#jumps) option, Mootant also removes `continue`, `yield` and
every `break`.

### Remove an early `return`

Mootant removes a `return` with no value or with a value such as `null`,
`undefined`, `this` or another literal. Without it, the function goes on and
runs code meant for other input:

```ts
export function checkout(cart: Cart): Order | null {
  if (cart.items.length === 0) {
    showEmptyCart()
    return null
  }
  return createOrder(cart)
}
```

With `return null` → `;`, an empty cart reaches `createOrder(cart)`.

### Remove the `break` of a case

Without the `break` that ends a case, the code falls through into the next case:

```ts
switch (coupon) {
  case 'WELCOME':
    discount = 10
    break
  case 'VIP':
    discount = 20
    break
}
```

With the first `break` → `;`, the coupon `'WELCOME'` gets a discount of 20.

### Statements Mootant doesn't remove

Mootant never removes a whole `if`, loop or block, a declaration, such as
`let order = createOrder(cart)`, or a statement without an effect, such as
`price + quantity`. It also skips the removal of these statements:

- The only statement of an `if` without `else`, such as the `throw` in
  `if (!coupon) throw new Error('No coupon')`: another mutant already makes the
  test `false`. For `if (order.total > 100) addGift(order)`, the removal comes
  back when [comparison-operator](/mutators/comparison-operator) is off.
- In `recommended`, a statement with a finer mutant inside, such as `count++`,
  `await save(order)` or `return 0`, unless it is a plain `=` assignment.
  Mootant assumes that a test that catches the finer mutant also catches the
  removal.
- A `console` call whose arguments are only text, such as
  `console.log('Order saved')`. Mootant removes other log calls, such as
  `console.log('Saved', order.id)` and `logger.info('Saved')`.

## Kill a surviving mutant

Check the effect of the statement, not only what the function returns. Take this
function:

```ts
export function redeem(coupon: { used: boolean; discount: number }): number {
  if (coupon.used) {
    throw new Error('Coupon already used')
  }
  coupon.used = true
  return coupon.discount
}
```

A test that redeems a coupon once and checks the discount does not catch
`coupon.used = true` → `;`: the function returns the same discount. Redeem it
twice:

```ts
it('accepts a coupon only once', () => {
  let coupon = { used: false, discount: 5 }
  redeem(coupon)
  expect(() => redeem(coupon)).toThrow('Coupon already used')
})
```

With the mutant, the second `redeem(coupon)` returns 5 instead of throwing.

Checks for the other statements:

- A call: check what it changes, such as `orders` after `orders.push(order)`.
  For `save(order)` from another module, mock the module and check
  `toHaveBeenCalledWith(order)`.
- A `throw`: call the function with input it must reject, and use `toThrow`.
- A `return`: use input that reaches it, and check the result, such as `null`
  from `checkout()` for an empty cart.
- The `break` of a case: use that case's value and check the result, such as a
  discount of 10 for `'WELCOME'`.
- With `jumps`: check what a loop does after the `continue` or `break`, and
  every value that a generator yields.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'statement-removal': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line statement-removal: only warms the image cache
preloadImages(product)
```

With `strict`, `'statement-removal': 'on'` turns `jumps` back off: the options
start from the [defaults of the mutator](/guide/configuration#mutators), not
from the preset.

### jumps

`false` by default, `true` in `strict`. With `jumps`, Mootant also removes
`continue`, `yield` and every `break`, not only the one that ends a case. Here,
`continue` → `;` makes the loop reserve an item that it has just put on back
order:

```ts
for (let item of items) {
  if (!item.inStock) {
    backorder(item)
    continue
  }
  reserve(item)
}
```

Turn it on:

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'statement-removal': ['on', { jumps: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                    | Example                                               | Rule                             |
| --------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| Removes code that has a finer mutant inside               | `stock.set(sku, left - 1)` → `;`                      | `solitary`, subsumed             |
| Same result as a `true` or `false` of another mutator     | `applyCoupon(order)` → `;` in `if (order.coupon)`     | `O19`, owned                     |
| Another mutant makes the `if` test `false` on some inputs | `addGift(order)` → `;` in `if (order.total > 100)`    | `R4`, subsumed                   |
| Text of a log message, such as in `console.log()`         | `console.log('Order saved')` → `;`                    | `log-message`, noise             |
| Last `return` of no value, `undefined` or `null`          | `return null` → `;`                                   | `tail-return`, equivalent        |
| Falls through only to the end or a `break`                | `break` → `;` in the last case                        | `fall-through-break`, equivalent |
| May keep a loop running forever                           | `ship(queue.shift())` → `;` in `while (queue.length)` | `loop-advance`, timeout          |
| Last `return false`: only `false` becomes `undefined`     | `return false` → `;`                                  | `tail-return-false`, noise       |
| Only waits for a timer delay                              | `await setTimeout(500)` → `;`                         | `timer-delay`, noise             |
| `continue` that ends the loop body anyway                 | `continue` → `;`                                      | `loop-end`, equivalent           |
| Mootant can't switch a mutant on here                     | `total = price * quantity` → `;` in `$:`              | `invalid-target`, invalid        |
| Read by the Vue or Svelte compiler as written             | `defineProps(['price'])` → `;`                        | `compiler-macro`, invalid        |

Changes that come back:

- `solitary`, with the [`coarseMutants`](/guide/configuration#coarsemutants)
  setting.
- `loop-advance`, with the [`timeouts`](/guide/configuration#timeouts) setting.
- `solitary` and `R4`, when the other mutant doesn't run, for example because
  its mutator is off.
- `log-message`, when [`loggers`](/guide/configuration#loggers) leaves out
  `console`. In `recommended`, a call with text is then skipped as `solitary`.

`strict` turns on both settings. The other changes stay skipped.

A `return` of any other value, such as `return createOrder(cart)`, belongs to
[return-value](/mutators/return-value).
