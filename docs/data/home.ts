import IconGitPullRequest from '../icons/git-pull-request.svg'
import IconFilter from '../icons/filter.svg'
import IconShield from '../icons/shield.svg'
import IconPuzzle from '../icons/puzzle.svg'
import IconNodejs from '../icons/nodejs.svg'
import IconVitest from '../icons/vitest.svg'
import IconHook from '../icons/hook.svg'
import IconBolt from '../icons/bolt.svg'
import IconJest from '../icons/jest.svg'

/**
 * Text of the first screen of the home page.
 */
export const HERO = {
  description:
    'Mootant changes your code in hundreds of small ways and runs the tests that should notice. The mutants that survive are the gaps in your suite, and the agent skill in the box knows how to close them.',
  slogan: 'Mutation testing for JavaScript and\u{A0}TypeScript',
  title: 'Find the tests that test nothing.',
  install: 'npm install -D mootant',
}

/**
 * Code coverage and mutation testing of the example project side by side.
 */
export const COVERAGE = {
  coverage: {
    /**
     * Files of `vitest run --coverage` on the example project. Each of them is
     * fully covered, so every metric shows 100%. The functions column is left
     * out to keep the table narrow on phones.
     */
    files: ['cart.ts', 'discount.ts', 'shipping.ts'],
    caption: 'Every statement, branch and line ran.',
    metrics: ['Stmts', 'Branch', 'Lines'],
    command: 'vitest run --coverage',

    /**
     * The file where the mutant survived, highlighted in the table.
     */
    survived: 'discount.ts',
    label: 'Code coverage',
    value: '100%',
  },
  mutation: {
    verdict:
      'No test checks an order of exactly 100, so all 11 tests still pass.',
    before: 'if (total >= 100 || isMember) {',
    after: 'if (total > 100 || isMember) {',
    command: 'mootant run src',
    label: 'Mutation testing',
    caption: 'of 26 mutants',
    file: 'src/discount.ts',
    score: 'score 96.15%',
    value: '1 survived',
    location: ':2:7',
  },
  lead: {
    text: "It can't tell whether any test would notice them change.",
    muted: 'Coverage shows which lines ran.',
  },
  title: 'Coverage lies',
}

/**
 * Reasons to use Mootant, as cards under a lead.
 */
export const WHY = {
  cards: [
    {
      description:
        'Mootant skips duplicate, likely equivalent, and likely hanging mutants, so you spend less time investigating false alarms.',
      title: 'Less noise',
      icon: IconFilter,
    },
    {
      description:
        'Mootant mutates numbers, return values, and awaits-not just operators-to expose tests that miss changes in behavior.',
      title: 'Finds hidden gaps',
      icon: IconHook,
    },
    {
      description:
        "Mootant caches results and tracks their dependencies. Mutants unaffected by your changes don't need to run again.",
      title: 'Fast reruns',
      icon: IconBolt,
    },
    {
      description:
        'Test only the lines changed in a pull request, and fail CI when the mutation score falls below your threshold.',
      icon: IconGitPullRequest,
      title: 'Ready for CI',
    },
    {
      description:
        'Every survivor shows the code change and a suggested test file to improve. Uncovered mutants are reported separately.',
      title: 'Actionable reports',
      icon: IconShield,
    },
    {
      description:
        'Use your existing Vitest, Jest or Node Test setup. JavaScript and TypeScript work with all three, Vue and Svelte with Vitest.',
      title: 'Fits your stack',
      icon: IconPuzzle,
    },
  ],
  lead: {
    muted: 'Mutation testing is often slow, noisy, and hard to act on.',
    text: 'Mootant was built to fix all three.',
  },
  title: 'Why Mootant',
}

/**
 * Steps of a run, in order.
 */
export const HOW_IT_WORKS = {
  steps: [
    {
      description:
        'Mootant picks the changes worth testing and compiles them all into your code in memory, each behind a switch. Your files stay untouched.',
      title: 'Built once, switched at runtime',
      label: '01 · Instrument',
    },
    {
      description:
        'A dry run maps which test files reach which mutant. Then every mutant runs alone, on a fresh module graph, with only those files, until a test fails.',
      title: 'Each mutant on its own',
      label: '02 · Run',
    },
    {
      description:
        'Each survivor comes with a diff, the test file to extend and a command to re-check it. Fix it yourself or hand it to the agent skill.',
      title: 'Survivors become tests',
      label: '03 · Fix',
    },
  ],
  title: 'How it works',
}

/**
 * The agent skill that comes with Mootant.
 */
export const SKILL = {
  paragraphs: [
    'Mutation testing produces a to-do list that nobody wants to work through by hand.',
    'The skill reads the report, writes the missing tests and asks Mootant to confirm each kill. You review the new tests.',
  ],
  install: 'npx skills add azat-io/mootant',
  title: 'Ships with an agent skill',
}

/**
 * What Mootant works with, and the demo report next to it.
 */
export const COMPATIBILITY = {
  demo: {
    description:
      'The report of a small sample shop: scores, every mutant in its code and what each test reaches.',

    /**
     * How to get the same report. Backticks mark code.
     */
    tip: 'Add `--html` to a run to write the same report for your project.',
    title: 'See what survives',
  },
  runners: [
    {
      icon: IconVitest,
      title: 'Vitest',
      text: '^5.0.0',
    },
    {
      text: '^29.7.0 || ^30.0.0',
      icon: IconJest,
      title: 'Jest',
    },
    {
      text: '^20.19.0 || >=22.12.0',
      title: 'Node Test',
      icon: IconNodejs,
    },
  ],
  /**
   * Extensions of the files Mootant mutates: JavaScript, then TypeScript in the
   * same order, then Vue and Svelte components.
   */
  extensions: [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.mts',
    '.cts',
    '.tsx',
    '.vue',
    '.svelte',
  ],
  title: 'Works with your stack',
}
