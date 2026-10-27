/**
 * Builds HTML from a template, which Prettier formats as HTML because of the
 * name of the tag. Values go in as they are, and the white space of the
 * formatting stays and means what HTML makes of it, so a fragment whose white
 * space shows, such as a row of a diff, is built without this tag. Only the
 * white space around the whole template is dropped.
 *
 * @param strings - Literal parts of the template.
 * @param values - Values between them.
 * @returns HTML of the template.
 */
export function html(
  strings: TemplateStringsArray,
  ...values: (undefined | boolean | string | number)[]
): string {
  return strings
    .map((part, index) => part + String(values[index] ?? ''))
    .join('')
    .trim()
}
