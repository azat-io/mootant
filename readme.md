# Mootant

[![Version](https://img.shields.io/npm/v/mootant.svg?color=fff&labelColor=fc46aa)](https://npmjs.com/package/mootant)
[![Code Coverage](https://img.shields.io/codecov/c/github/azat-io/mootant.svg?color=fff&labelColor=fc46aa)](https://codecov.io/gh/azat-io/mootant)
[![GitHub License](https://img.shields.io/badge/license-MIT-232428.svg?color=fff&labelColor=fc46aa)](https://github.com/azat-io/mootant/blob/main/license.md)

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

- `--preset <name>`: `recommended` (default) or `strict`, which adds noisier
  mutants
- `--json`: print the list as JSON for tools and AI agents

To skip a mutant, add a comment:

```js
// mootant-ignore-next-line string-literal: event name
emitter.emit('change', value)
```

`mootant-ignore-start` / `mootant-ignore-end` cover a region and
`mootant-ignore-file` the whole file. Without a list of mutators, every mutator
is ignored.

## Contributing

See
[Contributing Guide](https://github.com/azat-io/mootant/blob/main/contributing.md).

## License

MIT &copy; [Azat S.](https://azat.io)
