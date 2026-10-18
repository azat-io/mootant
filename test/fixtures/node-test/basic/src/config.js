import defaults from './defaults.json' with { type: 'json' }

export function getRetries(overrides) {
  return overrides.retries ?? defaults.retries
}
