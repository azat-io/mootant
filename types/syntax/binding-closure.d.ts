/**
 * How far the program that declares a binding holds its uses. `closed`: the
 * program holds every write and every read; an `export { x }` or `export
 * default x` reference counts as a read in the program, though importers read
 * the value through it. `write-closed`: it holds every write, but the value
 * leaves it, as an `export` declaration does. `open`: code may write the
 * binding where the scope analysis sees no write, so its writes say nothing
 * about its value.
 */
export type BindingClosure = 'write-closed' | 'closed' | 'open'
