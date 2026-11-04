/**
 * dependency-cruiser config for the architecture review of Mootant (170ec52).
 *
 * Run from the repository root (read-only, nothing is written to the repo
 * except where stdout is redirected):
 *
 *   /home/user/tools-arch/node_modules/.bin/depcruise \
 *     --config analysis/architecture/scripts/depcruise.config.cjs \
 *     --output-type json core adapters cli types \
 *     > analysis/architecture/data/depcruise.json
 *
 * Imports in the project are extensionless and resolve to `.ts` or `.d.ts`
 * (moduleResolution "bundler"), so the resolver gets those extensions.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-not-to-cli',
      comment: 'core must not depend on the CLI layer',
      severity: 'error',
      from: { path: '^core/' },
      to: { path: '^cli/' },
    },
    {
      name: 'core-not-to-adapters',
      comment: 'core must not depend on a concrete adapter',
      severity: 'error',
      from: { path: '^core/' },
      to: { path: '^adapters/' },
    },
    {
      name: 'adapters-not-to-cli',
      severity: 'error',
      from: { path: '^adapters/' },
      to: { path: '^cli/' },
    },
    {
      name: 'adapter-not-to-other-adapter',
      comment: 'vitest and node-test must not import each other',
      severity: 'error',
      from: { path: '^adapters/(vitest|node-test)/' },
      to: {
        path: '^adapters/(vitest|node-test)/',
        pathNot: '^adapters/$1/',
      },
    },
    {
      name: 'types-only-types',
      comment: 'types/ must only contain declarations',
      severity: 'error',
      from: { path: '^types/' },
      to: { pathNot: '^types/|^node_modules|oxc-parser|@eslint-community' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(test|docs|node_modules|dist|analysis)/' },
    tsPreCompilationDeps: true,
    detectJSDocImports: false,
    enhancedResolveOptions: {
      extensions: ['.ts', '.d.ts', '.js', '.mjs', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: {
      archi: {
        collapsePattern: '^(core|adapters|cli|types)/[^/]+',
      },
    },
  },
}
