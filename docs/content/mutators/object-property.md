---
title: object-property
description:
  Removes one property or spread from an object literal. Tests catch these
  mutants by checking the removed property, or a value that a removed spread
  copies.
shortDescription: Removes one property or spread from an object literal.
example:
  before: '{ name, price }'
  after: '{ price }'
keywords:
  - mutation testing
  - object literal
  - object property
  - object spread
  - missing property
  - javascript
  - typescript
---

This mutator removes one property or spread from an object literal, as if the
code left out a value: `{ name, price }` becomes `{ price }`. Tests catch these
mutants when they check the removed property, or a value that a removed spread
copies, such as the cart total in `{ ...cart, coupon }`.

## Changes

Each property and spread gets its own mutant:

| Code                           | Mutant         |
| ------------------------------ | -------------- |
| `{ name, price }`              | `{ price }`    |
| `{ id: product.id, quantity }` | `{ quantity }` |
| `{ ...cart, coupon }`          | `{ coupon }`   |
| `{ ...cart, coupon }`          | `{ ...cart }`  |

In `recommended`, Mootant doesn't remove a property that has a mutant inside: in
`{ code, rate: 0.1 }`, it removes `code` but not `rate: 0.1`, because
[number-literal](/mutators/number-literal) changes `0.1`. A mutant of
[optional-chaining](/mutators/optional-chaining) doesn't count:
`{ name: user?.name, total }` still becomes `{ total }`.

With [`coarseMutants`](/guide/configuration#coarsemutants), on in `strict`,
Mootant removes such properties too: `{ code, rate: 0.1 }` → `{ code }`.

Mootant leaves alone the label of a child logger, as in
`logger.child({ module: 'checkout' })`, but not a label with a call, such as
`{ requestId: getId() }`. The [`loggers`](/guide/configuration#loggers) setting
names the loggers.

## Kill a surviving mutant

Check the property that the mutant removes. For a removed spread, check a value
that comes from that spread. Take this function:

```ts
export function applyCoupon(
  cart: { total: number },
  coupon: string,
): { total: number; coupon: string } {
  return { ...cart, coupon }
}
```

A test that checks only the coupon does not catch `{ ...cart, coupon }` →
`{ coupon }`, because the coupon is still there. Compare the whole result:

```ts
it('keeps the cart total and adds the coupon', () => {
  expect(applyCoupon({ total: 30 }, 'SAVE10')).toEqual({
    total: 30,
    coupon: 'SAVE10',
  })
})
```

With the mutant, `applyCoupon({ total: 30 }, 'SAVE10')` returns
`{ coupon: 'SAVE10' }`, without `total`. The same test catches
`{ ...cart, coupon }` → `{ ...cart }`, which returns `{ total: 30 }`.

Other cases need these checks:

- `{ ...defaults, currency }` → `{ ...defaults }`: pass a `currency` other than
  `defaults.currency`.
- A method or a getter: call the method, or read the getter.
- `sendMail({ to, subject })`: check the call with `toHaveBeenCalledWith`.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'object-property': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line object-property, statement-removal: logging only
logger.info({ orderId, total }, 'Order paid')
```

Without [statement-removal](/mutators/statement-removal) in the list, the line
gets `logger.info({ orderId, total }, 'Order paid')` → `;`. Turning this mutator
off brings back that mutant too.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                     | Example                                     | Rule                         |
| ---------------------------------------------------------- | ------------------------------------------- | ---------------------------- |
| Removes code that has a finer mutant inside                | `{ code, rate: 0.1 }` → `{ code }`          | `solitary`, subsumed         |
| Read by the Vue or Svelte compiler as written              | `{ sku: String }` → `{}` in `defineProps()` | `compiler-macro`, invalid    |
| Removes an `Intl` option equal to its default              | `{ style: 'decimal' }` → `{}`               | `default-option`, equivalent |
| May keep a loop running forever                            | `{ page, done }` → `{ page }`               | `loop-advance`, timeout      |
| Same code as another mutant                                | `{ id, id, total }` → `{ id, total }`       | `duplicate`, duplicate       |
| Vue would read the new `&…` as an HTML character reference | `{ label: 'Q&A', id }` → `{ label: 'Q&A' }` | `template-text`, invalid     |

The [`coarseMutants`](/guide/configuration#coarsemutants) setting brings back
`solitary`, and [`timeouts`](/guide/configuration#timeouts) brings back
`loop-advance`; `strict` turns on both. `solitary` also comes back when the
mutant inside doesn't run, for example because its mutator is off. The other
changes stay skipped.
