# Sourced by setup.sh in the project directory. Upstream `npm test` is not
# green here: src/cases.spec.ts has no tests, src/redos.spec.ts fails with the
# native recheck binary and takes 97 % of the suite (see vitest-config.patch).
git apply "$PROJECT_CONF/vitest-config.patch"
