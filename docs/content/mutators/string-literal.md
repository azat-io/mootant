---
title: string-literal
description:
  Empties a string or the text of a template literal, and fills an empty string.
  Tests catch these changes by checking the whole result with input that makes
  the string appear in it.
shortDescription: Empties a string or fills an empty one.
example:
  before: "'EUR'"
  after: "''"
keywords:
  - mutation testing
  - string literal
  - template literal
  - string mutation
  - empty string
  - javascript
  - typescript
---

This mutator empties a string or the text of a template literal: `'EUR'` becomes
`''`. An empty string gets the text `mootant` instead. Tests catch these mutants
by checking the whole result with input that makes the string appear in it, such
as two coupon codes joined with `', '`.

## Changes

| Change                                                         | Code                            | Mutant                      |
| -------------------------------------------------------------- | ------------------------------- | --------------------------- |
| Empty a string or a template without `${}`                     | `'EUR'`                         | `''`                        |
| Fill an empty string or template                               | `''`                            | `'mootant'`                 |
| Empty a template that only reads variables and properties      | `` `/cart/${cart.id}` ``        | `''`                        |
| Keep only the `${}` of a template with a call or a calculation | `` `${price.toFixed(2)} EUR` `` | `` `${price.toFixed(2)}` `` |

Mootant skips strings in error and log messages, in comparisons such as
`status === 'paid'` and in JSX attributes such as `className="badge"`; see
[Skipped changes](#skipped-changes). A log template with more than a variable
name in `${}`, such as `${cart.id}`, still gets a mutant.

With the [`caseTests`](#casetests) option, on in `strict`, Mootant also changes
the strings of `case` labels.

## Kill a surviving mutant

Check the whole result with input that makes the string appear in it. Take this
function:

```ts
export function formatCoupons(codes: string[]): string {
  return codes.join(', ')
}
```

A test with one coupon code does not catch `', '` → `''`: a list of one has no
separator, so both versions return the code alone. Use two codes:

```ts
it('separates the codes with a comma', () => {
  expect(formatCoupons(['SAVE10', 'FREESHIP'])).toBe('SAVE10, FREESHIP')
})
```

With the mutant, `formatCoupons(['SAVE10', 'FREESHIP'])` returns
`'SAVE10FREESHIP'`.

What to check for the other changes:

- A template that keeps its `${}`, such as `` `${price.toFixed(2)} EUR` ``: the
  whole result with `toBe`, not `toContain`.
- `''` → `'mootant'`: two or more parts in `parts.join('')`, or `toBe('')` on a
  value that must stay empty.
- A `case` label, with `caseTests`: the value of the label, such as `'paid'`,
  and what its branch returns.

## Configuration

Turn the mutator off in the [configuration](/guide/configuration#mutators):

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'string-literal': 'off',
  },
})
```

To ignore the mutants of this mutator on one line, put an ignore comment above
it:

```ts
// mootant-ignore-next-line string-literal, statement-removal: styling only
button.classList.add('is-loading')
```

The comment also names [statement-removal](/mutators/statement-removal): without
it, the removal of the call comes back as a mutant; see
[Ignore mutants](/mutators#ignore-mutants).

With `strict`, `'string-literal': 'on'` turns `caseTests` back off; see
[Mutators](/guide/configuration#mutators).

### caseTests

`false` by default, `true` in `strict`. With it, Mootant also changes the
strings of `case` labels: `'paid'` → `''` in `case 'paid':`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'string-literal': ['on', { caseTests: true }],
  },
})
```

## Skipped changes

Mootant leaves out these changes. `mootant list --skipped` shows them with the
category and the rule; [Skipped changes](/mutators#skipped-changes) explains the
categories.

| Reason                                                                                                | Example                                                      | Rule                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Text of an error message, such as in `new Error()`                                                    | `'Stock cannot be negative'` → `''`                          | `error-message`, noise      |
| Text of a log message, such as in `console.log()`                                                     | `'Cart saved'` → `''`                                        | `log-message`, noise        |
| Literal in a comparison, left to [comparison-operator](/mutators/comparison-operator)                 | `'paid'` → `''` in `status === 'paid'`                       | `O4`, subsumed              |
| Quoted value of a JSX attribute                                                                       | `"badge"` → `""` in `className="badge"`                      | `jsx-attribute`, noise      |
| Empty key gives a fixed result, as another mutator does                                               | `'GIFT-'` → `''` in `if (code.startsWith('GIFT-'))`          | `O8`, owned                 |
| Same result as a `true` or `false` of another mutator                                                 | `'Sale'` → `''` in `sale ? 'Sale' : ''`                      | `O19`, owned                |
| Copies the other branch, as [comparison-operator](/mutators/comparison-operator) does at the boundary | `'Free'` → `''` in `total >= 50 ? 'Free' : ''`               | `R5`, subsumed              |
| Value of a `case` label                                                                               | `'paid'` → `''` in `case 'paid':`                            | `case-label`, noise         |
| Key of an object or a class                                                                           | `'X-Cart-Id'` → `''` in `{ ['X-Cart-Id']: cartId }`          | `property-key`, noise       |
| Text of a tagged template, which its tag reads                                                        | `` `color: ${value}` `` → `` `${value}` ``                   | `tagged-template`, noise    |
| [logical-operator](/mutators/logical-operator) drops the default instead                              | `'Unnamed'` → `''` in `name \|\| 'Unnamed'`                  | `O16`, owned                |
| [logical-operator](/mutators/logical-operator) swaps `\|\|` for `??` instead                          | `'Guest'` → `''` in `name \|\| 'Guest'` with `name?: string` | `R7`, subsumed              |
| Pattern or flags of `RegExp`, left to the regex mutators                                              | `'^SALE-'` → `''` in `new RegExp('^SALE-')`                  | `regex-argument`, noise     |
| Read by the Vue or Svelte compiler as written                                                         | `'title'` → `''` in `defineProps(['title'])`                 | `compiler-macro`, invalid   |
| Same code as another mutant                                                                           | `` `/cart/${id}` `` → `''`                                   | `duplicate`, duplicate      |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)                        | `'owner'` → `''` in `role === 'admin' \|\| 'owner'`          | `O3`, owned                 |
| Description of a `Symbol()`                                                                           | `'cart'` → `''` in `Symbol('cart')`                          | `symbol-description`, noise |
| String that stands alone as a statement                                                               | `'use client'` → `''` after an `import`                      | `bare-string`, noise        |
| May keep a loop running forever                                                                       | `'done'` → `''` in `state = 'done'`                          | `loop-advance`, timeout     |

Changes that come back:

- `case-label`, with the [`caseTests`](#casetests) option.
- `loop-advance`, with the [`timeouts`](/guide/configuration#timeouts) setting.
- `log-message`, for a name removed from
  [`loggers`](/guide/configuration#loggers).
- `O4`, `R5` and `R7`, when the other mutant doesn't run, as when its mutator is
  off or ignored on that line.
- The `RegExp` flags, when [regex-flag](/mutators/regex-flag) is off.

`strict` turns on `caseTests` and `timeouts`. The other changes stay skipped.
