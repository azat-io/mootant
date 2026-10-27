---
title: update-operator
description:
  Swaps ++ and --, and prefix and postfix where the code uses the value of the
  update. A test catches the mutants when it reaches the update and checks the
  counter or the value the update gives.
shortDescription: Swaps ++ and --, or prefix and postfix when the value is used.
example:
  before: 'count++'
  after: 'count--'
keywords:
  - mutation testing
  - update operator
  - increment operator
  - decrement operator
  - prefix and postfix
  - off-by-one error
  - javascript
  - typescript
---

This mutator swaps `++` and `--`, so `count++` becomes `count--`. Where the code
uses the value of the update, it also swaps prefix and postfix: `nextLineId++`
becomes `++nextLineId`. Tests catch these mutants when they reach the update and
check its result, such as `count` after `count++` or the id that `nextLineId++`
gives.

## Changes

### Swap `++` and `--`

A prefix stays a prefix, and a postfix stays a postfix:

| Code                | Mutant              |
| ------------------- | ------------------- |
| `count++`           | `count--`           |
| `cart.quantity--`   | `cart.quantity++`   |
| `++lastOrderNumber` | `--lastOrderNumber` |

### Swap prefix and postfix

`nextLineId++` gives the value before the update, and `++nextLineId` the value
after it. Mootant makes this swap only where the code uses the value:

| Code                                              | Mutant              |
| ------------------------------------------------- | ------------------- |
| `nextLineId++` in `let id = nextLineId++`         | `++nextLineId`      |
| `++lastOrderNumber` in `return ++lastOrderNumber` | `lastOrderNumber++` |

Mootant counts the value as used when the update is the body of an arrow
function. So `items.forEach(() => count++)` gets `count++` → `++count`, which no
test can catch: `forEach` ignores the value. With braces, `() => { count++ }`,
Mootant skips the change.

In `for (let i = 0; i < n; i++)`, `i++` gets no mutant; see
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Call the code with input that reaches the update, and check a result that the
update changes. Take this function:

```ts
export function countInStock(products: { stock: number }[]): number {
  let count = 0
  for (let product of products) {
    if (product.stock > 0) {
      count++
    }
  }
  return count
}
```

A test with no product in stock does not catch `count++` → `count--`: the
function never reaches `count++`, so both versions return 0. Add a product in
stock:

```ts
it('counts the products in stock', () => {
  expect(countInStock([{ stock: 3 }, { stock: 0 }])).toBe(1)
})
```

With the mutant, `countInStock([{ stock: 3 }, { stock: 0 }])` returns -1 instead
of 1.

Where the code uses the value of the update, check that value. Take
`let id = nextLineId++` with `nextLineId` at 1:

- `++nextLineId`: the first id is 2 instead of 1.
- `nextLineId--`: the first id stays 1, so check the second: 0 instead of 2.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'update-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it. For an update statement, also list
[statement-removal](/mutators/statement-removal):

```ts
// mootant-ignore-next-line update-operator, statement-removal: analytics only
views++
```

Without `statement-removal`, the line gets `views++` → `;`, as it does when this
mutator is off.

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                     | Example                                        | Rule                        |
| ---------------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| Nothing reads the value, so prefix and postfix do the same | `count++` → `++count`                          | `unused-result`, equivalent |
| May keep a loop running forever                            | `i++` → `i--` in `for (let i = 0; i < n; i++)` | `loop-advance`, timeout     |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. The other changes stay skipped.

Compound assignments, such as `count += 1`, belong to
[assignment-operator](/mutators/assignment-operator).
