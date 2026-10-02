import type { On, SessionRateLimit } from 'claude-code'
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

// usage-log が書く pace.json（7日枠は月曜 20:00 JST リセット、今は金曜 19:00 JST）
const PACE = {
  sevenDay: { pct: 64, resetsAt: '2026-10-05T11:00:00.000Z' },
  fiveHour: { pct: 9, resetsAt: '2026-10-02T12:00:00.000Z' },
  windowEnd: Date.parse('2026-10-05T11:00:00.000Z'),
  checkpoints: [
    { at: Date.parse('2026-09-28T11:00:00.000Z'), pct: 0, label: '月 20:00' },
    { at: Date.parse('2026-10-01T15:00:00.000Z'), pct: 49, label: '金 0:00' },
    { at: Date.parse('2026-10-02T15:00:00.000Z'), pct: 61, label: '土 0:00' },
    { at: Date.parse('2026-10-05T11:00:00.000Z'), pct: 100, label: '月 20:00' },
  ],
}

const engineWithPace = (on: On, rateLimits: SessionRateLimit[]) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 200_000, window: 1_000_000, percent: 20 }, rateLimits },
  }))
  on('clock.now', () => ({ value: Date.parse('2026-10-02T10:00:00Z') }))
  on('env.get', () => ({ value: '/home/test' }))
  on('fs.read', () => ({ value: JSON.stringify(PACE) }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
}

describe('7日枠の目安（usage-log の pace.json）', () => {
  test('7日枠の行に目安と超過を足す', async ($, on) => {
    engineWithPace(on, [
      { kind: 'five_hour', percentUsed: 14, resetsAt: '2026-10-02T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 67, resetsAt: '2026-10-05T11:00:00.000Z' },
    ])
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: /目安61%（土 0:00）超過6/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰▰▰▰▰▰┃▰▱▱▱/ })).toBeDefined()
    await ui.unmount()
  })

  test('最初の応答の前は、pace.json の値で 5時間枠・7日枠を出す', async ($, on) => {
    engineWithPace(on, [])
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: /5時間枠.*9%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /あと3/ })).toBeDefined()
    await ui.unmount()
  })

  test('pace.json が無ければ今までどおり', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.findAll({ type: 'Text', text: /目安/ })).toHaveLength(0)
    await ui.unmount()
  })
})
