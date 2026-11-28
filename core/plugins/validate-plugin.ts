import type { SkipCategory } from '../../types/mutant/skip-category'
import type { Plugin } from '../../types/config/plugin'

import { getSettingsProblem } from './get-settings-problem'
import { isMutatorSetting } from './is-mutator-setting'
import { isRecord } from './is-record'

/**
 * Every category of a skip rule.
 */
const SKIP_CATEGORIES: Record<SkipCategory, true> = {
  equivalent: true,
  duplicate: true,
  subsumed: true,
  timeout: true,
  invalid: true,
  owned: true,
  noise: true,
}

/**
 * Checks the shape of a plugin loaded at runtime: an object with a `mutators`
 * object of mutators, each with a `create` function and a `meta` object with a
 * description, optional skip rules with a category and a heuristic flag, and
 * optional presets with a description, mutator settings, `extends` and
 * settings. Names and ids are checked when the plugin is registered.
 *
 * @param value - Default export of a plugin package, or a plugin object.
 * @param namespace - Namespace the plugin is loaded under.
 * @returns The same value, typed as a plugin.
 * @throws Error - When the plugin does not have the shape of a plugin.
 */
export function validatePlugin(value: unknown, namespace: string): Plugin {
  let problem = getPluginProblem(value)
  if (problem !== null) {
    throw new Error(`Plugin "${namespace}" is invalid: ${problem}.`)
  }
  return value as Plugin
}

/**
 * Finds what is wrong with the shape of a preset.
 *
 * @param value - Preset to check.
 * @returns Description of the first problem, or null when there is none.
 */
function getPresetProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'must be an object'
  }
  if (typeof value['description'] !== 'string') {
    return 'has no description'
  }
  if (!isRecord(value['mutators'])) {
    return 'has "mutators" that is not an object'
  }
  let mutatorSettings = Object.entries(value['mutators'])
  for (let [id, setting] of mutatorSettings) {
    if (!isMutatorSetting(setting)) {
      return `has an invalid setting for "${id}": use "on", "off" or ["on", options]`
    }
  }
  let extended = value['extends']
  if (
    extended !== undefined &&
    (!Array.isArray(extended) || extended.some(id => typeof id !== 'string'))
  ) {
    return 'has "extends" that is not a list of preset ids'
  }
  if (value['settings'] !== undefined) {
    let problem = getSettingsProblem(value['settings'])
    if (problem !== null) {
      return `has invalid settings: ${problem}`
    }
  }
  return null
}

/**
 * Finds what is wrong with the shape of a plugin.
 *
 * @param value - Plugin to check.
 * @returns Description of the first problem, or null when there is none.
 */
function getPluginProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'it must be an object'
  }
  if (!isRecord(value['mutators'])) {
    return '"mutators" must be an object'
  }
  let mutators = Object.entries(value['mutators'])
  for (let [name, mutator] of mutators) {
    let problem = getMutatorProblem(mutator)
    if (problem !== null) {
      return `mutator "${name}" ${problem}`
    }
  }
  let rulesProblem = getSkipRulesProblem(value['skipRules'])
  if (rulesProblem !== null) {
    return rulesProblem
  }
  if (value['presets'] === undefined) {
    return null
  }
  if (!isRecord(value['presets'])) {
    return '"presets" must be an object'
  }
  let presets = Object.entries(value['presets'])
  for (let [name, preset] of presets) {
    let problem = getPresetProblem(preset)
    if (problem !== null) {
      return `preset "${name}" ${problem}`
    }
  }
  return null
}

/**
 * Finds what is wrong with the shape of the skip rules of a plugin.
 *
 * @param value - Skip rules to check, or undefined when the plugin has none.
 * @returns Description of the first problem, or null when there is none.
 */
function getSkipRulesProblem(value: unknown): string | null {
  if (value === undefined) {
    return null
  }
  if (!isRecord(value)) {
    return '"skipRules" must be an object'
  }
  for (let [name, rule] of Object.entries(value)) {
    if (!isRecord(rule)) {
      return `skip rule "${name}" must be an object`
    }
    let { category } = rule
    if (
      typeof category !== 'string' ||
      !Object.hasOwn(SKIP_CATEGORIES, category)
    ) {
      return `skip rule "${name}" has an invalid category: use "equivalent", "noise", "timeout", "owned", "subsumed", "duplicate" or "invalid"`
    }
    if (typeof rule['heuristic'] !== 'boolean') {
      return `skip rule "${name}" has heuristic that is not true or false`
    }
  }
  return null
}

/**
 * Finds what is wrong with the shape of a mutator.
 *
 * @param value - Mutator to check.
 * @returns Description of the first problem, or null when there is none.
 */
function getMutatorProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'must be an object'
  }
  if (typeof value['create'] !== 'function') {
    return 'has no create function'
  }
  let { meta } = value
  if (!isRecord(meta) || typeof meta['description'] !== 'string') {
    return 'has no meta.description'
  }
  if (
    meta['defaultOptions'] !== undefined &&
    !isRecord(meta['defaultOptions'])
  ) {
    return 'has meta.defaultOptions that is not an object'
  }
  if (
    meta['countsForSolitary'] !== undefined &&
    typeof meta['countsForSolitary'] !== 'boolean'
  ) {
    return 'has meta.countsForSolitary that is not true or false'
  }
  return null
}
