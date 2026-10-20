# Mootant

<picture>
  <source
    srcset="https://raw.githubusercontent.com/azat-io/mootant/main/assets/logo-light.svg"
    media="(prefers-color-scheme: light)"
  />
  <source
    srcset="https://raw.githubusercontent.com/azat-io/mootant/main/assets/logo-dark.svg"
    media="(prefers-color-scheme: dark)"
  />
  <img
    src="https://raw.githubusercontent.com/azat-io/mootant/main/assets/logo-light.svg"
    alt="Mootant Logo"
    align="right"
    height="160"
    width="160"
  />
</picture>

[![Version](https://img.shields.io/npm/v/mootant.svg?color=b8f12a&labelColor=f4f2ec)](https://npmjs.com/package/mootant)
[![Code Coverage](https://img.shields.io/codecov/c/github/azat-io/mootant.svg?color=b8f12a&labelColor=f4f2ec)](https://codecov.io/gh/azat-io/mootant)
[![GitHub License](https://img.shields.io/badge/license-MIT-232428.svg?color=b8f12a&labelColor=f4f2ec)](https://github.com/azat-io/mootant/blob/main/license.md)

Mutation testing for JavaScript and TypeScript.

Mootant makes small changes to your code (mutants) and checks whether your tests
notice them. A mutant that survives points to a test that is missing or too
weak. Mootant aims for mutants that are worth fixing: it skips mutants that
cannot change behavior, that duplicate another mutant or that only a timeout can
catch.

> **Early development.** The runner currently supports Vitest 5 and the Node.js
> test runner (`node:test`).

## Usage

```sh
mootant list src
```

Mootant reads JavaScript and TypeScript files (`.js`, `.jsx`, `.mjs`, `.cjs`,
`.ts`, `.tsx`, `.mts`, `.cts`) and the scripts of Vue, Svelte and Astro
components (`.vue`, `.svelte`, `.astro`): `<script>` blocks and the code between
the leading `---` lines of an Astro file. Expressions in Svelte templates are
mutated too when Svelte 5 or later is installed, and in Vue templates when
`@vue/compiler-dom` 3.5 or later is; Astro templates are not.

Options:

- `--config <path>`: configuration file to use instead of the one Mootant finds
  (see [Configuration](#configuration))
- `--preset <name>`: `recommended` (default), `strict`, which adds noisier
  mutants, or a plugin preset; it replaces the presets of the configuration
- `--since <ref>`: only mutants on lines changed since `<ref>`, uncommitted
  changes included
- `--json`: print the list as JSON for tools and AI agents, every mutant with
  its source lines before and after the change, long lines cut around it;
  `--verbose` adds offsets, kinds, the original and replacement texts and
  mutator descriptions
- `--no-color`: print without colors (also `NO_COLOR=1`)
- `--skipped`: also list the mutants Mootant considered and did not emit, each
  with a category (`equivalent`, `noise`, `timeout`, `owned`, `subsumed`,
  `duplicate` or `invalid`), the rule that skipped it and the reason. With
  `--json` they come in a `skipped` array, with a `heuristic` flag for skips
  that rest on a guess (a method name, a type hint) rather than a proof. Code
  that is never mutated, such as types, decorators and enums, is not listed.

To skip a mutant, add a comment:

```js
// mootant-ignore-next-line string-literal: event name
emitter.emit('change', value)
```

`mootant-ignore-start` / `mootant-ignore-end` cover a region and
`mootant-ignore-file` the whole file. Without a list of mutators, every mutator
is ignored. In a Svelte or Vue template, write them as HTML comments:
`<!-- mootant-ignore-next-line -->`.

## Running

```sh
mootant run src
mootant run src --json --threshold 80
```

Uses the project's [Vitest](https://vitest.dev) 5 installation and
configuration, or [`node:test`](#nodetest), selecting tests related to the
mutated files. Progress is shown as the run goes; the report lists surviving and
uncovered mutants and mutants with errors in a section each, by file, every one
as its source lines before and after the change, with a short id and the test
file to extend. `--json` lists the same mutants with full ids, source lines,
their likeliest test files, one covering test and the command to re-check each;
`--json --all` lists every mutant, a killed one with the test file that killed
it. What the tests print is hidden, unless tests fail without mutants: then the
output of their test files is shown. Tests must pass without mutants first.

Options:

- `--config <path>`, `--preset <name>` and `--since <ref>`: as for `list`
- `--threshold <score>`: lowest mutation score, from 0 to 100, that passes
- `--concurrency <n>`: most test files at once (default: Vitest's `maxWorkers`,
  CPU cores - 1 for `node:test`)
- `--fast`: try many mutants in one test run; faster, but a kill may be false
  and concurrent tests run one at a time
- `--no-cache`: run every mutant again instead of reusing earlier verdicts
- `--mutant <id>`: run only this mutant, by its id or a unique prefix of 4
  characters or more; repeat for more
- `--verbose`: show what the tests print, the covering test of each survivor and
  the runs of the test runner; with `--json`, print the full report with every
  covering test, offsets and timings
- `--all`: with `--json`, list every mutant, not only the ones to act on

The score is killed and timed-out mutants over all scored mutants; `Ignored` and
`Error` are excluded. The exit code is 1 on errors or a score below the
threshold. Snapshots are never updated.

Verdicts are cached in `node_modules/.cache/mootant` and reused while the
mutated file and the files and environment variables its tests read stay the
same. Use `--no-cache` after changes only child processes or the network see.

Vue and Svelte components run through the project's Vite plugin of the
framework; code their compilers read as written, such as `defineProps()` or a
rune call, is not mutated. A Svelte component or Vue template that does not
compile with its mutants gives them `Error` with the compiler's message. Vue
templates reach mutants through `Math[Symbol.for('mootant')]`, so tests that
freeze `Math` break them. Astro components can be listed but not run yet. Tests
that load a mutated file only through a computed `import()` may not be selected.

### node:test

Used when the test scripts run `node --test`, `tsx --test`, `bnt` or `borp`, or
test files import `node:test`. Each mutant runs a test file in its own process,
on Node.js 20.19 or 22.12 and later; `--fast` changes nothing. Child processes
and workers run the original code, and tests slower than 60 seconds need
`--test-timeout`.

## Configuration

Mootant looks for a configuration from the current directory up: a
`mootant.config.js` (also `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts`),
`.mootantrc`, `.mootantrc.json` or the `mootant` key of `package.json`. The
directory of the configuration is the project root: reported paths and mutant
ids are relative to it, so they stay the same wherever Mootant runs in the
project. Paths on the command line are relative to the current directory.

```ts
// mootant.config.ts
import { defineConfig } from 'mootant'

export default defineConfig({
  extends: ['recommended'],
  mutators: {
    'string-literal': 'off',
  },
  settings: {
    timeouts: false,
  },
})
```

- `extends`: presets applied first, in order (`['recommended']` by default)
- `mutators`: `'on'`, `'off'` or `['on', options]` for each mutator id, over the
  presets
- `settings`: `coarseMutants`, `timeouts` and `templates` (`false` leaves Svelte
  and Vue templates alone), over the presets
  - `loggers`: loggers whose message texts are not mutated, nor plain `console`
    calls removed (default: `['console', 'log', 'logger', '*Logger', 'debug']`);
    replaces the presets
- `plugins`: plugin objects by namespace, imported by the configuration file.
  Their mutators and presets get ids like `acme/name`:

```ts
import { defineConfig } from 'mootant'
import acme from 'mootant-plugin-acme'

export default defineConfig({
  extends: ['recommended', 'acme/recommended'],
  plugins: { acme },
})
```

- `run`: settings of `mootant run`; command line options win:
  - `paths`: default source paths, relative to the configuration directory
  - `threshold`, `concurrency`, `fast`: as the options of the same names
  - `cache`: `false` as `--no-cache`
  - `runner`: auto-detected, `'vitest'`, `'node-test'`, or an imported adapter
    object. For a custom Vitest config, import `vitestAdapter` from
    `mootant/vitest` and use
    `vitestAdapter({ config: 'vitest.unit.config.ts' })`; for another test
    command, import `nodeTestAdapter` from `mootant/node-test` and use
    `nodeTestAdapter({ command: 'bnt' })` (also `files`, `execArgv`, `env`,
    `node`)
  - `timeout`: `factor × baseline duration + constant` milliseconds; defaults to
    `{ factor: 3, constant: 250 }`
  - `hitLimit`: `max(floor, factor × baseline site evaluations)`; defaults to
    `{ factor: 100, floor: 100000 }`

TypeScript configuration files need Node.js 22.18 or later, which strips types
itself, or the [`jiti`](https://github.com/unjs/jiti) package.

## Contributing

See
[Contributing Guide](https://github.com/azat-io/mootant/blob/main/contributing.md).

## License

MIT &copy; [Azat S.](https://azat.io)
