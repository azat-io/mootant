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

Mootant skips strings in error and log messages and in comparisons such as
`status === 'paid'`; see [Skipped changes](#skipped-changes). A log template
with more than a variable name in `${}`, such as `${cart.id}`, still gets a
mutant.

By default, Mootant also skips every quoted value of a JSX attribute, those of
`type`, `href`, `aria-*` and `name` included: `"password"` in `type="password"`
gets no mutant. A value in braces, such as `'/reset'` in `href={'/reset'}`, gets
one.

With the [`caseTests`](#casetests) option, on in `strict`, Mootant also changes
the strings of `case` labels. With [`jsxAttributes`](#jsxattributes), which
`strict` leaves off, it also changes the quoted values of JSX attributes.

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
- A quoted JSX attribute value, with `jsxAttributes`: the attribute of the
  rendered element, such as the `type` of a password field, or a query that
  finds the element by it, such as `getByLabelText('Password')`.

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

### jsxAttributes

`false` by default, and `strict` leaves it off: in braces, a value can change
what some code does with no mutant on, as shown below. With it, Mootant also
changes the quoted values of JSX attributes and component props: `"password"` →
`""` in `type="password"`, and `""` → `"mootant"` in `href=""`.

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'string-literal': ['on', { jsxAttributes: true }],
  },
})
```

The values of `className`, `class`, `style` and `data-testid` stay skipped:
Mootant guesses from the name that they only change how an element looks or how
a test finds it. To switch a mutant on, Mootant moves the value into braces, so
it also skips the values that would mean something else there:

- A value with `\`, a tab, a line break or a character reference such as
  `&amp;`.
- The value of an attribute that Solid reads another way once the value is in
  braces. Mootant can't tell which framework compiles a file, so it skips these
  in React code too:
  - `value` and the boolean attributes of a built-in element, such as
    `disabled`, and every attribute of a custom element: Solid sets them as
    properties, and the `disabled` property reads `""` as false.
  - A name that starts with `on`, such as `onclick`, which becomes an event
    handler, and `ref`, `children`, `classList`, `innerHTML`, `innerText` and
    `textContent`.
  - The attributes of Solid's namespaces, such as `bool:disabled`, where a `"0"`
    in braces counts as true.

Some mutants of this option need a particular test:

- An emptied value that the attribute has by default, such as `type="submit"` on
  a `<button>`, changes nothing a user sees, so only a test of the attribute
  itself, such as a snapshot, catches it.
- A changed drawing attribute of SVG, such as `d` or `fill`, only changes the
  picture, which a snapshot test catches.
- A changed `key` that only React reads survives every test, unless another
  element in its place has the new key: `"a"` → `""` in
  `flag ? <Counter key="a" /> : <Counter key="" />` keeps the state of `Counter`
  when `flag` changes.

Some code treats a value in braces another way, which these skips can't see:

- Solid sets a value in braces only after the element is created and its refs
  and `use:` directives have run, so
  `ref={el => record(el.getAttribute('type'))}` finds no `type`.
- Build plugins and macros that read a quoted value as written, such as
  twin.macro for `tw`, Lingui for `<Trans>` and `<Plural>` and formatjs for
  `<FormattedMessage>`, reject the value in braces or compile it another way.

With no mutant on, such code can then work differently: a test that notices
fails, and the mutants of the file end with an error. Keep `jsxAttributes` off
for such code, or ignore its string-literal mutants.

## Skipped changes

Mootant leaves out these changes. `npx mootant list src --skipped` shows them
with the category and the rule; [Skipped changes](/mutators#skipped-changes)
explains the categories.

| Reason                                                                                                                                                          | Example                                                      | Rule                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| Text of an error message, such as in `new Error()`                                                                                                              | `'Stock cannot be negative'` → `''`                          | `error-message`, noise      |
| Text of a log message, such as in `console.log()`                                                                                                               | `'Cart saved'` → `''`                                        | `log-message`, noise        |
| Literal in a comparison, left to [comparison-operator](/mutators/comparison-operator)                                                                           | `'paid'` → `''` in `status === 'paid'`                       | `O4`, subsumed              |
| By default, every quoted JSX attribute value, `type`, `href`, `aria-*` and `name` included; a value in `{}` gets mutants; see [`jsxAttributes`](#jsxattributes) | `"password"` → `""` in `type="password"`                     | `jsx-attribute`, noise      |
| Mootant can't switch a mutant on here, with [`jsxAttributes`](#jsxattributes)                                                                                   | `"\d+"` → `""` in `pattern="\d+"`                            | `invalid-target`, invalid   |
| Empty key gives a fixed result, as another mutator does                                                                                                         | `'GIFT-'` → `''` in `if (code.startsWith('GIFT-'))`          | `O8`, owned                 |
| Same result as a `true` or `false` of another mutator, for a condition without an effect                                                                        | `'Sale'` → `''` in `sale ? 'Sale' : ''`                      | `O19`, owned                |
| Copies the other branch, as [comparison-operator](/mutators/comparison-operator) does at the boundary, with the same effects                                    | `'Free'` → `''` in `total >= 50 ? 'Free' : ''`               | `R5`, subsumed              |
| Value of a `case` label                                                                                                                                         | `'paid'` → `''` in `case 'paid':`                            | `case-label`, noise         |
| Key of an object or a class                                                                                                                                     | `'X-Cart-Id'` → `''` in `{ ['X-Cart-Id']: cartId }`          | `property-key`, noise       |
| Text of a tagged template, which its tag reads                                                                                                                  | `` `color: ${value}` `` → `` `${value}` ``                   | `tagged-template`, noise    |
| [logical-operator](/mutators/logical-operator) drops the default instead                                                                                        | `'Unnamed'` → `''` in `name \|\| 'Unnamed'`                  | `O16`, owned                |
| [logical-operator](/mutators/logical-operator) swaps `\|\|` for `??` instead                                                                                    | `'Guest'` → `''` in `name \|\| 'Guest'` with `name?: string` | `R7`, subsumed              |
| Pattern or flags of `RegExp`, left to the regex mutators                                                                                                        | `'^SALE-'` → `''` in `new RegExp('^SALE-')`                  | `regex-argument`, noise     |
| Read by the Vue or Svelte compiler as written                                                                                                                   | `'title'` → `''` in `defineProps(['title'])`                 | `compiler-macro`, invalid   |
| Same code as another mutant                                                                                                                                     | `` `/cart/${id}` `` → `''`                                   | `duplicate`, duplicate      |
| Side of `&&` or `\|\|`, left to [logical-operator](/mutators/logical-operator)                                                                                  | `'owner'` → `''` in `role === 'admin' \|\| 'owner'`          | `O3`, owned                 |
| Description of a `Symbol()`                                                                                                                                     | `'cart'` → `''` in `Symbol('cart')`                          | `symbol-description`, noise |
| String that stands alone as a statement                                                                                                                         | `'use client'` → `''` after an `import`                      | `bare-string`, noise        |
| May keep a loop running forever                                                                                                                                 | `'done'` → `''` in `state = 'done'`                          | `loop-advance`, timeout     |

Changes that come back:

- `case-label`, with the [`caseTests`](#casetests) option.
- `jsx-attribute`, with the [`jsxAttributes`](#jsxattributes) option, except for
  `className`, `class`, `style` and `data-testid`. The values that would mean
  something else in braces become `invalid-target`.
- `loop-advance`, with the [`timeouts`](/guide/configuration#timeouts) setting.
- `log-message`, for a name removed from
  [`loggers`](/guide/configuration#loggers).
- `O4`, `R5` and `R7`, when the other mutant doesn't run, as when its mutator is
  off or ignored on that line.
- The `RegExp` flags, when [regex-flag](/mutators/regex-flag) is off.

`strict` turns on `caseTests` and `timeouts`. The other changes stay skipped.
