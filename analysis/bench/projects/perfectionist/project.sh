# azat-io/eslint-plugin-perfectionist: the large Vitest project (rules tested
# with RuleTester on typescript-eslint; 24 rule test files, 170k test lines).
REPO=https://github.com/azat-io/eslint-plugin-perfectionist
SHA=486c3c85239e78a24aba2ade212cdef6acba1829
PM=pnpm
RUNNER=vitest
# One rule with its helpers (tested by one test file, so Mootant's units of it
# run one at a time) and the shared comparators (reached from every rule test
# file): 208 + 106 = 314 mutants (mootant list, recommended).
MUTATE=(rules/sort-switch-case.ts rules/sort-switch-case utils/compare)
# Smoke and profiles: the helpers of the rule only (21 mutants).
PROFILE_MUTATE=(rules/sort-switch-case)
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
