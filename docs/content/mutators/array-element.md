---
title: array-element
description:
  Removes one element from an array literal, or puts undefined into an empty
  array. Tests catch these mutants by comparing the whole array with inputs
  where each element makes a difference.
shortDescription:
  Removes one array element, or puts undefined into an empty array.
example:
  before: '[subtotal, shipping, tax]'
  after: '[subtotal, tax]'
keywords:
  - mutation testing
  - array literal
  - array element
  - empty array
  - spread element
  - react hook dependencies
  - javascript
  - typescript
---

This mutator removes one element from an array literal, as if the code left out
a value: `[subtotal, shipping, tax]` becomes `[subtotal, tax]`. An empty array
gets an `undefined` element instead: `[]` becomes `[undefined]`. Tests catch
these mutants when they compare the whole array, with inputs where each element
makes a difference, such as a cart that already holds items.

## Changes

### Remove an element

Each element gets its own mutant, a spread such as `...items` too:

| Code                        | Mutant            |
| --------------------------- | ----------------- |
| `[subtotal, shipping, tax]` | `[subtotal, tax]` |
| `[...items, gift]`          | `[gift]`          |
| `[...items, gift]`          | `[...items]`      |
| `[item]`                    | `[]`              |

In `recommended`, Mootant doesn't remove an element that has a mutant inside:
`['card', 'paypal']` gets no removal, because
[string-literal](/mutators/string-literal) changes both strings. A mutant of
[optional-chaining](/mutators/optional-chaining) doesn't count:
`[user?.coupon, code]` still becomes `[code]`.

With [`coarseMutants`](/guide/configuration#coarsemutants), on in `strict`,
Mootant removes such elements too: `['card', 'paypal']` → `['paypal']`.

### Put `undefined` into an empty array

An empty array literal gets an `undefined` element:

| Code                         | Mutant                                |
| ---------------------------- | ------------------------------------- |
| `let coupons: string[] = []` | `let coupons: string[] = [undefined]` |
| `setItems([])`               | `setItems([undefined])`               |

Mootant skips this change for the empty dependency list of a React hook, as in
`useEffect(load, [])`; see [Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the whole result, with inputs where each element makes a difference. Take
this function:

```ts
export function addGift(items: string[], gift: string): string[] {
  return [...items, gift]
}
```

A test that starts from an empty cart does not catch `[...items, gift]` →
`[gift]`, because both versions return only the gift. Put items in the cart and
compare the whole result:

```ts
it('keeps the items and adds the gift', () => {
  expect(addGift(['mug', 'tea'], 'tote bag')).toEqual([
    'mug',
    'tea',
    'tote bag',
  ])
})
```

With the mutant, `addGift(['mug', 'tea'], 'tote bag')` returns `['tote bag']`.
The same test catches `[...items, gift]` → `[...items]`, which returns
`['mug', 'tea']`.

Other cases need these checks:

- `[]` → `[undefined]`: check the length, or the whole array with `toEqual`.
- `[subtotal, shipping, tax]` → `[subtotal, tax]`, when the code sums the array:
  pass a shipping cost other than 0.
- `[cartId]` → `[]` in `useEffect`: check that the effect runs again for a new
  `cartId`.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'array-element': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line array-element, statement-removal: speed only
preload([heroImage, logoImage])
```

Without [statement-removal](/mutators/statement-removal) in the list, the line
gets `preload([heroImage, logoImage])` → `;`. Turning this mutator off brings
back that mutant too.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                     | Example                                       | Rule                            |
| ---------------------------------------------------------- | --------------------------------------------- | ------------------------------- |
| Removes code that has a finer mutant inside                | `['card', 'paypal']` → `['paypal']`           | `solitary`, subsumed            |
| A React hook behaves the same with `[undefined]`           | `[]` → `[undefined]` in `useEffect(load, [])` | `hook-dependencies`, equivalent |
| `join('')` writes `undefined` as an empty string           | `[]` → `[undefined]` in `let parts = []`      | `joined-array`, equivalent      |
| May keep a loop running forever                            | `[...box, item]` → `[...box]`                 | `loop-advance`, timeout         |
| Same code as another mutant                                | `[sku, sku]` → `[sku]`                        | `duplicate`, duplicate          |
| Read by the Vue or Svelte compiler as written              | `['sku']` → `[]` in `defineProps()`           | `compiler-macro`, invalid       |
| Vue would read the new `&…` as an HTML character reference | `['Q&A', reviews]` → `['Q&A']`                | `template-text`, invalid        |

The [`coarseMutants`](/guide/configuration#coarsemutants) setting brings back
`solitary`, and [`timeouts`](/guide/configuration#timeouts) brings back
`loop-advance`; `strict` turns on both. `solitary` also comes back when the
mutant inside doesn't run, for example because its mutator is off. The other
changes stay skipped.
