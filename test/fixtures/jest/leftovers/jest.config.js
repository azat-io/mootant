module.exports = {
  // The mask every new process starts with, which no later run can change.
  globals: { startMask: process.umask() },
  testEnvironment: 'node',
}
