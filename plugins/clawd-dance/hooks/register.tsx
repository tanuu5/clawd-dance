import { chimeWavBase64, sleepyChimeWavBase64 } from './sounds'
import type { AudioClip, EngineInterface, PluginOptions, Register } from 'claude-code'

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
// ターンの終わりから、Stop で届く裏の作業の一覧を待つ時間
const STOP_SETTLE_MS = 300

// 使う人が /config で変えられる設定（plugin.json の userConfig）。値は register の options で届く。
const SOUND_MODES = ['効果音と声', '効果音だけ', '声だけ', '鳴らさない'] as const
type SoundMode = (typeof SOUND_MODES)[number]
const NIGHT_SOUND_MODES = ['眠そうな音とひとこと', 'いつもどおり', '鳴らさない'] as const
const BAR_STYLES = ['グラフィカル', 'テキスト'] as const
type BarStyle = (typeof BAR_STYLES)[number]
type NightSoundMode = (typeof NIGHT_SOUND_MODES)[number]

type Settings = {
  showWhenIdle: boolean
  banzaiMs: number
  sleepAfterMs: number
  sound: SoundMode
  soundMinSeconds: number
  voice: string
  nightNudge: boolean
  nightNudgeMs: number
  nightSound: NightSoundMode
  questionSound: SoundMode
  permissionSound: SoundMode
  barStyle: BarStyle
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
    nightNudge: options.night_nudge !== false,
    nightNudgeMs: num('night_nudge_minutes', 0) * 60_000,
    nightSound: NIGHT_SOUND_MODES.find(mode => mode === options.night_sound) ?? '眠そうな音とひとこと',
    questionSound: SOUND_MODES.find(mode => mode === options.question_sound) ?? '効果音と声',
    permissionSound: SOUND_MODES.find(mode => mode === options.permission_sound) ?? '効果音と声',
    barStyle: BAR_STYLES.find(style => style === options.bar_style) ?? 'グラフィカル',
  }
}

type Pose = 'dance' | 'wild' | 'look' | 'type' | 'ask' | 'banzai' | 'idle' | 'sleep'

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
  if (tool === 'AskUserQuestion') {
    return 'ask'
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
  ask: `
    #armL { animation: raise 1.2s ease-in-out infinite; }
    .q { animation: bob 1.2s ease-in-out infinite; }
    @keyframes raise { 0%, 100% { transform: rotate(48deg); } 50% { transform: rotate(62deg); } }
    @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }`,
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
  const question = pose === 'ask' ? `<text class="q" x="124" y="8" font-size="24" font-weight="bold" fill="#E8C13C">?</text>` : ''
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
${notes}${sparks}${question}${zzz}
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
  ask: '手を挙げて質問する Clawd',
  banzai: 'バンザイする Clawd',
  idle: '待っている Clawd',
  sleep: '眠る Clawd',
}

// 帯に置く絵の一覧。ポーズ（と汗の量）ごとに 1 枚ずつ、最初から全部置いておき、表示・非表示だけを切り替える。
// 絵の中身（source）を差し替えると、そのたびに描画の枠が読み込み直されて一瞬消えるため。
const WORKING_POSES: Pose[] = ['dance', 'wild', 'look', 'type']
const VARIANTS = [
  ...WORKING_POSES.flatMap(pose => [0, 1, 2].map(sweat => ({ pose, sweat }))),
  ...(['ask', 'banzai', 'idle', 'sleep'] as const).map(pose => ({ pose, sweat: 0 })),
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

// ---- グラフィカルな棒 ----
// 角の丸い 10 個の区切り。埋まった数は文字の棒（▰▱）と同じく 10% 単位。目安があれば区切りの間に縦線を引く。
// 動かない画像として描く（isInteractive にしない）ので、中身が変わっても枠の読み込み直しは起きない。
const BAR_COLOR = '#5B7491'
const BAR_ALERT = '#E0575B'
const BAR_EMPTY = 'rgba(128,128,128,0.28)'
const BAR_MARKER = '#7A7F86'
const SEG_W = 20
const SEG_GAP = 3
const BAR_W = SEG_W * 10 + SEG_GAP * 9

export const meterColor = (percent: number) => (percent >= 80 ? BAR_ALERT : BAR_COLOR)

export function barSvg(percent: number, target?: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)))
  const color = meterColor(percent)
  const segments = Array.from(
    { length: 10 },
    (_, i) => `<rect x="${i * (SEG_W + SEG_GAP)}" y="1" width="${SEG_W}" height="8" rx="4" fill="${i < filled ? color : BAR_EMPTY}"/>`,
  ).join('')
  let marker = ''
  if (target !== undefined) {
    const k = Math.max(0, Math.min(10, Math.round(target / 10)))
    const x = Math.max(0, Math.min(BAR_W - 2, k * (SEG_W + SEG_GAP) - SEG_GAP / 2 - 1))
    marker = `<rect x="${x}" y="-1" width="2" height="12" rx="1" fill="${BAR_MARKER}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 ${BAR_W} 12">${segments}${marker}</svg>`
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
  const targetText = `目安${next.pct}%（${next.label}）`
  const marginText = margin < 0 ? `超過${Math.round(-margin * 10) / 10}` : `あと${Math.round(margin * 10) / 10}`
  const shortMargin = margin < 0 ? `超過${Math.round(-margin * 10) / 10}` : `残${Math.round(margin * 10) / 10}`
  return { target: next.pct, isOver: margin < 0, text: `${targetText}${marginText}`, targetText, marginText, shortTarget: `目安${next.pct}%`, shortMargin }
}

// ---- 夜ふかしの声かけ ----
// 0〜4 時台にメッセージを送ると、帯の Clawd の横にやさしい一言を出す（既定は送るたび。間隔をあけることもできる）。
// 前の声かけの時刻と言葉は $.store に置き、別のセッションとも共有する。
// その時間帯は、ターンの終わりの音も「ピポポ…」と眠そうな音にして、「終わったよ」の代わりにその一言を読む。
// 手元の時差はサンドボックスでは分からないので、`date +%z` で一度だけ聞く。

const NIGHT_LINES: Record<number, string[]> = {
  0: ['日付が変わったよ。きりのいいところで休もうね', '0時を回ったよ。今日はここまでにする？', 'もう新しい日だね。無理しないでね'],
  1: ['1時だよ。そろそろ区切りをつけよう', '夜ふかし中だね。あと少しにしようね', '1時を過ぎたよ。目、疲れてない？'],
  2: ['2時だよ。そろそろ寝よう…', 'もう2時。続きは明日のほうがはかどるかも', '2時だよ。眠い頭だと、バグも増えちゃうよ'],
  3: ['3時だよ。さすがに寝よう…', 'もう3時。体がいちばん大事だよ', '3時だよ。続きは起きてからにしよう'],
  4: ['もう朝が来ちゃう。少しでも眠ろう', '4時だよ。少しだけでも横になろう', '空が明るくなる前に、おやすみ'],
}
// 出した一言を見せておく時間（次に送ったときにも消える）
const NUDGE_SHOW_MS = 10 * 60_000

// 帯に出すときは「。」で行を分ける（長い一言が折り返して、右側の使用量の列を押し縮めないように）
export function sentenceLines(text: string): string[] {
  return text
    .split(/(?<=。)/)
    .map(line => line.trim())
    .filter(line => line !== '')
}

// その時刻に出す一言。前回と同じ言葉は避ける。0〜4 時台でなければ undefined
export function nightLine(hour: number, previous: unknown, random: number): string | undefined {
  const lines = NIGHT_LINES[hour]
  if (lines === undefined) return undefined
  const choices = lines.filter(line => line !== previous)
  return choices[Math.floor(random * choices.length) % choices.length] ?? lines[0]
}

async function localHour($: EngineInterface, state: BandState, now: number): Promise<number | undefined> {
  if (state.tzOffsetMin === undefined) {
    const { stdout } = await $.process.run(['/bin/date', '+%z'])
    const m = /^([+-])(\d\d)(\d\d)$/.exec(stdout.trim())
    if (!m) return undefined
    state.tzOffsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  }
  return new Date(now + state.tzOffsetMin * 60_000).getUTCHours()
}

// メッセージが送られたとき：時間帯と間隔が合えば一言を決めて state.nudge に置く。出したら true
async function maybeNudge($: EngineInterface, state: BandState): Promise<boolean> {
  if (!state.settings.nightNudge) return false
  const now = await $.clock.now()
  const hour = await localHour($, state, now)
  if (hour === undefined || NIGHT_LINES[hour] === undefined) return false
  const lastAt = Number((await $.store.get('nightNudgeAt')) ?? 0)
  if (now - lastAt < state.settings.nightNudgeMs) return false
  const text = nightLine(hour, await $.store.get('nightNudgeText'), Math.random())
  if (text === undefined) return false
  await $.store.set('nightNudgeAt', now)
  await $.store.set('nightNudgeText', text)
  state.nudge = { text, until: now + NUDGE_SHOW_MS }
  return true
}

type Clips = { chime: AudioClip; sleepy: AudioClip }

// 効果音で気づかせてから喋る。夜（0〜4 時台）は夜の音の設定に応じて、眠そうな音と夜の言葉に替えるか、鳴らさない
async function playCue($: EngineInterface, state: BandState, clips: Clips, mode: SoundMode, text: string, nightText: (hour: number, now: number) => string | undefined) {
  if (mode === '鳴らさない') return
  const { settings } = state
  let clip = clips.chime
  if (settings.nightSound !== 'いつもどおり') {
    const now = await $.clock.now()
    const hour = await localHour($, state, now).catch(() => undefined)
    if (hour !== undefined && NIGHT_LINES[hour] !== undefined) {
      if (settings.nightSound === '鳴らさない') return
      clip = clips.sleepy
      text = nightText(hour, now) ?? text
    }
  }
  const speak = () => $.audio.speak(text, { voice: settings.voice }).catch(() => $.audio.speak(text))
  if (mode === '声だけ') {
    await speak()
    return
  }
  await $.audio.play(clip)
  if (mode === '効果音と声') await speak()
}

// ターンの終わりの音。夜は「終わったよ」の代わりに、帯に出している声かけの一言を読む
function playEndSound($: EngineInterface, state: BandState, clips: Clips, durationMs: number) {
  const text = durationMs >= 120_000 ? 'おまたせ、終わったよ' : '終わったよ'
  return playCue($, state, clips, state.settings.sound, text, (hour, now) => {
    const shown = state.nudge !== undefined && now < state.nudge.until ? state.nudge.text : undefined
    return shown ?? nightLine(hour, undefined, Math.random())
  })
}

// Claude が質問のダイアログ（AskUserQuestion）を出したときの声かけ。席を外していても気づけるように
const QUESTION_LINES = ['ちょっと聞きたいことがあるよ', '質問があるよ。見てくれる？', 'ひとつ選んでほしいことがあるよ']
const NIGHT_QUESTION_LINE = '夜遅くにごめんね。ひとつ聞きたいことがあるよ'

export function questionLine(previous: unknown, random: number): string {
  const choices = QUESTION_LINES.filter(line => line !== previous)
  return choices[Math.floor(random * choices.length) % choices.length] ?? QUESTION_LINES[0]
}

// 許可のダイアログ（道具を使ってよいか、アプリを操作してよいか、計画を進めてよいか）が出たときの声かけ。
// ふつうの許可は classic.PermissionRequest（来なければ Notification の permission_prompt）で知る。
// コンピューター操作のアプリの許可などは、道具が自分でダイアログを出すので、呼ばれた時点で知らせる。
const DIALOG_TOOLS = [
  'mcp__computer-use__request_access',
  'mcp__computer-use__request_full_control',
  'mcp__computer-use__request_teach_access',
  'mcp__ccd_directory__request_directory',
]
const PERMISSION_LINES: { match: (tool: string) => boolean; lines: string[] }[] = [
  { match: tool => tool.startsWith('mcp__computer-use__'), lines: ['使いたいアプリがあるよ。見てくれる？', 'アプリを使ってもいいか、聞きたいことがあるよ'] },
  { match: tool => tool === 'mcp__ccd_directory__request_directory', lines: ['見たいフォルダがあるよ。見てくれる？'] },
  { match: tool => tool === 'ExitPlanMode', lines: ['計画ができたよ。見てくれる？'] },
  { match: () => true, lines: ['使っていいか、確認したいことがあるよ', '許可がほしいことがあるよ。見てくれる？', 'ひとつ確認させてね'] },
]
const NIGHT_PERMISSION_LINE = '夜遅くにごめんね。ひとつ確認させてね'

export function isDialogTool(tool: string): boolean {
  return DIALOG_TOOLS.includes(tool)
}

export function permissionLine(tool: string, previous: unknown, random: number): string {
  const { lines } = PERMISSION_LINES.find(group => group.match(tool)) ?? PERMISSION_LINES[PERMISSION_LINES.length - 1]
  const choices = lines.length > 1 ? lines.filter(line => line !== previous) : lines
  return choices[Math.floor(random * choices.length) % choices.length] ?? lines[0]
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

// グラフィカルな表示の短い書き方：残42m／残4h17m（1 日未満）／残30h（2 日未満）／残3日
export function shortUntil(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  if (minutes < 60) return `残${minutes}m`
  if (minutes < 24 * 60) return `残${Math.floor(minutes / 60)}h${minutes % 60}m`
  if (minutes < 48 * 60) return `残${Math.floor(minutes / 60)}h`
  return `残${Math.round(minutes / 1440)}日`
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
  nudge: { text: string; until: number } | undefined
  tzOffsetMin: number | undefined
  timers: { cancel: () => void }[]
  background: Background
  // Stop で届いた、まだ動いている裏の作業。ターンの終わりの判断で読んで消す
  stopTaskIds: string[] | undefined
  isNotificationTurn: boolean
  nextIsNotification: boolean
  // 別の mod が送ったプロンプトのターン（idle-compact の /compact など）。放置中に動くので声を出さない
  isPluginTurn: boolean
  nextIsPlugin: boolean
  // 許可のダイアログで返事を待っている道具。その呼び出しが終わるまで手を挙げて待つ
  awaitingTool: string | undefined
  lastPermissionLine: string | undefined
}

// ---- 裏の作業（バックグラウンドのタスク） ----
// 本体のターンが終わっても、裏でサブエージェントやコマンドが動いていることがある。
// そのときは「終わったよ」とは言わず、何個動いているかを知らせ、帯に「2/6 完了」と出す。
// 裏の作業が 1 つ終わるたびに本体が通知で起こされるが、そのターンの終わりでは何も言わない。
// 最後の 1 つまで終わったら「ぜんぶ終わったよ」。
// 動いている作業の一覧は、本体のターンの終わりに届く Stop の background_tasks から読む。

type Background = {
  // この一連の作業で見かけた作業の id（全体の数）
  seen: Set<string>
  // まだ動いている作業の id
  running: Set<string>
  // 一連の作業が始まった時刻（「ぜんぶ終わったよ」を鳴らすか決めるため）
  startedAt: number
}

// ターンの終わりに鳴らすもの
export type EndCue = { kind: 'done' } | { kind: 'started'; count: number } | { kind: 'quiet' } | { kind: 'allDone' }

// Stop で届いた一覧を取り込み、鳴らすものを決める
export function settleBackground(background: Background, runningIds: readonly string[], isNotificationTurn: boolean, turnStartedAt: number): EndCue {
  const wasRunning = background.running.size > 0
  background.running = new Set(runningIds)
  runningIds.forEach(id => background.seen.add(id))
  if (background.running.size > 0) {
    if (!wasRunning) background.startedAt = turnStartedAt
    return isNotificationTurn ? { kind: 'quiet' } : { kind: 'started', count: background.running.size }
  }
  if (wasRunning) {
    background.seen.clear()
    return { kind: 'allDone' }
  }
  return { kind: 'done' }
}

export function backgroundText(background: Background): string | undefined {
  if (background.running.size === 0) return undefined
  const total = background.seen.size
  return `⏳ バックグラウンド ${total - background.running.size}/${total} 完了`
}

// 裏の作業の完了通知で始まったターンか。出どころが分からないときは本文の印で見分ける
function isNotificationText(text: string): boolean {
  return text.trimStart().startsWith('<task-notification')
}

// 本体のターンの終わり。Stop が届くのを少し待ってから、ポーズと音を決める
async function endOfTurn($: EngineInterface, state: BandState, clips: Clips, reason: string, durationMs: number) {
  const { settings } = state
  const cue = settleBackground(state.background, state.stopTaskIds ?? [], state.isNotificationTurn, state.turnStartedAt)
  state.stopTaskIds = undefined
  const now = await $.clock.now()
  const isBusy = state.background.running.size > 0
  state.banzaiUntil = reason === 'answer' && !isBusy ? now + settings.banzaiMs : 0
  state.timers.push(...[settings.banzaiMs, settings.sleepAfterMs].map(ms => $.clock.after(ms + 50, () => void redrawIfChanged($, state))))
  await redrawIfChanged($, state)

  if (settings.sound === '鳴らさない' || reason !== 'answer') return
  if (cue.kind === 'quiet' || state.isPluginTurn) return
  if (cue.kind === 'allDone') {
    // 一連の作業全体の長さで決める（最後の通知のターンは短いことが多い）
    if (now - state.background.startedAt < settings.soundMinSeconds * 1000) return
    await playCue($, state, clips, settings.sound, 'バックグラウンドの作業も、ぜんぶ終わったよ', () => undefined)
    return
  }
  if (durationMs < settings.soundMinSeconds * 1000) return
  if (cue.kind === 'started') {
    await playCue($, state, clips, settings.sound, `ひと区切りついたよ。バックグラウンドで${cue.count}個動いてるよ`, () => undefined)
    return
  }
  await playEndSound($, state, clips, durationMs)
}

// details は「│ 文字」の並び（1 行）
type Meter = { key: string; label: string; percent: number | undefined; target: number | undefined; details: { text: string; color?: string }[] }

// 帯に出すもの（ポーズ・汗・数字）を今の状態から決める。描画とイベントの両方が使う。
async function computeView($: EngineInterface, state: BandState, isWorking: boolean) {
  const { context, rateLimits } = await $.session.usage()
  const now = await $.clock.now()

  let pose: Pose
  let sweat = 0
  if (isWorking) {
    const latestTool = [...state.runningTools.values()].at(-1)
    pose = state.awaitingTool !== undefined ? 'ask' : latestTool === undefined ? 'dance' : poseForTool(latestTool)
    const elapsed = state.isInTurn ? now - state.turnStartedAt : 0
    sweat = SWEAT_MS.filter(ms => elapsed >= ms).length
  } else if (now < state.banzaiUntil) {
    pose = 'banzai'
  } else if (state.background.running.size > 0) {
    // 裏の作業を見守る（眠らない）
    pose = 'look'
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
      ? { kind: limit.kind, percent: limit.percent, text: `${label}  ${bar(limit.percent)}  ${limit.percent}%  ${until}`, pace: undefined, until, short: shortUntil(limit.resetsAt, now) }
      : { kind: limit.kind, percent: limit.percent, text: `${label}  ${barWithTarget(limit.percent, target.target)}  ${limit.percent}%`, pace: target, until, short: shortUntil(limit.resetsAt, now) }
  })
  // グラフィカルな表示の行：見出し・使用率・棒の目安・右の説明
  const meters: Meter[] = [
    {
      key: 'context',
      label: 'コンテキスト',
      percent: context.percent,
      target: undefined,
      details: [{ text: context.percent === undefined ? 'まだ計測なし' : `${tokens(context.tokens ?? 0)} / ${tokens(context.window)}` }],
    },
    ...rateLines.map(line => ({
      key: line.kind,
      label: RATE_LIMIT_LABELS[line.kind] ?? line.kind,
      percent: line.percent as number | undefined,
      target: line.pace?.target,
      // 短い書き方で 1 行に収める（右の列の幅を抑え、Clawd の横の一言の場所を残す）
      details:
        line.pace === undefined
          ? [{ text: line.short }]
          : [
              { text: line.pace.shortTarget, color: line.pace.isOver ? 'red' : 'green' },
              { text: line.pace.shortMargin, color: line.pace.isOver ? 'red' : 'green' },
              { text: line.short },
            ],
    })),
  ]
  const nudgeText = state.nudge !== undefined && now < state.nudge.until ? state.nudge.text : undefined
  const bgText = backgroundText(state.background)
  const signature = [pose, sweat, contextLine, ...rateLines.map(line => `${line.text}${line.pace?.text ?? ''}${line.until}`), nudgeText ?? '', bgText ?? ''].join('|')

  return { now, pose, sweat, contextPercent, contextLine, rateLines, meters, nudgeText, bgText, signature }
}

// 許可のダイアログで待っていることを知らせる。同じ待ちで二度は鳴らさない
async function announcePermission($: EngineInterface, state: BandState, clips: Clips, tool: string) {
  if (state.awaitingTool !== undefined) return
  state.awaitingTool = tool
  await redrawIfChanged($, state)
  state.lastPermissionLine = permissionLine(tool, state.lastPermissionLine, Math.random())
  // 鳴り終わるのを待たない（ダイアログをすぐ出すため）
  playCue($, state, clips, state.settings.permissionSound, state.lastPermissionLine, () => NIGHT_PERMISSION_LINE).catch(() => undefined)
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
  const clips = {
    chime: { base64: chimeWavBase64(), mime: 'audio/wav' },
    sleepy: { base64: sleepyChimeWavBase64(), mime: 'audio/wav' },
  }

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
    nudge: undefined,
    tzOffsetMin: undefined,
    timers: [],
    background: { seen: new Set(), running: new Set(), startedAt: 0 },
    stopTaskIds: undefined,
    isNotificationTurn: false,
    nextIsNotification: false,
    isPluginTurn: false,
    nextIsPlugin: false,
    awaitingTool: undefined,
    lastPermissionLine: undefined,
  }
  let lastQuestionLine: string | undefined
  let shownPose: Pose | null = null
  let shownSince = 0
  let holdTimer: { cancel: () => void } | null = null
  let nudgeTimer: { cancel: () => void } | null = null

  const resetTimers = () => {
    state.timers.forEach(t => t.cancel())
    state.timers = []
  }

  // usage-log の pace.json を 1 分ごとに読み直す（目安が 0:00 で変わる、別のセッションが値を進める）
  on('session.start', async ($, e, next) => {
    $.clock.every(60_000, () => void readPace($, state).then(() => redrawIfChanged($, state)))
    return next(e)
  })

  // 裏の作業の完了通知で始まるターンを見分ける（prompt.submit のあとに turn.start が来る）
  on('prompt.submit', async ($, e, next) => {
    state.nextIsNotification = e.origin.kind === 'task-notification'
    state.nextIsPlugin = e.origin.kind === 'plugin'
    return next(e)
  })

  // 別の mod が実行したコマンド（idle-compact の /compact など）。その中で動くターンも声を出さない
  on('command.run', async ($, e, next) => {
    if (e.origin.kind !== 'plugin') return next(e)
    state.nextIsPlugin = true
    try {
      return await next(e)
    } finally {
      // ターンが起きなかったときに、次の本物のターンまで黙らせないよう戻す
      state.nextIsPlugin = false
    }
  })

  // 本体のターンの終わりに、まだ動いている裏の作業の一覧が届く
  on('classic.Stop', async ($, e, next) => {
    state.stopTaskIds = (e.background_tasks ?? []).map(task => task.id)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const isNotification = state.nextIsNotification || isNotificationText(e.text)
    const isPlugin = state.nextIsPlugin
    state.nextIsNotification = false
    state.nextIsPlugin = false
    // 打ったメッセージで始まるターンなら、前の一言を消し、夜ふかしの時間帯なら新しい一言を出す
    if (e.text.trim() !== '' && !isNotification && !isPlugin) {
      state.nudge = undefined
      try {
        if (await maybeNudge($, state)) {
          nudgeTimer?.cancel()
          nudgeTimer = $.clock.after(NUDGE_SHOW_MS + 50, () => void redrawIfChanged($, state))
        }
      } catch {
        // 声かけに失敗しても帯とターンは止めない
      }
    }
    // サブエージェントのターンでも呼ばれうるので、本体のターンの始まりだけを数える
    if (!state.isInTurn) {
      state.isInTurn = true
      state.isNotificationTurn = isNotification
      state.isPluginTurn = isPlugin
      state.turnStartedAt = await $.clock.now()
      state.banzaiUntil = 0
      resetTimers()
      state.timers = SWEAT_MS.map(ms => $.clock.after(ms, () => void redrawIfChanged($, state)))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? `${e.tool}-${state.runningTools.size}`
    state.runningTools.set(id, e.tool)
    await redrawIfChanged($, state)
    if (e.tool === 'AskUserQuestion' && !e.agentId) {
      // 質問のダイアログの間に許可の通知が来ても、重ねて鳴らさない
      state.awaitingTool ??= e.tool
      lastQuestionLine = questionLine(lastQuestionLine, Math.random())
      // 鳴り終わるのを待たない（ダイアログをすぐ出すため）
      playCue($, state, clips, settings.questionSound, lastQuestionLine, () => NIGHT_QUESTION_LINE).catch(() => undefined)
    } else if (isDialogTool(e.tool)) {
      await announcePermission($, state, clips, e.tool)
    }
    try {
      return await next(e)
    } finally {
      state.runningTools.delete(id)
      // 返事をもらった（許可でも拒否でも、その呼び出しが終わった）ら、手を下ろす
      if (state.awaitingTool === e.tool || state.awaitingTool === '') state.awaitingTool = undefined
      await redrawIfChanged($, state)
    }
  })

  // ふつうの許可のダイアログ（Bash などを使ってよいか、計画を進めてよいか）。サブエージェントの頼みでも、答えるのは人なので知らせる
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.tool_name !== 'AskUserQuestion') await announcePermission($, state, clips, e.tool_name)
    return next(e)
  })

  // PermissionRequest が届かない場合の備え。どの道具かはわからないので、ふつうの言葉で知らせる
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') await announcePermission($, state, clips, '')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      return result
    }

    state.isInTurn = false
    state.runningTools.clear()
    state.awaitingTool = undefined
    state.lastDoneAt = await $.clock.now()
    resetTimers()
    // Stop（裏の作業の一覧）が届くのを少し待ってから、バンザイと音を決める
    state.timers.push($.clock.after(STOP_SETTLE_MS, () => void endOfTurn($, state, clips, e.reason, e.durationMs).catch(() => undefined)))
    // usage-log がターンの終わりに pace.json を書き直すので、少し待って読む
    state.timers.push($.clock.after(3_000, () => void readPace($, state).then(() => redrawIfChanged($, state))))
    await redrawIfChanged($, state)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey || (!e.props.isWorking && !settings.showWhenIdle)) {
      return next(e)
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const view = await computeView($, state, e.props.isWorking)
    state.drawnSignature = view.signature
    const { now, sweat, contextPercent, contextLine, rateLines, meters, nudgeText, bgText } = view
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
        {/* 画像として描く（isInteractive の枠は背景が白く、ダークモードで四角く浮いた） */}
        <Box key="clawd">
          {VARIANTS.map(variant => (
            <Box key={variant.id} display={variant.id === shownId ? 'flex' : 'none'}>
              <Svg source={variant.source} alt={POSE_ALT[variant.pose]} width={68} height={52} />
            </Box>
          ))}
        </Box>
        <Box key="nudge" flexGrow={1} marginLeft={2} flexDirection="column">
          {bgText === undefined ? null : <Text key="bg">{bgText}</Text>}
          {nudgeText === undefined
            ? null
            : sentenceLines(nudgeText).map((line, i) => <Text key={`night-${i}`}>{i === 0 ? `💤 ${line}` : `　 ${line}`}</Text>)}
        </Box>
        {settings.barStyle === 'グラフィカル' ? (
          // 見出し・棒・使用率・説明を列ごとに並べる（各列が中身の幅になり、行はどれも 1 行の高さ）
          <Box flexDirection="row" flexShrink={0} gap={1}>
            <Box key="labels" flexDirection="column">
              {meters.map(meter => (
                <Text key={meter.key}>{meter.label}</Text>
              ))}
            </Box>
            <Box key="bars" flexDirection="column">
              {meters.map(meter => (
                <Box key={meter.key} height={1} alignItems="center">
                  {meter.percent === undefined ? (
                    <Text dimColor>―</Text>
                  ) : (
                    <Svg source={barSvg(meter.percent, meter.target)} alt={`${meter.label} ${meter.percent}%`} width={150} height={8} />
                  )}
                </Box>
              ))}
            </Box>
            <Box key="percents" flexDirection="column" alignItems="flex-end">
              {meters.map(meter =>
                meter.percent === undefined ? (
                  <Text key={meter.key}> </Text>
                ) : (
                  <Text key={meter.key} bold color={meterColor(meter.percent)}>
                    {`${meter.percent}%`}
                  </Text>
                ),
              )}
            </Box>
            <Box key="details" flexDirection="column">
              {meters.map(meter => (
                <Box key={meter.key} flexDirection="row" gap={1}>
                  {meter.details.map((detail, i) => (
                    <Box key={`d${i}`} flexDirection="row" gap={1}>
                      <Text dimColor>│</Text>
                      {detail.color === undefined ? <Text dimColor>{detail.text}</Text> : <Text color={detail.color}>{detail.text}</Text>}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" alignItems="flex-end" flexShrink={0}>
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
        )}
      </Box>
    )
  })
}
