import type { EngineInterface, PluginOptions, Register } from 'claude-code'

// Clawd（Anthropic のマスコットの二次創作版 SVG）を、状況に応じたポーズで帯に出す。
// 脚は新しい Clawd に合わせ、外側の脚の外端を体の側面に揃えている。
// 腕は肩を軸に回す（左腕は右端、右腕は左端）。左腕はプラス、右腕はマイナスで先端が上がる。
//
// 試して外した置き場所（デスクトップ 2.1.286）
// - うに（Spinner）：ui.render が呼ばれず、差し替えられない。
// - 作業中の最新の返答（AssistantMessage）の末尾：文字が届くたびにブロックごと作り直され、
//   本文のフェードインと Clawd のアニメーションが毎回やり直しになって激しく点滅した。

// 汗をかき始める経過時間（1滴、2滴）
const SWEAT_MS = [30_000, 120_000]
// 一度なったポーズを最低これだけ続ける（Edit などが一瞬で終わっても見えるように）
const MIN_POSE_MS = 1_500

// 使う人が /config で変えられる設定（plugin.json の userConfig）。値は register の options で届く。
const SOUND_MODES = ['効果音と声', '効果音だけ', '声だけ', '鳴らさない'] as const
type SoundMode = (typeof SOUND_MODES)[number]

type Settings = {
  showWhenIdle: boolean
  banzaiMs: number
  sleepAfterMs: number
  sound: SoundMode
  soundMinSeconds: number
  voice: string
}

function readSettings(options: PluginOptions): Settings {
  const num = (key: string, fallback: number) => (typeof options[key] === 'number' ? (options[key] as number) : fallback)
  const sound = SOUND_MODES.find(mode => mode === options.sound) ?? '効果音と声'
  return {
    showWhenIdle: options.show_when_idle !== false,
    banzaiMs: num('banzai_seconds', 4) * 1000,
    sleepAfterMs: num('sleep_after_minutes', 3) * 60_000,
    sound,
    soundMinSeconds: num('sound_min_seconds', 15),
    voice: typeof options.voice === 'string' && options.voice !== '' ? options.voice : 'Kyoko',
  }
}

// 終わったときの「ピロローン」。音声ファイルを同梱せず、ここで波形を合成して WAV にする。
// ミ・ソ・ドを短く鳴らし、最後のドを長く響かせる。
function chimeWavBase64(): string {
  const rate = 22_050
  const notes: [frequency: number, startSeconds: number, decay: number][] = [
    [1318.5, 0.0, 9],
    [1568.0, 0.09, 9],
    [2093.0, 0.18, 3],
  ]
  const samples = new Float32Array(Math.floor(rate * 1.3))
  for (const [frequency, startSeconds, decay] of notes) {
    const start = Math.floor(startSeconds * rate)
    for (let i = start; i < samples.length; i++) {
      const t = (i - start) / rate
      const attack = Math.min(1, t / 0.004)
      const tone = Math.sin(2 * Math.PI * frequency * t) + 0.25 * Math.sin(4 * Math.PI * frequency * t) * Math.exp(-t * 12)
      samples[i] = (samples[i] ?? 0) + attack * Math.exp(-t * decay) * tone
    }
  }
  const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 1e-6)

  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => [...text].forEach((c, k) => view.setUint8(offset + k, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round((v / peak) * 0.55 * 32767), true))

  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

type Pose = 'dance' | 'wild' | 'look' | 'type' | 'banzai' | 'idle' | 'sleep'

function poseForTool(tool: string): Pose {
  if (tool === 'Bash') {
    return 'wild'
  }
  if (['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'ToolSearch'].includes(tool) || tool.startsWith('mcp__')) {
    return 'look'
  }
  if (['Edit', 'Write', 'NotebookEdit'].includes(tool)) {
    return 'type'
  }

  return 'dance'
}

const BODY = '#C67D5F'
const EYE = '#141414'

const POSE_CSS: Record<Pose, string> = {
  dance: `
    #all { animation: bounce 0.8s ease-in-out infinite; }
    #armL { animation: waveL 0.8s ease-in-out infinite; }
    #armR { animation: waveR 0.8s ease-in-out infinite; }
    .legA { animation: step 0.4s steps(1) infinite; }
    .legB { animation: step 0.4s steps(1) infinite -0.2s; }
    @keyframes bounce { 0%, 100% { transform: translate(-4px, 0); } 25%, 75% { transform: translate(0, -7px); } 50% { transform: translate(4px, 0); } }
    @keyframes waveL { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(30deg); } }
    @keyframes waveR { 0%, 100% { transform: rotate(-30deg); } 50% { transform: rotate(6deg); } }`,
  wild: `
    #all { animation: bounce 0.4s ease-in-out infinite; }
    #armL { animation: waveL 0.4s ease-in-out infinite; }
    #armR { animation: waveR 0.4s ease-in-out infinite; }
    .legA { animation: step 0.2s steps(1) infinite; }
    .legB { animation: step 0.2s steps(1) infinite -0.1s; }
    @keyframes bounce { 0%, 100% { transform: translate(-7px, 0) rotate(-4deg); } 25%, 75% { transform: translate(0, -13px); } 50% { transform: translate(7px, 0) rotate(4deg); } }
    @keyframes waveL { 0%, 100% { transform: rotate(-20deg); } 50% { transform: rotate(45deg); } }
    @keyframes waveR { 0%, 100% { transform: rotate(-45deg); } 50% { transform: rotate(20deg); } }`,
  look: `
    #all { transform-box: fill-box; transform-origin: center bottom; animation: tilt 2.4s ease-in-out infinite; }
    #eyes { animation: look 2.4s steps(1) infinite; }
    @keyframes tilt { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
    @keyframes look { 0% { transform: translateX(-5px); } 33% { transform: translateX(0); } 66% { transform: translateX(5px); } }`,
  type: `
    #armL { animation: typeL 0.44s ease-in-out infinite alternate; }
    #armR { animation: typeR 0.44s ease-in-out infinite alternate; }
    @keyframes typeL { from { transform: rotate(-30deg); } to { transform: rotate(-42deg); } }
    @keyframes typeR { from { transform: rotate(42deg); } to { transform: rotate(30deg); } }`,
  banzai: `
    #all { animation: hop 0.5s ease-in-out infinite; }
    #armL { transform: rotate(32deg); }
    #armR { transform: rotate(-32deg); }
    .spark { animation: twinkle 1.4s ease-in-out infinite; }
    .spark2 { animation-delay: -0.5s; }
    .spark3 { animation-delay: -1s; }
    @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes twinkle { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }`,
  idle: `
    #eyes rect { transform-box: fill-box; transform-origin: center; animation: blink 4s infinite; }
    @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }`,
  sleep: `
    #all { transform-box: fill-box; transform-origin: center bottom; animation: breathe 3.2s ease-in-out infinite; }
    .z { animation: drift 3s linear infinite; opacity: 0; }
    .z2 { animation-delay: -1s; }
    .z3 { animation-delay: -2s; }
    @keyframes breathe { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.96); } }
    @keyframes drift { 0% { transform: translate(0, 6px); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(10px, -16px); opacity: 0; } }`,
}

const COMMON_CSS = `
  #armL { transform-box: fill-box; transform-origin: 100% 50%; }
  #armR { transform-box: fill-box; transform-origin: 0% 50%; }
  .note { animation: rise 1.6s linear infinite; opacity: 0; }
  .note2 { animation-delay: -0.8s; }
  .drop { animation: drip 1.2s ease-in infinite; }
  .drop2 { animation-delay: -0.6s; }
  @keyframes step { 0% { transform: translateY(-4px); } 50% { transform: translateY(0); } }
  @keyframes rise { 0% { transform: translateY(8px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-14px); opacity: 0; } }
  @keyframes drip { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }`

function clawdSvg(pose: Pose, sweat: number): string {
  const armY = pose === 'type' ? 42 : 35
  const eyeY = pose === 'sleep' || pose === 'type' ? 28 : 22
  const eyeH = pose === 'sleep' ? 3 : 13

  const notes =
    pose === 'dance' || pose === 'wild'
      ? `<text class="note" x="0" y="10" font-size="16" fill="${BODY}">♪</text>
         <text class="note note2" x="136" y="6" font-size="16" fill="${BODY}">♫</text>`
      : ''
  const sparks =
    pose === 'banzai'
      ? `<rect class="spark" x="20" y="-6" width="6" height="6" fill="#E8C13C"/>
         <rect class="spark spark2" x="72" y="-16" width="6" height="6" fill="#E8C13C"/>
         <rect class="spark spark3" x="126" y="-8" width="6" height="6" fill="#E8C13C"/>`
      : ''
  const zzz =
    pose === 'sleep'
      ? `<text class="z" x="122" y="10" font-size="14" fill="#8A96C9">z</text>
         <text class="z z2" x="122" y="10" font-size="14" fill="#8A96C9">z</text>
         <text class="z z3" x="122" y="10" font-size="14" fill="#8A96C9">z</text>`
      : ''
  const laptop =
    pose === 'type'
      ? `<rect x="42" y="66" width="66" height="38" fill="#3A3F45"/>
         <rect x="47" y="71" width="56" height="24" fill="#8FB4D9"/>
         <rect x="36" y="104" width="78" height="9" fill="#2B2F34"/>`
      : ''
  const drops = [
    sweat >= 1 ? `<rect class="drop" x="122" y="4" width="6" height="9" fill="#7FB8E6"/>` : '',
    sweat >= 2 ? `<rect class="drop drop2" x="22" y="8" width="6" height="9" fill="#7FB8E6"/>` : '',
  ].join('')

  return `<svg viewBox="-12 -18 174 134" xmlns="http://www.w3.org/2000/svg">
<style>${COMMON_CSS}${POSE_CSS[pose]}</style>
${notes}${sparks}${zzz}
<g id="all">
  <g id="armL"><rect x="12" y="${armY}" width="24" height="22" fill="${BODY}"/></g>
  <g id="armR"><rect x="114" y="${armY}" width="24" height="22" fill="${BODY}"/></g>
  <rect x="32" y="8" width="86" height="66" fill="${BODY}"/>
  <rect class="legA" x="32" y="74" width="11" height="22" fill="${BODY}"/>
  <rect class="legB" x="53" y="74" width="11" height="22" fill="${BODY}"/>
  <rect class="legA" x="86" y="74" width="11" height="22" fill="${BODY}"/>
  <rect class="legB" x="107" y="74" width="11" height="22" fill="${BODY}"/>
  <g id="eyes">
    <rect x="50" y="${eyeY}" width="13" height="${eyeH}" fill="${EYE}"/>
    <rect x="88" y="${eyeY}" width="13" height="${eyeH}" fill="${EYE}"/>
  </g>
  ${drops}
</g>
${laptop}
</svg>`
}

const POSE_ALT: Record<Pose, string> = {
  dance: '踊る Clawd',
  wild: '激しく踊る Clawd',
  look: 'きょろきょろする Clawd',
  type: 'タイピングする Clawd',
  banzai: 'バンザイする Clawd',
  idle: '待っている Clawd',
  sleep: '眠る Clawd',
}

// 帯に置く絵の一覧。ポーズ（と汗の量）ごとに 1 枚ずつ、最初から全部置いておき、表示・非表示だけを切り替える。
// 絵の中身（source）を差し替えると、そのたびに描画の枠が読み込み直されて一瞬消えるため。
const WORKING_POSES: Pose[] = ['dance', 'wild', 'look', 'type']
const VARIANTS = [
  ...WORKING_POSES.flatMap(pose => [0, 1, 2].map(sweat => ({ pose, sweat }))),
  ...(['banzai', 'idle', 'sleep'] as const).map(pose => ({ pose, sweat: 0 })),
].map(({ pose, sweat }) => ({ id: `${pose}-${sweat}`, pose, sweat, source: clawdSvg(pose, sweat) }))

const RATE_LIMIT_ORDER = ['five_hour', 'seven_day', 'spend_limit']
const RATE_LIMIT_LABELS: Record<string, string> = {
  five_hour: '5時間枠',
  seven_day: '7日枠',
  spend_limit: '利用上限',
}

function bar(percent: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)))
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled)
}

// 目安の位置に縦線を差し込んだバー（例：67% で目安 61% → ▰▰▰▰▰▰┃▰▱▱▱）
function barWithTarget(percent: number, target: number): string {
  const cells = [...bar(percent)]
  cells.splice(Math.max(0, Math.min(10, Math.round(target / 10))), 0, '┃')
  return cells.join('')
}

// ---- 7日枠の目安（usage-log mod が書く pace.json） ----
// usage-log は 5時間枠・7日枠の値と、今週の目安の時点（時刻・累計 %・ラベル）を ~/.claude/usage-log/pace.json に書く。
// あれば 7日枠の行に目安を足し、最初の応答の前（このセッションがまだ値を持たない間）は枠の値もそこから出す。
// 無ければ何もしない（usage-log は無くても動く）。

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const PACE_FILE = '.claude/usage-log/pace.json'

type PaceReading = { pct: number; resetsAt: string }
type PaceFile = {
  sevenDay: PaceReading
  fiveHour: PaceReading | null
  windowEnd: number
  checkpoints: { at: number; pct: number; label: string }[]
}

async function readPace($: EngineInterface, state: BandState) {
  try {
    const home = await $.env.get('HOME')
    if (home === undefined) return
    const pace = JSON.parse(await $.fs.read(`${home}/${PACE_FILE}`)) as PaceFile
    if (typeof pace.sevenDay?.pct === 'number' && Array.isArray(pace.checkpoints)) state.pace = pace
  } catch {
    // 無い、書きかけで読めない：前の値のまま
  }
}

// 次の時点の目安と、そこまであと何 %（負なら超過）。枠が pace.json より後の週なら、時点を週単位でずらす
function paceFor(pace: PaceFile | undefined, resetsAt: string | undefined, percent: number, now: number) {
  if (pace === undefined || resetsAt === undefined) return undefined
  const end = Date.parse(resetsAt)
  const shift = Math.round((end - pace.windowEnd) / WEEK_MS) * WEEK_MS
  if (!Number.isFinite(end) || Math.abs(end - (pace.windowEnd + shift)) > 60 * 60_000) return undefined
  const next = pace.checkpoints.find(c => c.at + shift > now)
  if (next === undefined) return undefined
  const margin = next.pct - percent
  return {
    target: next.pct,
    isOver: margin < 0,
    text: `目安${next.pct}%（${next.label}）${margin < 0 ? `超過${Math.round(-margin * 10) / 10}` : `あと${Math.round(margin * 10) / 10}`}`,
  }
}

function tokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

// 手元の時差に左右されないよう、時刻ではなく「あと何時間」で出す。
function untilReset(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) {
    return ''
  }
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  if (minutes >= 48 * 60) {
    return `あと${Math.round(minutes / 1440)}日`
  }
  if (minutes >= 60) {
    return `あと${Math.floor(minutes / 60)}時間${minutes % 60}分`
  }
  return `あと${minutes}分`
}

// 帯の描画に使う状態。register の中で 1 つ作り、各フックと描画が同じものを読み書きする。
type BandState = {
  settings: Settings
  isInTurn: boolean
  turnStartedAt: number
  banzaiUntil: number
  lastDoneAt: number
  runningTools: Map<string, string>
  drawnSignature: string
  pace: PaceFile | undefined
  isPaceLoaded: boolean
}

// 帯に出すもの（ポーズ・汗・数字）を今の状態から決める。描画とイベントの両方が使う。
async function computeView($: EngineInterface, state: BandState, isWorking: boolean) {
  const { context, rateLimits } = await $.session.usage()
  const now = await $.clock.now()

  let pose: Pose
  let sweat = 0
  if (isWorking) {
    const latestTool = [...state.runningTools.values()].at(-1)
    pose = latestTool === undefined ? 'dance' : poseForTool(latestTool)
    const elapsed = state.isInTurn ? now - state.turnStartedAt : 0
    sweat = SWEAT_MS.filter(ms => elapsed >= ms).length
  } else if (now < state.banzaiUntil) {
    pose = 'banzai'
  } else if (state.lastDoneAt === 0 || now - state.lastDoneAt >= state.settings.sleepAfterMs) {
    pose = 'sleep'
  } else {
    pose = 'idle'
  }

  const contextPercent = context.percent ?? 0
  const contextLine =
    context.percent === undefined
      ? 'コンテキスト  まだ計測なし'
      : `コンテキスト  ${bar(context.percent)}  ${context.percent}%  ${tokens(context.tokens ?? 0)} / ${tokens(context.window)}`
  if (!state.isPaceLoaded) {
    state.isPaceLoaded = true
    await readPace($, state)
  }
  const limits = rateLimits.map(limit => ({ kind: limit.kind, percent: limit.percentUsed, resetsAt: limit.resetsAt }))
  // 最初の応答の前は、このセッションに枠の値がない。usage-log が書いた値で補う
  const pace = state.pace
  if (pace !== undefined) {
    const fallbacks: [string, PaceReading | null][] = [['five_hour', pace.fiveHour], ['seven_day', pace.sevenDay]]
    for (const [kind, reading] of fallbacks) {
      if (reading && !limits.some(l => l.kind === kind) && Date.parse(reading.resetsAt) > now) {
        limits.push({ kind, percent: reading.pct, resetsAt: reading.resetsAt })
      }
    }
    limits.sort((a, b) => RATE_LIMIT_ORDER.indexOf(a.kind) - RATE_LIMIT_ORDER.indexOf(b.kind))
  }
  const rateLines = limits.map(limit => {
    const label = RATE_LIMIT_LABELS[limit.kind] ?? limit.kind
    const target = limit.kind === 'seven_day' ? paceFor(pace, limit.resetsAt, limit.percent, now) : undefined
    const until = untilReset(limit.resetsAt, now)
    return target === undefined
      ? { kind: limit.kind, percent: limit.percent, text: `${label}  ${bar(limit.percent)}  ${limit.percent}%  ${until}`, pace: undefined, until }
      : { kind: limit.kind, percent: limit.percent, text: `${label}  ${barWithTarget(limit.percent, target.target)}  ${limit.percent}%`, pace: target, until }
  })
  const signature = [pose, sweat, contextLine, ...rateLines.map(line => `${line.text}${line.pace?.text ?? ''}${line.until}`)].join('|')

  return { now, pose, sweat, contextPercent, contextLine, rateLines, signature }
}

// 帯の描き直しは、見た目が変わるときだけにする。描き直すたびに絵がわずかにちらつくため。
async function redrawIfChanged($: EngineInterface, state: BandState) {
  const view = await computeView($, state, state.isInTurn || state.runningTools.size > 0)
  if (view.signature !== state.drawnSignature) {
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = (on, options) => {
  const settings = readSettings(options)
  const chime = { base64: chimeWavBase64(), mime: 'audio/wav' }

  // 描画が読む状態。変えたら redrawIfChanged で、見た目が変わるときだけ帯を描き直す。
  const state: BandState = {
    settings,
    isInTurn: false,
    turnStartedAt: 0,
    banzaiUntil: 0,
    lastDoneAt: 0,
    runningTools: new Map(),
    drawnSignature: '',
    pace: undefined,
    isPaceLoaded: false,
  }
  let timers: { cancel: () => void }[] = []
  let shownPose: Pose | null = null
  let shownSince = 0
  let holdTimer: { cancel: () => void } | null = null

  const resetTimers = () => {
    timers.forEach(t => t.cancel())
    timers = []
  }

  // usage-log の pace.json を 1 分ごとに読み直す（目安が 0:00 で変わる、別のセッションが値を進める）
  on('session.start', async ($, e, next) => {
    $.clock.every(60_000, () => void readPace($, state).then(() => redrawIfChanged($, state)))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // サブエージェントのターンでも呼ばれうるので、本体のターンの始まりだけを数える
    if (!state.isInTurn) {
      state.isInTurn = true
      state.turnStartedAt = await $.clock.now()
      state.banzaiUntil = 0
      resetTimers()
      timers = SWEAT_MS.map(ms => $.clock.after(ms, () => void redrawIfChanged($, state)))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `${e.tool}-${state.runningTools.size}`
    state.runningTools.set(id, e.tool)
    await redrawIfChanged($, state)
    try {
      return await next(e)
    } finally {
      state.runningTools.delete(id)
      await redrawIfChanged($, state)
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      return result
    }

    state.isInTurn = false
    state.runningTools.clear()
    state.lastDoneAt = await $.clock.now()
    state.banzaiUntil = e.reason === 'answer' ? state.lastDoneAt + settings.banzaiMs : 0
    resetTimers()
    timers = [settings.banzaiMs, settings.sleepAfterMs].map(ms => $.clock.after(ms + 50, () => void redrawIfChanged($, state)))
    // usage-log がターンの終わりに pace.json を書き直すので、少し待って読む
    timers.push($.clock.after(3_000, () => void readPace($, state).then(() => redrawIfChanged($, state))))
    await redrawIfChanged($, state)

    const seconds = Math.round(e.durationMs / 1000)
    if (settings.sound !== '鳴らさない' && e.reason === 'answer' && seconds >= settings.soundMinSeconds) {
      const text = seconds >= 120 ? 'おまたせ、終わったよ' : '終わったよ'
      const speak = () => $.audio.speak(text, { voice: settings.voice }).catch(() => $.audio.speak(text))
      // 効果音で気づかせてから喋る。鳴り終わるのを待たない（フックの持ち時間を使わないため）
      const played =
        settings.sound === '声だけ'
          ? speak()
          : $.audio.play(chime).then(() => (settings.sound === '効果音と声' ? speak() : undefined))
      played.catch(() => undefined)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey || (!e.props.isWorking && !settings.showWhenIdle)) {
      return next(e)
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const view = await computeView($, state, e.props.isWorking)
    state.drawnSignature = view.signature
    const { now, sweat, contextPercent, contextLine, rateLines } = view
    let pose = view.pose

    // 前のポーズになってから MIN_POSE_MS たっていなければ前のポーズのまま。残り時間で描き直しを予約する。
    if (shownPose !== null && pose !== shownPose && now - shownSince < MIN_POSE_MS) {
      holdTimer?.cancel()
      holdTimer = $.clock.after(MIN_POSE_MS - (now - shownSince) + 20, () => $.ui.invalidate('ui.render'))
      pose = shownPose
    } else if (pose !== shownPose) {
      shownPose = pose
      shownSince = now
    }

    // 汗の絵があるのは作業中のポーズだけ。待機のポーズのまま汗が出る瞬間は汗なしの絵にする
    const shownId = VARIANTS.some(variant => variant.id === `${pose}-${sweat}`) ? `${pose}-${sweat}` : `${pose}-0`

    return (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
        <Box key="clawd">
          {VARIANTS.map(variant => (
            <Box key={variant.id} display={variant.id === shownId ? 'flex' : 'none'}>
              <Svg source={variant.source} alt={POSE_ALT[variant.pose]} width={68} height={52} isInteractive />
            </Box>
          ))}
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text dimColor={contextPercent < 80} color={contextPercent >= 80 ? 'red' : undefined}>
            {contextLine}
          </Text>
          {rateLines.map(line =>
            line.pace === undefined ? (
              <Text key={line.kind} dimColor={line.percent < 80} color={line.percent >= 80 ? 'red' : undefined}>
                {line.text}
              </Text>
            ) : (
              <Box key={line.kind} flexDirection="row" gap={2}>
                <Text dimColor={line.percent < 80} color={line.percent >= 80 ? 'red' : undefined}>
                  {line.text}
                </Text>
                <Text color={line.pace.isOver ? 'red' : 'green'}>{line.pace.text}</Text>
                <Text dimColor>{line.until}</Text>
              </Box>
            ),
          )}
        </Box>
      </Box>
    )
  })
}
