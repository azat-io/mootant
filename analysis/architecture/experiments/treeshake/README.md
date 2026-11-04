# Tree-shaking with preserveModules (rolldown 1.2.16 from the project's lockfile)

`node run.mjs src/entry.js` bundles `entry.js`, which imports one of the two
exports of `helpers.js`, with `preserveModules: true`, as `vite.config.ts` does.
The output (`output.txt`) keeps `helpers.js` as its own module and drops
`unusedHelper`: grouping several functions into one module does not cost
tree-shaking.
