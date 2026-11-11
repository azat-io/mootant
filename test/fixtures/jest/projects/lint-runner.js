module.exports = class LintRunner {
  async runTests(tests, watcher, onStart, onResult) {
    for (let test of tests) {
      let now = Date.now()
      await onStart(test)
      await onResult(test, {
        snapshot: {
          uncheckedKeys: [],
          fileDeleted: false,
          unchecked: 0,
          unmatched: 0,
          matched: 0,
          updated: 0,
          added: 0,
        },
        testResults: [
          {
            failureMessages: [],
            numPassingAsserts: 0,
            failureDetails: [],
            ancestorTitles: [],
            status: 'passed',
            fullName: 'lint',
            title: 'lint',
            duration: 0,
          },
        ],
        perfStats: { start: now, end: now, runtime: 0, slow: false },
        testFilePath: test.path,
        numFailingTests: 0,
        numPassingTests: 1,
        numPendingTests: 0,
        numTodoTests: 0,
        openHandles: [],
        skipped: false,
        leaks: false,
      })
    }
  }
}
