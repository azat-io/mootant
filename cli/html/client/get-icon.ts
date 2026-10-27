import externalLink from '../../../docs/icons/external-link.svg?raw'
import chevronRight from '../../../docs/icons/chevron-right.svg?raw'
import chevronDown from '../../../docs/icons/chevron-down.svg?raw'
import arrowRight from '../../../docs/icons/arrow-right.svg?raw'
import volumeOff from '../../../docs/icons/volume-off.svg?raw'
import arrowLeft from '../../../docs/icons/arrow-left.svg?raw'
import copyCheck from '../../../docs/icons/copy-check.svg?raw'
import hourglass from '../../../docs/icons/hourglass.svg?raw'
import download from '../../../docs/icons/download.svg?raw'
import stack from '../../../docs/icons/stack-2.svg?raw'
import filter from '../../../docs/icons/filter.svg?raw'
import search from '../../../docs/icons/search.svg?raw'
import crown from '../../../docs/icons/crown.svg?raw'
import equal from '../../../docs/icons/equal.svg?raw'
import cross from '../../../docs/icons/cross.svg?raw'
import copy from '../../../docs/icons/copy.svg?raw'
import moon from '../../../docs/icons/moon.svg?raw'
import ban from '../../../docs/icons/ban.svg?raw'
import sun from '../../../docs/icons/sun.svg?raw'

/**
 * Icons of the docs the report uses, by name.
 */
const ICONS = {
  'external-link': externalLink,
  'chevron-right': chevronRight,
  'chevron-down': chevronDown,
  'arrow-right': arrowRight,
  'volume-off': volumeOff,
  'copy-check': copyCheck,
  'arrow-left': arrowLeft,
  'stack-2': stack,
  hourglass,
  download,
  search,
  filter,
  crown,
  equal,
  cross,
  copy,
  moon,
  ban,
  sun,
}

/**
 * Name of an icon of the report.
 */
type IconName = keyof typeof ICONS

/**
 * Returns the markup of an icon of the docs, hidden from assistive technology
 * and with a class to size it.
 *
 * @param name - Name of the icon file in the docs.
 * @returns SVG markup with the classes `icon` and `icon-<name>`.
 */
export function getIcon(name: IconName): string {
  return ICONS[name]
    .trim()
    .replaceAll(/\s+(?:height|width)="\d+"/gu, '')
    .replace('<svg', `<svg class="icon icon-${name}" aria-hidden="true"`)
}
