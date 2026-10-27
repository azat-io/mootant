---
title: Configuration
description:
  Set the presets, mutators and their options, shared settings, plugins and the
  defaults of mootant run in a configuration file.
keywords:
  - mutation testing
  - configuration
  - config file
  - presets
  - mutators
  - plugins
  - test runner
---

Mootant works without a configuration: it applies the `recommended` preset and
finds your test runner itself. Add a configuration file to change the mutators,
set the paths to mutate or tune `mootant run`.

## Configuration file

Create `mootant.config.ts` in the root of your project:

```ts
import { defineConfig } from 'mootant'

export default defineConfig({
  mutators: {
    'string-literal': 'off',
  },
  run: {
    paths: ['src'],
    threshold: 80,
  },
})
```

`defineConfig` only adds types: it returns the object as it is.

Mootant looks for a configuration in the current directory, then in each
directory above it, and uses the first one it finds. In each directory, it
checks in this order:

1. The `mootant` key of `package.json`
2. `.mootantrc` and `.mootantrc.json`, written in JSON
3. `mootant.config.js`, `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts`

To use another file, pass its path:

```sh
npx mootant run --config mootant.ci.config.ts
```

A JSON configuration takes the same options, except plugins and test runner
adapters, which have to be imported:

```json
{
  "extends": ["strict"],
  "run": {
    "paths": ["src"]
  }
}
```

TypeScript files need Node.js 22.18 or later, which strips types itself. On
older versions, install the [`jiti`](https://github.com/unjs/jiti) package.

### Project root

The directory of the configuration file is the root of the project. Reported
paths and mutant ids are relative to it, so they stay the same wherever in the
project you run Mootant. Paths in the configuration are relative to the root,
and paths on the command line to the current directory. Without a configuration
file, the current directory is the root.

## Presets

A preset is a ready set of mutators and settings. `extends` lists the presets to
apply, in order, and a later preset overrides an earlier one:

```ts
export default defineConfig({
  extends: ['strict'],
})
```

- `recommended`, the default: every built-in mutator, without noisy variants and
  without mutants that may cause timeouts
- `strict`: `recommended` with the noisier options of the mutators, the mutants
  that may cause timeouts and the coarse mutants that `recommended` drops

`--preset` replaces `extends` for one run, while the `mutators` and `settings`
of the configuration still apply:

```sh
npx mootant run src --preset strict
```

## Mutators

`mutators` turns mutators on and off and sets their options, over the presets.
[Mutators](/mutators) lists every mutator with the changes it makes. The id of a
mutator is the name that reports show next to each mutant:

```ts
export default defineConfig({
  mutators: {
    'string-literal': 'off',
    'method-call': ['on', { anyReceiver: true }],
  },
})
```

- `'off'`: the mutator does not run
- `'on'`: the mutator runs with its default options
- `['on', options]`: the mutator runs with these options over its defaults

A setting replaces the one that a preset gives, so its options are merged over
the defaults of the mutator, not over the options of the preset. With `strict`,
`'method-call': 'on'` turns `anyReceiver` back off.

### Mutator options

The options are `false` by default, and `strict` turns all of them on.
`nullishSwap` is `'distinguishing'` by default, and `strict` sets it to
`'always'`.

- [`assignment-operator`](/mutators/assignment-operator)
  - `nullishSwap`: with `'always'`, `??=` and `||=` are also swapped for a
    number with the default `0`, such as `count ??= 0`, and for a left side of
    unknown type
- [`logical-operator`](/mutators/logical-operator)
  - `nullishSwap`: the same for `??` and `||`
  - `nullishNormalization`: drops a `null`, `undefined` or `void 0` default of
    `??`, so `value ?? null` becomes `value`
- [`method-call`](/mutators/method-call)
  - `anyReceiver`: mutates methods also on receivers of another known type, such
    as `filter()` on an instance of your own class
- [`number-literal`](/mutators/number-literal)
  - `caseTests`: mutates numbers in `case` labels
- [`optional-chaining`](/mutators/optional-chaining)
  - `nonNullable`: replaces `?.` also where type hints say that the value cannot
    be nullish, since annotations can be wrong at runtime
- [`regex-flag`](/mutators/regex-flag)
  - `additions`: adds `i` to a pattern with cased letters and `g` to the pattern
    of a `.replace()` call
- [`regex-pattern`](/mutators/regex-pattern)
  - `classMembers`: removes an element of a character class and narrows a range
    by one character at each end
  - `largeAlternations`: removes an alternative also from a list of more than
    eight
  - `negations`: negates classes and escapes, such as `[a]` and `[^a]` or `\d`
    and `\D`, and turns `\.` into `.`
  - `quantifiers`: narrows a quantifier, such as `x+` to `x` or `x*` to `x?`,
    and moves its bounds by one
- [`statement-removal`](/mutators/statement-removal)
  - `jumps`: removes `continue`, `yield` and the `break` of a loop or a label
- [`string-literal`](/mutators/string-literal)
  - `caseTests`: mutates strings in `case` labels

## Settings

`settings` holds the settings that all mutators share. Each one overrides the
same setting of the presets:

```ts
export default defineConfig({
  settings: {
    templates: false,
  },
})
```

### loggers

Loggers whose messages are not mutated. Mootant skips the mutants that only
change the text of a log call or remove the call, and leaves alone the labels of
child loggers, such as `'db'` in `logger.child('db')`.

A name is a receiver whose log methods write entries, such as `logger` in
`logger.info('Saved')`, or a function called with a text first, such as
`debug('Saved')`. A name matches in any letter case, and a leading `*` matches
any start: `*Logger` matches `requestLogger`.

`recommended` sets `['console', 'log', 'logger', '*Logger', 'debug']`. Your list
replaces it, so repeat these names to add one:

```ts
export default defineConfig({
  settings: {
    loggers: ['console', 'log', 'logger', '*Logger', 'debug', 'consola'],
  },
})
```

### templates

Whether expressions in Svelte and Vue templates are mutated, when Svelte 5 or
`@vue/compiler-dom` 3.5 or later is installed. `true` by default.

### timeouts

Whether to add the mutants that may cause timeouts, such as a loop condition
forced to `true`. `false` by default, `strict` turns it on.

### coarseMutants

Whether to keep a coarse mutant, such as a removed statement, when a finer
mutant lies inside it. `recommended` drops such a mutant, since a test that
kills the finer one already has to observe this code. That is not a proof, so
`strict` keeps it.

## Plugins

`plugins` adds the mutators and presets of plugin packages. Import a plugin in
the configuration and give it a namespace in kebab case. The namespace prefixes
the ids of the plugin's mutators and presets, such as `acme/recommended`:

```ts
import { defineConfig } from 'mootant'
import acme from 'mootant-plugin-acme'

export default defineConfig({
  extends: ['recommended', 'acme/recommended'],
  plugins: { acme },
})
```

The mutators of a plugin run only when a preset or `mutators` turns them on.

## Run settings

`run` holds the defaults of `mootant run`. An option on the command line wins
over the setting of the same name:

```ts
export default defineConfig({
  run: {
    paths: ['src'],
    threshold: 80,
    concurrency: 4,
  },
})
```

### paths

Files and directories to mutate when the command line gives none, relative to
the root of the project. With them, `mootant run` needs no arguments.
`mootant list` always takes its paths from the command line.

### threshold

The lowest mutation score, from 0 to 100, that passes. Below it, the exit code
is 1. No threshold by default. The `--threshold` option sets it for one run.

### concurrency

The most test files to run at once. By default, the `maxWorkers` of Vitest, or
the number of CPU cores minus one for `node:test`. The `--concurrency` option
sets it for one run.

### fast

Fast mode tries many mutants in one test run and trusts their kills. It is
faster, but a kill may be false, and tests that run concurrently run one at a
time. It works with Vitest and changes nothing with `node:test`. `false` by
default. `--fast` and `--no-fast` set it for one run.

### cache

Whether to reuse the verdicts of earlier runs. They are kept in
`node_modules/.cache/mootant` in the root of the project and reused while the
mutated file and the files and environment variables its tests read stay the
same. `true` by default. `--no-cache` and `--cache` set it for one run.

### incremental

Whether a verdict outlives changes elsewhere. A cached verdict is reused while
the declaration of its mutant, what that uses in its file and what its tests
read outside the mutated files stay the same. It is faster after an edit, but a
change of a caller or of another mutated file may leave a verdict stale. It
needs the cache. `false` by default. `--incremental` and `--no-incremental` set
it for one run.

### html

Whether to write the [HTML report](/guide/report) after the run: `true` writes
it to `.mootant/report.html` in the root of the project, a path writes it there,
relative to the root. No report by default. `--html` asks for it for one run,
and `--no-html` skips it. A run of single mutants with `--mutant` writes a
report only with `--html`, so a re-check keeps the report of the whole run.

### runner

The test runner: `'vitest'`, `'node-test'` or an adapter object. By default,
Mootant detects it, and a runner that the test scripts of `package.json` call
wins over one that is only installed.

To run Vitest with another configuration file than the one it finds, import the
adapter from `mootant/vitest`. The path is relative to the root of the project:

```ts
import { vitestAdapter } from 'mootant/vitest'
import { defineConfig } from 'mootant'

export default defineConfig({
  run: {
    runner: vitestAdapter({ config: 'vitest.unit.config.ts' }),
  },
})
```

The adapter of `node:test` comes from `mootant/node-test`:

```ts
import { nodeTestAdapter } from 'mootant/node-test'
import { defineConfig } from 'mootant'

export default defineConfig({
  run: {
    runner: nodeTestAdapter({
      files: ['test/**/*.test.js'],
      env: { TZ: 'UTC' },
    }),
  },
})
```

`nodeTestAdapter` takes these options:

- `command`: the test command as a script of `package.json` has it, such as
  `bnt` or `node --test --import tsx`. Mootant reads its flags and files and
  never runs it. Taken from the test scripts by default.
- `files`: test files or globs, relative to the root, in place of those of the
  command
- `execArgv`: Node.js flags added after those of the command
- `env`: environment variables added to the test processes
- `node`: the Node.js binary that runs the tests, by default the one that runs
  Mootant

### timeout

The time limit of each test with a mutant: `factor × duration + constant`
milliseconds, where the duration is how long the test took without mutants. A
mutant that goes over it counts as a timeout. `{ factor: 3, constant: 250 }` by
default.

### hitLimit

The most evaluations of mutated code in each test: `max(floor, factor × hits)`,
where the hits are how many evaluations the test made without mutants. A mutant
that goes over it, such as a loop made endless, counts as a timeout without
waiting for the time limit. `{ factor: 100, floor: 100000 }` by default.
