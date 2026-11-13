---
name: mootant
description:
  'Closes the test gaps that Mootant mutation testing finds in JavaScript and
  TypeScript code. Use when the user asks to kill or fix surviving mutants,
  raise a mutation score, check whether the tests would catch a bug in their
  changes, or points to a Mootant report or a mutant id.'
license: MIT
---

# Mootant

A surviving mutant is a small change to the code that the tests did not detect.
For each one, find an input on which the original and the mutant behave
differently, and assert the right behavior in a test.

Mootant decides whether a test kills a mutant. You decide what the test should
say.

## Rules

1. A mutant is killed only when the last run reports it `Killed` or `Timeout`.
2. Change test files only, apart from ignore comments the user approved. Never
   edit the code under test, Mootant or runner config, thresholds or scripts,
   and never disable, delete or loosen a test that was there before you started.
3. Never compute an expected value with the code under test or a copy of its
   algorithm. Literals, independent fixtures, the identity of an input
   (`toBe(input)`), properties and invariants are fine. Note the source of each
   expected value: a requirement, docs, a comment, a test name, a caller, or
   only the code.
4. Assert what a caller can see: a return value, a thrown error, state the
   caller reads, or a call into another module, storage, the network or a
   callback passed in.
5. Keep the task in `.mootant/ledger.md`: the root, the commands, the scope, one
   row per mutant id (verdict, reason, test, confirming run) and the next step.
   After a context reset, read it first. Continue an unfinished task from it;
   start a new ledger only for a new task.
6. Once the first run has started, do not stop to ask. Put what needs the user's
   consent, such as installing, ignore comments and suspected bugs, in the
   report.
7. Never run two Mootant commands at once in one project.

## Start

| The user gives                                  | First step                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A report to explain                             | Read it and the code it points to; run nothing.                                                                      |
| Mutant ids to fix                               | Run with `--mutant <id>` for each id; they are the whole scope.                                                      |
| A file or a function                            | Run on that file only.                                                                                               |
| A request about their changes or a pull request | Run with `--since <base>`: the base they named, else what `git rev-parse --abbrev-ref origin/HEAD` prints, else ask. |
| A request about changed tests only              | Run on the source files those tests import, without `--since`.                                                       |
| A request about the whole project, or no scope  | Run on the paths they named, else on `run.paths`, else ask.                                                          |

A report from earlier may be stale: recheck the ids you work on before you trust
it. Ids may be short prefixes: after the first run, use the full ids from its
report everywhere. The last run has the same scope as the first.

## Quick reference

`<mootant>` is the project's own Mootant: `npx --no mootant`,
`pnpm exec mootant` with pnpm, `yarn mootant` with Yarn 2 or later, or the
command the user gave. A bare `npx mootant` may download an unrelated package.

The project root is the folder of the Mootant config, searched from the current
folder up (a `mootant` key in package.json, `.mootantrc`, `mootant.config.*`),
else the current folder. `file`, `testFiles` and `run.paths` are relative to the
root, paths on the command line to the current folder. Run every command from
one folder, keep the first run's `--config` and `--preset`, and give no paths to
use `run.paths`. The commands assume a POSIX shell; in Windows PowerShell 5.1,
wrap redirects in `cmd /c "..."`, since its `>` writes UTF-16.

```sh
# A folder for the output, hidden from git
node -e "const fs=require('fs');fs.mkdirSync('.mootant',{recursive:true});fs.existsSync('.mootant/.gitignore')||fs.writeFileSync('.mootant/.gitignore','*')"

# The first run
<mootant> run [<paths>] [--since <base>] --no-fast --no-incremental [--mutant <id>] --json > .mootant/before.json 2> .mootant/before.log

# Problems of a run, then one line per mutant
node -e "const r=require('./.mootant/before.json');console.log(JSON.stringify({schemaVersion:r.schemaVersion,diagnostics:r.diagnostics,summary:r.summary}))"
node -e "for(const m of require('./.mootant/before.json').mutants)console.log(m.id,m.status,m.file+':'+(m.focus||m).line,m.scope||'-',m.mutator,m.tests)"

# A recheck: the mutant's recheck with <mootant> in place of mootant, always with --no-fast --no-incremental
<mootant> run [<paths>] --no-fast --no-incremental --mutant <id> [--mutant <id>] --json --all > .mootant/recheck.json 2> .mootant/recheck.log

# The last run: the first run's command with --all, then the final status of full ids and any new problem ids
<mootant> run [<paths>] [--since <base>] --no-fast --no-incremental [--mutant <id>] --json --all > .mootant/after.json 2> .mootant/after.log
node -e "const b=require('./.mootant/before.json').mutants.map(m=>m.id),a=require('./.mootant/after.json').mutants;for(const id of process.argv.slice(1))console.log(id,(a.find(m=>m.id===id)||{status:'missing'}).status);for(const m of a)if(!b.includes(m.id)&&['Survived','NoCoverage','Error'].includes(m.status))console.log('new',m.id,m.status)" <id> <id>
```

A mutant in the report has `id`, `file`, `line`, `mutator`, `status`, `before`
and `after` (its source lines; `…` marks a cut), `scope` (the function or
constant), `focus` (the part that changes, when smaller than the line), `test`
(the first covering test: file, name, line), `testFiles` (an object of test
files to extend, best first, each with its number of covering tests), `tests`
(covering tests; 0 on a survivor means only module loading, a setup file or a
hook such as `beforeAll` reached it) and `recheck`. With `--all`, killed and
timed-out mutants keep only `id`, `file`, `line`, `column`, `mutator`, `status`
and `killedIn`.

| Recheck status      | Meaning                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Killed`, `Timeout` | Done.                                                                                                                            |
| `Survived`          | The tests did not detect it: the input misses the change, no assertion checks what changed, a mock hides it, or nothing differs. |
| `NoCoverage`        | No test reached the code: check the test's import and the runner's test pattern.                                                 |
| `Error`             | Mootant could not test it: report its `message`; do not retry.                                                                   |
| `Ignored`           | An ignore comment covers it.                                                                                                     |

Read the problems of every run before its mutants: `diagnostics`,
`summary.totalErrors`, `summary.totalErrorMutants` and `summary.passed`. An
error diagnostic, such as `read-error` or `parse-error`, means some code was not
tested: report it. `passed: false` with exit code 1 comes from such errors, from
`Error` mutants or from a score below `summary.threshold`; tell them apart. An
empty report needs the exit code or signal and the whole log: an `Error:` line
means Mootant stopped; otherwise the process crashed, ran out of memory, was
killed or is still running. Rerun only after it has ended. If you rerun on a
smaller path, list the rest as not reached.

## Loop

1. **Prepare.** Unless the user gave a command, check that package.json lists
   `mootant` and `node -p "require('mootant/package.json').version"` prints a
   version; if not, stop and give the user the install command. Make the folder
   and start the ledger with the request, the root, the scope and the output of
   `git status --porcelain`. Before you edit a test file that already has
   changes, save its `git diff HEAD` in the ledger, or a copy in `.mootant/`
   when git does not track it.
2. **Run once**, as Start says, in the background or with the longest timeout,
   and wait for the exit. Read its problems. An `Error:` line in the log: report
   it with the lines under it and stop. `schemaVersion` other than 3 or 4: stop,
   this skill does not fit this Mootant. No mutants to act on and no errors: say
   so and stop.
3. **Ledger.** One row per id with verdict `pending`; the report keeps the rest.
   Over 20 rows: tell the user the counts per file and work file by file in the
   report's order.
4. **Witness, then test.** In a file, take one function's mutants (`scope`) with
   those in the constants it reads (`tests: 0`); log and message text last.
   Write the witness: input, original behavior, mutant behavior, source. If the
   covering test already feeds that input, add an assertion to it and keep its
   inputs. Otherwise add the smallest behavior test to the first `testFiles`
   file, in its style. Before the first test for a mutator, read its row in
   [references/mutators.md](references/mutators.md). Run the file with the
   project's runner. If your assertion fails and its value has a source other
   than the code, the code may be wrong: remove only the assertion or the test
   you added, keep the existing tests and the user's changes, and record a
   suspected bug with the input and both values. Otherwise fix your test until
   it passes.
5. **Recheck** a function's ids together. "Tests fail without mutants" on a test
   you did not write: stop and report. Still `Survived` or `NoCoverage` after
   two rechecks: `could not kill`, with what you tried.
6. **Close.** Run the project's tests for the changed files, and its typecheck
   and lint scripts when it has them. Do the last run and read its problems.
   Take each id's final status from `after.json`. Compare
   `git status --porcelain` and the saved diffs and copies with the ones in the
   ledger: your changes are in test files only, and the user's are intact. Write
   the report.

## Verdicts

`killed` · `pinned` (killed; the expected value comes only from the code) ·
`suspected bug` (another source says the original is wrong; no test kept) ·
`equivalent` (with its reason, and an ignore comment when one hides only
equivalent mutants) · `could not kill` · `not testable` (`Error`, child process,
global setup) · `not reached`. A guessed verdict is worse than `not reached`.

## No coverage

No test reached the code, so it needs a test that calls the code and checks its
result. Read `diagnostics` first: `never-served` means no test loaded the file
through the test runner's transform. If tests import it through a built copy, an
external or a pre-bundled dependency, report that rather than writing a second
set of tests. If no test imports it, there is no `testFiles`: create a test file
named and placed like the project's others. Write one test per behavior of each
uncovered function, not one per mutant. Their expected values usually come only
from the code: `pinned`.

## Equivalent mutants

Equivalent means no caller can observe the change for any input the code
accepts: same result, error, state and calls into other modules. Write why, for
the whole input domain: other types such as BigInt, `NaN`, `-0`, empty values,
other branches, thrown errors and effects. Inputs on which both versions agree
support the argument but never prove it, since `Survived` only means the tests
did not detect the change. Without the argument, the verdict is
`could not kill`. To try inputs on the mutant, put them with the original's
outputs in a throwaway test and recheck: `Killed` or `Timeout` means you found a
real test, so keep it; otherwise delete the throwaway test.

An ignore comment hides every mutant of the named mutators on the next line, not
one id; a mutant is on its `line`, and one of `kind` `element` or `property` on
the line of its `focus`. Before you propose
`// mootant-ignore-next-line <mutator>: <reason>`, with mutator names separated
by commas and never without one, list what it would hide with
`<mootant> list <file> --json --verbose`, which gives `kind`. Propose it only
when each of those mutants is equivalent, and show the user each one with its
reason. When the user approves, add the comment and list the file again: the new
`Ignored` mutants must be exactly the ones you showed, with no
`malformed-directive` or `unknown-mutator` in `diagnostics`. A coarse mutant
that comes back gets its own row.

## Report

Scope and command; the score of that scope before → after, with the counts of
errors and `Error` mutants, which leave the score; killed, confirmed by the last
run; needs your decision (pinned, suspected bugs, equivalent mutants with any
proposed ignore comment and the mutants it hides, installing); could not kill;
not testable; not reached; changed files. Commit, push or open a pull request
only when the user asks.

## Common mistakes

| You notice                                                                 | Do instead                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Putting the code's value into `expect` after your new test fails           | Check the value's source. Misread code: fix the test. A requirement backs it: suspected bug. |
| `toHaveBeenCalled*` on a helper of the same module, or on which branch ran | Assert the result. A call into another module, storage or a callback is itself the effect.   |
| "The rest are probably equivalent", or `pending` rows at the end           | One verdict per id. Out of time: `not reached`, and say so.                                  |
| "Equivalent" after failed attempts, or because a recheck said `Survived`   | That is `could not kill` until you can say why no input shows the change.                    |
| `statement-removal` added to an ignore comment to hide the coarse mutant   | Give that mutant its own row. List it only when removing the statement is invisible too.     |
| The score went up, so the tests improved                                   | Compare statuses by id: errors and `Error` mutants leave the score.                          |
| A run on the whole project for a request about one mutant or one file      | Keep to the scope from Start.                                                                |
| A snapshot or log text assertion added only for a mutant                   | Only when the text is a contract.                                                            |
| A new test reads the real clock, randomness, the network or timers         | Use the project's fakes. A kill from a flaky test is not a kill.                             |

## Done when

- Every id in the scope has one verdict in the ledger.
- Every `killed` and `pinned` id is `Killed` or `Timeout` in `after.json`; the
  report explains any id that is missing or has another status.
- The report names every error in the last run's `diagnostics`.
- No `Survived`, `NoCoverage` or `Error` id in `after.json` is new, except
  coarse mutants that approved ignore comments brought back, each with its own
  row.
- Your changes are in test files only, plus approved ignore comments, and the
  user's changes are intact.
