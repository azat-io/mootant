# Contributing

Thank you for your interest in contributing to Mootant! This document provides
guidelines and instructions for contributing to the project.

## How to Contribute

### Reporting Issues

Before creating an issue, please check existing issues to avoid duplicates. When
creating a new issue:

1. Use a clear and descriptive title
2. Provide detailed description of the issue
3. Include steps to reproduce (if it's a bug)
4. Include expected vs actual behavior
5. Add relevant labels

For a missing, wrong or useless mutant, include the smallest snippet that shows
it, the output of `mootant list <file>` and the mutant you expected.

### Suggesting Features

Feature requests are welcome! Please:

1. Check if the feature has already been suggested
2. Provide clear use case and motivation
3. Explain how it benefits users
4. Consider implementation complexity

For a new mutator, show a bug in real code that its mutants would catch and the
existing mutators miss.

### Pull Requests

1. **Fork & Clone**

   ```bash
   git clone https://github.com/your-username/mootant.git
   cd mootant
   ```

2. **Install Dependencies**

   ```bash
   pnpm install
   ```

3. **Create Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make Changes**
   - Follow existing code style
   - Add/update tests as needed
   - Update documentation if required

5. **Run Tests & Checks**

   ```bash
   pnpm test          # Full suite: lint, types, unit (with coverage), etc.
   # Or target specific checks during iteration:
   pnpm test:unit     # Unit tests with coverage (Vitest)
   pnpm test:js       # ESLint
   pnpm test:types    # TypeScript type check
   pnpm test:format   # Prettier formatting check
   pnpm test:spelling # Spell check (cspell)
   ```

6. **Commit Changes**

   ```bash
   git commit -m "feat: add amazing feature"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `style:` Code style changes (formatting, etc)
   - `refactor:` Code refactoring
   - `test:` Test changes
   - `chore:` Build process or auxiliary tool changes
   - `perf:` Performance improvements

7. **Push & Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Node.js ^20.19.0 or >=22.12.0
- pnpm 12
- Git

### Project Structure

```
mootant/
├── adapters/          # Test runner adapters
│   └── vitest/        # Vitest: session, Vite plugin, worker runner
│       ├── types/     # Types used only by the Vitest adapter
│       └── worker/    # Code that runs inside Vitest workers
├── bin/               # CLI launcher pointing to dist
├── cli/               # CLI entry point (TypeScript)
├── core/              # Core logic
│   ├── config/        # Configuration file loading and run setup
│   ├── files/         # Expansion of paths into source files
│   ├── generate/      # Mutant generation: candidates, filters, deduplication
│   ├── hints/         # Scope analysis and syntactic type hints
│   ├── identity/      # Stable mutant ids
│   ├── ignore/        # mootant-ignore comments
│   ├── instrument/    # Switched files that hold every mutant of a file
│   ├── mutators/      # Built-in mutators, one per file
│   │   └── shared/    # Helpers shared by mutators
│   ├── parser/        # Parsing with oxc-parser, Svelte and Vue templates
│   ├── plugins/       # Mutator registry, core plugin, preset resolution
│   ├── presets/       # recommended and strict presets
│   ├── regex/         # Regular expression parsing, checks and pattern changes
│   ├── run/           # Runner-agnostic run: dry run, batch, isolated rounds
│   ├── runtime/       # Runtime the switched files call inside test workers
│   ├── skips/         # Rules that skip redundant or noisy mutants
│   ├── syntax/        # Questions about the syntactic position of a node
│   ├── text/          # Source text helpers: positions, operators, edits
│   └── tree/          # Runtime tree: parents, slots, parentheses
├── test/              # Tests (Vitest), at the path of the file under test
│   ├── fixtures/      # Acceptance fixtures of the list and run commands
│   └── helpers/       # Test helpers
└── types/             # Shared TypeScript types, grouped by area
    ├── adapter/       # Contract between the run and a test runner adapter
    ├── config/        # Configuration, plugins and presets
    ├── hints/         # Type hints
    ├── mutant/        # Mutants, skips, ignore comments and diagnostics
    ├── mutator/       # Mutator API
    ├── regex/         # Regular expression literals, calls and pattern changes
    ├── report/        # List and run reports
    ├── run/           # Run state, verdicts and results
    ├── source/        # Source files, positions and edits
    └── syntax/        # Syntax tree helpers and scope analysis
```

### Available Scripts

```bash
# Build
pnpm build          # Build the project (Vite)

# Full test suite
pnpm test           # Runs all test:* scripts

# Focused checks
pnpm test:unit      # Unit tests with coverage (Vitest)
pnpm test:js        # ESLint
pnpm test:types     # TypeScript type check (no emit)
pnpm test:format    # Prettier formatting check
pnpm test:spelling  # Spell check (cspell)
pnpm test:usage     # Unused files/exports/deps (knip)
pnpm test:packages  # Dependency dedupe check

# Local CLI run (after build)
node bin/mootant.js --help
node bin/mootant.js list core
```

Note: A `dev` command is not used in this repo. Build, then run the CLI via
`node bin/mootant.js` for local testing.

## Adding a Mutator

1. Create `core/mutators/<name>.ts`. A mutator has `meta` with a description and
   a `create(context)` function that returns visitors by AST node type. Each
   visitor returns replacements: the node and its new source text.
2. Register it in `core/plugins/core-plugin.ts`.
3. Enable it in `core/presets/recommended.ts`. Options that add noisier mutants
   belong to `core/presets/strict.ts`.
4. Add `test/core/mutators/<name>.test.ts`.
5. If the mutator changes the mutants of the acceptance fixture, update the
   fixture (see below).

## Testing Guidelines

- Write tests for new features
- Keep coverage at 100%: statements, branches, functions and lines
- Test edge cases and error scenarios
- Use descriptive test names
- Put the test at the path of the file under test: `core/text/edit-text.ts` is
  tested in `test/core/text/edit-text.test.ts`

Example test:

```typescript
import { describe, expect, it } from 'vitest'

import { runMutator } from '../../helpers/run-mutator'

describe('updateOperator', () => {
  it('swaps ++ and --', () => {
    expect(runMutator('update-operator', 'count++')).toMatchObject([
      { replacement: 'count--', original: 'count++' },
    ])
  })
})
```

### Acceptance Fixture

`test/fixtures/list/` checks the whole `list` command:

- `source/` holds the input files. They are written for the test, not to run:
  Prettier, ESLint and TypeScript skip them.
- `expectations.json` lists every expected mutant by hand.
- `derive-expected-mutants.mjs` turns the expectations into the expected JSON
  reports of both presets. It never imports the implementation.

After changing the sources or the expectations, regenerate the reports:

```bash
node test/fixtures/list/derive-expected-mutants.mjs
```

`expected-skipped.json` and `expected-skipped-strict.json` hold the skipped
candidates of `--skipped` with their summary counts. They come from the CLI, not
from the oracle, so review the diff by hand before you commit it. To regenerate
them, build first with `pnpm build`, then run
`node bin/mootant.js list test/fixtures/list/source --json --verbose --skipped`
(add `--preset strict` for the strict file) and keep only `skipped`,
`summary.totalSkipped` and `summary.skippedByCategory`.

## Code Style

### TypeScript

- Use `let` for variables; `const` only for true constants such as
  `KEBAB_CASE_PATTERN`
- One exported function per file, named after the file
- Put shared types in a subfolder of `types/`, one per file; types used by one
  adapter only go in its own `types/` folder
- Prefer early returns
- Use meaningful variable names
- Add JSDoc comments to functions, types and their fields

### Formatting

- 2 spaces for indentation
- No semicolons
- Single quotes for strings
- Trailing commas in multiline structures
- Max line length: 80 characters

### File Naming

- Kebab case for files: `get-comparison-plan.ts`

## Security

If you discover a security vulnerability:

1. **DO NOT** create a public issue
2. Email security details to the maintainer
3. Allow time for patch before disclosure

## Tips

- Commit messages follow Conventional Commits. A commit-msg hook is configured
  via `simple-git-hooks`. To enable hooks locally after install, run:
  `pnpm exec simple-git-hooks`.
- Use `pnpm` v12 to ensure script features like regex runs (e.g.
  `pnpm run /^test:/`).
