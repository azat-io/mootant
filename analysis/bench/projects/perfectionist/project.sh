# azat-io/eslint-plugin-perfectionist: the large Vitest project (rules tested
# with RuleTester on typescript-eslint; 24 rule test files, 170k test lines).
REPO=https://github.com/azat-io/eslint-plugin-perfectionist
SHA=486c3c85239e78a24aba2ade212cdef6acba1829
PM=pnpm
RUNNER=vitest
# Filled in after the smoke runs (see README, "Projects").
MUTATE=(rules/sort-switch-case.ts rules/sort-switch-case)
TEST_CMD=(node node_modules/vitest/vitest.mjs run)
TSC_CHECKER=1

install_deps() {
  pnpm install --frozen-lockfile --ignore-scripts
}

add_tools() {
  pnpm add -D --ignore-scripts --save-exact "file:$MOOTANT_TGZ" \
    "@stryker-mutator/core@$STRYKER_VERSION" \
    "@stryker-mutator/vitest-runner@$STRYKER_VERSION" \
    "@stryker-mutator/typescript-checker@$STRYKER_VERSION"
}
