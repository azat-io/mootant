const { globalAgent } = require('node:http')

module.exports = {
  // Under its mutant the test leaves the shared agent changed.
  leaves: () => false,
  // Runs after that mutant, and one of its mutants passes only on what it left.
  poolSize: () => Math.min(globalAgent.maxSockets, 8),
  scale: value => value * 2,
}
