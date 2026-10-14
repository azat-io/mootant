// Architecture fixture: type-only syntax, wrappers, scopes, identity, columns and the ignore grammar.
'use strict'

import type { Readable } from 'node:stream'
import { join } from 'node:path'
export { basename } from 'node:path'

declare const VERSION: string
declare module 'virtual' {
  export const flag: boolean
}

interface User {
  name: string
}

type Mode = 'a' | 'b'

enum Level {
  Low = 1,
  High = 2,
}

export function scale(value: number): number
export function scale(value: number, factor = 2): number {
  return value * factor
}

export abstract class Base {
  abstract size: number
  abstract describe(): string
}

@sealed('final')
export class Box extends Base implements Partial<User> {
  size = 1
  constructor(private readonly label = 'box') {
    super()
  }
  get area(): number {
    return this.size * this.size
  }
  set area(next: number) {
    this.size = next / this.size
  }
  #grow(by: number): void {
    this.size += by
  }
  describe(): string {
    return this.label + '!'
  }
}

export const LIMIT = 10
export const double = (n: number): number => n * 2
export const config = {
  compute(a: number, b: number) {
    return a - b
  },
}

export function wrappers(a: number, b: number, x: number | undefined, y: unknown, user: User | undefined, mode: Mode = 'a') {
  let sum = (a + b) as number
  let shape = { size: a % b } satisfies { size: number }
  let forced = x! - a
  let cast = <number>y / b
  let pair = [1, 2] as const
  let ratio = (a + b) /* note */ * a
  let trimmed = user?.name.trim()
}

export namespace Space {
  export const half = LIMIT / Level.High
}

export function first(a: number, b: number) {
  return a + b
}

export function second(a: number, b: number) {
  return a + b
}

export function twice(a: number, b: number) {
  return (a + b) * (a + b)
}

export function effects(total: number, base: string, sep: string, items: number[]) {
  save(total * 3)
  notify(
    total,
    base,
  )
  let path = base + sep + sep
  items.forEach((item) => record(item))
  return path
}

export const greet = (name: string): string => '👋 ' + name.trim()

// mootant-ignore-next-line
export let one = 'one'
// mootant-ignore-next-line string-literal: label text
export let two = 'two' + LIMIT
/* mootant-ignore-next-line */ export let three = 'three'
export let four = LIMIT * Level.High
// mootant-ignore-start number-literal: legacy constants
export let five = [5, 'five']
// mootant-ignore-end number-literal
// mootant-ignore-start: outer
export let six = LIMIT - Level.Low
// mootant-ignore-start string-literal: inner
export let seven = 'seven'
// mootant-ignore-end string-literal
export let eight = LIMIT / Level.High
// mootant-ignore-end
// mootant-ignore-start string-literal: strings
// mootant-ignore-start arithmetic-operator: math
export let nine = 'nine' + LIMIT
// mootant-ignore-end string-literal
export let ten = 'ten' + LIMIT
// mootant-ignore-end
export let eleven = 'eleven'

// mootant-ignore-next-line strng-literal: typo
export let typo = 'typo'
// mootant-ignore-end
// mootant-ignore-nextline
export let malformed = LIMIT + Level.Low
/**
 * Mootant-ignore-next-line string-literal: written by the house formatter
 */
export let formatted = 'formatted'

export default { label: 'default' + LIMIT }
