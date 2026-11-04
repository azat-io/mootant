# fastify/fast-json-stringify: the node:test project (CommonJS, `node --test`
# is its own runner: "test:unit": "c8 ... node --test").
REPO=https://github.com/fastify/fast-json-stringify
SHA=ac1723c7073ab4e0ceca074ad214af742fa439fa
PM=npm
RUNNER=node-test
MUTATE=(lib)
TEST_CMD=(node --test)
TSC_CHECKER=0

install_deps() {
  # No lockfile upstream (.npmrc: package-lock=false): resolve as of a fixed
  # date, so a rebuild gets the same versions.
  npm install --ignore-scripts --before="$BENCH_BEFORE"
}

add_tools() {
  npm install -D --ignore-scripts --save-exact --before="$BENCH_BEFORE" "$MOOTANT_TGZ" \
    "@stryker-mutator/core@$STRYKER_VERSION" \
    "@stryker-mutator/tap-runner@$STRYKER_VERSION"
}
