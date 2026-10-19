// Fixture for the mootant mutator catalog. Each statement exercises the rule in its comment.
interface User {
  name: string
}
type MaybeUser = User | null

export function arithmetic(count: number, rate: number, first: string, last: string) {
  let product = count * rate // * becomes /
  let sum = count + rate // numeric + becomes -
  let full = first + last // string +: the right operand is dropped
  let tagged = first + '!' // right operand is a string literal: string-literal owns it
  let same = rate ** 1 // identity: only number-literal
}

export function arrays(a: string, b: string, more: string[]) {
  let list = [a, b, ...more] // one removal per element
  let empty: string[] = [] // [] becomes [undefined]
  let digits = [1, 2] // elements with their own mutants are not removed
  useEffect(load, []) // hook dependency array: no array mutant
}

export function assignments(total: number, step: number, label: string, suffix: string, n: number | undefined, name: string | undefined, list: string[] | undefined) {
  total += step // += becomes -=
  label += suffix // string +=: no operator mutant, the statement is removed instead
  n ??= step // ??= becomes ||= (subsumes =), and the assignment never happens
  name ||= label // ||= becomes =, and ||= becomes ??=
  list ??= [] // object slot: ??= becomes =, and the assignment never happens
}

export function bits(flags: number, mask: number, n: number) {
  let masked = flags & mask // & becomes |
  let truncated = n | 0 // truncation idiom: the truncation is dropped
  let shifted = n >> 0 // identity: only number-literal
}

export function booleans(x: boolean, ok: boolean) {
  let done = false // false becomes true
  let strict = x === true // comparison operand: owned by the comparison constants
  let picked = ok ? true : false // a flipped branch equals the other branch: only condition
  do {
    run()
  } while (false) // the flip would loop forever: strict only
}

export function comparisons(a: number, b: number, mode: string, list: string[], value: string, user: User, key: string, map: object) {
  let below = a < b // <=, != and false
  let atLeast = a >= 10 // >, == and the shifted literal
  let nonEmpty = list.length > 0 // lengths are never negative: >= and the shifted literal
  let same = a === b // <=, >= and false
  let dark = mode === 'dark' // not numeric: true and false
  let isText = typeof value === 'string' // always true for a string: false only
  let missing = user === null // never true for a User: true only
  let has = key in map // true and false
  let larger = a > b ? a : b // max idiom: >= would be equivalent
}

export function conditions(flag: boolean, items: string[], el: Element | null, queue: string[], attempts: number, limit: number) {
  let answer = flag ? 'yes' : 'no' // condition: true and false
  if (items) run() // an array is always truthy: false only; the call is the whole then-branch
  if (el) show(el) // true and false
  while (queue.length) handle(queue.shift()) // loop test: false only; the call advances the loop
  for (;;) {
    if (++attempts > limit) break
  }
  let negated = !flag // value negation: true and false
}

export function logic(isMember: boolean, isActive: boolean, a: number, user: User | undefined, name: string | undefined, title: string, count: number | null, value: any) {
  if (isMember && isActive) run() // every operand is dropped, plus false
  if (a > 0 && isActive) run() // the comparison mutants subsume the drop of a > 0 and false
  let owner = user && user.name // value mode: two drops
  let label = name || 'anon' // the drop of name becomes ??; emptying 'anon' is subsumed by that swap
  let heading = title || 'untitled' // title is never nullish: plain drops; emptying 'untitled' is the drop of it
  let total = count ?? 0 // number with default 0: no swap
  let fallback = value ?? 0 // unknown value: ?? becomes ||
}

export function boolResult(a: { read: boolean; write: boolean }): boolean {
  return a.read && a.write // boolean return type: drops and false
}

export function methods(name: string, items: number[], query: Query, text: string) {
  let lower = name.trim().toLowerCase() // toUpperCase, and trim removed
  let evens = items.filter(isEven).sort() // sort removed, and filter removed
  let found = query.filter(isEven) // Query is not an array: no mutant
  let biggest = Math.max(items.length, 1) // max becomes min
  let width = name.padStart(8).length // only the length is observed: no swap
  if (text.startsWith('#')) run() // startsWith becomes endsWith; the needle is owned by the test
}

export async function awaits(id: string) {
  let user = await load(id) // the await is removed
  await save(user) // the await is removed; the statement removal is coarser
  if (await exists(id)) run() // a promise is always truthy, but the await removal still calls exists
  return await fetchName(user) // the caller awaits the same promise: no missing-await
}

export function numbers(items: string[], price: number) {
  let rate = 0.2 // 1.2
  let last = items[items.length - 1] // - becomes +, and 1 becomes 2
  let negative = -1 // 0, and unary-operator flips the sign
  let big = 10n // 11n
  let hex = 0xff // 0x100
  if (1) run() // stays truthy: no literal mutant, so the call is removed
  setTimeout(run, 100) // timer delay: only the statement removal
}

export function objects(name: string, defaults: object, x: number) {
  let config = { name, ...defaults, nested: { x } } // members without inner mutants are removed
  let none = {} // no mutant
}

export function chains(user: User | undefined, list: string[], callback?: () => void) {
  let n = user?.name // ?. becomes .
  let size = list?.length // list is never nullish: no mutant
  callback?.()
}

export function plainReturn(u: User): string {
  return u.name // ''
}

export function predicate(rows: User[]) {
  return rows.filter((row) => row.name) // predicate callback: true and false
}

export function localResult(a: number, b: number) {
  const result = compute(a, b)
  return result // the initializer has no mutant: undefined
}

export const onClick = (): void => track() // void result: the call is removed

export function statements(x: number, cache: Record<string, number>, key: string) {
  save(x) // removed
  delete cache[key] // removed
  if (x) notify(x) // the call is the whole then-branch: owned by the condition
  switch (key) {
    case 'a':
      first()
      break // removed: falls through into case 'b'
    case 'b':
      second()
      break // the next case starts with break: no mutant
    case 'c':
      break
  }
  if (x > 1) {
    save(x)
    return null // early return: removed
  }
  return null // tail position: no mutant
}

export class Builder {
  name = ''
  setName(name: string) {
    this.name = name // removed
    return this // removed
  }
}

export function strings(id: string, mode: string, s: string, map: Map<string, string>) {
  let greeting = 'Hello' // ''
  let empty = '' // 'mootant'
  let path = `/api/${id}/items` // only plain reads: ''
  let joined = `${id}${mode}` // no static text: no mutant
  let found = s.includes('foo') // value context: the needle is kept
  if (map.has('key')) run() // lookup key in a test: no string mutant
  console.log('debug', id) // logging call: the text is skipped, the removal stays
  throw new Error(`bad ${id}`) // error message: only the statement removal
}

export function unary(x: number, s: string, mask: number) {
  let negated = -x // x
  let parsed = +s // s
  let already = +x // already a number: no mutant
  let inverted = ~mask // mask
  let truncated = ~~x // x, once
}

export function updates(values: number[], n: number) {
  let count = 0
  for (let i = 0; i <= 10; i++) { // i++ advances the loop: no mutant; <= 10 gets the shifted literal
    count++ // count--
    values[count++] = n // count--, ++count (the value is used), and the removal of a plain assignment
  }
  while (count < n) count += 2 // advances the loop test: no operator mutant, no removal
}

export function nullable<T extends User | undefined>(maybe: MaybeUser, generic: T, user: User) {
  let a = maybe?.name // the alias is nullable
  let b = generic?.name // the constraint is nullable
  let c = user?.name // a User is never nullish: no mutant
}

export function ignores(emitter: Emitter, value: number, a: number, b: boolean) {
  // mootant-ignore-next-line string-literal: event name
  emitter.emit('change', value)
  // mootant-ignore-next-line comparison-operator: boundary is checked elsewhere
  if (a > 0 && b) run()
}

export function more(ok: boolean, a: boolean, b: boolean, c: boolean, s: string, text: string | undefined, label: string | undefined) {
  if (ok && true) run() // a literal operand is fixed: dropping it would be equivalent
  if (a && b || c) run() // the root's true is subsumed by the inner drops
  const at = s.indexOf(':') // value context: the needle is kept
  if (at === -1) run() // the lower bound follows the const: no <=; -1 -> 1
  let shown = text || '' // canonical default: no ?? swap
  let fallback = label ?? null // only the swap; dropping ?? null is strict
}

export async function guarded() {
  try {
    return await risky() // inside try with catch: the await is removed
  } catch {
    return null // tail position: no mutant
  }
}

export function deepChains(data: Data | undefined, value: string | undefined) {
  let title = data?.items?.[0]?.title // one mutant per ?., each replacing the whole chain
  let lower = value?.trim().toLowerCase() // method mutants inside a chain replace the whole chain
}

export function nullishTest(enabled: boolean | undefined) {
  if (enabled ?? false) run() // the flipped default covers undefined, so condition keeps only false
}

export function predicates(items: { id: string }[], id: string, rows: { visible?: boolean }[]) {
  let rest = items.filter((item) => item.id !== id) // true keeps every item in a copy: not the filter removal
  let shown = rows.filter((r) => r.visible ?? false) // the flip of false moves toward true, so only false
}

export function isTag(s: string): boolean {
  return s.startsWith('#') // boolean result: true and false stay next to the method swap
}

export function canEdit(user: { isAdmin: boolean }): boolean {
  if (user.isAdmin) return true // a flipped literal is the test forced to a constant: only condition
  return false
}

export function caseSwap(answer: string) {
  let yes = answer.toLowerCase() === 'yes' // toUpperCase never gives 'yes': the comparison constants own it
}

export async function search(client: SearchClient, query: string, count: () => Promise<number>) {
  let hits = await client.search(query) // search is typed by its name only: the await is removed
  if ((await count()) === 0) stop() // a promise never equals 0: the comparison's false owns the removed await
}

export async function loadUser(api: Api, id: string) {
  const user = await api.get(id)
  return user // the caller awaits the same promise: only return-value
}

export function partialIgnore(x: number) {
  // mootant-ignore-next-line comparison-operator: boundary is checked elsewhere
  if (x > 1) save(x) // the test's mutants are ignored, so the removal is the active probe
}

interface Query {
  filter(test: (n: number) => boolean): Query
}

export function childLogger(logger: { withContext(label: string): object }) {
  let buildLogger = logger.withContext('Build') // child-logger label: nothing
}

import { setTimeout as sleep } from 'node:timers/promises'

export async function timers(seconds: number, options?: { delay?: number }) {
  setInterval(tick, seconds * 1000) // timer delay: 1000 -> 1001 is noise; * becomes / (a name is touched)
  setTimeout(tick, options?.delay ?? 300) // ?. becomes . and ?? loses an operand; 300 -> 301 is noise
  await sleep(500) // promise timer: no mutant
}

export function templates(size: number, icon: { path: string }) {
  let svg = `<svg width="${size}">${icon.path}</svg>` // only plain reads: ''
  let label = `${format(size)} px` // a call is kept: `${format(size)}`
}

export async function guardedTimers(options: Options | null, pending: Job) {
  setTimeout(tick, options && options.delay) // both drops of && are kept: they touch a name and a member read
  await sleep(100, pending) // the timer takes on the state of pending: the await is kept
}
