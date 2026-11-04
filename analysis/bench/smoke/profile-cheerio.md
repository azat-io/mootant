> **Смоук, не результаты бенчмарка**: профили под `--cpu-prof` на машине под нагрузкой (load average 25–40), `--concurrency 2`, подмножество `PROFILE_MUTATE`. Проверка того, что `profile.sh` работает, и первое представление о структуре затрат.

# Profiles of cheerio

    date: 2026-11-04T06:03:29Z
    host: 4 vCPU, Intel(R) Xeon(R) Processor @ 2.10GHz, 15 GB RAM
    kernel: 6.18.44-fc-v233
    node: v22.23.4, npm 10.9.9, pnpm 12.16.1
    hyperfine: 1.18.0
    mootant: 170ec52 (mootant-0.1.0-170ec52.tgz)
    stryker: 10.1.1
    load: 13.20 27.85 32.19

Paths: src/api/forms.ts

## mootant run --no-cache under --cpu-prof: 21 s (profiling slows it down)

JSON timing, ms: {"batch":null,"isolated":11512,"startup":858,"dryRun":8104,"total":20474}; mutants 27, runs {"dry":1,"isolated":1}, isolated units 26

Profiles: main 1, other processes 36 (a worker killed by a signal writes none).

### Main process

### CPU.20261104.060330.17891.0.001.cpuprofile

Sampled 20971.5 ms of 20992.4 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `(idle)` | :0 | 17384.9 | 82.9% |
| 2 | `transformSync` | node_modules/rolldown/dist/shared/resolve-tsconfig-CQ3UD0Ax.mjs:95 | 481.6 | 2.3% |
| 3 | `spawn` | node:internal/child_process:354 | 290.4 | 1.4% |
| 4 | `(garbage collector)` | :0 | 225.8 | 1.1% |
| 5 | `compileSourceTextModule` | node:internal/modules/esm/utils:344 | 167.0 | 0.8% |
| 6 | `writeBuffer` | :0 | 124.9 | 0.6% |
| 7 | `dlopen` | :0 | 108.2 | 0.5% |
| 8 | `(program)` | :0 | 72.5 | 0.3% |
| 9 | `update` | node_modules/vite/dist/node/chunks/node.js:4455 | 72.4 | 0.3% |
| 10 | `wrappedHook` | node_modules/rolldown/dist/shared/normalize-string-or-regex-COVDiCTB.mjs:19 | 59.4 | 0.3% |
| 11 | `jsonParseAst` | node_modules/rolldown/dist/shared/parse-BFmj01mi.mjs:25 | 57.8 | 0.3% |
| 12 | `#build` | node_modules/rolldown/dist/shared/rolldown-BYX6bV3R.mjs:137 | 49.8 | 0.2% |
| 13 | `enter` | node_modules/vite/dist/node/chunks/node.js:16738 | 44.6 | 0.2% |
| 14 | `(anonymous)` | node_modules/vite/dist/node/chunks/node.js:56 | 40.7 | 0.2% |
| 15 | `encode$1` | node_modules/vite/dist/node/chunks/node.js:1020 | 40.3 | 0.2% |
| 16 | `parseChannelMessages` | node:internal/child_process/serialization:61 | 37.5 | 0.2% |
| 17 | `RegExp: \bimport\.meta\.env\b` | :0 | 36.8 | 0.2% |
| 18 | `transform` | node_modules/vite/dist/node/chunks/node.js:26578 | 35.5 | 0.2% |
| 19 | `visit` | node_modules/vite/dist/node/chunks/node.js:16102 | 34.8 | 0.2% |
| 20 | `RegExp: \/\/# sourceMappingURL=data:application\/json[^,]+base64,([A-Za-z0-9+/=]+)$` | :0 | 33.4 | 0.2% |
| 21 | `parse` | node_modules/rolldown/dist/shared/parse-BFmj01mi.mjs:55 | 32.5 | 0.2% |
| 22 | `resolve` | node:path:1260 | 28.9 | 0.1% |
| 23 | `toEncodedMap` | node_modules/vite/dist/node/chunks/node.js:1458 | 27.1 | 0.1% |
| 24 | `(anonymous)` | node_modules/vite/dist/node/chunks/node.js:16770 | 27.1 | 0.1% |
| 25 | `stripBase` | node_modules/vite/dist/node/chunks/node.js:3006 | 26.8 | 0.1% |
| 26 | `(anonymous)` | node:events:342 | 26.8 | 0.1% |
| 27 | `internalModuleStat` | :0 | 25.6 | 0.1% |
| 28 | `onIdentifier` | node_modules/vite/dist/node/chunks/node.js:16648 | 25.0 | 0.1% |
| 29 | `get exports` | node:internal/modules/package_json_reader:86 | 21.2 | 0.1% |
| 30 | `compileForInternalLoader` | node:internal/bootstrap/realm:385 | 20.9 | 0.1% |

| package | self, ms | share |
|---|---|---|
| (idle) | 17384.9 | 82.9% |
| rolldown | 731.0 | 3.5% |
| vite | 617.6 | 2.9% |
| (native) | 488.7 | 2.3% |
| node:internal/child_process | 383.6 | 1.8% |
| node:internal/modules | 369.7 | 1.8% |
| (garbage collector) | 225.8 | 1.1% |
| vitest | 187.7 | 0.9% |
| (program) | 72.5 | 0.3% |
| node:path | 42.7 | 0.2% |
| node:internal/deps | 38.6 | 0.2% |
| node:events | 37.8 | 0.2% |
| node:fs | 37.0 | 0.2% |
| node:internal/bootstrap | 34.1 | 0.2% |
| node:internal/url | 32.1 | 0.2% |
| oxc-parser | 18.8 | 0.1% |
| @vitest/mocker | 16.2 | 0.1% |
| node:internal/process | 14.8 | 0.1% |
| mootant/adapters/vitest | 14.4 | 0.1% |
| mootant/core/run | 14.2 | 0.1% |
| node:internal/encoding | 11.7 | 0.1% |
| node:internal/worker | 11.5 | 0.1% |
| mootant/core/mutators | 11.1 | 0.1% |
| mootant/cli/terminal | 11.0 | 0.1% |
| mootant/core/generate | 10.3 | 0.0% |
| node:timers | 9.1 | 0.0% |
| node:internal/util | 8.9 | 0.0% |
| node:child_process | 8.0 | 0.0% |
| node:internal/fs | 7.9 | 0.0% |
| node:internal/streams | 7.3 | 0.0% |

| function (inclusive) | ms | share |
|---|---|---|
| `core/run-mutants.js` | 33.1 | 0.2% |
| `core/config/prepare-run.js` | 6.1 | 0.0% |
| `core/files/list-file-mutants.js` | 62.6 | 0.3% |
| `core/files/expand-paths.js` | 1.1 | 0.0% |
| `core/generate/generate-file-mutants.js` | 60.4 | 0.3% |
| `core/generate/collect-candidates.js` | 38.6 | 0.2% |
| `core/generate/deduplicate-candidates.js` | 0.0 | 0.0% |
| `core/generate/apply-solitary-rule.js` | 1.1 | 0.0% |
| `core/generate/get-mutant-regions.js` | 0.0 | 0.0% |
| `core/identity/assign-mutant-ids.js` | 2.2 | 0.0% |
| `adapters/vitest/start-vitest-session.js` | 21.8 | 0.1% |
| `adapters/node-test/start-node-test-session.js` | 0.0 | 0.0% |
| `core/instrument/create-switched-files.js` | 0.0 | 0.0% |
| `core/run/run-dry-phase.js` | 0.0 | 0.0% |
| `core/run/read-dry-run.js` | 2.2 | 0.0% |
| `core/cache/prepare-run-cache.js` | 0.0 | 0.0% |
| `core/run/create-run-state.js` | 2.2 | 0.0% |
| `core/run/read-test-imports.js` | 11.7 | 0.1% |
| `core/run/run-batch-phases.js` | 0.0 | 0.0% |
| `core/run/run-isolated-rounds.js` | 10.5 | 0.1% |
| `adapters/vitest/run-plan.js` | 10.6 | 0.1% |
| `adapters/vitest/write-plan-files.js` | 0.0 | 0.0% |
| `adapters/vitest/read-out-files.js` | 3.3 | 0.0% |
| `adapters/vitest/collect-dependencies.js` | 6.6 | 0.0% |
| `adapters/vitest/read-unit-inputs.js` | 1.1 | 0.0% |
| `core/cache/save-run-cache.js` | 0.0 | 0.0% |
| `cli/report/build-run-report.js` | 6.5 | 0.0% |
| `cli/report/format-run-report.js` | 0.0 | 0.0% |
| `cli/report/build-list-report.js` | 1.1 | 0.0% |
| `cli/report/format-report.js` | 0.0 | 0.0% |
| `cli/terminal/get-display-width.js` | 11.0 | 0.1% |

### Workers and test processes, merged

### 36 profiles merged

Sampled 29480.8 ms of 30369.1 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `(idle)` | :0 | 3971.6 | 13.5% |
| 2 | `compileSourceTextModule` | node:internal/modules/esm/utils:344 | 3772.0 | 12.8% |
| 3 | `(garbage collector)` | :0 | 2329.8 | 7.9% |
| 4 | `compileForInternalLoader` | node:internal/bootstrap/realm:385 | 761.7 | 2.6% |
| 5 | `(program)` | :0 | 514.4 | 1.7% |
| 6 | `getPackageScopeConfig` | :0 | 481.7 | 1.6% |
| 7 | `writeBuffer` | :0 | 434.8 | 1.5% |
| 8 | `internalModuleStat` | :0 | 377.4 | 1.3% |
| 9 | `realpathSync` | node:fs:2715 | 292.8 | 1.0% |
| 10 | `_runParsingLoop` | node_modules/parse5/dist/tokenizer/index.js:205 | 239.6 | 0.8% |
| 11 | `lstat` | :0 | 237.5 | 0.8% |
| 12 | `Script` | node:vm:85 | 225.5 | 0.8% |
| 13 | `(anonymous)` | /home/user/projects/bench/cheerio/src/api/forms.spec.ts:20 | 202.4 | 0.7% |
| 14 | `_runInlinedModule` | node_modules/vitest/dist/module-evaluator.js:186 | 200.9 | 0.7% |
| 15 | `decode` | node:internal/encoding:442 | 184.3 | 0.6% |
| 16 | `resolvePackageTargetString` | node:internal/modules/esm/resolve:380 | 182.3 | 0.6% |
| 17 | `deserializePackageJSON` | node:internal/modules/package_json_reader:48 | 180.3 | 0.6% |
| 18 | `open` | :0 | 176.1 | 0.6% |
| 19 | `runMicrotasks` | :0 | 175.5 | 0.6% |
| 20 | `parse` | :0 | 156.7 | 0.5% |
| 21 | `URL` | node:internal/url:802 | 149.5 | 0.5% |
| 22 | `wrapSafe` | node:internal/modules/cjs/loader:1671 | 146.1 | 0.5% |
| 23 | `resolve` | node_modules/vitest/dist/chunks/pathe.M-eThtNZ.Ba-7h1rE.js:371 | 139.4 | 0.5% |
| 24 | `(anonymous)` | node_modules/entities/lib/esm/generated/decode-data-html.js:1 | 136.8 | 0.5% |
| 25 | `task` | node_modules/vitest/dist/chunks/run.BPv-BBRv.js:2627 | 133.1 | 0.5% |
| 26 | `_link` | node:internal/modules/esm/module_job:161 | 133.0 | 0.5% |
| 27 | `parseSingleV8Stack` | node_modules/vitest/dist/chunks/source-map.DdKI5IHB.js:1656 | 130.6 | 0.4% |
| 28 | `resolve` | node:path:1260 | 129.7 | 0.4% |
| 29 | `getPackageScopeConfig` | node:internal/modules/package_json_reader:207 | 129.2 | 0.4% |
| 30 | `internalBinding` | node:internal/bootstrap/realm:185 | 127.9 | 0.4% |

| package | self, ms | share |
|---|---|---|
| node:internal/modules | 6468.7 | 21.9% |
| (idle) | 3971.6 | 13.5% |
| vitest | 3608.4 | 12.2% |
| (native) | 2790.4 | 9.5% |
| (garbage collector) | 2329.8 | 7.9% |
| parse5 | 1238.7 | 4.2% |
| node:internal/bootstrap | 998.6 | 3.4% |
| vite | 709.8 | 2.4% |
| node:internal/url | 639.7 | 2.2% |
| (program) | 514.4 | 1.7% |
| project/cheerio/src | 469.0 | 1.6% |
| project/src/api | 443.0 | 1.5% |
| entities | 440.7 | 1.5% |
| node:fs | 422.2 | 1.4% |
| mootant/adapters/vitest | 417.6 | 1.4% |
| chai | 360.4 | 1.2% |
| node:internal/deps | 323.0 | 1.1% |
| css-select | 290.6 | 1.0% |
| node:path | 258.3 | 0.9% |
| node:vm | 253.2 | 0.9% |
| mootant/adapters/shared | 211.4 | 0.7% |
| node:internal/streams | 200.6 | 0.7% |
| node:internal/encoding | 189.6 | 0.6% |
| css-what | 162.0 | 0.5% |
| node:internal/child_process | 153.5 | 0.5% |
| node:internal/timers | 122.8 | 0.4% |
| domhandler | 103.4 | 0.4% |
| node:internal/event_target | 99.3 | 0.3% |
| node:events | 89.8 | 0.3% |
| undici | 86.4 | 0.3% |

| module | self, ms | share |
|---|---|---|
| node:internal/modules | 6468.7 | 21.9% |
| (idle) | 3971.6 | 13.5% |
| (native) | 2790.4 | 9.5% |
| (garbage collector) | 2329.8 | 7.9% |
| vitest/dist/chunks/run.BPv-BBRv.js | 1511.7 | 5.1% |
| node:internal/bootstrap | 998.6 | 3.4% |
| vite/dist/node/module-runner.js | 709.8 | 2.4% |
| parse5/dist/tokenizer/index.js | 708.3 | 2.4% |
| node:internal/url | 639.7 | 2.2% |
| (program) | 514.4 | 1.7% |
| vitest/dist/chunks/index.aTZaPVhf.js | 495.9 | 1.7% |
| node:fs | 422.2 | 1.4% |
| mootant/adapters/vitest | 417.6 | 1.4% |
| parse5/dist/parser/index.js | 391.8 | 1.3% |
| chai/index.js | 360.4 | 1.2% |
| node:internal/deps | 323.0 | 1.1% |
| vitest/dist/module-evaluator.js | 306.6 | 1.0% |
| vitest/dist/chunks/source-map.DdKI5IHB.js | 267.8 | 0.9% |
| node:path | 258.3 | 0.9% |
| node:vm | 253.2 | 0.9% |
| entities/lib/esm/generated/decode-data-html.js | 244.6 | 0.8% |
| project//home/user/projects/bench/cheerio/src/load.ts | 242.2 | 0.8% |
| vitest/dist/chunks/pathe.M-eThtNZ.Ba-7h1rE.js | 235.5 | 0.8% |
| project//home/user/projects/bench/cheerio/src/api/forms.spec.ts | 221.1 | 0.8% |
| mootant/adapters/shared | 211.4 | 0.7% |
| node:internal/streams | 200.6 | 0.7% |
| vitest/dist/chunks/index.CK-t0WMg.js | 197.2 | 0.7% |
| node:internal/encoding | 189.6 | 0.6% |
| node:internal/child_process | 153.5 | 0.5% |
| css-what/lib/commonjs/parse.js | 140.2 | 0.5% |
| css-select/lib/esm/compile.js | 124.5 | 0.4% |
| project//home/user/projects/bench/cheerio/src/api/traversing.ts | 124.1 | 0.4% |
| node:internal/timers | 122.8 | 0.4% |
| vitest/dist/chunks/index.D0heQG4v.js | 103.3 | 0.4% |
| domhandler/dist/node.js | 102.3 | 0.3% |
| node:internal/event_target | 99.3 | 0.3% |
| vitest/dist/chunks/base.CzXt2BO_.js | 97.0 | 0.3% |
| node:events | 89.8 | 0.3% |
| node:internal/process | 79.3 | 0.3% |
| vitest/dist/chunks/init.PvxYpuCm.js | 79.2 | 0.3% |


