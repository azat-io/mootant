/**
 * Waits for a service that never answers, as a global setup does when what it
 * waits for is down.
 *
 * @returns A promise that never settles.
 */
export default function setup() {
  console.error('global setup waits for a service')
  return new Promise(() => {})
}
