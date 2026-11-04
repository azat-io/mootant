# Sourced by setup.sh in the project directory. The upstream Vitest config
# type-checks src/api/extract.spec.ts with tsc on every start of Vitest (44 %
# of the suite in the smoke run); the bench turns it off for both tools.
git apply "$PROJECT_CONF/vitest-config.patch"
