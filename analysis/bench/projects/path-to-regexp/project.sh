# pillarjs/path-to-regexp: the small Vitest project (one 700-line module, a
# table of ~1000 cases).
REPO=https://github.com/pillarjs/path-to-regexp
SHA=32292b9d13239c7fa3ed23e89c59c10264f9fe20
PM=npm
RUNNER=vitest
MUTATE=(src/index.ts)
TEST_CMD=(node node_modules/vitest/vitest.mjs run)
# typescript 7 (native) has no JS API for @stryker-mutator/typescript-checker.
TSC_CHECKER=0

install_deps() {
  npm ci --ignore-scripts
}

add_tools() {
  npm install -D --ignore-scripts --save-exact "$MOOTANT_TGZ" \
    "@stryker-mutator/core@$STRYKER_VERSION" \
    "@stryker-mutator/vitest-runner@$STRYKER_VERSION"
}
