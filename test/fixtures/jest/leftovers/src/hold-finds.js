module.exports = {
  // Under its mutant the test finds the port taken that the other file left, and
  // survives unless what the other mutant left falsifies it.
  finds: () => false,
}
