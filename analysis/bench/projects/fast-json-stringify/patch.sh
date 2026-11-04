# Sourced by setup.sh in the project directory. test/webpack.test.js bundles
# the library with webpack and evaluates the bundle: 16.6 of 56 s of the suite
# (smoke, 2 processes), one test, no logic of its own. Per mutant it would cost
# both tools the same 15+ s, so the bench drops it.
git rm -q test/webpack.test.js
