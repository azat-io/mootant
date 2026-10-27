---
title: unary-operator
description:
  Removes the -, + or ~ in front of a value, so -total becomes total. Tests
  catch these mutants with a value that the operator changes, such as a total
  other than 0.
shortDescription: Removes the -, + or ~ in front of a value.
example:
  before: '-total'
  after: 'total'
keywords:
  - mutation testing
  - unary operator
  - unary minus
  - unary plus
  - bitwise not
  - javascript
  - typescript
---

This mutator removes a unary `-`, `+` or `~` as if it had been forgotten:
`-total` becomes `total`, and `+input` becomes `input`. Tests catch these
mutants with a value that the operator changes, such as a total other than 0.

## Changes

The mutant drops the operator and keeps the code after it as written:

| Code                    | Mutant                |
| ----------------------- | --------------------- |
| `-total`                | `total`               |
| `-1`                    | `1`                   |
| `+input`                | `input`               |
| `~GIFT_WRAP`            | `GIFT_WRAP`           |
| `~~(quantity / perBox)` | `(quantity / perBox)` |

Mootant removes a `+` only where the value after it may be something other than
a number, such as a string, `null` or a value of unknown type. It removes `~~`,
which drops the fraction of a number, as a whole.

A `-1` returned by a comparator written inside a `sort` or `toSorted` call gets
no mutant from this mutator; see [Skipped changes](#skipped-changes).

## Kill a surviving mutant

Check the result with values for which the code and the mutant differ. Take this
function:

```ts
export function hasCoupon(codes: string[], code: string): boolean {
  return codes.indexOf(code) !== -1
}
```

A test that looks up the first code of the list does not catch `-1` → `1`:
`indexOf` returns 0, and both `0 !== -1` and `0 !== 1` are true. Look up a code
that is not in the list:

```ts
it('rejects a code that is not in the list', () => {
  expect(hasCoupon(['SALE10'], 'WELCOME')).toBe(false)
})
```

With the mutant, `hasCoupon(['SALE10'], 'WELCOME')` returns `true`: `indexOf`
returns -1, and `-1 !== 1` is true.

Values that tell the other changes apart:

- `-total` → `total`: a total other than 0 and `NaN`.
- `+input` → `input`: a string, such as `'3'`, and an assertion that expects 3.
- `~GIFT_WRAP` → `GIFT_WRAP` in `options & ~GIFT_WRAP`: a flag set in `options`.
- `~~` removed: a quotient with a fraction, such as 10 items in boxes of 4.

No test catches `+input` → `input` in `+input * 2`: the `*` converts the string
too. Ignore such a mutant with a [comment](#configuration).

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'unary-operator': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line unary-operator: the subtraction converts the date
let started = +new Date()
let elapsed = Date.now() - started
```

This mutator has no options.

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                 | Example                                | Rule                              |
| ---------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| [number-literal](/mutators/number-literal) turns `-1` into `0` instead | `-1` → `1` in `sort((a, b) => …)`      | `comparator-sign-flip`, owned     |
| Value is a number by its type                                          | `+price` → `price` for `price: number` | `numeric-plus`, equivalent        |
| Delay of a timer, made of literals                                     | `-1` → `1` in `setTimeout(retry, -1)`  | `timer-delay`, noise              |
| May keep a loop running forever                                        | `+price` → `price` in `price = +price` | `loop-advance`, timeout           |
| Converts a literal that is not a number                                | `+'5'` → `'5'`                         | `literal-coercion`, noise         |
| `+` doesn't change a number literal                                    | `+5` → `5`                             | `number-literal-plus`, equivalent |

The [`timeouts`](/guide/configuration#timeouts) setting, on in `strict`, brings
back `loop-advance`. The other changes stay skipped.

Negations, such as `!coupon`, belong to [condition](/mutators/condition).
