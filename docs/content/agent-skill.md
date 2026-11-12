---
title: Agent skill
description:
  Install the Mootant agent skill, which turns surviving mutants into tests and
  asks Mootant to confirm each kill, and see what the skill changes in your
  project.
keywords:
  - mutation testing
  - agent skill
  - ai agents
  - claude code
  - codex
  - cursor
---

Mootant ships with an agent skill. It reads the report, writes the missing tests
and asks Mootant to confirm each kill. You review the new tests.

## Install

Add the skill to your project:

```sh
npx skills add azat-io/mootant
```

The installer asks which agents get the skill, such as Claude Code, Codex,
Cursor, GitHub Copilot or Gemini CLI. Add `-g` to install it for all your
projects.

The installer needs Node.js 22.20 or later. On an older version, copy
`skills/mootant` from the [repository](https://github.com/azat-io/mootant) to
`.claude/skills/mootant` for Claude Code, or to `.agents/skills/mootant` for
Codex, Cursor, GitHub Copilot and Gemini CLI.

The skill runs your project's Mootant, so install it there too:

```sh
npm install -D mootant
```

## Ask your agent

Ask in your own words, for example:

- Fix the surviving mutants in src.
- Would the tests catch a bug in my changes?
- Kill mutant q31p.

You can also call the skill by name: `/mootant` in Claude Code, Cursor, GitHub
Copilot and Gemini CLI, `$mootant` in Codex.

The agent runs Mootant and works through the surviving and uncovered mutants. It
adds tests and assertions, then runs each mutant again. At the end, the agent
runs Mootant once more.

## What it changes

| Part of your project          | What the skill does                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| Test files                    | Adds tests and assertions; never disables, loosens or deletes yours |
| Source code and configuration | Leaves them unchanged, apart from ignore comments                   |
| Ignore comments               | Proposes them with a reason and adds them once you agree            |
| `.mootant/`                   | Keeps its notes and reports there, hidden from Git                  |
| Commits and pull requests     | Makes them only when you ask                                        |

## Report

The agent ends with a report:

- The mutation score before and after.
- The mutants it killed, each with its test.
- What needs your decision: tests whose expected values come only from the code,
  possible bugs and proposed ignore comments.
- The mutants it could not kill or did not reach.

## Update

`npx skills check` shows whether a newer version of the skill exists. Install it
with:

```sh
npx skills update mootant
```
