// 季節の登場。セッションで最初にメッセージを送ったとき、季節の絵の Clawd で登場し、
// しばらくすると風がサーっと吹いて、いつもの Clawd に戻る。$ を使わない関数だけを置く。
//
// どの季節も同じ流れ：右から景色が入ってくる → 季節の遊び（前半）→ 手に取ったものを掲げてにっこり（後半）
// → 季節のものがサーっと吹き抜けて、景色ごと飛んでいく → いつもの Clawd。
//
// 絵は 1 枚の SVG に、登場から戻るまでの流れを 1 回きりの CSS アニメーションとして描く。
// 画像のアニメーションは読み込まれたときに始まる。デスクトップアプリは帯を描き直すたび（使用量が変わった、
// 返答が終わった など）に絵を読み込み直すので、そのままだと流れが頭からやり直しになる（焚き火が何度も入ってきて、
// 芋を掲げる場面まで進まなかった）。そこで、描くたびに登場からの経過時間だけアニメーションの開始を前にずらし、
// 読み込み直されても続きから再生する。id は登場ごとに変え、前の登場の絵が使い回されないようにする。

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// 月（1〜12）から季節。春 3〜5 月、夏 6〜8 月、秋 9〜11 月、冬 12〜2 月
export function seasonFor(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

// 絵の中の流れの長さと、いつもの絵に切り替えるまで。吹き抜けるものが抜けきったら（6.8 秒ごろ）すぐ切り替える
// （登場の絵を長く出しておくと、古い時点の絵で読み込み直されて、終わったはずの場面がまた出ることがあった）
const INTRO_SECONDS = 7.2
export const INTRO_MS = 6_900
// 登場の間は、この間隔で描き直して、絵に書き込む経過時間を新しく保つ（読み込み直されたときの遅れをこの範囲に収める）
export const INTRO_REDRAW_MS = 500

// いつもの絵（viewBox の幅 174、表示 68px）と同じ縮尺のまま、右に景色の場所を足す
const VIEW_WIDTH = 266
export const INTRO_WIDTH = Math.round((68 * VIEW_WIDTH) / 174)

// register.tsx の Clawd と同じ色
const BODY = '#C67D5F'
const EYE = '#141414'

const WOOD = '#8B5E34'
const STEAM = '#B8BDC4'

// 絵の中の時刻（秒）を、1 回きりのアニメーションの % に
const at = (seconds: number) => `${((seconds / INTRO_SECONDS) * 100).toFixed(2)}%`

// 流れ（秒）
const ENTER_END = 0.5 // 景色が右から入ってくる
const POKE_END = 3.4 // 前半（季節の遊び）
const RAISE_END = 3.7 // 手に取ったものを掲げる
const GUST_START = 5.6 // サーっと吹き抜けて、景色も持っていたものも飛んでいく
const GUST_END = 6.4

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`

// 降ってくるもの・吹き抜けるものの形（色は順に使う）
type Particle = { colors: string[]; w: number; h: number; rx: number }

type Scene = {
  alt: string
  // 右の景色。右から入ってきて、最後に吹き抜けるものといっしょに飛んでいく
  props: string
  // 景色の中で、掲げると同時に消えるもの（手に取ったもの）と、現れるもの（切ったあとのスイカ）
  taken?: string
  added?: string
  // 前半に手に持つもの（腕といっしょに動く）と、前半の腕の動き（肩を軸にした transform）
  tool?: string
  poke?: { transform: string; seconds: number }
  // 後半に掲げるもの。腕の先に、腕を上げる前の向きで描く
  hand: string
  // Clawd に付くもの（頭の花びら、汗、湯気など）。自分で出入りを決める
  onClawd?: string
  // 前半の目の向き（見上げるなど）
  look?: [number, number]
  // 前半に降ってくるもの
  falling?: Particle
  // 最後にサーっと吹き抜けるもの。spin なら回りながら、そうでなければ斜めのまま（雨）
  gust: Particle & { spin: boolean; streak: string }
  // その場面だけの動き。繰り返しの動きも delay で経過時間ぶんずらし、読み込み直されても続きから動かす
  css?: string
}

type Delay = (seconds: number) => string

// ---- 秋：落ち葉の焚き火で焼き芋 → 焼けた芋を掲げる → 落ち葉の風 ----

const LEAF_COLORS = ['#D9822B', '#B9472E', '#E5B43B', '#8E5A2D', '#C9652A']

function autumn(delay: Delay): Scene {
  // 落ち葉の山（8 単位の升目を 3 段に積む）
  const pile = [
    { y: 88, x0: 160, n: 11 },
    { y: 80, x0: 168, n: 9 },
    { y: 72, x0: 184, n: 5 },
  ]
    .flatMap(({ y, x0, n }, r) => Array.from({ length: n }, (_, i) => rect(x0 + i * 8, y, 8, 8, LEAF_COLORS[(i * 3 + r * 2) % LEAF_COLORS.length])))
    .join('')
  // 炎は 2 枚を交互に出して、ちらちら揺らす
  const outer = '#E4572E'
  const inner = '#F2B84B'
  const frameA = [rect(196, 62, 8, 12, outer), rect(204, 52, 8, 22, outer), rect(212, 60, 8, 14, outer), rect(204, 62, 8, 12, inner), rect(198, 68, 6, 6, inner)]
  const frameB = [rect(196, 56, 8, 18, outer), rect(204, 60, 8, 14, outer), rect(212, 52, 8, 22, outer), rect(206, 66, 8, 8, inner), rect(212, 62, 6, 12, inner)]
  const smoke = [0, 1, 2].map(i => rect(204, 42, 8, 8, '#9AA0A6', ` class="smoke${i === 0 ? '' : ` smoke${i + 1}`}"`)).join('')
  const steam = [0, 1, 2].map(i => rect(128 + i * 6, 8 - i * 3, 5, 5, STEAM, ` class="steam${i === 0 ? '' : ` steam${i + 1}`}"`)).join('')
  return {
    alt: '焚き火で焼き芋を焼く Clawd',
    props: `${pile}<g class="fA">${frameA.join('')}</g><g class="fB">${frameB.join('')}</g>${smoke}`,
    taken: rect(228, 76, 26, 11, '#8E2F55', ' rx="5"'),
    tool: rect(136, 43.5, 64, 5, WOOD, ' transform="rotate(34 138 46)"'),
    poke: { transform: 'rotate(7deg)', seconds: 0.55 },
    hand: rect(134, 39, 26, 14, '#8E2F55', ' rx="6"') + rect(134, 48, 18, 5, '#6E2442', ' rx="2"') + rect(152, 40, 8, 12, '#F2C14E', ' rx="2"'),
    // 焼けた芋の湯気（掲げた芋の上）
    onClawd: `<g class="once steamAll">${steam}</g>`,
    falling: { colors: LEAF_COLORS.slice(0, 3), w: 8, h: 6, rx: 2 },
    gust: { colors: LEAF_COLORS, w: 9, h: 6, rx: 2, spin: true, streak: '#9AA0A6' },
    css: `
    .fA { animation: fA 0.36s steps(1) ${delay(0)} infinite; }
    .fB { animation: fB 0.36s steps(1) ${delay(0)} infinite; }
    @keyframes fA { 0% { opacity: 1; } 50% { opacity: 0; } }
    @keyframes fB { 0% { opacity: 0; } 50% { opacity: 1; } }
    .smoke { animation: smoke 2.2s linear ${delay(0)} infinite; opacity: 0; }
    .smoke2 { animation-delay: ${delay(-0.73)}; }
    .smoke3 { animation-delay: ${delay(-1.47)}; }
    @keyframes smoke { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 0.75; } 100% { transform: translate(16px, -60px); opacity: 0; } }
    .steamAll { animation-name: steamAll; }
    @keyframes steamAll { 0%, ${at(RAISE_END)} { opacity: 0; } ${at(RAISE_END + 0.2)}, ${at(GUST_START)} { opacity: 1; } ${at(GUST_START + 0.3)}, 100% { opacity: 0; } }
    .steam { animation: steam 1.5s linear ${delay(0)} infinite; opacity: 0; }
    .steam2 { animation-delay: ${delay(-0.5)}; }
    .steam3 { animation-delay: ${delay(-1)}; }
    @keyframes steam { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.9; } 100% { transform: translate(4px, -22px); opacity: 0; } }`,
  }
}

// ---- 冬：こたつでみかん → みかんを掲げる → 吹雪 ----

const MIKAN = '#F29A2E'
const MIKAN_LEAF = '#5B8C3A'
const SNOW = ['#A9C8E8', '#CFE0F2', '#8FB6DE']

const mikan = (x: number, y: number, w = 12, h = 11) => rect(x, y, w, h, MIKAN, ` rx="${Math.min(w, h) / 2 - 0.5}"`) + rect(x + w / 2 - 1, y - 2, 4, 3, MIKAN_LEAF)

function winter(delay: Delay): Scene {
  const futon = '#D2553F'
  const dot = '#F2A58E'
  // こたつ布団（ふっくら丸く、天板より少し広く垂れる。水玉柄。細い格子柄だとレンガの壁に見えた）と天板
  const dots = [0, 1, 2].flatMap(row => Array.from({ length: 7 }, (_, i) => [148 + i * 16 + (row % 2) * 8, 70 + row * 8])).filter(([x]) => x < 252)
  const kotatsu = [
    rect(138, 63, 124, 33, futon, ' rx="10"'),
    ...dots.map(([x, y]) => rect(x, y, 4, 4, dot, ' rx="2"')),
    rect(142, 57, 114, 6, WOOD),
    rect(142, 61, 114, 2, '#6E4A28'),
  ].join('')
  // 湯のみと湯気
  const cup = rect(224, 44, 13, 14, '#6E8B74', ' rx="2"') + rect(223, 43, 15, 3, '#5A7360')
  const steam = [0, 1, 2].map(i => rect(227 + i * 2, 34, 5, 5, STEAM, ` class="steam${i === 0 ? '' : ` steam${i + 1}`}"`)).join('')
  return {
    alt: 'こたつでみかんを食べる Clawd',
    props: `${kotatsu}${mikan(147, 47)}${mikan(161, 47)}${cup}${steam}`,
    taken: mikan(154, 37),
    // 天板のみかんへ手を伸ばす
    poke: { transform: 'translate(3px, 2px) rotate(8deg)', seconds: 0.6 },
    hand: rect(136, 39, 16, 15, MIKAN, ' rx="7"') + rect(139, 42, 4, 3, '#F7B861') + rect(142, 36, 5, 4, MIKAN_LEAF),
    falling: { colors: SNOW, w: 5, h: 5, rx: 1 },
    gust: { colors: [...SNOW, '#E1ECF7'], w: 6, h: 6, rx: 1, spin: true, streak: '#A9C8E8' },
    css: `
    .steam { animation: steam 1.8s linear ${delay(0)} infinite; opacity: 0; }
    .steam2 { animation-delay: ${delay(-0.6)}; }
    .steam3 { animation-delay: ${delay(-1.2)}; }
    @keyframes steam { 0% { transform: translate(0, 0); opacity: 0; } 20% { opacity: 0.85; } 100% { transform: translate(3px, -26px); opacity: 0; } }`,
  }
}

// ---- 春：桜を見上げる（花びらが頭に乗る）→ 三色団子を掲げる → 桜吹雪 ----

const PETALS = ['#F7B9CB', '#F4A3B8', '#F7C6D3']
const DANGO = { pink: '#F4A3B8', white: '#F6EFE2', green: '#8DBF6A', edge: '#D8CBB0', stick: '#B08A5A' }

const dango = (x: number, y: number, size: number, gap: number) =>
  rect(x - 2, y + size / 2 - 1, gap * 2 + size + 8, 2.5, DANGO.stick) +
  [DANGO.pink, DANGO.white, DANGO.green]
    .map((color, i) => rect(x + i * gap, y, size, size, color, ` rx="${size / 2}"${color === DANGO.white ? ` stroke="${DANGO.edge}" stroke-width="1"` : ''}`))
    .join('')

function spring(delay: Delay): Scene {
  const trunk = '#7A5230'
  const tree = [
    rect(216, 28, 10, 68, trunk),
    rect(198, 34, 20, 5, trunk),
    rect(178, 6, 34, 24, '#F4B6C8', ' rx="10"'),
    rect(196, -12, 42, 28, '#F7C6D3', ' rx="12"'),
    rect(224, -4, 30, 28, '#F4B6C8', ' rx="12"'),
    rect(190, 14, 52, 20, '#EFA3BA', ' rx="10"'),
    rect(232, 14, 22, 18, '#F7C6D3', ' rx="8"'),
    ...[[188, 12], [206, -2], [230, 6], [214, 20], [244, 18], [198, 24]].map(([x, y]) => rect(x, y, 4, 4, '#E58BA5')),
  ].join('')
  // 花見の敷物とお皿
  const picnic = rect(146, 91, 108, 5, '#C9473D') + rect(152, 87, 34, 5, '#E3E3E3', ' rx="2"')
  return {
    alt: '桜の下でお団子を食べる Clawd',
    props: tree + picnic,
    taken: dango(156, 79, 7, 8),
    hand: dango(142, 41, 8, 9),
    look: [3, -3],
    // 散ってきた花びらが 1 枚、頭に乗る
    onClawd: rect(68, 3, 8, 5, PETALS[1], ' rx="2.5" class="once headPetal"'),
    falling: { colors: PETALS, w: 7, h: 5, rx: 2.5 },
    gust: { colors: [...PETALS, '#FBD3DE'], w: 8, h: 6, rx: 3, spin: true, streak: '#E8A0B4' },
    css: `
    .headPetal { animation-name: headPetal; }
    @keyframes headPetal { 0%, ${at(1.2)} { transform: translate(34px, -40px); opacity: 0; } ${at(1.25)} { transform: translate(34px, -40px); opacity: 1; } ${at(1.6)} { transform: translate(14px, -18px); } ${at(1.95)}, ${at(GUST_START + 0.1)} { transform: translate(0, 0); opacity: 1; } ${at(GUST_START + 0.6)}, 100% { transform: translate(130px, -10px); opacity: 0; } }`,
  }
}

// ---- 夏：金魚のうちわであおぐ（汗、風鈴）→ スイカを掲げる → 夕立 ----

const MELON = '#3F8F3A'
const MELON_STRIPE = '#245E25'
const MELON_RED = '#E5484D'
const MELON_WHITE = '#EAF2DC'
const SEED = '#2B2B2B'

function summer(delay: Delay): Scene {
  const whole = rect(190, 68, 36, 28, MELON, ' rx="13"') + [197, 206, 215].map((x, i) => rect(x, i === 1 ? 69 : 70, 4, i === 1 ? 26 : 24, MELON_STRIPE)).join('')
  const half = rect(190, 80, 36, 16, MELON, ' rx="8"') + rect(191, 76, 34, 5, MELON_RED, ' rx="2"') + rect(191, 80.5, 34, 2, MELON_WHITE) + rect(200, 77.5, 2.5, 2, SEED) + rect(212, 77.5, 2.5, 2, SEED)
  // 風鈴（短冊が揺れる）
  const bell = `<g class="chime">${rect(240, -18, 1.5, 18, '#8A8F96')}${rect(232, -1, 18, 13, '#8FD0EE', ' rx="6"')}${rect(231, 10, 20, 2.5, '#6BB7DD')}${rect(236, 4, 3, 3, MELON_RED)}${rect(243, 4, 3, 3, MELON_RED)}${rect(240.3, 12, 1, 6, '#8A8F96')}${rect(237, 18, 8, 18, '#F2D35B')}</g>`
  const fan = rect(136, 44.5, 12, 3, WOOD) + rect(146, 33, 24, 26, '#6FA8DC', ' rx="12"') + rect(153, 43, 8, 6, MELON_RED, ' rx="3"') + rect(160, 42, 4, 8, MELON_RED, ' rx="1"')
  const slice = rect(133, 36, 6, 20, MELON, ' rx="2"') + rect(138, 37, 2.5, 18, MELON_WHITE) + `<polygon points="140,37 164,46 140,55" fill="${MELON_RED}"/>` + [[146, 42], [151, 45.5], [146, 49]].map(([x, y]) => rect(x, y, 2.5, 3.5, SEED)).join('')
  return {
    alt: 'うちわであおいでスイカを食べる Clawd',
    props: bell,
    taken: whole,
    added: half,
    tool: fan,
    poke: { transform: 'rotate(-18deg)', seconds: 0.36 },
    hand: slice,
    // 暑くて汗（前半だけ）
    onClawd: `<g class="once sweatAll">${rect(20, 8, 6, 9, '#7FB8E6', ' class="sweat"')}</g>`,
    gust: { colors: ['#7FB8E6', '#9CC9EE'], w: 2.5, h: 12, rx: 1.2, spin: false, streak: '#7FB8E6' },
    css: `
    .chime { transform-origin: 241px -18px; animation: chime 1.8s ease-in-out ${delay(0)} infinite alternate; }
    @keyframes chime { from { transform: rotate(-8deg); } to { transform: rotate(8deg); } }
    .sweatAll { animation-name: sweatAll; }
    @keyframes sweatAll { 0%, ${at(POKE_END - 0.05)} { opacity: 1; } ${at(POKE_END)}, 100% { opacity: 0; } }
    .sweat { animation: drip 1.2s ease-in ${delay(0)} infinite; }
    @keyframes drip { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }`,
  }
}

const SCENES: Record<Season, (delay: Delay) => Scene> = { spring, summer, autumn, winter }

export function introAlt(season: Season): string {
  return SCENES[season](seconds => `${seconds}s`).alt
}

// ---- 吹き抜けるもの（左の外から右の外へ、波打ちながら抜ける） ----

const GUST_PATHS = [
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

function gust(spec: Scene['gust'], delay: Delay): { css: string; svg: string } {
  if (!spec.spin) return rain(spec, delay)
  const css = GUST_PATHS.map(
    ({ dy1, dy2 }, i) => `
    .g${i} { animation: g${i} 0.8s cubic-bezier(.45,0,.7,1) ${delay(GUST_START - 0.05 + i * 0.05)} both; }
    @keyframes g${i} { from { transform: translate(0, 0) rotate(0); } 50% { transform: translate(150px, ${dy1}px) rotate(300deg); } to { transform: translate(310px, ${dy2}px) rotate(640deg); } }`,
  ).join('')
  const svg = GUST_PATHS.map(({ y }, i) => rect(-28, y, spec.w, spec.h, spec.colors[i % spec.colors.length], ` rx="${spec.rx}" class="gl g${i}"`)).join('')
  const streaks = [28, 58, 86].map((y, i) => rect(-60, y, 40, 2, spec.streak, ` class="streak" style="animation-delay: ${delay(GUST_START + i * 0.08)}"`)).join('')
  return { css, svg: svg + streaks }
}

// 夕立：上から斜めに降る雨が、左から右へサーっと通り過ぎる（2 列）
function rain(spec: Scene['gust'], delay: Delay): { css: string; svg: string } {
  const drops = Array.from({ length: 18 }, (_, i) => ({ x: -14 + (i % 9) * 30 + (i >= 9 ? 15 : 0), start: GUST_START - 0.15 + (i % 9) * 0.07 + (i >= 9 ? 0.18 : 0) }))
  const css = `
    .rain { transform-box: fill-box; transform-origin: center; animation-name: rain; animation-duration: 0.45s; animation-timing-function: linear; animation-fill-mode: both; }
    @keyframes rain { from { transform: translate(0, 0) rotate(-12deg); opacity: 0.9; } to { transform: translate(32px, 156px) rotate(-12deg); opacity: 0.6; } }`
  const svg = drops
    .map(({ x, start }, i) => rect(x, -30, spec.w, spec.h, spec.colors[i % spec.colors.length], ` rx="${spec.rx}" class="rain" style="animation-delay: ${delay(start)}"`))
    .join('')
  return { css, svg }
}

// 目。いつもの目（13×13）と、掲げている間のにっこり目（^ ^）
function eyes(): string {
  const normal = `<g class="once eyesN">${rect(50, 22, 13, 13, EYE)}${rect(88, 22, 13, 13, EYE)}</g>`
  const happy = (x: number) => rect(x - 1, 28, 5, 5, EYE) + rect(x + 4, 23, 5, 5, EYE) + rect(x + 9, 28, 5, 5, EYE)
  return `${normal}<g class="once eyesH">${happy(50)}${happy(88)}</g>`
}

// elapsed は登場からたった秒数。描き直しで絵が読み込み直されても、その時点の続きから再生する
export function introSvg(season: Season, id: string, elapsed = 0): string {
  const delay: Delay = seconds => `${(seconds - elapsed).toFixed(2)}s`
  const scene = SCENES[season](delay)
  const { css: gustCss, svg: gustSvg } = gust(scene.gust, delay)
  const [lookX, lookY] = scene.look ?? [0, 0]
  const look = `translate(${lookX}px, ${lookY}px)`
  // 前半の腕の動きは、前半に収まる回数だけ繰り返す
  const pokeCount = scene.poke === undefined ? 0 : Math.floor((POKE_END - ENTER_END - 0.1) / scene.poke.seconds)
  const css = `
    .once { animation-duration: ${INTRO_SECONDS}s; animation-timing-function: linear; animation-fill-mode: both; animation-delay: ${delay(0)}; }
    .props { animation-name: props; }
    @keyframes props { 0% { transform: translateX(40px); opacity: 0; } ${at(ENTER_END)}, ${at(GUST_START)} { transform: translateX(0); opacity: 1; } ${at(GUST_END)}, 100% { transform: translateX(70px); opacity: 0; } }
    .taken { animation-name: taken; }
    @keyframes taken { 0%, ${at(POKE_END - 0.05)} { opacity: 1; } ${at(POKE_END)}, 100% { opacity: 0; } }
    .added { animation-name: added; }
    @keyframes added { 0%, ${at(POKE_END - 0.05)} { opacity: 0; } ${at(POKE_END)}, 100% { opacity: 1; } }
    .armPhase { transform-origin: 114px 46px; animation-name: armPhase; animation-timing-function: ease-in-out; }
    @keyframes armPhase { 0%, ${at(POKE_END)} { transform: rotate(0); } ${at(RAISE_END)}, ${at(GUST_START)} { transform: rotate(-50deg); } ${at(GUST_START + 0.6)}, 100% { transform: rotate(0); } }
    .poke { transform-origin: 114px 46px; ${scene.poke === undefined ? '' : `animation: poke ${scene.poke.seconds}s ease-in-out ${delay(ENTER_END + 0.1)} ${pokeCount} both;`} }
    @keyframes poke { 0%, 100% { transform: rotate(0); } 50% { transform: ${scene.poke?.transform ?? 'none'}; } }
    .tool { animation-name: tool; }
    @keyframes tool { 0% { opacity: 0; } ${at(0.3)}, ${at(POKE_END - 0.05)} { opacity: 1; } ${at(POKE_END)}, 100% { opacity: 0; } }
    .hand { animation-name: hand; }
    @keyframes hand { 0%, ${at(POKE_END - 0.05)} { opacity: 0; } ${at(POKE_END)}, ${at(GUST_START + 0.1)} { opacity: 1; } ${at(GUST_START + 0.5)}, 100% { opacity: 0; } }
    .eyesN { animation-name: eyesN; }
    .eyesH { animation-name: eyesH; }
    @keyframes eyesN { 0% { opacity: 1; transform: translate(0, 0); } ${at(0.6)}, ${at(POKE_END)} { opacity: 1; transform: ${look}; } ${at(POKE_END + 0.05)}, ${at(GUST_START + 0.2)} { opacity: 0; transform: translate(0, 0); } ${at(GUST_START + 0.25)}, 100% { opacity: 1; transform: translate(0, 0); } }
    @keyframes eyesH { 0%, ${at(POKE_END)} { opacity: 0; } ${at(POKE_END + 0.05)}, ${at(GUST_START + 0.2)} { opacity: 1; } ${at(GUST_START + 0.25)}, 100% { opacity: 0; } }
    #all { animation: hop 0.47s ease-in-out ${delay(RAISE_END)} 4 both; }
    @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    .fall { animation-name: fall; }
    @keyframes fall { 0%, ${at(GUST_START)} { opacity: 1; } ${at(GUST_START + 0.3)}, 100% { opacity: 0; } }
    .flake { transform-box: fill-box; transform-origin: center; animation: flake 2.6s linear ${delay(0)} infinite; opacity: 0; }
    .flake2 { animation-delay: ${delay(-0.9)}; }
    .flake3 { animation-delay: ${delay(-1.8)}; }
    @keyframes flake { 0% { transform: translate(0, 0) rotate(0); opacity: 0; } 12%, 85% { opacity: 1; } 100% { transform: translate(-16px, 112px) rotate(220deg); opacity: 0; } }
    .gl { transform-box: fill-box; transform-origin: center; }
    .streak { animation: streak 0.7s linear both; }
    @keyframes streak { 0% { transform: translateX(0); opacity: 0; } 20% { opacity: 0.7; } 100% { transform: translateX(330px); opacity: 0; } }${scene.css ?? ''}${gustCss}`

  const falling =
    scene.falling === undefined
      ? ''
      : [60, 150, 232]
          .map((x, i) => {
            const { colors, w, h, rx } = scene.falling as Particle
            return rect(x, -14, w, h, colors[i % colors.length], ` rx="${rx}" class="flake${i === 0 ? '' : ` flake${i + 1}`}"`)
          })
          .join('')

  return `<svg id="${id}" viewBox="-12 -18 ${VIEW_WIDTH} 134" xmlns="http://www.w3.org/2000/svg">
<style>${css}</style>
<g class="once fall">${falling}</g>
<g class="once props">
  ${scene.props}
  ${scene.taken === undefined ? '' : `<g class="once taken">${scene.taken}</g>`}
  ${scene.added === undefined ? '' : `<g class="once added">${scene.added}</g>`}
</g>
<g id="all">
  <rect x="12" y="35" width="24" height="22" fill="${BODY}"/>
  <g class="once armPhase">
    <g class="poke">
      <rect x="114" y="35" width="24" height="22" fill="${BODY}"/>
      ${scene.tool === undefined ? '' : `<g class="once tool">${scene.tool}</g>`}
    </g>
    <g class="once hand">${scene.hand}</g>
  </g>
  <rect x="32" y="8" width="86" height="66" fill="${BODY}"/>
  <rect x="32" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="53" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="86" y="74" width="11" height="22" fill="${BODY}"/>
  <rect x="107" y="74" width="11" height="22" fill="${BODY}"/>
  ${eyes()}
  ${scene.onClawd ?? ''}
</g>
${gustSvg}
</svg>`
}
