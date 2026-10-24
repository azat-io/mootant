import type { ThemeRegistration } from 'shiki'

import { createCssVariablesTheme } from 'shiki'

let theme = createCssVariablesTheme({
  variablePrefix: '--color-code-',
  name: 'css-variables',
  variableDefaults: {},
  fontStyle: true,
})

/**
 * Terminal colors of the theme. Shiki swaps colors that are not hex, such as
 * CSS variables, for stand-ins in the theme object itself and loses the swap
 * when it loads the theme again, as Astro does, so ANSI output would show the
 * stand-ins. Hex stand-ins of our own, mapped back with `colorReplacements`,
 * stay as they are.
 */
let terminalColors = Object.entries(theme.colors ?? {}).filter(([key]) =>
  key.startsWith('terminal.ansi'),
)

/**
 * Builds the hex stand-in of a terminal color.
 *
 * @param index - Position of the color among the terminal colors.
 * @returns Color such as `#000001`.
 */
function getStandIn(index: number): string {
  return `#${(index + 1).toString(16).padStart(6, '0')}`
}

export let colorTheme: ThemeRegistration = {
  ...theme,
  colors: {
    ...theme.colors,
    ...Object.fromEntries(
      terminalColors.map(([key], index) => [key, getStandIn(index)]),
    ),
  },
  colorReplacements: Object.fromEntries(
    terminalColors.map(([, value], index) => [getStandIn(index), value]),
  ),
}
