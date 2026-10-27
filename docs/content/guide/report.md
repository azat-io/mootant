---
title: HTML report
description:
  Write the results of a run to one HTML file and browse the score, the files
  with their mutants in place, the mutators and the tests.
keywords:
  - mutation testing
  - html report
  - mutation score
  - survived mutants
  - test quality
---

The terminal report lists what to fix. The HTML report shows the whole run: the
score of every file, every mutant in its code, the changes Mootant left out on
purpose and what each test reaches. It is one file that opens offline, so it
also works as a build artifact.

## Write the report

Add `--html` to a run:

```sh
npx mootant run src --html
```

The report goes to `.mootant/report.html` in the root of the project, and the
run prints its path after the terminal report. Add `.mootant` to `.gitignore`.

To write the report on every run, or to another path, set `html` in the run
settings of the [configuration](/guide/configuration#html):

```ts
export default defineConfig({
  run: {
    html: 'reports/mutation.html',
  },
})
```

`--no-html` skips it for one run. A re-check of single mutants with `--mutant`
writes no report unless it has `--html`, so the report of the whole run stays.

## What it shows

- **Overview**: the score, the mutators with the lowest score, the files whose
  isolated runs took the most time, the mutants by status, the time of each
  phase, the mutants to look at first grouped by file, the files from the lowest
  score and the changes left out on purpose by category.
- **Files**: the code of a file with the mutants to fix marked in place and a
  badge per line for each status. A mutant opens a panel with the change, the
  test that killed it with the first line of its failure, or, for a survivor,
  the test file to extend and the covering test to start from. The panel also
  lists the other mutants and the skipped changes at the same place and the
  command that runs the mutant again.
- **Mutants**: every mutant, filtered by status or by an id, a mutator, a file
  or a piece of code.
- **Mutators**: the score of each mutator; its name lists its mutants. One that
  keeps surviving points to a kind of change the tests do not check.
- **Tests**: what each test reaches, the survivors it runs without noticing them
  and the slowest tests.

Turn on Skipped in a file to see why some code has no mutant. Each skipped
change comes with its category, the rule that skipped it and the reason.

The download button in the header saves the run as JSON: the report that
`mootant run --json --verbose --all` prints, plus the skipped changes. Scripts
and agents can read it without opening the HTML.

## Keys

- `/`, Ctrl+K or Cmd+K: search mutants, files and tests
- `j` and `k`: next and previous mutant to fix, from the open mutant or from the
  start of the open file
- Esc: close the mutant or the skipped change

Every page and mutant has its own address, such as `report.html#/mutant/q31p`,
to share or bookmark.

## Before you share it

The report holds the source code of every mutated file and the names of the
tests. Share it only where that code may go.
