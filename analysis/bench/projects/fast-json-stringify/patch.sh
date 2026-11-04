# Sourced by setup.sh in the project directory; both removals apply to both
# tools, so they run the same tests.
# - test/webpack.test.js bundles the library with webpack and evaluates the
#   bundle: 16.6 of 56 s of the suite (smoke, 2 processes), one test, no logic
#   of its own; per mutant it would cost both tools the same 15+ s.
# - test/property-names.test.js passes under `node --test`, but Stryker's
#   tap-runner reports it failed in the initial test run, so Stryker refuses
#   to start (smoke; the file passes when run as tap-runner runs it, `node
#   --test-reporter=tap <file>`, so the likely cause is the TAP parsing of its
#   test names with U+2028, U+2029, '#' and quotes, not checked further).
git rm -q test/webpack.test.js test/property-names.test.js
