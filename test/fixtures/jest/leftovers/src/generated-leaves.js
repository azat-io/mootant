module.exports = {
  // Its mutant makes the run look for a file it did not write.
  moduleName: () => 'generated-module',
  // Runs after that mutant, and survives unless the file still reads as missing.
  scale: value => value * 2,
}
