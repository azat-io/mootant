export function a(s) {
  return s.replace(/^\s+/gm, '')
}
export function b(s) {
  return s.replace(/^a|b/g, '')
}
export function c(s) {
  return s.replace(/x$/g, 'y')
}
export function d(s) {
  return s.replace(/(?:^a)|(?:^b)/g, '')
}
