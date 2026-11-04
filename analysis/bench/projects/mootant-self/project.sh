# Mootant on itself (dogfood, Mootant only): the commit under study, built in
# its own clone; Mootant runs from that build (bin/mootant.js), so its Vitest is
# the project's. Not part of the Stryker comparison. core/text: 544 mutants in
# 16 files that almost every test imports (the dry run picks 8 393 of 10 491
# tests, 00-baseline.md); core/regex 1 123 and core/run 1 543 mutants.
REPO=/home/user/mootant
SHA=170ec52a8cc4e4551ca5d689caf4418b4edb4291
PM=pnpm
RUNNER=vitest
MUTATE=(core/text)
PROFILE_MUTATE=(core/text/pluralize.ts)
MOOTANT_BIN=bin/mootant.js
CLEAN_KEEP=(dist)
TEST_CMD=(node node_modules/vitest/vitest.mjs run)

install_deps() {
  SKIP_SIMPLE_GIT_HOOKS=1 pnpm install --frozen-lockfile --ignore-scripts
  pnpm run build
}

add_tools() {
  :
}
