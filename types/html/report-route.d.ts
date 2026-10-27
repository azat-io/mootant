/**
 * Page of the report a location hash names.
 */
export type ReportRoute =
  | {
      /**
       * Line to scroll to, or null.
       */
      line: number | null

      /**
       * Path of the file, or null for the file with the lowest score.
       */
      path: string | null

      /**
       * Files page.
       */
      name: 'files'
    }
  | {
      /**
       * Files page with a mutant selected.
       */
      name: 'mutant'

      /**
       * Id of the mutant or its start.
       */
      id: string
    }
  | {
      /**
       * Index of the test.
       */
      index: number

      /**
       * Tests page with a test marked.
       */
      name: 'test'
    }
  | {
      /**
       * Page without parameters.
       */
      name: 'overview' | 'mutators' | 'mutants' | 'tests'
    }
