import { getSetting, requireSetting } from "@/lib/settings";

/** 開放權重 Muse Spark Open，走 Baseten 的 OpenAI 相容端點。此模型不支援 JSON mode，提示要 JSON 再自行解析 */
export const BASETEN_BASE = "https://inference.baseten.co/v1";
export const DEFAULT_BASETEN_MODEL = "meta-models/muse-spark-open-1026";

export async function sparkOpenChat(opts: { system?: string; user: string; maxTokens?: number; temperature?: number }): Promise<{ text: string; model: string; ms: number }> {
  const key = await requireSetting("BASETEN_API_KEY");
  const model = (await getSetting("BASETEN_MODEL")) ?? DEFAULT_BASETEN_MODEL;
  const t0 = Date.now();
  const r = await fetch(`${BASETEN_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content: opts.user }],
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? 0.2,
    }),
  });
  if (!r.ok) throw new Error(`baseten ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const j = (await r.json()) as { choices: { message: { content: string | null } }[] };
  return { text: j.choices?.[0]?.message?.content ?? "", model, ms: Date.now() - t0 };
}

export function extractJSON<T = unknown>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}
