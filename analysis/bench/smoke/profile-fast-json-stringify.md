> **Смоук, не результаты бенчмарка**: профили под `--cpu-prof` на машине под нагрузкой (load average 25–40), `--concurrency 2`, подмножество `PROFILE_MUTATE`. Проверка того, что `profile.sh` работает, и первое представление о структуре затрат.

# Profiles of fast-json-stringify

    date: 2026-11-04T06:04:12Z
    host: 4 vCPU, Intel(R) Xeon(R) Processor @ 2.10GHz, 15 GB RAM
    kernel: 6.18.44-fc-v233
    node: v22.23.4, npm 10.9.9, pnpm 12.16.1
    hyperfine: 1.18.0
    mootant: 170ec52 (mootant-0.1.0-170ec52.tgz)
    stryker: 10.1.1
    load: 11.38 25.36 31.14

Paths: lib/location.js lib/standalone.js

## mootant run --no-cache under --cpu-prof: 119 s (profiling slows it down)

JSON timing, ms: {"batch":null,"isolated":101774,"startup":233,"dryRun":16888,"total":118895}; mutants 33, runs {"dry":1,"isolated":7}, isolated units 232

Profiles: main 1, other processes 297 (a worker killed by a signal writes none).

### Main process

### CPU.20261104.060413.20734.0.001.cpuprofile

Sampled 119512.7 ms of 119523.8 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `(idle)` | :0 | 115149.3 | 96.3% |
| 2 | `spawn` | node:internal/child_process:354 | 2559.7 | 2.1% |
| 3 | `(garbage collector)` | :0 | 339.2 | 0.3% |
| 4 | `read` | :0 | 110.7 | 0.1% |
| 5 | `parseSync` | node_modules/oxc-parser/src-js/index.js:57 | 105.5 | 0.1% |
| 6 | `(program)` | :0 | 98.1 | 0.1% |
| 7 | `g` | node_modules/mootant/dist/adapters/node-test/run-test-process.js:11 | 87.9 | 0.1% |
| 8 | `e` | node_modules/mootant/dist/adapters/node-test/list-loaded-files.js:1 | 47.0 | 0.0% |
| 9 | `compileSourceTextModule` | node:internal/modules/esm/utils:344 | 44.7 | 0.0% |
| 10 | `writeFileUtf8` | :0 | 30.8 | 0.0% |
| 11 | `normalizeSpawnArguments` | node:child_process:566 | 26.2 | 0.0% |
| 12 | `unlink` | :0 | 23.4 | 0.0% |
| 13 | `emitBeforeScript` | node:internal/async_hooks:517 | 23.2 | 0.0% |
| 14 | `listOnTimeout` | node:internal/timers:526 | 23.0 | 0.0% |
| 15 | `i` | node_modules/mootant/dist/core/run/apply-isolated-result.js:5 | 19.5 | 0.0% |
| 16 | `getPackageScopeConfig` | :0 | 18.0 | 0.0% |
| 17 | `e` | node_modules/mootant/dist/adapters/node-test/check-todo-bail.js:1 | 17.4 | 0.0% |
| 18 | `spawn` | node:child_process:779 | 16.8 | 0.0% |
| 19 | `Socket` | node:net:363 | 16.4 | 0.0% |
| 20 | `getPackageScopeConfig` | node:internal/modules/package_json_reader:207 | 15.7 | 0.0% |
| 21 | `nextTick` | node:internal/process/task_queues:111 | 14.9 | 0.0% |
| 22 | `processTimers` | node:internal/timers:506 | 14.3 | 0.0% |
| 23 | `lstat` | :0 | 13.8 | 0.0% |
| 24 | `internalModuleStat` | :0 | 13.7 | 0.0% |
| 25 | `relative` | node:path:1371 | 13.2 | 0.0% |
| 26 | `a` | node_modules/mootant/dist/adapters/node-test/collect-node-dependencies.js:6 | 12.9 | 0.0% |
| 27 | `t` | node_modules/mootant/dist/adapters/node-test/read-tries.js:2 | 12.8 | 0.0% |
| 28 | `Hash` | node:internal/crypto/hash:88 | 12.3 | 0.0% |
| 29 | `writeBuffer` | :0 | 11.4 | 0.0% |
| 30 | `finalizeResolution` | node:internal/modules/esm/resolve:229 | 11.3 | 0.0% |

| package | self, ms | share |
|---|---|---|
| (idle) | 115149.3 | 96.3% |
| node:internal/child_process | 2571.4 | 2.2% |
| (garbage collector) | 339.2 | 0.3% |
| (native) | 311.7 | 0.3% |
| mootant/adapters/node-test | 272.9 | 0.2% |
| node:internal/modules | 124.3 | 0.1% |
| oxc-parser | 105.5 | 0.1% |
| (program) | 98.1 | 0.1% |
| mootant/core/run | 77.1 | 0.1% |
| node:child_process | 57.2 | 0.0% |
| node:internal/timers | 42.8 | 0.0% |
| node:path | 30.7 | 0.0% |
| node:internal/crypto | 30.6 | 0.0% |
| node:net | 30.4 | 0.0% |
| node:internal/streams | 28.2 | 0.0% |
| node:internal/async_hooks | 27.9 | 0.0% |
| node:internal/process | 25.0 | 0.0% |
| node:internal/url | 23.8 | 0.0% |
| node:internal/fs | 20.5 | 0.0% |
| mootant/cli/terminal | 13.6 | 0.0% |
| node:internal/errors | 13.2 | 0.0% |
| mootant/core | 12.1 | 0.0% |
| node:internal/buffer | 10.1 | 0.0% |
| node:internal/util | 9.8 | 0.0% |
| node:fs | 8.4 | 0.0% |
| mootant/core/generate | 7.5 | 0.0% |
| @eslint-community/regexpp | 5.6 | 0.0% |
| node:events | 5.3 | 0.0% |
| node:internal/deps | 5.3 | 0.0% |
| mootant/cli | 5.2 | 0.0% |

| function (inclusive) | ms | share |
|---|---|---|
| `core/run-mutants.js` | 155.4 | 0.1% |
| `core/config/prepare-run.js` | 8.6 | 0.0% |
| `core/files/list-file-mutants.js` | 35.9 | 0.0% |
| `core/files/expand-paths.js` | 0.0 | 0.0% |
| `core/generate/generate-file-mutants.js` | 35.9 | 0.0% |
| `core/generate/collect-candidates.js` | 23.0 | 0.0% |
| `core/generate/deduplicate-candidates.js` | 1.1 | 0.0% |
| `core/generate/apply-solitary-rule.js` | 0.0 | 0.0% |
| `core/generate/get-mutant-regions.js` | 0.0 | 0.0% |
| `core/identity/assign-mutant-ids.js` | 1.1 | 0.0% |
| `adapters/vitest/start-vitest-session.js` | 0.0 | 0.0% |
| `adapters/node-test/start-node-test-session.js` | 116.0 | 0.1% |
| `core/instrument/create-switched-files.js` | 2.2 | 0.0% |
| `core/run/run-dry-phase.js` | 20.1 | 0.0% |
| `core/run/read-dry-run.js` | 5.4 | 0.0% |
| `core/cache/prepare-run-cache.js` | 0.0 | 0.0% |
| `core/run/create-run-state.js` | 23.7 | 0.0% |
| `core/run/read-test-imports.js` | 99.0 | 0.1% |
| `core/run/run-batch-phases.js` | 0.0 | 0.0% |
| `core/run/run-isolated-rounds.js` | 116.2 | 0.1% |
| `adapters/vitest/run-plan.js` | 0.0 | 0.0% |
| `adapters/vitest/write-plan-files.js` | 0.0 | 0.0% |
| `adapters/vitest/read-out-files.js` | 0.0 | 0.0% |
| `adapters/vitest/collect-dependencies.js` | 0.0 | 0.0% |
| `adapters/vitest/read-unit-inputs.js` | 0.0 | 0.0% |
| `core/cache/save-run-cache.js` | 0.0 | 0.0% |
| `cli/report/build-run-report.js` | 6.8 | 0.0% |
| `cli/report/format-run-report.js` | 1.1 | 0.0% |
| `cli/report/build-list-report.js` | 2.2 | 0.0% |
| `cli/report/format-report.js` | 0.0 | 0.0% |
| `cli/terminal/get-display-width.js` | 9.6 | 0.0% |

### Workers and test processes, merged

### 297 profiles merged

Sampled 170213.3 ms of 181922.6 ms of profile time.

| # | function | location | self, ms | share |
|---|---|---|---|---|
| 1 | `(garbage collector)` | :0 | 16410.0 | 9.6% |
| 2 | `wrapSafe` | node:internal/modules/cjs/loader:1671 | 11805.5 | 6.9% |
| 3 | `compileForInternalLoader` | node:internal/bootstrap/realm:385 | 6982.1 | 4.1% |
| 4 | `(anonymous)` | /home/user/projects/bench/fast-json-stringify/test/array.test.js:807 | 5689.2 | 3.3% |
| 5 | `internalModuleStat` | :0 | 3488.8 | 2.0% |
| 6 | `(program)` | :0 | 3458.7 | 2.0% |
| 7 | `normalizeString` | node:path:93 | 3136.8 | 1.8% |
| 8 | `resolve` | node:path:1260 | 2869.2 | 1.7% |
| 9 | `addNames` | node_modules/ajv/dist/compile/codegen/index.js:637 | 2734.0 | 1.6% |
| 10 | `build` | /home/user/projects/bench/fast-json-stringify/index.js:418 | 2041.1 | 1.2% |
| 11 | `validate10` | /home/user/projects/bench/fast-json-stringify/lib/schema-validator.js:73 | 1856.4 | 1.1% |
| 12 | `compileSourceTextModule` | node:internal/modules/esm/utils:344 | 1855.5 | 1.1% |
| 13 | `(idle)` | :0 | 1721.7 | 1.0% |
| 14 | `compileSchema` | node_modules/ajv/dist/compile/index.js:33 | 1674.5 | 1.0% |
| 15 | `fileURLToPath` | node:internal/url:1600 | 1564.4 | 0.9% |
| 16 | `realpathSync` | node:fs:2715 | 1431.9 | 0.8% |
| 17 | `anonymous0` | :32 | 1400.9 | 0.8% |
| 18 | `assertStaysOptimized` | /home/user/projects/bench/fast-json-stringify/test/deopt.test.js:20 | 1307.7 | 0.8% |
| 19 | `resolvePackageTargetString` | node:internal/modules/esm/resolve:380 | 1126.2 | 0.7% |
| 20 | `readFileUtf8` | :0 | 1103.0 | 0.6% |
| 21 | `isValidSchema` | /home/user/projects/bench/fast-json-stringify/index.js:233 | 1091.1 | 0.6% |
| 22 | `equal` | node:assert:236 | 1089.6 | 0.6% |
| 23 | `(anonymous)` | node:internal/modules/cjs/loader:1193 | 934.7 | 0.5% |
| 24 | `(anonymous)` | node:internal/modules/cjs/loader:1490 | 845.1 | 0.5% |
| 25 | `(anonymous)` | /home/user/projects/bench/fast-json-stringify/test/array.test.js:812 | 813.3 | 0.5% |
| 26 | `(anonymous)` | node_modules/ajv/dist/compile/codegen/index.js:181 | 762.3 | 0.4% |
| 27 | `parseSource` | node:internal/deps/cjs-module-lexer/lexer:85 | 696.6 | 0.4% |
| 28 | `writeString` | :0 | 693.8 | 0.4% |
| 29 | `run` | node:internal/test_runner/test:984 | 665.0 | 0.4% |
| 30 | `lstat` | :0 | 652.8 | 0.4% |

| package | self, ms | share |
|---|---|---|
| node:internal/modules | 30222.2 | 17.8% |
| ajv | 29360.2 | 17.2% |
| (garbage collector) | 16410.0 | 9.6% |
| (native) | 12697.2 | 7.5% |
| project/fast-json-stringify/test | 10159.1 | 6.0% |
| node:internal/bootstrap | 8584.4 | 5.0% |
| node:path | 6494.2 | 3.8% |
| project/bench/fast-json-stringify | 5868.7 | 3.4% |
| node:internal/test_runner | 5459.3 | 3.2% |
| node:internal/streams | 4159.0 | 2.4% |
| node:internal/url | 3948.1 | 2.3% |
| fast-uri | 3835.4 | 2.3% |
| (program) | 3458.7 | 2.0% |
| project/fast-json-stringify/lib | 3148.1 | 1.8% |
| mootant/adapters/node-test | 2786.7 | 1.6% |
| node:fs | 2384.8 | 1.4% |
| node:internal/util | 1913.5 | 1.1% |
| (idle) | 1721.7 | 1.0% |
| node:internal/async_hooks | 1598.2 | 0.9% |
| node:internal/deps | 1538.8 | 0.9% |
| mootant/adapters/shared | 1534.6 | 0.9% |
| node:assert | 1424.9 | 0.8% |
| node:internal/per_context | 1061.0 | 0.6% |
| json-schema-ref-resolver | 700.9 | 0.4% |
| node:async_hooks | 696.1 | 0.4% |
| node:internal/event_target | 656.4 | 0.4% |
| node:events | 650.7 | 0.4% |
| node:internal/process | 638.3 | 0.4% |
| json-schema-traverse | 611.9 | 0.4% |
| node:internal/fs | 607.4 | 0.4% |

| module | self, ms | share |
|---|---|---|
| node:internal/modules | 30222.2 | 17.8% |
| (garbage collector) | 16410.0 | 9.6% |
| (native) | 12697.2 | 7.5% |
| ajv/dist/compile/codegen/index.js | 10338.9 | 6.1% |
| node:internal/bootstrap | 8584.4 | 5.0% |
| project:/home/user/projects/bench/fast-json-stringify/test/array.test.js | 7820.5 | 4.6% |
| node:path | 6494.2 | 3.8% |
| project:/home/user/projects/bench/fast-json-stringify/index.js | 5868.7 | 3.4% |
| node:internal/test_runner | 5459.3 | 3.2% |
| node:internal/streams | 4159.0 | 2.4% |
| ajv/dist/compile/codegen/code.js | 4058.4 | 2.4% |
| node:internal/url | 3948.1 | 2.3% |
| ajv/dist/compile/validate/index.js | 3547.8 | 2.1% |
| (program) | 3458.7 | 2.0% |
| mootant/adapters/node-test | 2786.7 | 1.6% |
| ajv/dist/core.js | 2489.6 | 1.5% |
| fast-uri/index.js | 2420.9 | 1.4% |
| node:fs | 2384.8 | 1.4% |
| ajv/dist/compile/index.js | 2207.8 | 1.3% |
| project:/home/user/projects/bench/fast-json-stringify/lib/schema-validator.js | 1951.1 | 1.1% |
| node:internal/util | 1913.5 | 1.1% |
| (idle) | 1721.7 | 1.0% |
| node:internal/async_hooks | 1598.2 | 0.9% |
| node:internal/deps | 1538.8 | 0.9% |
| mootant/adapters/shared | 1534.6 | 0.9% |
| node:assert | 1424.9 | 0.8% |
| project:/home/user/projects/bench/fast-json-stringify/test/deopt.test.js | 1313.6 | 0.8% |
| fast-uri/lib/utils.js | 1216.9 | 0.7% |
| node:internal/per_context | 1061.0 | 0.6% |
| ajv/dist/compile/resolve.js | 913.0 | 0.5% |
| ajv/dist/compile/codegen/scope.js | 830.6 | 0.5% |
| ajv/dist/compile/errors.js | 796.0 | 0.5% |
| ajv/dist/compile/validate/applicability.js | 749.4 | 0.4% |
| json-schema-ref-resolver/index.js | 700.9 | 0.4% |
| node:async_hooks | 696.1 | 0.4% |
| node:internal/event_target | 656.4 | 0.4% |
| node:events | 650.7 | 0.4% |
| ajv/dist/compile/validate/dataType.js | 641.7 | 0.4% |
| node:internal/process | 638.3 | 0.4% |
| json-schema-traverse/index.js | 611.9 | 0.4% |


