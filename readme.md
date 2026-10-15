# Mootant

[![Version](https://img.shields.io/npm/v/mootant.svg?color=b8f12a&labelColor=f4f2ec)](https://npmjs.com/package/mootant)
[![Code Coverage](https://img.shields.io/codecov/c/github/azat-io/mootant.svg?color=b8f12a&labelColor=f4f2ec)](https://codecov.io/gh/azat-io/mootant)
[![GitHub License](https://img.shields.io/badge/license-MIT-232428.svg?color=b8f12a&labelColor=f4f2ec)](https://github.com/azat-io/mootant/blob/main/license.md)

Mutation testing for JavaScript and TypeScript.

Mootant makes small changes to your code (mutants) and checks whether your tests
notice them. A mutant that survives points to a test that is missing or too
weak. Mootant aims for mutants that are worth fixing: it skips mutants that
cannot change behavior, that duplicate another mutant or that only a timeout can
catch.

> **Early development.** For now Mootant only lists the mutants it would run;
> running tests against them is not implemented yet.

## Usage

```sh
mootant list src
```

Mootant reads JavaScript and TypeScript files (`.js`, `.jsx`, `.mjs`, `.cjs`,
`.ts`, `.tsx`, `.mts`, `.cts`) and the scripts of Vue, Svelte and Astro
components (`.vue`, `.svelte`, `.astro`): `<script>` blocks and the code between
the leading `---` lines of an Astro file. Expressions in component templates are
not mutated.

Options:

- `--config <path>`: configuration file to use instead of the one Mootant finds
  (see [Configuration](#configuration))
- `--preset <name>`: `recommended` (default), `strict`, which adds noisier
  mutants, or a plugin preset; it replaces the presets of the configuration
- `--json`: print the list as JSON for tools and AI agents
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
is ignored.

## Configuration

Mootant looks for a configuration from the current directory up: a
`mootant.config.js` (also `.mjs`, `.cjs`, `.ts`, `.mts` and `.cts`),
`.mootantrc`, `.mootantrc.json` or the `mootant` key of `package.json`. The
directory of the configuration is the project root: paths and mutant ids are
relative to it, so they stay the same wherever Mootant runs in the project.

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
- `settings`: `coarseMutants` and `timeouts`, over the presets
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

TypeScript configuration files need Node.js 22.18 or later, which strips types
itself, or the [`jiti`](https://github.com/unjs/jiti) package.

## Contributing

See
[Contributing Guide](https://github.com/azat-io/mootant/blob/main/contributing.md).

## License

MIT &copy; [Azat S.](https://azat.io)
