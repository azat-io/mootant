---
name: mootant
description: >-
  Finds weak tests with Mootant mutation testing and writes the tests that are
  missing. Use when the user asks to find gaps in tests, improve or harden
  tests, kill surviving mutants, raise the mutation score, or check the tests of
  changed code in a JavaScript or TypeScript project tested with Vitest 5 or
  node:test.
license: MIT
compatibility: >-
  Needs mootant installed in the project, Node.js 22.12+ with Vitest 5 or
  Node.js 20.19+ with node:test, and tests that pass.
---

# Mootant

Mootant makes small changes to the code, called mutants, and runs the tests
that reach them. A mutant that **survives** marks code whose behavior no test
checks. Your job: for each survivor, write the smallest test that passes on the
current code and fails on the mutant, then let Mootant confirm the kill.

## Before you start

1. `npx mootant --version` must print `mootant/0.1.0` or later. If Mootant is
   missing, ask the user before adding it (`npm install -D mootant`, or the
   project's package manager).
2. The tests must pass as they are; Mootant runs them without mutants first and
   stops otherwise.
3. Pick a small scope: the paths the user named, the code of the current
   branch (`--since main`, or the base branch), or one directory. A whole
   project can take minutes to hours.
4. `.mootant/` must be in `.gitignore`: it holds source code.

## 1. Find the mutants to act on

```sh
npx mootant run src/cart --json > .mootant/mutants.json
```

- stdout holds only JSON; progress goes to stderr.
- Exit code 1 **with empty stdout**: the run stopped (failing tests, bad
  option, unknown id). Read stderr, fix the cause, run again.
- Exit code 1 **with JSON**: errors or a score below `--threshold`. The JSON is
  still valid.
- `mutants` lists only `Survived`, `NoCoverage` and `Error`. Per mutant:
  - `id`, `file`, `line`, `column`, `mutator`, `scope` (enclosing function)
  - `before` / `after`: the source lines without and with the change; `…`
    marks text cut from a long line
  - `testFiles`: where to add the test, likeliest first, each with the number
    of its tests that reach the mutant
  - `test`: a covering test to start from (`file`, `line`, `name`)
  - `recheck`: the command that runs this mutant alone
  - `message`: the reason of an `Error`
- Add `--verbose` for `original`, `replacement` and every covering test
  (`coveredBy`). Do not read a large report at once: take one file at a time,
  for example `jq '[.mutants[] | select(.file == "src/cart.ts")]'`.

## 2. Decide what each mutant needs

Read the code around `file:line` and compare `before` with `after`. Ask: is
there an input the code can get for which a caller sees a different result,
return value, thrown error or side effect?

- **No such input**: the mutant is likely equivalent. Write no test. Tell the
  user and suggest an ignore comment with the reason; do not add it yourself
  unless asked:
  `// mootant-ignore-next-line <mutator>: <why it cannot change behavior>`.
- **Survived**: a test runs the code but does not check this difference.
  Usually an assertion is too weak or a boundary value is missing.
- **NoCoverage**: no test runs this code. Write a test that calls it. When
  `testFiles` is empty, create a test file next to the existing ones, named the
  way the project names them.
- **Error**: the mutant broke compilation or the runner. It is not a gap in the
  tests; report `message`.

What usually kills a mutator (each page at
`https://mootant.org/mutators/<mutator>` has a section "Kill a surviving
mutant"):

| Mutator                                   | Test                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `comparison-operator`, `number-literal`   | The value at the boundary and right next to it          |
| `arithmetic-operator`                     | Inputs where the operators differ: not 0, 1 or equal    |
| `logical-operator`, `condition`           | Each operand alone deciding the result, both branches   |
| `return-value`, `boolean-literal`         | The exact returned value, not `toBeTruthy()`            |
| `statement-removal`, `method-call`        | The effect of the call: state, output, thrown error     |
| `string-literal`, `regex-*`               | The exact text; strings that the changed pattern splits |
| `optional-chaining`                       | `null` or `undefined` where the code allows it          |
| `missing-await`                           | The result after `await`, rejections included           |
| `object-property`, `array-element`        | The removed property or element itself                  |

## 3. Write the test

- Add it to `testFiles[0]` (or the file of `test`), in the style of that file;
  reuse the setup of `test`.
- Assert exact values (`toBe`, `toEqual`, `toThrow(message)`), never only
  `toBeDefined()`, `toBeTruthy()` or a length.
- Name the test after the behavior, not the mutant id. One behavior per test.
- Do not change the source code to kill a mutant, and do not weaken, skip or
  delete existing tests, unless the user asks. Do not use snapshots: Mootant
  never writes them, so a new snapshot fails.

## 4. Confirm the kill

1. Run the new test with the project's runner, such as
   `npx vitest run test/cart.test.ts`. It must pass on the current code.
2. Run the mutant again with the `recheck` command, prefixed with `npx`:
   `npx mootant run src/cart --mutant q31p780qv6yk`. Repeat `--mutant` for
   several ids. Expect `killed`; with `--json`, `mutants` is empty.
3. Still `survived`: the test does not reach the line or does not observe the
   difference. Run the recheck with `--verbose` to see the covering tests.
4. An id stays the same while other code changes. It changes when the mutated
   text, its enclosing function or the file path changes; then run step 1
   again. Never use `--fast` to confirm a kill: its kills may be false.

## 5. Report

Run the scope once more (cached verdicts make it fast) and tell the user:

- killed mutants: id, file:line, the test you added
- mutants you judged equivalent, with the reason and the suggested comment
- mutants left, and why
- the score before and after
