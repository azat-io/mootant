# Changelog

## v0.2.0

[compare changes](https://github.com/azat-io/mootant/compare/v0.1.0...v0.2.0)

### 🚀 Features

- Add option to mutate quoted jsx attributes
  ([cc84180](https://github.com/azat-io/mootant/commit/cc84180))

### 🐞 Bug Fixes

- Drop only the files that break the dry run
  ([23935cc](https://github.com/azat-io/mootant/commit/23935cc))
- Ignore one-off failures of tests that ran
  ([8d2d9f5](https://github.com/azat-io/mootant/commit/8d2d9f5))
- ⚠️ Narrow removals to the removed element
  ([b6142d3](https://github.com/azat-io/mootant/commit/b6142d3))
- Keep html comment regexes loading in vite 8
  ([033ae94](https://github.com/azat-io/mootant/commit/033ae94))
- Confirm hit limit timeouts
  ([d3a61a5](https://github.com/azat-io/mootant/commit/d3a61a5))
- Give rechecks the tests of the full run
  ([312ff7b](https://github.com/azat-io/mootant/commit/312ff7b))
- Confirm fast mode timeouts with file time
  ([26656f8](https://github.com/azat-io/mootant/commit/26656f8))
- Count unhandled errors as vitest does
  ([74d9766](https://github.com/azat-io/mootant/commit/74d9766))
- Keep removals of string array elements
  ([aaa4689](https://github.com/azat-io/mootant/commit/aaa4689))
- Keep returned locals that other code reads
  ([dda0203](https://github.com/azat-io/mootant/commit/dda0203))
- Keep mutants under tests with effects
  ([a684578](https://github.com/azat-io/mootant/commit/a684578))
- Keep boolean locals that other code reads
  ([4eb7fcb](https://github.com/azat-io/mootant/commit/4eb7fcb))
- Run the mutants skipped changes are left to
  ([2824b83](https://github.com/azat-io/mootant/commit/2824b83))
- Keep drops of falsy number defaults
  ([f018b9a](https://github.com/azat-io/mootant/commit/f018b9a))
- Keep exit tests of loops with other exits
  ([f660892](https://github.com/azat-io/mootant/commit/f660892))
- Track files plugins watch for virtual modules
  ([01b9137](https://github.com/azat-io/mootant/commit/01b9137))
- Track files tests read outside the root
  ([996431f](https://github.com/azat-io/mootant/commit/996431f))
- Warn when file times turn the cache off
  ([bd7af11](https://github.com/azat-io/mootant/commit/bd7af11))

#### ⚠️ Breaking Changes

- ⚠️ Narrow removals to the removed element
  ([b6142d3](https://github.com/azat-io/mootant/commit/b6142d3))

### ❤️ Contributors

- Azat S. ([@azat-io](https://github.com/azat-io))

## v0.1.0

### 🚀 Initial Release
