export const patterns = [
  /^[\p{L}--[a-z]]+$/v,
  /[\q{abc|d}a-c]/v,
  /^(?<year>\d{4})-(?<month>\d{2})$/u,
  /\p{Script=Greek}+/u,
  /(?<=\$)\d+(\.\d+)?/,
  /(?<!\\)"/g,
  /^\u{1F600}?x$/u,
  /[^\s\w-]+/gi,
  /a{2,3}|b+?|(?:c|d)*/y,
  /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+)@example\.com$/i,
  /[\d&&[^0]]/v,
  /\k<n>(?<n>a)/u,
]
export function test(s) {
  return patterns.map(p => p.test(s))
}
