/**
 * Environment variables that change from one shell or terminal to another
 * without changing what tests do, and mootant's switch of spare test processes
 * (`readPreforkSwitch`), which tests never see; left out of the hash of all
 * variables, which stands for code that lists them.
 */
export const VOLATILE_VARIABLES: ReadonlySet<string> = new Set([
  'ITERM_SESSION_ID',
  'MOOTANT_PREFORK',
  'TERM_SESSION_ID',
  'WINDOWID',
  'OLDPWD',
  'SHLVL',
  'PWD',
  '_',
])
