// An array that is only pushed to and joined with '' (catalog 4.2), and the
// groups of a regex match (catalog 4.13): an undefined element first, and ?.
// after groups that every match has, change nothing, so they are skipped.

export function text(items: string[]): string {
  let parts: string[] = [] // joined with '': no [undefined]
  for (let item of items) parts.push(item)
  return parts.join('')
}

export function key(line: string): string | undefined {
  let match = /(?<key>.)=/u.exec(line)
  return match?.groups?.['key']?.trim() // every match has groups and key: only the first ?. is replaced
}
