---
title: Getting started
description:
  Install Mootant, run it against your tests and turn the mutants that survive
  into better tests.
keywords:
  - mutation testing
  - getting started
  - installation
  - vitest
  - node test runner
  - test quality
---

Mootant makes small changes to your code, called mutants, and runs the tests
that should notice them. A mutant that survives points to a test that is missing
or too weak.

## Requirements

- Node.js 20.19, 22.12 or later
- Tests on [Vitest](https://vitest.dev) 5 or the
  [Node.js test runner](https://nodejs.org/api/test.html)
- Tests that pass as they are: Mootant runs them without mutants first

## Installation

Add Mootant to the development dependencies of your project:

```sh
npm install -D mootant
```

## First run

Point Mootant at your source code:

```sh
npx mootant run src
```

Mootant finds Vitest or `node:test` and uses your existing configuration. The
mutants are compiled into your code in memory, so your files stay untouched, and
each mutant runs only the test files that reach it.

The report lists the mutants that survived, the ones no test reached and the
ones that caused an error, file by file. Each mutant comes with its changed
lines, a short id and the test file to extend.

## Fix a surviving mutant

Write a test that fails with the change, then run that mutant again by its id:

```sh
npx mootant run src --mutant {id}
```

Verdicts are cached, so the next full run reuses them for mutants whose file and
tests did not change.

## Run in CI

Check only the lines a pull request changed, and fail the build when the
mutation score drops below a threshold:

```sh
npx mootant run src --since origin/main --threshold 80
```

## Let an agent fix them

Mootant ships with an agent skill. It reads the report, writes the missing tests
and asks Mootant to confirm each kill:

```sh
npx skills add azat-io/mootant
```
