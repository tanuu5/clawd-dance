// 季節の登場。セッションで最初にメッセージを送ったとき、季節の絵の Clawd で登場し、
// しばらくすると風がサーっと吹いて、いつもの Clawd に戻る。$ を使わない関数だけを置く。
//
// 絵は 1 枚の SVG に、登場から戻るまでの流れを 1 回きりの CSS アニメーションとして描く。
// 画像のアニメーションは読み込まれたときに始まる。デスクトップアプリは帯を描き直すたび（使用量が変わった、
// 返答が終わった など）に絵を読み込み直すので、そのままだと流れが頭からやり直しになる（焚き火が何度も入ってきて、
// 芋を掲げる場面まで進まなかった）。そこで、描くたびに登場からの経過時間だけアニメーションの開始を前にずらし、
// 読み込み直されても続きから再生する。id は登場ごとに変え、前の登場の絵が使い回されないようにする。

export type Season = 'autumn'

// 月（1〜12）から季節。いまは秋（9〜11 月）だけ
export function seasonFor(month: number): Season | undefined {
  return month >= 9 && month <= 11 ? 'autumn' : undefined
}

// 登場から、いつもの絵に切り替えるまで（絵の中の流れは INTRO_SECONDS で終わり、少し余らせて切り替える）
const INTRO_SECONDS = 7.2
export const INTRO_MS = INTRO_SECONDS * 1000 + 300

// いつもの絵（viewBox の幅 174、表示 68px）と同じ縮尺のまま、右に焚き火の場所を足す
const VIEW_WIDTH = 266
export const INTRO_WIDTH = Math.round((68 * VIEW_WIDTH) / 174)

// register.tsx の Clawd と同じ色
const BODY = '#C67D5F'
const EYE = '#141414'

const LEAF_COLORS = ['#D9822B', '#B9472E', '#E5B43B', '#8E5A2D', '#C9652A']
const YAM = '#8E2F55'
const YAM_DARK = '#6E2442'
const YAM_INSIDE = '#F2C14E'
const STICK = '#8B5E34'
const SMOKE = '#9AA0A6'
const STEAM = '#B8BDC4'

// 絵の中の時刻（秒）を、1 回きりのアニメーションの % に
const at = (seconds: number) => `${((seconds / INTRO_SECONDS) * 100).toFixed(2)}%`

// 流れ（秒）
const ENTER_END = 0.5 // 落ち葉の山と焚き火が右から入ってくる
const POKE_END = 3.4 // 棒で焚き火をつつく
const RAISE_END = 3.7 // 焼けた芋を掲げる
const GUST_START = 5.6 // 風がサーっと吹いて、焚き火も芋も飛んでいく
const GUST_END = 6.4

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`

// 落ち葉の山（8 単位の升目を 3 段に積む）
function leafPile(): string {
  const rows = [
    { y: 88, x0: 160, n: 11 },
    { y: 80, x0: 168, n: 9 },
    { y: 72, x0: 184, n: 5 },
  ]
  return rows
    .flatMap(({ y, x0, n }, r) => Array.from({ length: n }, (_, i) => rect(x0 + i * 8, y, 8, 8, LEAF_COLORS[(i * 3 + r * 2) % LEAF_COLORS.length])))
    .join('')
}

// 焚き火の炎。2 枚を交互に出して、ちらちら揺らす
function flames(): string {
  const outer = '#E4572E'
  const inner = '#F2B84B'
  const frameA = [rect(196, 62, 8, 12, outer), rect(204, 52, 8, 22, outer), rect(212, 60, 8, 14, outer), rect(204, 62, 8, 12, inner), rect(198, 68, 6, 6, inner)]
  const frameB = [rect(196, 56, 8, 18, outer), rect(204, 60, 8, 14, outer), rect(212, 52, 8, 22, outer), rect(206, 66, 8, 8, inner), rect(212, 62, 6, 12, inner)]
  return `<g class="fA">${frameA.join('')}</g><g class="fB">${frameB.join('')}</g>`
}

// 風で飛ぶ落ち葉（左の外から右の外へ、波打ちながら回って抜ける）
const GUST_LEAVES = [
  { y: 4, dy1: 10, dy2: -6 },
  { y: 22, dy1: -12, dy2: 8 },
  { y: 40, dy1: 14, dy2: -10 },
  { y: 56, dy1: -10, dy2: 4 },
  { y: 70, dy1: 8, dy2: -14 },
  { y: 84, dy1: -14, dy2: -4 },
  { y: 94, dy1: -8, dy2: -20 },
  { y: 12, dy1: 16, dy2: 12 },
  { y: 62, dy1: -16, dy2: -8 },
]

function gust(delay: (seconds: number) => string): { css: string; svg: string } {
  const css = GUST_LEAVES.map(
    ({ dy1, dy2 }, i) => `
    .g${i} { animation: g${i} 0.8s cubic-bezier(.45,0,.7,1) ${delay(GUST_START - 0.05 + i * 0.05)} both; }
    @keyframes g${i} { from { transform: translate(0, 0) rotate(0); } 50% { transform: translate(150px, ${dy1}px) rotate(300deg); } to { transform: translate(310px, ${dy2}px) rotate(640deg); } }`,
  ).join('')
  const svg = GUST_LEAVES.map(({ y }, i) => rect(-28, y, 9, 6, LEAF_COLORS[i % LEAF_COLORS.length], ` rx="2" class="gl g${i}"`)).join('')
  const streaks = [28, 58, 86].map((y, i) => rect(-60, y, 40, 2, '#9AA0A6', ` class="streak" style="animation-delay: ${delay(GUST_START + i * 0.08)}"`)).join('')
  return { css, svg: svg + streaks }
}

// 目。いつもの目（13×13）と、芋を掲げている間のにっこり目（^ ^）
function eyes(): string {
  const normal = `<g class="once eyesN">${rect(50, 22, 13, 13, EYE)}${rect(88, 22, 13, 13, EYE)}</g>`
  const happy = (x: number) => rect(x - 1, 28, 5, 5, EYE) + rect(x + 4, 23, 5, 5, EYE) + rect(x + 9, 28, 5, 5, EYE)
  return `${normal}<g class="once eyesH">${happy(50)}${happy(88)}</g>`
}

// elapsed は登場からたった秒数。描き直しで絵が読み込み直されても、その時点の続きから再生する
export function autumnIntroSvg(id: string, elapsed = 0): string {
  const delay = (seconds: number) => `${(seconds - elapsed).toFixed(2)}s`
  const { css: gustCss, svg: gustSvg } = gust(delay)
  const T = `${INTRO_SECONDS}s`
  const css = `
    .once { animation-duration: ${T}; animation-timing-function: linear; animation-fill-mode: both; animation-delay: ${delay(0)}; }
    .props { animation-name: props; }
    @keyframes props { 0% { transform: translateX(40px); opacity: 0; } ${at(ENTER_END)}, ${at(GUST_START)} { transform: translateX(0); opacity: 1; } ${at(GUST_END)}, 100% { transform: translateX(70px); opacity: 0; } }
    .fA { animation: fA 0.36s steps(1) infinite; }
    .fB { animation: fB 0.36s steps(1) infinite; }
    @keyframes fA { 0% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes fB { 0% { opacity: 0; } 50% { opacity: 1; } }
    .smoke { animation: smoke 2.2s linear infinite; opacity: 0; }
    .smoke2 { animation-delay: -0.73s; }
    .smoke3 { animation-delay: -1.47s; }
    @keyframes smoke { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 0.75; } 100% { transform: translate(16px, -60px); opacity: 0; } }
    .pileYam { animation-name: pileYam; }
    @keyframes pileYam { 0%, ${at(POKE_END - 0.05)} { opacity: 1; } ${at(POKE_END)}, 100% { opacity: 0; } }
    .armPhase { transform-origin: 114px 46px; animation-name: armPhase; animation-timing-function: ease-in-out; }
    @keyframes armPhase { 0%, ${at(POKE_END)} { transform: rotate(0); } ${at(RAISE_END)}, ${at(GUST_START)} { transform: rotate(-50deg); } ${at(GUST_START + 0.6)}, 100% { transform: rotate(0); } }
    .poke { transform-origin: 114px 46px; animation: poke 0.55s ease-in-out ${delay(ENTER_END + 0.1)} 5 both; }
    @keyframes poke { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(7deg); } }
    .stick { animation-name: stick; }
    @keyframes stick { 0% { opacity: 0; } ${at(0.3)}, ${at(POKE_END - 0.05)} { opacity: 1; } ${at(POKE_END)}, 100% { opacity: 0; } }
    .handYam { animation-name: handYam; }
    @keyframes handYam { 0%, ${at(POKE_END - 0.05)} { opacity: 0; } ${at(POKE_END)}, ${at(GUST_START + 0.1)} { opacity: 1; } ${at(GUST_START + 0.5)}, 100% { opacity: 0; } }
    .steamAll { animation-name: steamAll; }
    @keyframes steamAll { 0%, ${at(RAISE_END)} { opacity: 0; } ${at(RAISE_END + 0.2)}, ${at(GUST_START)} { opacity: 1; } ${at(GUST_START + 0.3)}, 100% { opacity: 0; } }
    .steam { animation: steam 1.5s linear infinite; opacity: 0; }
    .steam2 { animation-delay: -0.5s; }
    .steam3 { animation-delay: -1s; }
    @keyframes steam { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.9; } 100% { transform: translate(4px, -22px); opacity: 0; } }
    .eyesN { animation-name: eyesN; }
    .eyesH { animation-name: eyesH; }
    @keyframes eyesN { 0%, ${at(POKE_END)} { opacity: 1; } ${at(POKE_END + 0.05)}, ${at(GUST_START + 0.2)} { opacity: 0; } ${at(GUST_START + 0.25)}, 100% { opacity: 1; } }
    @keyframes eyesH { 0%, ${at(POKE_END)} { opacity: 0; } ${at(POKE_END + 0.05)}, ${at(GUST_START + 0.2)} { opacity: 1; } ${at(GUST_START + 0.25)}, 100% { opacity: 0; } }
    #all { animation: hop 0.47s ease-in-out ${delay(RAISE_END)} 4 both; }
    @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .fall { animation-name: fall; }
    @keyframes fall { 0%, ${at(GUST_START)} { opacity: 1; } ${at(GUST_START + 0.3)}, 100% { opacity: 0; } }
    .leaf { transform-box: fill-box; transform-origin: center; animation: leaf 2.6s linear infinite; opacity: 0; }
    .leaf2 { animation-delay: -0.9s; }
    .leaf3 { animation-delay: -1.8s; }
    @keyframes leaf { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 12%, 85% { opacity: 1; } 100% { transform: translate(-16px, 112px) rotate(220deg); opacity: 0; } }
    .gl { transform-box: fill-box; transform-origin: center; }
    .streak { animation: streak 0.7s linear both; }
    @keyframes streak { 0% { transform: translateX(0); opacity: 0; } 20% { opacity: 0.7; } 100% { transform: translateX(330px); opacity: 0; } }${gustCss}`

  const fallingLeaves = [
    rect(60, -14, 8, 6, LEAF_COLORS[0], ' rx="2" class="leaf"'),
    rect(150, -14, 8, 6, LEAF_COLORS[1], ' rx="2" class="leaf leaf2"'),
    rect(232, -14, 8, 6, LEAF_COLORS[2], ' rx="2" class="leaf leaf3"'),
  ].join('')
  const smoke = [0, 1, 2].map(i => rect(204, 42, 8, 8, SMOKE, ` class="smoke${i === 0 ? '' : ` smoke${i + 1}`}"`)).join('')
  const steam = [0, 1, 2].map(i => rect(128 + i * 6, 8 - i * 3, 5, 5, STEAM, ` class="steam${i === 0 ? '' : ` steam${i + 1}`}"`)).join('')

  return `<svg id="${id}" viewBox="-12 -18 ${VIEW_WIDTH} 134" xmlns="http://www.w3.org/2000/svg">
<style>${css}</style>
<g class="once fall">${fallingLeaves}</g>
<g class="once props">
  ${leafPile()}
  ${rect(228, 76, 26, 11, YAM, ' rx="5" class="once pileYam"')}
  ${flames()}
  ${smoke}
</g>
<g id="all">
  <rect x="12" y="35" width="24" height="22" fill="${BODY}"/>
  <g class="once armPhase">
    <g class="poke">
      <rect x="114" y="35" width="24" height="22" fill="${BODY}"/>
      <rect x="136" y="43.5" width="64" height="5" fill="${STICK}" transform="rotate(34 138 46)" class="once stick"/>
    </g>
    <g class="once handYam">
      <rect x="134" y="39" width="26" height="14" rx="6" fill="${YAM}"/>
      <rect x="134" y="48" width="18" height="5" rx="2" fill="${YAM_DARK}"/>
      <rect x="152" y="40" width="8" height="12" rx="2" fill="${YAM_INSIDE}"/>
    </g>
  </g>
  <rect x="32" y="8" width="86" height="66" fill="${BODY}"/>
  <rect x="32" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="53" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="86" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="107" y="74" width="11" height="22" fill="${BODY}"/>
  ${eyes()}
  <g class="once steamAll">${steam}</g>
</g>
${gustSvg}
</svg>`
}
