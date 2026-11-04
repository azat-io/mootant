export const CONFIG = JSON.parse(process.env.ORACLE_CONFIG ?? '{"mode":"test"}')

export function mode() {
  return CONFIG.mode
}
