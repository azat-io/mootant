> **Смоук, не результаты**: `node --cpu-prof bin/mootant.js list core` (текст, 17 098 строк) и `list core --json --skipped` в /home/user/wt/base (170ec52), load average ~30. Основание BUG-702.

```
text: 16.12 s wall, 251640 KB; json --skipped: 9.08 s wall, 347784 KB
```

### CPU.20261104.060147.8348.0.001.cpuprofile

Sampled 15846.1 ms of 15993.0 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `o` | /home/user/wt/base/dist/cli/terminal/get-display-width.js:12 | 6449.4 | 40.7% |
| 2 | `(garbage collector)` | :0 | 1462.9 | 9.2% |
| 3 | `jsonParseAst` | node_modules/oxc-parser/src-js/wrap.js:34 | 822.8 | 5.2% |
| 4 | `parseSync` | node_modules/oxc-parser/src-js/index.js:57 | 771.9 | 4.9% |
| 5 | `read` | :0 | 362.8 | 2.3% |
| 6 | `i` | /home/user/wt/base/dist/core/syntax/get-exited-loops.js:12 | 197.7 | 1.2% |
| 7 | `t` | /home/user/wt/base/dist/core/tree/walk-tree.js:2 | 197.1 | 1.2% |
| 8 | `p` | /home/user/wt/base/dist/cli/diff/format-change.js:25 | 190.3 | 1.2% |
| 9 | `c` | /home/user/wt/base/dist/cli/diff/format-change.js:20 | 140.0 | 0.9% |
| 10 | `compileSourceTextModule` | node:internal/modules/esm/utils:344 | 136.1 | 0.9% |
| 11 | `k` | /home/user/wt/base/dist/core/mutators/shared/get-comparison-plan.js:135 | 132.0 | 0.8% |
| 12 | `o` | /home/user/wt/base/dist/core/mutators/shared/is-boolean-valued.js:7 | 127.1 | 0.8% |
| 13 | `wrap` | node_modules/oxc-parser/src-js/wrap.js:1 | 120.5 | 0.8% |
| 14 | `u` | /home/user/wt/base/dist/core/ignore/parse-ignore-directives.js:69 | 111.4 | 0.7% |
| 15 | `u` | /home/user/wt/base/dist/core/hints/create-syntactic-type-provider.js:6 | 107.1 | 0.7% |

| package | self, ms | share |
|---|---|---|
| project/cli/terminal | 6830.5 | 43.1% |
| oxc-parser | 1885.3 | 11.9% |
| (garbage collector) | 1462.9 | 9.2% |
| (native) | 816.2 | 5.2% |
| project/core/generate | 642.4 | 4.1% |
| project/mutators/shared | 605.1 | 3.8% |
| project/core/syntax | 565.0 | 3.6% |
| project/cli/diff | 469.0 | 3.0% |
| project/core/hints | 422.2 | 2.7% |
| project/core/tree | 411.8 | 2.6% |
| node:internal/modules | 306.4 | 1.9% |
| project/core/identity | 214.3 | 1.4% |
| project/core/mutators | 199.6 | 1.3% |
| project/cli/report | 164.7 | 1.0% |
| node:internal/crypto | 157.2 | 1.0% |

| function (inclusive) | ms | share |
|---|---|---|
| `core/files/list-file-mutants.js` | 5499.7 | 34.7% |
| `core/generate/generate-file-mutants.js` | 5482.2 | 34.6% |
| `core/generate/collect-candidates.js` | 3576.7 | 22.6% |
| `core/files/expand-paths.js` | 4.2 | 0.0% |
| `cli/report/build-list-report.js` | 62.5 | 0.4% |
| `cli/report/format-report.js` | 7507.8 | 47.4% |
| `cli/report/format-text-report.js` | 7507.8 | 47.4% |
| `cli/report/format-file-groups.js` | 6170.9 | 38.9% |
| `cli/terminal/get-display-width.js` | 6837.5 | 43.1% |

### CPU.20261104.060203.9544.0.001.cpuprofile

Sampled 8849.9 ms of 8929.5 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `(garbage collector)` | :0 | 1048.4 | 11.8% |
| 2 | `jsonParseAst` | node_modules/oxc-parser/src-js/wrap.js:34 | 949.5 | 10.7% |
| 3 | `parseSync` | node_modules/oxc-parser/src-js/index.js:57 | 719.4 | 8.1% |
| 4 | `json` | /home/user/wt/base/dist/cli/report/format-report.js:4 | 274.5 | 3.1% |
| 5 | `a` | /home/user/wt/base/dist/core/hints/analyze-scopes.js:20 | 264.3 | 3.0% |
| 6 | `replaceOperator` | /home/user/wt/base/dist/core/text/create-source-code.js:16 | 259.6 | 2.9% |
| 7 | `p` | /home/user/wt/base/dist/core/generate/collect-candidates.js:17 | 208.9 | 2.4% |
| 8 | `wrap` | node_modules/oxc-parser/src-js/wrap.js:1 | 189.0 | 2.1% |
| 9 | `f` | /home/user/wt/base/dist/core/mutators/string-literal.js:123 | 185.4 | 2.1% |
| 10 | `D` | /home/user/wt/base/dist/core/generate/collect-candidates.js:49 | 163.5 | 1.8% |
| 11 | `t` | /home/user/wt/base/dist/core/tree/walk-tree.js:2 | 155.7 | 1.8% |
| 12 | `consoleCall` | :0 | 145.6 | 1.6% |
| 13 | `(anonymous)` | :0 | 129.1 | 1.5% |
| 14 | `k` | /home/user/wt/base/dist/core/mutators/shared/get-comparison-plan.js:135 | 120.1 | 1.4% |
| 15 | `n` | /home/user/wt/base/dist/core/identity/assign-mutant-ids.js:3 | 114.7 | 1.3% |

| package | self, ms | share |
|---|---|---|
| oxc-parser | 2001.0 | 22.6% |
| (garbage collector) | 1048.4 | 11.8% |
| project/core/generate | 885.3 | 10.0% |
| project/core/hints | 748.5 | 8.5% |
| project/mutators/shared | 626.4 | 7.1% |
| project/cli/report | 484.2 | 5.5% |
| project/core/mutators | 405.8 | 4.6% |
| (native) | 402.4 | 4.5% |
| project/core/text | 368.8 | 4.2% |
| project/core/identity | 337.5 | 3.8% |
| project/core/tree | 325.9 | 3.7% |
| project/core/syntax | 248.0 | 2.8% |
| node:internal/crypto | 184.5 | 2.1% |
| @eslint-community/regexpp | 135.4 | 1.5% |
| node:internal/modules | 127.0 | 1.4% |

| function (inclusive) | ms | share |
|---|---|---|
| `core/files/list-file-mutants.js` | 6479.6 | 73.2% |
| `core/generate/generate-file-mutants.js` | 6472.3 | 73.1% |
| `core/generate/collect-candidates.js` | 4223.1 | 47.7% |
| `core/files/expand-paths.js` | 6.1 | 0.1% |
| `cli/report/build-list-report.js` | 134.6 | 1.5% |
| `cli/report/format-report.js` | 395.9 | 4.5% |
| `cli/report/format-text-report.js` | 0.0 | 0.0% |
| `cli/report/format-file-groups.js` | 0.0 | 0.0% |
| `cli/terminal/get-display-width.js` | 11.3 | 0.1% |

