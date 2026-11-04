# Repro: plugin skip rule outside the built-in registry

Commit 170ec52, package `mootant-0.1.0-170ec52.tgz` (dist from
/home/user/wt/base).

```sh
cd analysis/architecture/repro-plugin-skip-rule
node <extracted-package>/bin/mootant.js list src            # exit 0, plugin candidate silently dropped
node <extracted-package>/bin/mootant.js list src --skipped  # Error: Cannot read properties of undefined (reading 'heuristic'), exit 1
```

`Replacement.skip.rule` is typed as `keyof typeof skipRules`
(types/mutant/skip-rule-id.d.ts:1,7), `validateReplacement` does not check it
(core/generate/validate-replacement.ts), and `generate-file-mutants.ts:376-377`
reads `skipRules[candidate.rule].heuristic`.
