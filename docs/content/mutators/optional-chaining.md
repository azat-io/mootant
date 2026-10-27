---
title: optional-chaining
description:
  Replaces ?. with a plain property access or call, as if the value before it
  were never null or undefined. Tests catch it by running the code with such a
  value, which makes the mutant throw a TypeError.
shortDescription: Replaces ?. with a plain property access or call.
example:
  before: 'coupon?.code'
  after: 'coupon.code'
keywords:
  - mutation testing
  - optional chaining
  - null check
  - undefined
  - nullish values
  - TypeError
  - javascript
  - typescript
---

This mutator replaces `?.` with `.`, as if the value before it could never be
`null` or `undefined`: `coupon?.code` becomes `coupon.code`. Tests catch these
mutants by running the code with `null` or `undefined` before the `?.`, such as
a cart without a coupon. The mutant then throws a `TypeError`.

## Changes

Mootant replaces `?.` with `.` before a property name and removes it before `[`
or `(`:

| Code               | Mutant           |
| ------------------ | ---------------- |
| `coupon?.code`     | `coupon.code`    |
| `product?.['sku']` | `product['sku']` |
| `onChange?.(0)`    | `onChange(0)`    |

A chain gets one mutant per `?.`, each with the other `?.` kept.
`cart?.items?.[0]?.title` gets three:

- `cart.items?.[0]?.title`
- `cart?.items[0]?.title`
- `cart?.items?.[0].title`

Whether a `?.` gets a mutant depends on type hints: what Mootant can tell about
a type from the same file, such as an annotation.

| Type of the value before `?.`                               | Mutant                                             |
| ----------------------------------------------------------- | -------------------------------------------------- |
| May be `null` or `undefined`, such as `Coupon \| undefined` | Yes                                                |
| Can't be, such as `string[]`                                | Only with the [`nonNullable`](#nonnullable) option |
| Imported from another file, or unknown                      | Yes                                                |

## Kill a surviving mutant

Run the code with `null` or `undefined` before the `?.`, and check the result.
Take this function:

```ts
interface Cart {
  coupon?: { code: string; percent: number }
}

export function discountPercent(cart: Cart): number {
  return cart.coupon?.percent ?? 0
}
```

A test with a coupon does not catch `cart.coupon?.percent` →
`cart.coupon.percent`, because both versions return the percent of the coupon.
Test a cart without a coupon:

```ts
it('gives no discount without a coupon', () => {
  expect(discountPercent({})).toBe(0)
})
```

With the mutant, `discountPercent({})` throws a `TypeError` instead of
returning 0.

The other changes need these tests:

- A call, such as `onChange?.(0)`: run the code without the function.
- A chain: a test for each `?.` with `null` or `undefined` right before it, such
  as no cart, no `items` and an empty `items` list.

If the value before `?.` can never be `null` or `undefined`, no test can catch
the mutant: remove the `?.`, or ignore the mutant as
[Configuration](#configuration) shows.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'optional-chaining': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line optional-chaining: browsers have no unref
setTimeout(releaseReservation, 15 * 60_000).unref?.()
```

With `strict`, `'optional-chaining': 'on'` turns `nonNullable` back off; see
[Mutators](/guide/configuration#mutators).

### nonNullable

`false` by default, `true` in `strict`. With it, Mootant replaces `?.` whatever
the type hints say, since an annotation can be wrong at runtime: `items?.length`
→ `items.length` with `items: string[]`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'optional-chaining': ['on', { nonNullable: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                           | Example                                                 | Rule                       |
| ------------------------------------------------ | ------------------------------------------------------- | -------------------------- |
| Type hints say it can't be `null` or `undefined` | `items?.length` → `items.length`                        | `non-nullable`, equivalent |
| Changes the value that advances a loop           | `page?.next` → `page.next` in `cursor = page?.next`     | `loop-advance`, timeout    |
| The regex shows the match has its named groups   | `match?.groups?.size` → `match?.groups.size`            | `named-groups`, equivalent |
| Mootant can't switch a mutant on here            | `cart?.coupon` → `cart.coupon` in `delete cart?.coupon` | `invalid-target`, invalid  |

The [`nonNullable`](#nonnullable) option brings back `non-nullable`, and the
[`timeouts`](/guide/configuration#timeouts) setting brings back `loop-advance`;
`strict` turns on both. The other changes stay skipped.
