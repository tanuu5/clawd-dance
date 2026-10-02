// 効果音。音声ファイルを同梱せず、ここで波形を合成して WAV（base64）にする。$ を使わない関数だけを置く。

const RATE = 22_050

type Note = {
  frequency: number
  start: number // 秒
  decay: number // 大きいほど早く消える
  droop?: number // 鳴っている間に音程を下げる割合（0.06 なら 1 秒で 6% 下がる）
}

function synth(notes: Note[], seconds: number, attackSeconds: number, brightness: number): Float32Array {
  const samples = new Float32Array(Math.floor(RATE * seconds))
  for (const { frequency, start, decay, droop = 0 } of notes) {
    const first = Math.floor(start * RATE)
    let phase = 0
    for (let i = first; i < samples.length; i++) {
      const t = (i - first) / RATE
      // 音程を下げない音は、元の式（sin(2πft)）と同じ値になるよう t から直接求める
      const angle = droop === 0 ? 2 * Math.PI * frequency * t : phase
      const attack = Math.min(1, t / attackSeconds)
      const tone = Math.sin(angle) + brightness * Math.sin(2 * angle) * Math.exp(-t * 12)
      samples[i] = (samples[i] ?? 0) + attack * Math.exp(-t * decay) * tone
      phase += (2 * Math.PI * frequency * (1 - droop * t)) / RATE
    }
  }
  return samples
}

// 16bit モノラルの WAV にして base64 で返す。level は最大振幅（0〜1）
function wavBase64(samples: Float32Array, level: number): string {
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
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round((v / peak) * level * 32767), true))

  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// 終わったときの「ピロローン」。ミ・ソ・ドを短く鳴らし、最後のドを長く響かせる。
export function chimeWavBase64(): string {
  const notes: Note[] = [
    { frequency: 1318.5, start: 0.0, decay: 9 },
    { frequency: 1568.0, start: 0.09, decay: 9 },
    { frequency: 2093.0, start: 0.18, decay: 3 },
  ]
  return wavBase64(synth(notes, 1.3, 0.004, 0.25), 0.55)
}

// 夜（0〜4 時台）の「ピポポ…」。ソ・ミ・ドと下がり、間をあけて小さく鳴らす。
// 最後のドはため息のように音程を少し下げながら消える。
export function sleepyChimeWavBase64(): string {
  const notes: Note[] = [
    { frequency: 784.0, start: 0.0, decay: 7 },
    { frequency: 659.3, start: 0.2, decay: 7 },
    { frequency: 523.3, start: 0.45, decay: 2.2, droop: 0.06 },
  ]
  return wavBase64(synth(notes, 2.0, 0.015, 0.1), 0.38)
}
