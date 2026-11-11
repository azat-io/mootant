import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { findJestCommand } from '../../../adapters/jest/find-jest-command'

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Gives the project scripts.
 *
 * @param scripts - Scripts of its `package.json`.
 */
async function writeScripts(scripts: Record<string, string>): Promise<void> {
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts }))
}

describe('findJestCommand', () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mootant-command-'))
  })

  afterEach(async () => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it('finds the first command of the test scripts that runs Jest', async () => {
    await writeScripts({
      'test:unit': 'NODE_ENV=test jest --config unit.js',
      'test:lint': 'eslint . && node build.js',
      'test:e2e': 'jest --config e2e.js',
      test: 'pnpm run /^test:/',
    })

    await expect(findJestCommand(root, undefined)).resolves.toStrictEqual({
      args: ['--config', 'unit.js'],
      env: { NODE_ENV: 'test' },
      diagnostics: [],
      nodeFlags: [],
    })
  })

  it('falls back to plain jest', async () => {
    await writeScripts({ test: 'vitest run' })

    await expect(findJestCommand(root, undefined)).resolves.toStrictEqual({
      diagnostics: [],
      nodeFlags: [],
      args: [],
      env: {},
    })
  })

  it.each([
    'pnpm -s jest --config custom.js',
    'npm exec --yes -- jest --config custom.js',
    'yarn run jest --config custom.js',
    'node --experimental-vm-modules $(npm bin)/jest',
    'yarn node --experimental-vm-modules $(yarn bin jest)',
    'node --experimental-vm-modules $(npm bin)/jest.js',
  ])('warns when it runs plain jest in place of %s', async script => {
    await writeScripts({ test: script })

    await expect(findJestCommand(root, undefined)).resolves.toStrictEqual({
      diagnostics: [
        {
          message:
            'mootant cannot read how the test scripts run Jest, so it runs plain jest; give the command in the options of the adapter.',
          code: 'config-overridden',
          severity: 'warning',
          column: null,
          line: null,
          file: null,
        },
      ],
      nodeFlags: [],
      args: [],
      env: {},
    })
  })

  it('reads the given command instead of the scripts', async () => {
    await writeScripts({ test: 'jest --config scripts.js' })

    await expect(
      findJestCommand(root, 'tsc && jest --config given.js'),
    ).resolves.toMatchObject({ args: ['--config', 'given.js'] })
  })

  it('refuses a given command that does not run Jest', async () => {
    await expect(findJestCommand(root, 'vitest run')).rejects.toThrow(
      'The command "vitest run" does not run Jest; give one such as "jest --config jest.config.js".',
    )
  })

  it.each([
    ['npx jest -i', ['-i']],
    ['pnpm exec jest -i', ['-i']],
    ['yarn jest -i', ['-i']],
    ['cross-env A=1 jest -i', ['-i']],
    ['./node_modules/.bin/jest -i', ['-i']],
    ['node_modules/.bin/jest.cmd -i', ['-i']],
    ['node_modules/jest/bin/jest.js -i', ['-i']],
  ])('reads %s', async (command, arguments_) => {
    await expect(findJestCommand(root, command)).resolves.toMatchObject({
      args: arguments_,
    })
  })

  it.each([
    ['npm exec jest -- --ci', ['--ci']],
    ['npm x jest -- --ci -- a', ['--ci', '--', 'a']],
    ['A=1 npm exec jest -- --ci', ['--ci']],
    ['npm exec node jest.js -- --ci', ['--ci']],
    ['npm exec -- jest -- --ci', ['--', '--ci']],
    ['npx jest -- --ci', ['--', '--ci']],
    ['pnpm exec jest -- --ci', ['--', '--ci']],
    ['jest -- --ci', ['--', '--ci']],
  ])('keeps the -- that reaches Jest in %s', async (command, arguments_) => {
    await expect(findJestCommand(root, command)).resolves.toMatchObject({
      args: arguments_,
    })
  })

  it.each([
    ['jest --ci > out.txt', ['--ci']],
    ['jest --ci >> out.txt', ['--ci']],
    ['jest --ci >out.txt', ['--ci']],
    ['jest --ci 2> err.txt -i', ['--ci', '-i']],
    ['jest --ci 2>err.txt', ['--ci']],
    ['jest --ci < in.txt', ['--ci']],
    ['jest --ci 2>&1 | tee out.txt', ['--ci']],
    ['jest --ci >', ['--ci']],
    ['node jest.js --ci > out.txt', ['--ci']],
    ['jest -t "<Button />"', ['-t', '<Button />']],
    ['jest --config=a>b.js', ['--config=a>b.js']],
  ])('leaves redirects out of %s', async (command, arguments_) => {
    await expect(findJestCommand(root, command)).resolves.toMatchObject({
      args: arguments_,
      diagnostics: [],
    })
  })

  it.each([
    ['jest $JEST_ARGS --ci', '$JEST_ARGS', ['--ci']],
    [`jest \${ARGS}`, `\${ARGS}`, []],
    ['jest "$@"', '$@', []],
    ['jest $*', '$*', []],
    ['jest $1', '$1', []],
    ['node jest.js $ARGS', '$ARGS', []],
  ])(
    'warns about the shell variable of %s',
    async (command, word, arguments_) => {
      await expect(findJestCommand(root, command)).resolves.toMatchObject({
        diagnostics: [
          { message: `mootant ignores ${word} of the test command.` },
        ],
        args: arguments_,
      })
    },
  )

  it('keeps a shell variable in a word as written', async () => {
    await expect(
      findJestCommand(root, 'jest --config=$CONFIG src/$NAME'),
    ).resolves.toMatchObject({
      args: ['--config=$CONFIG', 'src/$NAME'],
      diagnostics: [],
    })
  })

  it('expands the variables of the command as a shell does', async () => {
    vi.stubEnv('FROM_SHELL', 'shell')
    vi.stubEnv('REDEFINED', 'before')

    await expect(
      findJestCommand(
        root,
        `NODE_OPTIONS="$FROM_SHELL --flag" BRACED=\${FROM_SHELL}/x REDEFINED=$REDEFINED-after EARLIER=$BRACED! UNSET=[$NOT_SET] PRICE=5$ jest`,
      ),
    ).resolves.toMatchObject({
      env: {
        NODE_OPTIONS: 'shell --flag',
        REDEFINED: 'before-after',
        EARLIER: 'shell/x!',
        BRACED: 'shell/x',
        UNSET: '[]',
        PRICE: '5$',
      },
    })
  })

  it('keeps a $ the shell keeps as written, in single quotes or after a backslash, in variables and arguments', async () => {
    vi.stubEnv('FROM_SHELL', 'shell')

    await expect(
      findJestCommand(
        root,
        String.raw`SINGLE='$FROM_SHELL' ESCAPED=\$FROM_SHELL QUOTED="\$FROM_SHELL" PASSWORD='pa$$word' BEFORE="x$"FROM_SHELL DOUBLE="$FROM_SHELL" jest -t '$FROM_SHELL'`,
      ),
    ).resolves.toStrictEqual({
      env: {
        ESCAPED: '$FROM_SHELL',
        BEFORE: 'x$FROM_SHELL',
        QUOTED: '$FROM_SHELL',
        SINGLE: '$FROM_SHELL',
        PASSWORD: 'pa$$word',
        DOUBLE: 'shell',
      },
      args: ['-t', '$FROM_SHELL'],
      diagnostics: [],
      nodeFlags: [],
    })
  })

  it.each([
    [`DEFAULT=\${FROM_SHELL:-x} jest`, 'DEFAULT', `\${FROM_SHELL:-x}`],
    ['OUTPUT=$(pwd) jest', 'OUTPUT', '$(pwd)'],
    ['TICKS=`pwd` jest', 'TICKS', '`pwd`'],
    ['FIRST=$1 jest', 'FIRST', '$1'],
    ['PID=pa$$word jest', 'PID', 'pa$$word'],
  ])(
    'keeps an expansion it cannot make in %s as written, with a warning that names the variable alone',
    async (command, name, value) => {
      await expect(findJestCommand(root, command)).resolves.toStrictEqual({
        diagnostics: [
          {
            message: `mootant cannot expand the value of ${name} in the test command, so it keeps it as written; give ${name} in the env option of the adapter.`,
            code: 'config-overridden',
            severity: 'warning',
            column: null,
            line: null,
            file: null,
          },
        ],
        env: { [name]: value },
        nodeFlags: [],
        args: [],
      })
    },
  )

  it('keeps a backtick in single quotes as written, with no warning', async () => {
    await expect(
      findJestCommand(root, "TICKS='a`b`' jest"),
    ).resolves.toMatchObject({ env: { TICKS: 'a`b`' }, diagnostics: [] })
  })

  it('expands what cross-env sets once more, as cross-env does: with its own escapes and the variables of its own process alone', async () => {
    vi.stubEnv('FROM_SHELL', 'shell')

    await expect(
      findJestCommand(
        root,
        String.raw`KEPT='$FROM_SHELL' OUTER=outer cross-env SET='$FROM_SHELL' ESCAPED='\$FROM_SHELL' HALVED='\\$FROM_SHELL' UNQUOTED=\$FROM_SHELL BRACED='${'$'}{FROM_SHELL}' FROM_OUTER='$OUTER' OWN=own FROM_OWN='$OWN' jest`,
      ),
    ).resolves.toStrictEqual({
      env: {
        HALVED: String.raw`\shell`,
        ESCAPED: '$FROM_SHELL',
        FROM_OUTER: 'outer',
        KEPT: '$FROM_SHELL',
        UNQUOTED: 'shell',
        BRACED: 'shell',
        OUTER: 'outer',
        SET: 'shell',
        FROM_OWN: '',
        OWN: 'own',
      },
      diagnostics: [],
      nodeFlags: [],
      args: [],
    })
  })

  it('expands the words of cross-env with what the shell has, before cross-env sets its own variables', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await expect(
      findJestCommand(root, 'cross-env NODE_ENV=test TARGET=$NODE_ENV jest'),
    ).resolves.toMatchObject({
      env: { TARGET: 'production', NODE_ENV: 'test' },
      diagnostics: [],
    })
  })

  it.each<[string, Record<string, string>]>([
    ['FLAG=one cross-env TARGET=$FLAG jest', { TARGET: 'old', FLAG: 'one' }],
    [
      "FLAG=one env GIVEN=$FLAG cross-env SEEN='$FLAG' jest",
      { GIVEN: 'old', SEEN: 'one', FLAG: 'one' },
    ],
    [
      'export SHARED=shared && FLAG=$SHARED cross-env TARGET=$SHARED jest',
      { TARGET: 'shared', SHARED: 'shared', FLAG: 'shared' },
    ],
  ])(
    'expands %s as the shell does, the words of env and cross-env before what is set ahead of the command takes effect',
    async (command, env) => {
      vi.stubEnv('FLAG', 'old')

      await expect(findJestCommand(root, command)).resolves.toMatchObject({
        diagnostics: [],
        env,
      })
    },
  )

  it.each<[string, Record<string, string>]>([
    ['export A=1 B=$A; jest', { B: 'old', A: '1' }],
    ['export A=1; export B=$A; jest', { A: '1', B: '1' }],
  ])(
    'expands the words of one export before it sets any, as the shell does for %s',
    async (command, env) => {
      vi.stubEnv('A', 'old')

      await expect(findJestCommand(root, command)).resolves.toMatchObject({
        diagnostics: [],
        env,
      })
    },
  )

  it('takes what the script exports before the command as its variables', async () => {
    vi.stubEnv('FROM_SHELL', 'shell')

    await expect(
      findJestCommand(
        root,
        'export A=1 B=$FROM_SHELL C; export D=2 && A=3 jest --ci',
      ),
    ).resolves.toStrictEqual({
      env: { B: 'shell', A: '3', D: '2' },
      diagnostics: [],
      args: ['--ci'],
      nodeFlags: [],
    })
  })

  it.each([
    'node',
    'node build.js',
    'node --test',
    'pnpm run jest',
    'jester',
    'node jester.js',
  ])('does not take %s for Jest', async command => {
    await expect(findJestCommand(root, command)).rejects.toThrow('does not run')
  })

  it('reads Node flags and Jest arguments of a command that runs Jest with node', async () => {
    await expect(
      findJestCommand(
        root,
        'A=1 node --expose-gc --max-old-space-size 512 node_modules/jest/bin/jest.js -i a',
      ),
    ).resolves.toStrictEqual({
      nodeFlags: ['--expose-gc', '--max-old-space-size', '512'],
      args: ['-i', 'a'],
      diagnostics: [],
      env: { A: '1' },
    })
    await expect(
      findJestCommand(root, String.raw`node "node_modules\.bin\jest" -i`),
    ).resolves.toMatchObject({ args: ['-i'] })
  })

  it('leaves out the inspector and debug flags of Node with a warning', async () => {
    let command = await findJestCommand(
      root,
      'node --inspect-brk --inspect-port 9229 --debug-port=1 --expose-gc node_modules/.bin/jest',
    )

    expect(command.nodeFlags).toStrictEqual(['--expose-gc'])
    expect(command.diagnostics).toStrictEqual(
      ['--inspect-brk', '--inspect-port', '--debug-port=1'].map(flag => ({
        message: `mootant ignores ${flag} of the test command.`,
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      })),
    )
  })
})
