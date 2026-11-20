import type { JSXOpeningElement, JSXAttribute } from 'oxc-parser'

/**
 * Attributes whose value the compiler of Solid, dom-expressions, sets as a
 * property of a built-in element once the value is an expression, while it
 * writes a quoted value into the HTML as an attribute: `value` and the boolean
 * attributes, whose properties read `""` as false. Names are compared in
 * lowercase; the experimental names of the compiler are left out.
 */
let propertyAttributes = new Set(
  [
    'allowFullscreen',
    'async',
    'autofocus',
    'autoplay',
    'checked',
    'controls',
    'default',
    'defaultChecked',
    'defaultMuted',
    'defaultSelected',
    'defer',
    'disabled',
    'disablePictureInPicture',
    'disableRemotePlayback',
    'formNoValidate',
    'hidden',
    'indeterminate',
    'inert',
    'isMap',
    'loop',
    'multiple',
    'muted',
    'noModule',
    'noValidate',
    'open',
    'playsInline',
    'preservesPitch',
    'readOnly',
    'required',
    'reversed',
    'selected',
    'shadowRootClonable',
    'shadowRootDelegatesFocus',
    'shadowRootSerializable',
    'value',
  ].map(name => name.toLowerCase()),
)

/**
 * Namespaces whose attributes the compiler of Solid reads itself, such as
 * `bool:`, which leaves out an attribute whose quoted value is `"0"` but sets
 * it for a `"0"` in braces, since that is a truthy expression.
 */
let solidNamespaces = new Set([
  // spell-checker: disable-next-line
  'oncapture',
  'class',
  'style',
  'bool',
  'prop',
  'attr',
  'use',
  'on',
])

/**
 * Attributes that the compiler of Solid reads by its own rules on any element:
 * `ref` and `children` as such, `classList` as an object, the content
 * properties `innerHTML`, `innerText` and `textContent` as properties, and a
 * quoted `class`, `className` or `style` with its white space folded, while it
 * writes a value of theirs in braces as it is.
 */
let solidNames = new Set([
  'textContent',
  'className',
  'classList',
  'innerHTML',
  'innerText',
  'children',
  'class',
  'style',
  'ref',
])

/**
 * Start of the name of an attribute that the compiler of Solid takes for an
 * event once its value is in braces, such as `onclick`, while it writes a
 * quoted value as an attribute.
 */
const EVENT_PATTERN = /^on/u

/**
 * First letter of the tag of a built-in JSX element.
 */
const BUILT_IN_TAG_PATTERN = /^[a-z]/u

/**
 * Tells whether a compiler may read the value of a JSX attribute another way
 * once the mutant switch moves it into braces than while it is quoted. The
 * compiler of Solid reads by its own rules, on any element, an attribute of its
 * namespaces, such as `bool:`, of `solidNames`, such as `ref`, and one whose
 * name starts with `on`, such as `onclick`. In braces it also sets a name of
 * `propertyAttributes` on a built-in element and any attribute of a custom
 * element, whose tag has a `-` or which has an `is` attribute, as a property,
 * which can read the same text another way, as `disabled` reads `""` as false.
 * Other props of a component stay the same either way; so do the attributes of
 * other namespaces, such as `xlink:href`.
 *
 * @param attribute - Attribute with a quoted value.
 * @param element - Opening element of the attribute.
 * @returns Whether braces may change what the value does.
 */
export function isBraceSensitiveAttribute(
  attribute: JSXAttribute,
  element: JSXOpeningElement,
): boolean {
  let { name } = attribute
  let special =
    name.type === 'JSXNamespacedName' ?
      solidNamespaces.has(name.namespace.name)
    : solidNames.has(name.name) || EVENT_PATTERN.test(name.name)
  if (special) {
    return true
  }
  let tag = element.name
  if (tag.type !== 'JSXIdentifier' || !BUILT_IN_TAG_PATTERN.test(tag.name)) {
    return false
  }
  let custom =
    tag.name.includes('-') ||
    element.attributes.some(
      item =>
        item.type === 'JSXAttribute' &&
        item.name.type === 'JSXIdentifier' &&
        item.name.name === 'is',
    )
  return (
    custom ||
    (name.type === 'JSXIdentifier' &&
      propertyAttributes.has(name.name.toLowerCase()))
  )
}
