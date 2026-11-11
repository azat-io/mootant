/* Cspell:words babelignore browserslistrc swcrc */

/**
 * Names of the files in a directory that decide how transformers turn the files
 * of a project into code: Babel's project-wide and file-relative ones and its
 * ignore file, swc's, and Browserslist's, which Babel reads for its targets.
 */
export const TRANSFORM_CONFIG_NAMES = [
  'babel.config.js',
  'babel.config.cjs',
  'babel.config.mjs',
  'babel.config.json',
  'babel.config.cts',
  'babel.config.ts',
  'babel.config.mts',
  '.babelrc',
  '.babelrc.js',
  '.babelrc.cjs',
  '.babelrc.mjs',
  '.babelrc.json',
  '.babelrc.cts',
  '.babelignore',
  '.swcrc',
  '.browserslistrc',
  'browserslist',
]
