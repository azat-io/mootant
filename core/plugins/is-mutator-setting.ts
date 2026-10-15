import type { MutatorSetting } from '../../types/mutator/mutator-setting'

import { isRecord } from './is-record'

/**
 * Tells whether a value is a mutator setting: `'on'`, `'off'` or `['on',
 * options]` with an options object.
 *
 * @param value - Value read from a configuration file or a plugin.
 * @returns Whether the value is a mutator setting.
 */
export function isMutatorSetting(value: unknown): value is MutatorSetting {
  if (value === 'on' || value === 'off') {
    return true
  }
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === 'on' &&
    isRecord(value[1])
  )
}
