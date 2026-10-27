---
title: logical-operator
description:
  Drops one side of &&, || or ??, swaps || and ??, and makes a whole condition
  true or false. Tests catch a drop with a case where the dropped side decides
  the result, such as an item that is out of stock.
shortDescription: Drops one side of &&, || or ??, or swaps || and ??.
example:
  before: 'inStock && hasAddress'
  after: 'hasAddress'
keywords:
  - mutation testing
  - logical operator
  - logical operator mutation
  - nullish coalescing
  - short-circuit evaluation
  - boolean conditions
  - javascript
  - typescript
---

This mutator drops one side of `&&`, `||` or `??`, as if a check or a default
were missing: `inStock && hasAddress` becomes `hasAddress`. It also swaps `||`
and `??` and turns a whole condition into `true` or `false`. Tests catch a drop
with a case where the dropped side decides the result, such as an item that is
out of stock.

## Changes

### Drop one side

`&&`, `||` and `??` become one of their two sides:

| Code                    | Mutant       |
| ----------------------- | ------------ |
| `inStock && hasAddress` | `hasAddress` |
| `inStock && hasAddress` | `inStock`    |
| `title \|\| 'Untitled'` | `'Untitled'` |
| `title \|\| 'Untitled'` | `title`      |
| `discount ?? 0`         | `0`          |
| `discount ?? 0`         | `discount`   |

In a chain such as `isSignedIn && hasItems && isPaid`, Mootant drops each part
once.

Mootant drops a `null` or `undefined` default, as in `gift ?? null`, only with
the [`nullishNormalization`](#nullishnormalization) option, on in `strict`.

### Swap `||` and `??`

`||` becomes `??`, and `??` becomes `||`, as if the code used the wrong one:
`||` takes the default for every falsy value, such as `''` or `0`, and `??` only
for `null` and `undefined`.

| Code                | Mutant            |
| ------------------- | ----------------- |
| `name \|\| 'Guest'` | `name ?? 'Guest'` |
| `quantity ?? 1`     | `quantity \|\| 1` |

Mootant swaps only where the swap may change the result. It decides by the type
of the left side, as far as the code shows it, and by the default:

| Left side                                 | Default                                                          | `recommended` | `'always'` |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------- | ---------- |
| `number`                                  | `0`                                                              | Skipped       | Swap       |
| `string`, `bigint` or `boolean`           | `''`, `0n` or `false`                                            | Skipped       | Skipped    |
| `string`, `number`, `bigint` or `boolean` | Any other                                                        | Swap          | Swap       |
| Object, array or function                 | Any                                                              | Skipped       | Skipped    |
| Unknown type                              | A number, `true`, or a string or BigInt other than `''` and `0n` | Swap          | Swap       |
| Unknown type                              | Object, array or function                                        | Skipped       | Skipped    |
| Unknown type                              | Any other, such as `''`, `false`, `null` or `rates.standard`     | Skipped       | Swap       |

`||` becomes `??` only where its left side may be `null` or `undefined` and its
result is a value, not a condition or a `boolean`. Where it doesn't, Mootant
drops the right side instead: `title || 'Untitled'` → `title` for a `string`
title.

A swap replaces the drop of one side, since a test that catches the swap also
catches that drop: `name || 'Guest'` gets no `name` mutant, and `quantity ?? 1`
no `1`.

### Make the condition constant

A whole `&&` becomes `false`, and a whole `||` becomes `true`, as if the
condition never or always held:

| Code                               | Mutant  |
| ---------------------------------- | ------- |
| `isSignedIn && hasItems && isPaid` | `false` |
| `isMember \|\| hasCoupon`          | `true`  |

Mootant makes this change once, for the outermost `&&` or `||`, in these places:

| Place                                                                           | Example                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| A condition, such as `if (…)`, `!` or a `filter` callback                       | `if (isMember \|\| hasCoupon)`                 |
| Both sides are booleans, or a `boolean` is expected                             | `let free: boolean = isMember \|\| hasCoupon`  |
| Another returned value, unless a side is a literal or known not to be a boolean | `return user && user.name` in plain JavaScript |

Where a side is a comparison, as in `quantity > 0 && inStock`, some drops and
constants are left to [comparison-operator](/mutators/comparison-operator); see
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Test a case where the result changes without the dropped side. Take this
function:

```ts
export function canShip(inStock: boolean, hasAddress: boolean): boolean {
  return inStock && hasAddress
}
```

A test that ships an item in stock to a known address does not catch
`inStock && hasAddress` → `hasAddress`: both versions return `true`. Ship an
item that is out of stock:

```ts
it('does not ship an item that is out of stock', () => {
  expect(canShip(false, true)).toBe(false)
})
```

With the mutant, `canShip(false, true)` returns `true`.

Cases that tell the other changes apart:

- `inStock && hasAddress` → `inStock`: an item in stock without an address.
- `discount ?? 0` → `discount`: no discount; → `0`: a discount other than 0.
- `name || 'Guest'` → `name ?? 'Guest'`: an empty name.
- `quantity ?? 1` → `quantity || 1`: a quantity of 0.
- A constant `true` or `false`: a case where the condition has the other value.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'logical-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line logical-operator: retry delay
let delay = options.retryDelay ?? 1000
```

Your setting for this mutator replaces the one from `strict`: with `strict`,
`['on', { nullishSwap: 'always' }]` turns `nullishNormalization` back off.

### nullishSwap

`'distinguishing'` by default, `'always'` in `strict`. The `'always'` column of
the table in [Swap `||` and `??`](#swap--and-) shows the swaps it adds. For a
`number` with the default `0`, such as `discount ?? 0` → `discount || 0`, only
`NaN` and `-0` tell the swap apart from the code.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'logical-operator': ['on', { nullishSwap: 'always' }],
  },
})
```

### nullishNormalization

`false` by default, `true` in `strict`. With `true`, Mootant also drops a
`null`, `undefined` or `void 0` default of `??`: `gift ?? null` → `gift` gives
`undefined` where the code gives `null`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'logical-operator': ['on', { nullishNormalization: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                                   | Example                                                            | Rule                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| Another mutant inside gives this result on some inputs                                                   | `quantity > 0 && inStock` → `inStock`                              | `R2`, subsumed                        |
| This mutator swaps `\|\|` and `??` instead                                                               | `name \|\| 'Guest'` → `name`                                       | `swap-subsumes-drop`, subsumed        |
| Type of the left side decides the result                                                                 | `cart && cart.items` → `cart.items` for `cart: Cart`               | `typed-constant`, equivalent          |
| Type hints say the left side is never `null` or `undefined`                                              | `name ?? 'Untitled'` → `name` for `name: string`                   | `never-nullish`, equivalent           |
| Default is the type's only falsy value, `NaN` aside                                                      | `note \|\| ''` → `note` for `note: string`                         | `canonical-falsy-default`, equivalent |
| `??` and `\|\|` likely give the same result                                                              | `discount ?? 0` → `discount \|\| 0` for a `number`                 | `nullish-swap`, noise                 |
| Falsy default where only truth counts                                                                    | `coupon?.active ?? false` → `coupon?.active` in `if (…)`           | `falsy-default`, equivalent           |
| A side is always true or always false                                                                    | `typeof sku === 'string' && sku.length > 0` → `sku.length > 0`     | `fixed-operand`, equivalent           |
| Only turns `null` into `undefined`, or back                                                              | `gift ?? null` → `gift`                                            | `nullish-normalization`, noise        |
| May keep a loop running forever                                                                          | `finished \|\| failed` → `failed` in `done = finished \|\| failed` | `loop-advance`, timeout               |
| Makes a loop condition always true                                                                       | `hasMore \|\| retrying` → `true` in `while (…)`                    | `loop-running`, timeout               |
| Same change as a [condition](/mutators/condition) or [boolean-literal](/mutators/boolean-literal) mutant | `showBadge ?? true` → `true` in `if (…)`                           | `O15`, owned                          |
| Left side is falsy only when `null` or `undefined`                                                       | `price?.toFixed(2) ?? 'free'` → `price?.toFixed(2) \|\| 'free'`    | `never-falsy`, equivalent             |
| [method-call](/mutators/method-call) removes the `sort()` call instead                                   | `a.featured && !b.featured` → `false` in a `sort` callback         | `O12`, owned                          |
| Ends the loop at once, as [condition](/mutators/condition) does                                          | `isEmpty \|\| failed` → `true` in `if (…) break`                   | `O13`, owned                          |
| Same code as another mutant                                                                              | `isAdmin \|\| isAdmin` → `isAdmin`                                 | `duplicate`, duplicate                |

Changes that come back:

- `loop-advance` and `loop-running`, with the
  [`timeouts`](/guide/configuration#timeouts) setting.
- `nullish-normalization` and part of `nullish-swap`, with the
  [options](#configuration).
- `R2`, when the mutant inside doesn't run, for example with
  [comparison-operator](/mutators/comparison-operator) off.

`strict` turns on the setting and the options. The other changes stay skipped.

Logical assignments, such as `note ||= ''`, belong to
[assignment-operator](/mutators/assignment-operator).
