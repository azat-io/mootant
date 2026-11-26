import IconAntigravity from '../icons/antigravity.svg'
import IconOpencode from '../icons/opencode.svg'
import IconWindsurf from '../icons/windsurf.svg'
import IconChatgpt from '../icons/chatgpt.svg'
import IconCopilot from '../icons/copilot.svg'
import IconCursor from '../icons/cursor.svg'
import IconClaude from '../icons/claude.svg'
import IconCline from '../icons/cline.svg'
import IconQoder from '../icons/qoder.svg'
import IconKimi from '../icons/kimi.svg'
import IconQwen from '../icons/qwen.svg'
import IconZed from '../icons/zed.svg'

/**
 * Agents that the agent skill page shows, in alphabetical order and by the
 * names the installer gives them. The installer supports more agents, and the
 * link after them lists all.
 */
export const AGENTS = {
  list: [
    { icon: IconAntigravity, title: 'Antigravity' },
    { title: 'Claude Code', icon: IconClaude },
    { icon: IconCline, title: 'Cline' },
    { icon: IconChatgpt, title: 'Codex' },
    { icon: IconCursor, title: 'Cursor' },
    { title: 'GitHub Copilot', icon: IconCopilot },
    { title: 'Kimi Code CLI', icon: IconKimi },
    { icon: IconOpencode, title: 'OpenCode' },
    { icon: IconQoder, title: 'Qoder' },
    { title: 'Qwen Code', icon: IconQwen },
    { icon: IconWindsurf, title: 'Windsurf' },
    { icon: IconZed, title: 'Zed' },
  ],
  more: {
    url: 'https://github.com/vercel-labs/skills/blob/main/docs/agents.md',
    text: 'and every other agent skills.sh supports',
  },
  label: 'Works in',
}

/**
 * Report of a real session on `src/coupon.ts` of the sample shop in
 * `docs/demo`: 9 of its 25 mutants survived, the 8 new tests caught 8 of them,
 * and the last one is equivalent. Backticks mark code.
 */
export const SKILL_REPORT = {
  decisions: [
    {
      text: 'Only the code says that a 0% coupon is invalid. Three more pinned tests cover spaces around the code and digits in it.',
      title: "`parseCoupon('SAVE-0')` returns `null`",
      kind: 'pinned',
    },
    {
      text: 'The percent comes from `\\d{1,2}` and is never negative, so no input tells the two apart. An ignore comment would also hide two mutants the new tests kill, so the agent proposes none.',
      title: '`percent <= 0` in place of `percent === 0`',
      kind: 'equivalent',
    },
  ],
  counts: [
    {
      note: 'of the 9 survivors, each confirmed by Mootant',
      label: 'Caught',
      value: '8',
    },
    {
      note: 'of them pinned: only the code backs the expected value',
      label: 'To review',
      value: '4',
    },
    {
      note: 'the last survivor, with the reason',
      label: 'Equivalent',
      value: '1',
    },
  ],
  tests: '8 tests added to `test/coupon.test.ts`, the only file changed',
  decisionsLabel: 'Needs your decision',
  score: { before: 64, after: 96 },
  label: 'Mutation score',
  scope: 'src/coupon.ts',
}
