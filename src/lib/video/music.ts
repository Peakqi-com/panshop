/**
 * 程序化背景音樂：不用外部音檔，直接合成一段柔和的和弦鋪底加琶音。
 * 輸出 WAV（44.1 kHz、立體聲、16-bit）。不同風格用不同和弦走向與速度。
 */
const NOTE: Record<string, number> = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88 };
const CHORDS: Record<string, string[][]> = {
  lifestyle: [["C", "E", "G"], ["F", "A", "C"], ["A", "C", "E"], ["G", "B", "D"]],
  minimal: [["C", "E", "G"], ["A", "C", "E"], ["F", "A", "C"], ["G", "B", "D"]],
  natural: [["F", "A", "C"], ["C", "E", "G"], ["D", "F", "A"], ["G", "B", "D"]],
  luxury: [["A", "C", "E"], ["F", "A", "C"], ["D", "F", "A"], ["E", "G", "B"]],
  cute: [["C", "E", "G"], ["G", "B", "D"], ["A", "C", "E"], ["F", "A", "C"]],
  promo: [["C", "E", "G"], ["G", "B", "D"], ["F", "A", "C"], ["G", "B", "D"]],
};
const TEMPO: Record<string, number> = { lifestyle: 0.5, minimal: 0.75, natural: 0.6, luxury: 0.75, cute: 0.375, promo: 0.25 };

export function generateMusic(seconds: number, style: string, seed = 7): Buffer {
  const sr = 44100, n = Math.floor(seconds * sr);
  const chords = CHORDS[style] ?? CHORDS.lifestyle;
  const step = TEMPO[style] ?? 0.5;
  const chordLen = seconds / chords.length;
  const out = new Float32Array(n);
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };

  // 鋪底：每個和弦三個音的低八度正弦，慢進慢出
  for (let c = 0; c < chords.length; c++) {
    const start = Math.floor(c * chordLen * sr), end = Math.min(n, Math.floor((c + 1) * chordLen * sr));
    const freqs = chords[c].map((nm) => NOTE[nm] / 2);
    for (let i = start; i < end; i++) {
      const t = i / sr, local = (i - start) / sr, remain = (end - i) / sr;
      const env = Math.min(1, local / 1.2, remain / 1.2);
      let v = 0;
      for (const [k, f] of freqs.entries()) v += Math.sin(2 * Math.PI * f * t + k) * (1 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t + k));
      out[i] += v * 0.08 * env;
    }
  }
  // 琶音：每 step 秒一個撥弦，衰減正弦，音高從和弦音挑
  for (let t0 = 0.25; t0 < seconds - 0.5; t0 += step) {
    const c = Math.min(chords.length - 1, Math.floor(t0 / chordLen));
    const tone = chords[c][Math.floor(rand() * 3)];
    const oct = rand() < 0.3 ? 2 : 1;
    const f = NOTE[tone] * oct;
    const start = Math.floor(t0 * sr), len = Math.floor(1.4 * sr);
    const amp = 0.09 + rand() * 0.04;
    for (let i = 0; i < len && start + i < n; i++) {
      const tt = i / sr;
      out[start + i] += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 3.2) * amp * (1 - Math.exp(-tt * 200));
    }
  }
  // 低通柔化 + 整體淡入淡出
  let lp = 0;
  const a = 0.08;
  for (let i = 0; i < n; i++) { lp += a * (out[i] - lp); out[i] = lp; }
  for (let i = 0; i < n; i++) {
    const t = i / sr, remain = seconds - t;
    out[i] *= Math.min(1, t / 0.8, remain / 1.5);
  }
  // 寫 WAV（立體聲，左右略有差異增加寬度）
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, out[i])), r = Math.max(-1, Math.min(1, out[Math.max(0, i - 40)]));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  return buf;
}
