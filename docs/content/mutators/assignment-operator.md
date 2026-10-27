---
title: assignment-operator
description:
  Swaps the operator of a compound assignment, such as += for -=, and changes
  when &&=, ||= and ??= assign. Tests catch these mutants by checking the value
  after the assignment, with inputs for which the two versions differ.
shortDescription:
  Swaps a compound assignment operator or changes when it assigns.
example:
  before: 'total += shipping'
  after: 'total -= shipping'
keywords:
  - mutation testing
  - assignment operator
  - compound assignment
  - logical assignment
  - nullish coalescing assignment
  - javascript
  - typescript
---

This mutator swaps the operator of a compound assignment: `total += shipping`
becomes `total -= shipping`. In `&&=`, `||=` and `??=`, it changes when the
assignment happens. Tests catch these mutants by checking the value after the
assignment, with inputs for which the two versions differ, such as a shipping
cost other than 0.

## Changes

### Swap an arithmetic or bitwise operator

Each operator becomes one other operator:

| Code                    | Mutant                 |
| ----------------------- | ---------------------- |
| `total += shipping`     | `total -= shipping`    |
| `total -= discount`     | `total += discount`    |
| `price *= quantity`     | `price /= quantity`    |
| `amount /= 100`         | `amount *= 100`        |
| `cents %= 100`          | `cents *= 100`         |
| `rate **= years`        | `rate *= years`        |
| `bits <<= 2`            | `bits >>= 2`           |
| `bits >>= 2`            | `bits <<= 2`           |
| `hash >>>= 0`           | `hash >>= 0`           |
| `options &= allowed`    | `options \|= allowed`  |
| `options \|= GIFT_WRAP` | `options &= GIFT_WRAP` |
| `options ^= EXPRESS`    | `options \|= EXPRESS`  |

Mootant swaps `+=` only when one side is known to be a number, such as a
`number` parameter, a numeric literal or a variable that starts at `0`, and the
other side is not known to be anything else. Any other `+=` may join strings,
and Mootant skips its swap.

### Change when a logical assignment assigns

`&&=`, `||=` and `??=` can get up to two of these mutants each:

| Change                 | Code                              | Mutant                |
| ---------------------- | --------------------------------- | --------------------- |
| Always assign          | `note \|\|= 'Thank you!'`         | `note = 'Thank you!'` |
| Never assign           | `coupon &&= coupon.toUpperCase()` | `coupon`              |
| Swap `??=` and `\|\|=` | `shipping ??= 5`                  | `shipping \|\|= 5`    |

`??=` and `||=` differ only for a falsy target other than `null` and
`undefined`, such as `0` or `''`. Mootant swaps them for these targets and
defaults:

| Target                                  | Default                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------- |
| A string, number, BigInt or boolean     | Not the falsy value of its type, such as `5` for a number                  |
| Of unknown type, as in plain JavaScript | A number, or a string, BigInt or boolean other than `''`, `0n` and `false` |

`||=` becomes `??=` only where the target may also be `null` or `undefined`. The
[`nullishSwap`](#nullishswap) option adds two more cases.

Mootant also skips changes to an assignment that moves a loop, such as
`packed += perBox` in `while (packed < items)`. See
[Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the value after the assignment with inputs for which the two versions
differ. Take this function:

```ts
export function giftNote(note: string | undefined): string {
  note ||= 'Enjoy your gift!'
  return note
}
```

Tests that pass `undefined` or a non-empty note do not catch
`note ||= 'Enjoy your gift!'` → `note ??= 'Enjoy your gift!'`: both versions
replace `undefined` and keep a non-empty note. Pass an empty note:

```ts
it('replaces an empty note', () => {
  expect(giftNote('')).toBe('Enjoy your gift!')
})
```

With the mutant, `giftNote('')` returns an empty string instead of
`'Enjoy your gift!'`. A falsy target other than `null`, `undefined` and the
default, such as `0` or `''`, also catches `??=` → `||=`.

Values that tell the other changes apart:

- Arithmetic operators: a target such as 10 and a right side such as 3.
- Shifts: a target such as -8 and a shift such as 1.
- `&=`, `|=` and `^=`: a target that shares a bit with the right side but
  differs from it, such as 6 for 2.
- Always assign: a target that the original keeps, but `=` would change.
- Never assign: a target that the original changes.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'assignment-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line assignment-operator: timing only
stats.checkoutMs += Date.now() - startedAt
```

When this mutator is off, or its mutants on a line are ignored,
[statement-removal](/mutators/statement-removal) removes an assignment such as
`total += shipping` that no other mutant changes.

`['on', options]` merges the options over the
[defaults of the mutator](/guide/configuration#mutators), not over the options
of the preset: with `strict`, `'assignment-operator': 'on'` turns `nullishSwap`
back to `'distinguishing'`.

### nullishSwap

`'distinguishing'` by default, `'always'` in `strict`. With `'always'`, Mootant
also swaps `??=` and `||=` for these targets:

- A number with the default `0`: `fee ??= 0` → `fee ||= 0`, which differ only
  for `NaN` and `-0`.
- A target of unknown type, unless the default is an object, an array or a
  function.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'assignment-operator': ['on', { nullishSwap: 'always' }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                   | Example                                    | Rule                                  |
| -------------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| May join strings, where `-=` gives `NaN`                 | `name += size` → `name -= size`            | `non-numeric-plus`, noise             |
| May keep a loop running forever                          | `packed += perBox` → `packed -= perBox`    | `loop-advance`, timeout               |
| This mutator swaps `??=` and `\|\|=` instead             | `shipping ??= 5` → `shipping = 5`          | `swap-subsumes-drop`, subsumed        |
| `??=` and `\|\|=` likely give the same result            | `fee ??= 0` → `fee \|\|= 0` for a `number` | `nullish-swap`, noise                 |
| Type hints say the target is never `null` or `undefined` | `options ??= {}` → `options`               | `never-nullish`, equivalent           |
| Type hints make the target always truthy                 | `items \|\|= []` → `items`                 | `typed-constant`, equivalent          |
| Default is the type's only falsy value, `NaN` aside      | `coupon \|\|= ''` → `coupon`               | `canonical-falsy-default`, equivalent |
| 0 on the right of a number gives the same result         | `total += 0` → `total -= 0`                | `numeric-identity`, equivalent        |
| 1 or -1 on the right gives the same result               | `amount *= -1` → `amount /= -1`            | `identity-operand`, equivalent        |

The [`timeouts`](/guide/configuration#timeouts) setting brings back
`loop-advance`, and [`nullishSwap`](#nullishswap) set to `'always'` brings back
some `nullish-swap` changes, such as `fee ??= 0` → `fee ||= 0`; `strict` does
both. The other changes stay skipped.

A plain `=` gets no mutant from this mutator: in `total = total + price`,
[arithmetic-operator](/mutators/arithmetic-operator) changes `total + price`.
[update-operator](/mutators/update-operator) changes `count++` and `count--`.
