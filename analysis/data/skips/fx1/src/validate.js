export function validate(input, report) {
  let ok = input.length > 2 && input.length < 10
  if (!ok) {
    report('invalid')
  }
  return ok
}
