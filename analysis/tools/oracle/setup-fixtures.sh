#!/usr/bin/env bash
# Installs mootant (and Vitest 5.0.5 where needed) for the oracle fixtures and
# the real projects. Fixtures share one node_modules per runner family
# (/home/user/projects/oracle/vt and /nt): Node resolves `vitest` and `mootant`
# from the parent, so mootant's runner and the project load the same Vitest copy
# (adapters/vitest/check-vitest-copy.ts).
set -eu
tgz=${MOOTANT_TGZ:-/home/user/artifacts/mootant-0.1.0-170ec52.tgz}
root=${ORACLE_ROOT:-/home/user/projects/oracle}
export npm_config_audit=false npm_config_fund=false npm_config_update_notifier=false
(cd "$root/vt" && nice -n 10 npm i -D "$tgz" vitest@5.0.5)
(cd "$root/nt" && nice -n 10 npm i -D "$tgz")
for project in defu scule; do
  if [ -d "$root/real/$project" ]; then
    extra=""
    if [ "$project" = defu ]; then extra="expect-type"; fi
    (cd "$root/real/$project" && nice -n 10 npm i -D "$tgz" vitest@5.0.5 $extra)
  fi
done
for project in nanoid fastify-error; do
  if [ -d "$root/real/$project" ]; then
    (cd "$root/real/$project" && nice -n 10 npm i -D "$tgz")
  fi
done
