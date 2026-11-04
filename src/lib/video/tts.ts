/**
 * 配音：Fish Audio（看得懂方括號語氣指令）優先，OpenAI gpt-4o-mini-tts 備援（語氣用 instructions 帶入，正文去掉指令）。
 * 兩者都沒金鑰就回 null，呼叫端退回賣家原聲或無口白。
 */
import { getSetting } from "@/lib/settings";

const CUE_RE = /\[[^\[\]\n]*\]|［[^［］\n]*］/g;
/** 拿掉語氣指令，得到真正要念或要顯示的字 */
export const stripDirection = (t: string) => t.replace(CUE_RE, "").replace(/[ \t]{2,}/g, " ").trim();
/** 抽出語氣指令文字（給 OpenAI 的 instructions） */
export const directionsOf = (t: string) => Array.from(t.matchAll(CUE_RE)).map((m) => m[0].slice(1, -1)).join("、");

export type TtsResult = { audio: Buffer; mime: string; provider: "fish" | "openai"; model: string };

export async function synthesize(text: string, lang: "zh" | "en" = "zh"): Promise<TtsResult | null> {
  const fishKey = await getSetting("FISH_AUDIO_API_KEY");
  if (fishKey) {
    try { return await fish(text, fishKey, (await getSetting("FISH_VOICE_ID")) ?? undefined); } catch (e) { console.warn("fish tts 失敗", (e as Error).message); }
  }
  const oaKey = await getSetting("OPENAI_API_KEY");
  if (oaKey) {
    try { return await openai(text, oaKey, lang); } catch (e) { console.warn("openai tts 失敗", (e as Error).message); }
  }
  return null;
}

async function fish(text: string, key: string, referenceId?: string): Promise<TtsResult> {
  const body: Record<string, unknown> = { text: text.replace(/［([^［］\n]*)］/g, "[$1]"), format: "mp3", mp3_bitrate: 128, latency: "normal", normalize: true };
  if (referenceId) body.reference_id = referenceId;
  const r = await fetch("https://api.fish.audio/v1/tts", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", model: process.env.FISH_AUDIO_TTS_MODEL ?? "s1" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`fish ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { audio: Buffer.from(await r.arrayBuffer()), mime: "audio/mpeg", provider: "fish", model: process.env.FISH_AUDIO_TTS_MODEL ?? "s1" };
}

async function openai(text: string, key: string, lang: "zh" | "en" = "zh"): Promise<TtsResult> {
  const instructions = lang === "en"
    ? `Natural, friendly US English, like recommending a product to a friend.${directionsOf(text) ? ` Tone: ${directionsOf(text)}.` : ""}`
    : `繁體中文、台灣口音，像在跟朋友介紹商品。${directionsOf(text) ? `語氣：${directionsOf(text)}。` : ""}`;
  const r = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "coral", input: stripDirection(text), instructions, response_format: "mp3" }) });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { audio: Buffer.from(await r.arrayBuffer()), mime: "audio/mpeg", provider: "openai", model: "gpt-4o-mini-tts" };
}
