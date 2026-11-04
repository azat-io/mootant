#!/usr/bin/env bash
# Installs mootant (and Vitest 5.0.5 with Vite 8.3.5 where needed) for the
# oracle fixtures and the real-code project. npm 10.9.9 fails on the peer
# dependencies of Vitest 5.0.5 ("Cannot read properties of null (reading
# 'edgesOut')"), hence --legacy-peer-deps and the explicit Vite. Fixtures share one node_modules per runner family
# (/home/user/projects/oracle/vt and /nt): Node resolves `vitest` and `mootant`
# from the parent, so mootant's runner and the project load the same Vitest copy
# (adapters/vitest/check-vitest-copy.ts).
set -eu
# Fixture sources: analysis/tools/oracle/fixtures/{vt,nt} (copy them to $root).
tgz=${MOOTANT_TGZ:-/home/user/artifacts/mootant-0.1.0-170ec52.tgz}
root=${ORACLE_ROOT:-/home/user/projects/oracle}
export npm_config_audit=false npm_config_fund=false npm_config_update_notifier=false
(cd "$root/vt" && nice -n 10 npm i -D --legacy-peer-deps "$tgz" vitest@5.0.5 vite@8.3.5)
(cd "$root/nt" && nice -n 10 npm i -D --legacy-peer-deps "$tgz")
# Real code: core/text, core/tree and their tests copied from the mootant
# checkout into a project of their own (see verdicts.md, "Реальный код").
if [ -d "$root/real/mootant-text" ]; then
  (cd "$root/real/mootant-text" && nice -n 10 npm i -D --legacy-peer-deps \
    "$tgz" vitest@5.0.5 vite@8.3.5 oxc-parser@0.156.0 @eslint-community/regexpp@4.12.2)
fi
