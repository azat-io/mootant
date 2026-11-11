export function when(delay) {
  return delay > 0 ? '__LATER__' : 'now'
}
