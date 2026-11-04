# cheeriojs/cheerio: the medium Vitest project (jQuery API on parse5 and
# htmlparser2; 22 spec files next to the sources).
REPO=https://github.com/cheeriojs/cheerio
SHA=40d4365fc025ebc053e6c886c1dac3cf29a4bc61
PM=npm
RUNNER=vitest
# The attribute, CSS and form APIs: 393 + 76 + 27 = 496 mutants.
MUTATE=(src/api/attributes.ts src/api/css.ts src/api/forms.ts)
PROFILE_MUTATE=(src/api/forms.ts)
TEST_CMD=(node node_modules/vitest/vitest.mjs run)
TSC_CHECKER=1

install_deps() {
  npm ci --ignore-scripts
}

add_tools() {
  npm install -D --ignore-scripts --save-exact "$MOOTANT_TGZ" \
    "@stryker-mutator/core@$STRYKER_VERSION" \
    "@stryker-mutator/vitest-runner@$STRYKER_VERSION" \
    "@stryker-mutator/typescript-checker@$STRYKER_VERSION"
}
