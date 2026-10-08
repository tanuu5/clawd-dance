import type { On, SessionRateLimit } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { backgroundText, barSvg, cleanUserText, isDialogTool, meterColor, permissionLine, shortUntil, nightLine, questionLine, recapLines, recapTranscript, sentenceLines, settleBackground } from '../hooks/register'

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
  test('デスクトップでは全ポーズの絵を置き、1 枚だけ見せる', { options: { bar_style: 'テキスト' } }, async ($, on) => {
    engine(on)
    for (const isWorking of [true, false]) {
      const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(isWorking) })
      const svgs = await ui.findAll({ type: 'Svg' })
      expect(svgs.length).toBe(16)
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
  test('7日枠の行に目安と超過を足す', { options: { bar_style: 'テキスト' } }, async ($, on) => {
    engineWithPace(on, [
      { kind: 'five_hour', percentUsed: 14, resetsAt: '2026-10-02T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 67, resetsAt: '2026-10-05T11:00:00.000Z' },
    ])
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: /目安61%（土 0:00）超過6/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰▰▰▰▰▰┃▰▱▱▱/ })).toBeDefined()
    await ui.unmount()
  })

  test('最初の応答の前は、pace.json の値で 5時間枠・7日枠を出す', { options: { bar_style: 'テキスト' } }, async ($, on) => {
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

describe('夜ふかしの声かけ', () => {
  test('0〜4 時台だけ、その時刻の一言を選ぶ', async () => {
    expect(nightLine(2, undefined, 0)).toBe('2時だよ。そろそろ寝よう…')
    expect(nightLine(4, undefined, 0.99)).toBe('空が明るくなる前に、おやすみ')
    expect(nightLine(5, undefined, 0)).toBeUndefined()
    expect(nightLine(23, undefined, 0)).toBeUndefined()
  })

  test('帯では「。」で行を分ける', async () => {
    expect(sentenceLines('日付が変わったよ。きりのいいところで休もうね')).toEqual(['日付が変わったよ。', 'きりのいいところで休もうね'])
    expect(sentenceLines('2時だよ。そろそろ寝よう…')).toEqual(['2時だよ。', 'そろそろ寝よう…'])
    expect(sentenceLines('空が明るくなる前に、おやすみ')).toEqual(['空が明るくなる前に、おやすみ'])
  })

  test('前回と同じ言葉は続けない', async () => {
    for (const random of [0, 0.4, 0.99]) {
      expect(nightLine(2, '2時だよ。そろそろ寝よう…', random)).not.toBe('2時だよ。そろそろ寝よう…')
    }
  })
})

describe('質問のときの声かけ', () => {
  test('前回と同じ言葉は続けない', async () => {
    for (const random of [0, 0.4, 0.99]) {
      expect(questionLine('ちょっと聞きたいことがあるよ', random)).not.toBe('ちょっと聞きたいことがあるよ')
    }
  })

  test('質問のダイアログが出るとき、効果音のあとに読み上げる', async ($, on) => {
    engine(on)
    const heard: string[] = []
    on('audio.play', () => {
      heard.push('♪')
      return { value: undefined }
    })
    on('audio.speak', (_$, e) => {
      heard.push(e.text)
      return { value: undefined }
    })
    on('process.run', () => ({ value: { stdout: '+0900\n', stderr: '', exitCode: 0 } }))
    on('tool.call', () => ({ result: {} }) as never)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(heard[0]).toBe('♪')
    expect(heard[1]).toMatch(/聞きたい|質問|選んで/)
  })
})

describe('許可のときの声かけ', () => {
  const listen = (on: On) => {
    const heard: string[] = []
    on('audio.play', () => {
      heard.push('♪')
      return { value: undefined }
    })
    on('audio.speak', (_$, e) => {
      heard.push(e.text)
      return { value: undefined }
    })
    on('process.run', () => ({ value: { stdout: '+0900\n', stderr: '', exitCode: 0 } }))
    on('classic.PermissionRequest', () => ({}) as never)
    on('classic.Notification', () => ({}) as never)
    return heard
  }

  test('道具ごとに言葉を選び、前回と同じ言葉は続けない', async () => {
    expect(permissionLine('mcp__computer-use__request_access', undefined, 0)).toMatch(/アプリ/)
    expect(permissionLine('ExitPlanMode', undefined, 0)).toMatch(/計画/)
    for (const random of [0, 0.4, 0.99]) {
      expect(permissionLine('Bash', 'ひとつ確認させてね', random)).not.toBe('ひとつ確認させてね')
    }
    expect(isDialogTool('mcp__computer-use__request_access')).toBe(true)
    expect(isDialogTool('mcp__computer-use__screenshot')).toBe(false)
  })

  test('アプリの許可のダイアログを出す道具が呼ばれたら、効果音のあとに読み上げる', async ($, on) => {
    engine(on)
    const heard = listen(on)
    on('tool.call', () => ({ result: {} }) as never)
    await $.tool.call({ tool: 'mcp__computer-use__request_access', apps: [] } as never)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(heard[0]).toBe('♪')
    expect(heard[1]).toMatch(/アプリ/)
  })

  test('許可のダイアログ（PermissionRequest）で知らせ、続く通知では重ねて鳴らさない', async ($, on) => {
    engine(on)
    const heard = listen(on)
    await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } } as never)
    await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' } as never)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(heard.filter(text => text === '♪')).toHaveLength(1)
    expect(heard[1]).toMatch(/確認|許可/)
  })

  test('質問のダイアログ（AskUserQuestion）には許可の声を重ねない', async ($, on) => {
    engine(on)
    const heard = listen(on)
    await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: {} } as never)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(heard).toHaveLength(0)
  })
})

describe('裏の作業（バックグラウンド）', () => {
  const fresh = () => ({ seen: new Set<string>(), running: new Set<string>(), startedAt: 0 })

  test('裏で動いたまま区切れたら個数を知らせ、通知のターンでは黙り、最後に「ぜんぶ」', async () => {
    const bg = fresh()
    expect(settleBackground(bg, ['a', 'b', 'c'], false, 100)).toEqual({ kind: 'started', count: 3 })
    expect(backgroundText(bg)).toBe('⏳ バックグラウンド 0/3 完了')
    expect(settleBackground(bg, ['b', 'c'], true, 200)).toEqual({ kind: 'quiet' })
    expect(backgroundText(bg)).toBe('⏳ バックグラウンド 1/3 完了')
    // 途中で増えたら全体の数も増える
    expect(settleBackground(bg, ['c', 'd'], true, 300)).toEqual({ kind: 'quiet' })
    expect(backgroundText(bg)).toBe('⏳ バックグラウンド 2/4 完了')
    expect(settleBackground(bg, [], true, 400)).toEqual({ kind: 'allDone' })
    expect(backgroundText(bg)).toBeUndefined()
    expect(bg.startedAt).toBe(100)
  })

  test('裏の作業がなければ今までどおり「終わったよ」', async () => {
    const bg = fresh()
    expect(settleBackground(bg, [], false, 0)).toEqual({ kind: 'done' })
  })

  test('裏の作業の途中でも、打ったメッセージへの応答の終わりは知らせる', async () => {
    const bg = fresh()
    settleBackground(bg, ['a', 'b'], false, 0)
    expect(settleBackground(bg, ['b'], false, 0)).toEqual({ kind: 'started', count: 1 })
  })
})

describe('裏の作業のときの声（イベントの流れ）', () => {
  const setup = (on: On) => {
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 1_000_000, percent: 0 }, rateLimits: [] } }))
    const clock = mock.clock(on, { now: Date.parse('2026-10-03T03:00:00Z') })
    const heard: string[] = []
    on('audio.play', () => ({ value: undefined }))
    on('audio.speak', (_$, e) => {
      heard.push(e.text)
      return { value: undefined }
    })
    on('process.run', () => ({ value: { stdout: '+0900\n', stderr: '', exitCode: 0 } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: 'ok' }) as never)
    on('classic.Stop', () => ({}) as never)
    return { clock, heard }
  }
  const turn = async ($: never, clock: { advance: (ms: number) => Promise<void> }, text: string, tasks: string[]) => {
    const api = $ as unknown as { turn: { start: Function; complete: Function }; classic: { Stop: Function } }
    await api.turn.start({ text, turnId: text })
    await clock.advance(20_000)
    await api.classic.Stop({ stop_hook_active: false, background_tasks: tasks.map(id => ({ id, type: 'subagent', status: 'running', description: id })) })
    await api.turn.complete({ answer: 'ok', durationMs: 20_000, isAborted: false, turnId: text, reason: 'answer' })
    await clock.advance(1_000)
  }

  test('区切りで個数、通知では黙り、最後に「ぜんぶ」', async ($, on) => {
    const { clock, heard } = setup(on)
    await turn($ as never, clock, '調べて', ['a', 'b'])
    expect(heard).toEqual(['ひと区切りついたよ。バックグラウンドで2個動いてるよ'])
    await turn($ as never, clock, '<task-notification>a done</task-notification>', ['b'])
    expect(heard).toHaveLength(1)
    await turn($ as never, clock, '<task-notification>b done</task-notification>', [])
    expect(heard[1]).toBe('バックグラウンドの作業も、ぜんぶ終わったよ')
  })

  test('別の mod が送ったプロンプトのターン（放置中の /compact など）では声を出さない', async ($, on) => {
    const { clock, heard } = setup(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    await $.prompt.submit({ text: '/compact keep the plan', origin: { kind: 'plugin', name: 'idle-compact' } } as never)
    await turn($ as never, clock, '/compact keep the plan', [])
    expect(heard).toEqual([])
    await turn($ as never, clock, 'お願い', [])
    expect(heard).toEqual(['終わったよ'])
  })

  test('裏の作業がなければ「終わったよ」', async ($, on) => {
    const { clock, heard } = setup(on)
    await turn($ as never, clock, 'お願い', [])
    expect(heard).toEqual(['終わったよ'])
  })
})

describe('使用量の棒', () => {
  test('グラフィカル（既定）では、コンテキストと各枠を色付きの棒で描く', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    // Clawd の絵 16 枚に、コンテキストと 5時間枠の棒 2 本
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(18)
    expect(await ui.find({ type: 'Text', text: '20%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /200k \/ 1\.0M/ })).toBeDefined()
    await ui.unmount()
  })

  test('テキストを選ぶと、今までどおり ▰▱ の文字で出す', { options: { bar_style: 'テキスト' } }, async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(16)
    expect(await ui.find({ type: 'Text', text: /コンテキスト  ▰▰▱/ })).toBeDefined()
    await ui.unmount()
  })

  test('グラフィカルでも 7日枠の目安と超過を右に出す', async ($, on) => {
    engineWithPace(on, [
      { kind: 'five_hour', percentUsed: 14, resetsAt: '2026-10-02T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 67, resetsAt: '2026-10-05T11:00:00.000Z' },
    ])
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    expect(await ui.find({ type: 'Text', text: '目安61%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '超過6' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '残3日' })).toBeDefined()
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(19)
    await ui.unmount()
  })

  test('埋まる区切りの数と色、目安の縦線', async () => {
    const svg = barSvg(32)
    expect(svg.match(/fill="#5B7491"/g)).toHaveLength(3)
    expect(barSvg(80).match(/fill="#E0575B"/g)).toHaveLength(8)
    expect(barSvg(80, 98)).toContain('fill="#7A7F86"')
    expect(meterColor(79)).toBe('#5B7491')
  })
})

describe('残り時間の短い書き方', () => {
  test('1 時間未満は分、1 日未満は時と分、2 日未満は時、それ以上は日', async () => {
    const now = Date.parse('2026-10-04T00:00:00Z')
    const after = (minutes: number) => new Date(now + minutes * 60_000).toISOString()
    expect(shortUntil(after(42), now)).toBe('残42m')
    expect(shortUntil(after(4 * 60 + 17), now)).toBe('残4h17m')
    expect(shortUntil(after(30 * 60 + 51), now)).toBe('残30h')
    expect(shortUntil(after(3 * 1440), now)).toBe('残3日')
  })
})

describe('前回までのあらすじ', () => {
  const user = (text: string) => ({ role: 'user' as const, text, toolUses: [] })
  const claude = (text: string, toolUses: { tool: string; input: Record<string, unknown> }[] = []) => ({ role: 'assistant' as const, text, toolUses })

  test('人の発言から差し込みを除き、通知やコマンドの出力は捨てる', async () => {
    expect(cleanUserText('直して<system-reminder>秘密の指示</system-reminder>ね')).toBe('直してね')
    expect(cleanUserText('<task-notification>done</task-notification>')).toBe('')
    expect(cleanUserText('<local-command-stdout>x</local-command-stdout>')).toBe('')
  })

  test('会話の記録には発言と、道具の名前・ファイル名だけを入れる', async () => {
    const text = recapTranscript([
      user('Clawd にあらすじ機能を'),
      claude('作ります', [{ tool: 'Edit', input: { file_path: '/a/b/register.tsx', old_string: 'x'.repeat(5000) } }, { tool: 'Bash', input: { command: 'ls', description: 'テストを流す' } }]),
      user(''),
    ])
    expect(text).toBe('あなた：Clawd にあらすじ機能を\nClaude：作ります [Edit register.tsx] [Bash: テストを流す]')
  })

  test('長ければ新しいほうを残し、最初の依頼を先頭に足す', async () => {
    const messages = [user('最初の依頼'), ...Array.from({ length: 50 }, (_, i) => claude(`返答${i} ${'あ'.repeat(100)}`))]
    const text = recapTranscript(messages, 1000)
    expect(text.length).toBeLessThan(1100)
    expect(text.startsWith('（最初の依頼）あなた：最初の依頼')).toBe(true)
    expect(text).toContain('返答49')
    expect(text).not.toContain('返答0 ')
  })

  test('返事から記号や見出しを落とし、段落は文ごとに分け、多すぎれば「次は」を残して詰める', async () => {
    expect(recapLines('前回までのあらすじ！\n\n- **一行目**\n二行目\n▶ 次は：試す')).toEqual(['一行目', '二行目', '▶ 次は：試す'])
    const many = recapLines(['a', 'b', 'c', 'd', 'e', 'f', '▶ 次は：g'].join('\n'))
    expect(many).toEqual(['a', 'b', 'c', 'd', '▶ 次は：g'])
    expect(recapLines('一文目。二文目。三文目。\n▶ 次は：試す。')).toEqual(['一文目。', '二文目。', '三文目。', '▶ 次は：試す。'])
    expect(recapLines('一。二。三。四。五。六。')).toEqual(['一。', '二。', '三。', '四。'])
  })

  test('ボタンを押すと Haiku に会話を渡し、あらすじを帯に出す。閉じると消える', async ($, on) => {
    engine(on)
    const asked: { model: string; prompt: string }[] = []
    on('session.messages', () => ({ value: [user('あらすじ機能を作って'), claude('できました')] }) as never)
    on('model.complete', (_$, e) => {
      asked.push(e)
      return { value: { isAnswered: true, text: '前回までのあらすじ！\nClawd に新しい技が！\n▶ 次は：試してみる', usage: {} } } as never
    })
    const ui = await $.ui.mount({ plugin: 'clawd-dance', surface: 'desktop', component: 'AbovePrompt', props: bandProps(false) })
    await ui.press({ key: 'recap' })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(asked[0]?.model).toBe('haiku')
    expect(asked[0]?.prompt).toContain('あなた：あらすじ機能を作って')
    expect(await ui.find({ type: 'Text', text: /前回までのあらすじ/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Clawd に新しい技が！' })).toBeDefined()
    await ui.press({ key: 'recap-close' })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(await ui.find({ type: 'Text', text: /前回までのあらすじ/ })).toBeUndefined()
    await ui.unmount()
  })
})
