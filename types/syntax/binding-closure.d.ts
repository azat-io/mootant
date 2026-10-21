/**
 * How far the program that declares a binding holds its uses. `closed`: the
 * program holds every write and every read; an `export { x }` or `export
 * default x` reference counts as a read in the program, though importers read
 * the value through it. `write-closed`: it holds every write, but the value
 * leaves it, as an `export` declaration does. `open`: code may write the
 * binding where the scope analysis sees no write, or a read that the analysis
 * resolves to it may read another value, so neither its writes nor its
 * initializer tell the value a read gets.
 */
export type BindingClosure = 'write-closed' | 'closed' | 'open'
