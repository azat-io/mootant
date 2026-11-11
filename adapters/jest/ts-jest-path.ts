/**
 * Real path that tells ts-jest, whose type check mootant turns off: it rejects
 * switched text on a type error, and its language service would keep the text
 * and reject the next test file too. The transformer of jest-preset-angular
 * counts as ts-jest, since it extends ts-jest's and takes its options.
 */
export const TS_JEST_PATH = /[/\\](?:jest-preset-angular|ts-jest)[/\\]/u
