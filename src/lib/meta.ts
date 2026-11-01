import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { VideoSegmentationResult, ImageSegmentationResult } from "@meta-sam/parser";
import { samParser } from "@/lib/sam-parser";
import { requireSetting } from "@/lib/settings";
import { PRICE } from "@/lib/config";

/** Meta Model API 封裝。所有對 api.meta.ai 的呼叫只經過這裡；每個函式回傳估算費用 usd */
export const META_BASE = "https://api.meta.ai/v1";
export type Effort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

async function headers(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${await requireSetting("META_API_KEY")}`, ...extra };
}

async function fail(r: Response, what: string): Promise<never> {
  const text = await r.text().catch(() => "");
  throw new Error(`${what} ${r.status}: ${text.slice(0, 600)}`);
}

// ---------- Spark：結構化輸出 ----------

async function toDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`下載圖片失敗 ${r.status} ${url}`);
  const ct = r.headers.get("content-type") ?? "image/jpeg";
  return `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
}

export type Part = { text: string } | { imageUrl: string };

export async function sparkJSON<T>(opts: {
  schema: z.ZodType<T>;
  name: string;
  system?: string;
  parts: Part[];
  effort?: Effort;
  model?: string;
  maxTokens?: number;
}): Promise<{ data: T; usd: number; raw: string }> {
  const model = opts.model ?? "muse-spark-1.3";
  const jsonSchema = zodToJsonSchema(opts.schema, { name: opts.name, $refStrategy: "none" });
  const schema = (jsonSchema as { definitions?: Record<string, unknown> }).definitions?.[opts.name] ?? jsonSchema;
  const content = opts.parts.map((p) => ("text" in p ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.imageUrl } }));
  const body = {
    model,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name: opts.name, schema } },
    reasoning_effort: opts.effort ?? "low",
    max_completion_tokens: opts.maxTokens ?? 4000,
  };
  let usd = 0;
  let lastErr = "";
  let inlined = false;
  // 偶爾會回空字串（推理把 token 用完或輸出被截斷），最多試三次，第二次起放大輸出上限、降低推理強度
  for (let attempt = 0; attempt < 3; attempt++) {
    const b = attempt === 0 ? body : { ...body, max_completion_tokens: Math.max(8000, (opts.maxTokens ?? 4000) * 2), reasoning_effort: "low" };
    const r = await fetch(`${META_BASE}/chat/completions`, { method: "POST", headers: await headers({ "content-type": "application/json" }), body: JSON.stringify(b) });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      // 剛上傳的 Blob 偶爾還抓不到：改成自己下載後用 data URL 內嵌再送一次
      if (r.status === 400 && text.includes("media_url_not_fetchable") && !inlined) {
        inlined = true;
        await new Promise((res) => setTimeout(res, 2000));
        const msgs = body.messages as { role: string; content: unknown }[];
        const user = msgs[msgs.length - 1].content as { type: string; image_url?: { url: string } }[];
        for (const part of user) {
          if (part.type === "image_url" && part.image_url && /^https?:/.test(part.image_url.url)) part.image_url.url = await toDataUrl(part.image_url.url);
        }
        attempt--;
        continue;
      }
      throw new Error(`spark ${r.status}: ${text.slice(0, 600)}`);
    }
    const j = (await r.json()) as { choices: { message: { content: string | null }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const raw = j.choices?.[0]?.message?.content ?? "";
    usd += (j.usage?.prompt_tokens ?? 0) * PRICE.sparkIn + (j.usage?.completion_tokens ?? 0) * PRICE.sparkOut;
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const parsed = JSON.parse(cleaned);
      return { data: opts.schema.parse(parsed), usd, raw };
    } catch (e) {
      lastErr = `spark 回傳不是合法 JSON（finish=${j.choices?.[0]?.finish_reason ?? "?"}，${cleaned.length} 字）：${cleaned.slice(0, 200)} ${e instanceof Error ? e.message.slice(0, 120) : ""}`;
    }
  }
  throw new Error(lastErr);
}

/** 自由文字（文案用） */
export async function sparkText(opts: { system?: string; parts: Part[]; effort?: Effort; maxTokens?: number }): Promise<{ text: string; usd: number }> {
  const content = opts.parts.map((p) => ("text" in p ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.imageUrl } }));
  const body = {
    model: "muse-spark-1.3",
    messages: [...(opts.system ? [{ role: "system", content: opts.system }] : []), { role: "user", content }],
    reasoning_effort: opts.effort ?? "low",
    max_completion_tokens: opts.maxTokens ?? 2000,
  };
  const r = await fetch(`${META_BASE}/chat/completions`, { method: "POST", headers: await headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
  if (!r.ok) await fail(r, "spark");
  const j = (await r.json()) as { choices: { message: { content: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { text: j.choices?.[0]?.message?.content ?? "", usd: (j.usage?.prompt_tokens ?? 0) * PRICE.sparkIn + (j.usage?.completion_tokens ?? 0) * PRICE.sparkOut };
}

// ---------- Files ----------

export async function uploadFile(data: Buffer, fileName: string, contentType: string, expiresSec = 86400): Promise<string> {
  const fd = new FormData();
  fd.append("purpose", "user_data");
  fd.append("expires_after[anchor]", "created_at");
  fd.append("expires_after[seconds]", String(expiresSec));
  fd.append("file", new Blob([new Uint8Array(data)], { type: contentType }), fileName);
  const r = await fetch(`${META_BASE}/files`, { method: "POST", headers: await headers(), body: fd });
  if (!r.ok) await fail(r, "files");
  const j = (await r.json()) as { id: string };
  return j.id;
}

// ---------- SAM 3.1 ----------

type SSEEvent = { type: string } & Record<string, unknown>;

async function* sse(res: Response): AsyncGenerator<SSEEvent> {
  if (!res.body) throw new Error("SAM 沒有回應串流");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data) as SSEEvent;
      } catch {
        /* 略過壞掉的事件 */
      }
    }
  }
}

/** 串流只要最終結果，把事件讀完即可 */
async function drain(it: AsyncIterable<unknown>) {
  const i = it[Symbol.asyncIterator]();
  while (!(await i.next()).done) { /* 讀完 */ }
}

async function samRequest(media: Record<string, unknown>, phrase: string, metadata: Record<string, string>) {
  const body = {
    model: "sam-3.1",
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: phrase }, media] }],
    stream: true,
    metadata: { include_confidence: "true", mask_encoding: "one_bit", ...metadata },
  };
  const r = await fetch(`${META_BASE}/responses`, {
    method: "POST",
    headers: await headers({ "content-type": "application/json", accept: "text/event-stream" }),
    body: JSON.stringify(body),
  });
  if (!r.ok) await fail(r, "sam");
  return r;
}

/** 影片：一個名詞片語一次請求；回傳解析結果與估算費用 */
export async function samVideo(opts: { fileId?: string; videoUrl?: string; phrase: string; frames: number }): Promise<{ result: VideoSegmentationResult; usd: number }> {
  const media = opts.fileId ? { type: "input_video", file_id: opts.fileId } : { type: "input_video", video_url: opts.videoUrl };
  const { parseVideoStream } = await samParser();
  const r = await samRequest(media, opts.phrase, {});
  const parsed = parseVideoStream(sse(r));
  await drain(parsed);
  const result = await parsed.finalResult;
  return { result, usd: Math.max(opts.frames, PRICE.samVideoMinFrames) * PRICE.samVideoFrame };
}

export async function samImage(opts: { imageUrl: string; phrase: string }): Promise<{ result: ImageSegmentationResult; usd: number }> {
  const { parseImageStream } = await samParser();
  const r = await samRequest({ type: "input_image", image_url: opts.imageUrl }, opts.phrase, {});
  const parsed = parseImageStream(sse(r));
  await drain(parsed);
  return { result: await parsed.finalResult, usd: PRICE.samImage };
}

// ---------- Muse Image ----------

type ImgResp = { data: { b64_json?: string; url?: string }[] };

async function imgBuffers(j: ImgResp): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const d of j.data) {
    if (d.b64_json) out.push(Buffer.from(d.b64_json, "base64"));
    else if (d.url) out.push(Buffer.from(await (await fetch(d.url)).arrayBuffer()));
  }
  return out;
}

export async function imageGenerate(opts: { prompt: string; size?: string; n?: number; format?: "png" | "jpeg" | "webp" }): Promise<{ images: Buffer[]; usd: number }> {
  const body = { model: "muse-image-1.0", prompt: opts.prompt, n: opts.n ?? 1, size: opts.size ?? "1024x1024", response_format: "b64_json", output_format: opts.format ?? "png" };
  const r = await fetch(`${META_BASE}/images/generations`, { method: "POST", headers: await headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
  if (!r.ok) await fail(r, "image.generate");
  const images = await imgBuffers((await r.json()) as ImgResp);
  return { images, usd: images.length * PRICE.image };
}

/** 以 1 到 10 張參考圖編輯／生成（不支援遮罩） */
export async function imageEdit(opts: { prompt: string; images: string[]; size?: string; n?: number; format?: "png" | "jpeg" | "webp" }): Promise<{ images: Buffer[]; usd: number }> {
  const body = {
    model: "muse-image-1.0",
    prompt: opts.prompt,
    images: opts.images.slice(0, 10).map((u) => ({ image_url: u })),
    n: opts.n ?? 1,
    size: opts.size ?? "1024x1024",
    response_format: "b64_json",
    output_format: opts.format ?? "png",
  };
  const r = await fetch(`${META_BASE}/images/edits`, { method: "POST", headers: await headers({ "content-type": "application/json" }), body: JSON.stringify(body) });
  if (!r.ok) await fail(r, "image.edit");
  const images = await imgBuffers((await r.json()) as ImgResp);
  return { images, usd: images.length * PRICE.image };
}

// ---------- Voice Transcribe ----------

export type Turn = { turnId: number; startMs: number; endMs: number; transcript: string; speaker?: string };
export type TranscribeResult = { sessionId: string; transcript: string; audioDurationMs: number; turns: Turn[] };

/** 批次轉寫 WAV（單聲道 16/24 kHz 16-bit，≤10 分鐘、≤32 MB），turn 級時間戳 */
export async function transcribe(wav: Buffer, opts: { keywords?: string[]; languageBias?: string[] } = {}): Promise<{ result: TranscribeResult; usd: number }> {
  const build = (withBias: boolean) => {
    const req: Record<string, unknown> = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "ENDPOINTING" };
    if (opts.keywords?.length) req.keywords = opts.keywords.slice(0, 50);
    if (withBias && opts.languageBias?.length) req.languageBias = opts.languageBias;
    const fd = new FormData();
    fd.append("request", new Blob([JSON.stringify(req)], { type: "application/json" }));
    fd.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");
    return fd;
  };
  let r = await fetch(`${META_BASE}/asr/transcribe`, { method: "POST", headers: await headers({ accept: "application/json" }), body: build(true) });
  if (r.status === 400 && opts.languageBias?.length) {
    r = await fetch(`${META_BASE}/asr/transcribe`, { method: "POST", headers: await headers({ accept: "application/json" }), body: build(false) });
  }
  if (!r.ok) await fail(r, "transcribe");
  const result = (await r.json()) as TranscribeResult;
  return { result, usd: ((result.audioDurationMs ?? 0) / 3_600_000) * PRICE.voicePerHour };
}
