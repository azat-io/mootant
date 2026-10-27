---
title: method-call
description:
  Swaps a method for its opposite, such as Math.max for Math.min, or removes a
  call such as trim() or filter(). Tests catch these mutants with a value for
  which the two versions differ, such as a text with spaces around it for
  trim().
shortDescription: Swaps a method for its opposite or removes a call like trim().
example:
  before: 'Math.max(total, 0)'
  after: 'Math.min(total, 0)'
keywords:
  - mutation testing
  - method call
  - method mutation
  - string methods
  - array methods
  - javascript
  - typescript
---

This mutator swaps a method for its opposite, as if the code called the wrong
one of a pair: `Math.max(total, 0)` becomes `Math.min(total, 0)`. It also
removes a call such as `trim()` or `filter()`, as if the code forgot it:
`input.trim()` becomes `input`. Tests catch such a mutant with a value for which
the two versions differ, such as a total above 0 for `Math.max(total, 0)`.

## Changes

This mutator changes only the methods in the tables below. It changes a string
method only on a value that may be a string, and an array method only on a value
that may be an array. A value of unknown type may be either, such as a parameter
in plain JavaScript or a value of a type imported from another file.

Mootant swaps `max`, `min`, `floor` and `ceil` only on the global `Math`. With
the [`anyReceiver`](#anyreceiver) option, on in `strict`, it changes the methods
of both tables on any value.

### Swap the method

Mootant swaps each method for the other one of its pair, in both directions:

| Code                        | Mutant                      |
| --------------------------- | --------------------------- |
| `code.startsWith('SHIP')`   | `code.endsWith('SHIP')`     |
| `label.toLowerCase()`       | `label.toUpperCase()`       |
| `label.toLocaleLowerCase()` | `label.toLocaleUpperCase()` |
| `name.trimStart()`          | `name.trimEnd()`            |
| `sku.padStart(6, '0')`      | `sku.padEnd(6, '0')`        |
| `items.every(isInStock)`    | `items.some(isInStock)`     |
| `Math.max(total, 0)`        | `Math.min(total, 0)`        |
| `Math.floor(price)`         | `Math.ceil(price)`          |

### Remove the call

Mootant replaces the call with the value it is called on:

| Code                      | Mutant   |
| ------------------------- | -------- |
| `input.trim()`            | `input`  |
| `name.charAt(0)`          | `name`   |
| `title.substring(0, 20)`  | `title`  |
| `code.substr(2)`          | `code`   |
| `card.slice(-4)`          | `card`   |
| `items.slice(0, 3)`       | `items`  |
| `items.filter(isInStock)` | `items`  |
| `items.sort(byPrice)`     | `items`  |
| `items.toSorted(byPrice)` | `items`  |
| `orders.reverse()`        | `orders` |
| `orders.toReversed()`     | `orders` |

In an optional chain, the `?.` of a removed call moves to the next link:
`value?.trim().length` becomes `value?.length`. At the end of the chain, it goes
with the call: `value?.trim()` becomes `value`.

The [`loggers`](/guide/configuration#loggers) setting doesn't skip calls inside
a log message: `console.log(name.trim())` still gets `name.trim()` → `name`.

Mootant makes no case swap where the result is checked against a literal in the
same letter case, such as `size.toUpperCase() === 'XL'`; see
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the result with a value that the call changes, or that the two methods of
a pair treat differently. Take this function:

```ts
interface Item {
  name: string
  inStock: boolean
}

export function availableItems(items: Item[]): Item[] {
  return items.filter(item => item.inStock)
}
```

The mutant `items.filter(item => item.inStock)` → `items` survives a test in
which every item is in stock, since the filter then keeps the whole list. Add an
item that is out of stock:

```ts
it('leaves out items that are out of stock', () => {
  let shirt = { name: 'Shirt', inStock: true }
  let socks = { name: 'Socks', inStock: false }
  expect(availableItems([shirt, socks])).toEqual([shirt])
})
```

With the mutant, `availableItems([shirt, socks])` returns both items.

Values that tell some other changes apart:

- `startsWith` and `endsWith`: `'SHIP10'`, which has `'SHIP'` at one end only.
- `every` and `some`: a list where some items pass the check and others don't.
- `Math.max` and `Math.min`: arguments that differ, none of them `NaN`.
- Case swaps: a text with cased letters, such as `'Sale'`, and an assertion on
  the whole result.
- A removed call: a value that the call changes, such as `' 42 '` for `trim()`.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'method-call': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line method-call: only the speed depends on it
let workers = Math.max(cores - 1, 1)
```

Your setting for this mutator replaces the one from `strict`: with `strict`,
`'method-call': 'on'` turns `anyReceiver` back off.

### anyReceiver

`false` by default, `true` in `strict`. With `true`, Mootant changes these
methods on any value, such as `filter()` of your own class or `_.max()`:
`stock.filter('A1')` becomes `stock`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'method-call': ['on', { anyReceiver: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                                                    | Example                                                      | Rule                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------- |
| Method of another type, such as your own class                                                                            | `stock.filter('A1')` → `stock`                               | `receiver-type`, noise            |
| Only the truth of the result counts                                                                                       | `note.trimEnd()` → `note.trimStart()` in `if (…)`            | `truth-keeping-swap`, equivalent  |
| [comparison-operator](/mutators/comparison-operator) or [condition](/mutators/condition) makes the check constant instead | `size.toUpperCase()` → `size.toLowerCase()` in `… === 'XL'`  | `O17`, owned                      |
| Call returns the whole string                                                                                             | `code.slice(0)` → `code`                                     | `identity-call`, equivalent       |
| Compared text has no cased letters                                                                                        | `size.toUpperCase()` → `size.toLowerCase()` in `… === '42'`  | `caseless-literal`, equivalent    |
| Only the length of the result counts                                                                                      | `id.padStart(8, '0')` → `id.padEnd(8, '0')` before `.length` | `length-keeping-swap`, equivalent |
| May keep a loop running forever                                                                                           | `code.slice(1)` → `code` in `code = code.slice(1)`           | `loop-advance`, timeout           |
| Same code as another mutant                                                                                               | `code.trim()` → `code` in `code.trim().trim()`               | `duplicate`, duplicate            |
| Mootant can't switch a mutant on here                                                                                     | `super.filter(isPositive)` → `super`                         | `invalid-target`, invalid         |

The [`anyReceiver`](#anyreceiver) option brings back `receiver-type`, and the
[`timeouts`](/guide/configuration#timeouts) setting brings back `loop-advance`;
`strict` turns both on. The other changes stay skipped.
