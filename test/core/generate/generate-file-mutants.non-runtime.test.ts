import { describe, expect, it } from 'vitest'

import { generateMutants } from '../../helpers/generate-mutants'

/**
 * Snippets full of code that scope analysis sees but the runtime tree leaves
 * out: ambient declarations of every kind, logging calls that read and write
 * locals (also inside loops and returns), type positions, decorators, enums,
 * `import()` and `require` arguments.
 */
const SNIPPETS: { lines: string[]; file: string }[] = [
  {
    lines: [
      'declare const VERSION: string',
      'export function v() { return VERSION }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare const cfg: { url: string; on: boolean }',
      'export function u() { return cfg.url }',
      'export function o() { return cfg.on }',
      'export const a = () => cfg.url',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare let count: number',
      'declare var flag: boolean',
      'export function c() { count++; count += 2; return count }',
      'export function f() { if (flag) return flag; flag = !flag; return !flag }',
      'export function w() { while (count < 3) { count = count + 1 } return count > 0 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare function load(): Promise<string>',
      'declare function load(id: number): Promise<string>',
      'declare const pending: Promise<number>',
      'export async function g() { const u = await load(); return u }',
      'export async function h() { const v = await pending; return v }',
      'export async function* pages(ids: number[]) { for (const id of ids) yield await load(id) }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare class Foo { x: number; m(): boolean }',
      'declare enum E { A, B }',
      'declare namespace N { const x: number }',
      "declare module 'm' { export const y: number }",
      'declare global { var G: string }',
      'export function h(f: Foo) { return f.x > 0 ? f.m() : null }',
      'export function e() { return E.A === E.B }',
      'export function n() { return N.x + 1 }',
      "export function gg() { return G || 'x' }",
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'export declare const ready: boolean',
      'export declare function check(a: number): boolean',
      'class A { declare x: number; m() { return this.x } }',
      'abstract class B { abstract y: number; abstract m(): number; f(a: string): string; f(a: any) { return a } }',
      'export function r(a: A) { return check(a.m()) && ready }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'enum Color { Red = 1, Green = Red + 1, Blue = Green * 2 }',
      'const enum Size { S = 1, L = S << 2 }',
      'export function col(c: Color) { return c === Color.Red ? Size.S : Size.L }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'function run(ts) { let done = 0; for (const t of ts) { t(); console.log(++done) } return done }',
      'async function f() { const u = await load(); return console.log(u) }',
      "async function g() { const u = await load(); return debug('loaded %o', u) }",
      'function h(a) { let x = a; console.log(x = x + 1, x > 0 && x); while (x < 10) { logger.info(x++) } return x }',
      'function k(a) { let ok = false; console.log((ok = a > 1)); return ok }',
      'function m(a) { let s = ""; console.warn(s += a); return s.length > 0 ? s : null }',
      'let t = 0; console.log(t += 1); export const read = () => t',
      'function n(xs) { let i = 0; while (i < xs.length) { console.log(i++) } return i }',
      'function p() { let q = 1; console.log((() => { let z = q; return z })()); return q }',
    ],
    file: 'example.js',
  },
  {
    lines: [
      'export function f(x?: number) { console.log(x ??= 1); return x }',
      'export function g(a: number[]) { let total = 0; for (const v of a) { console.debug(total += v) } return total }',
      'export async function h() { const u = await fetchUser(); return console.log(u as unknown) }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      "function f<T extends string = 'a'>(x: T): T { let y: typeof x = x; return y }",
      'let base = 1',
      'type K = typeof base',
      'interface I { k: typeof base }',
      'function g(a: number): K { let r: Array<typeof a> = []; return r.length > 0 ? base : a }',
      'let z = <const>[1, 2]',
      'let s = { a: 1 } satisfies Record<string, number>',
      'export function h(v: string | null) { return v!.length > 0 && z.length > 1 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'function dec(v: number) { return (t: any) => t }',
      'let n = 1',
      '@dec(n + 1) class A { @dec(n++) m() { return n } @dec(n > 0 ? 1 : 2) p = n }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      "let p = 'x'",
      "export async function i() { const m = await import(p + '.js'); return m }",
      "export function r(name: string) { const mod = require('./' + name); return mod }",
      "import fs = require('fs')",
      "export function q() { return fs.readFileSync('a') }",
      "export * from './other'",
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'namespace NS { export const a = 1; export function f() { return a > 0 } }',
      'export function nf() { return NS.f() && NS.a === 1 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(rs) { for (await using r of rs) { return await r.read() } }',
      'async function g(r0) { await using r = r0; return await r.read() }',
      'function h(rs) { for (using r of rs) { return r.size > 0 } }',
    ],
    file: 'example.ts',
  },
]

describe('generateFileMutants on non-runtime code', () => {
  it.each(
    SNIPPETS.flatMap(snippet =>
      ['recommended', 'strict'].map(preset => ({ ...snippet, preset })),
    ),
  )('runs every mutator without errors ($file, $preset)', snippet => {
    expect(() =>
      generateMutants(snippet.lines.join('\n'), {
        preset: snippet.preset,
        file: snippet.file,
      }),
    ).not.toThrow()
  })
})
