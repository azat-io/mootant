/**
 * dependency-cruiser config for test -> source edges (used to estimate how a
 * regrouping of source files touches the mirrored tests).
 *
 *   /home/user/tools-arch/node_modules/.bin/depcruise \
 *     --config analysis/architecture/scripts/depcruise-tests.config.cjs \
 *     --output-type json test > analysis/architecture/data/depcruise-tests.json
 */
module.exports = {
  forbidden: [],
  options: {
    doNotFollow: { path: 'node_modules|^(core|adapters|cli|types)/' },
    exclude: { path: '^(test/fixtures|docs|node_modules|dist|analysis)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.d.ts', '.js', '.mjs', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
}
