import type { Config } from '../../types/config'

/**
 * Types a configuration in a `mootant.config.ts` or `mootant.config.js` file.
 * It returns the configuration unchanged.
 *
 * @example Import { defineConfig } from 'mootant'
 *
 * Export default defineConfig({ mutators: { 'string-literal': 'off' }, })
 *
 * @param config - Configuration of the project.
 * @returns The same configuration.
 */
export function defineConfig(config: Config): Config {
  return config
}
