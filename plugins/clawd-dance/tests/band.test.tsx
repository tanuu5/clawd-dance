import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const bandProps = (isWorking: boolean) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 20,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 20, totalRows: 0 },
  view: {},
}) as never

// エンジンの代わり：使用量を返し、mod が描かないときは何も描かない
const engine = (on: On) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 200_000, window: 1_000_000, percent: 20 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 14, resetsAt: '2026-10-02T12:00:00Z' }],
    },
  }))
  on('clock.now', () => ({ value: Date.parse('2026-10-02T10:00:00Z') }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

describe('帯', () => {
  test('デスクトップでは全ポーズの絵を置き、1 枚だけ見せる', async ($, on) => {
    engine(on)
    for (const isWorking of [true, false]) {
      const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(isWorking) })
      const svgs = await ui.findAll({ type: 'Svg' })
      expect(svgs.length).toBe(15)
      expect(await ui.find({ type: 'Text', text: /コンテキスト/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('ターミナルでは何も足さない', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'terminal', component: 'AbovePrompt', props: bandProps(true) })
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
    await ui.unmount()
  })
})
