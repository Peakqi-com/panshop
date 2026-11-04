import { z } from "zod";
import * as OpenCC from "opencc-js";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON, transcribe as asr } from "@/lib/meta";
import { jobs } from "@/repositories/jobs";
import type { TranscriptTurn } from "@/models/job";
import { PIPE } from "@/lib/config";
import { isEn, withLang } from "@/lib/video/lang";

const Out = z.object({
  turns: z.array(z.object({
    index: z.number().int(),
    names: z.array(z.string()).describe("這句提到的商品名稱（繁體中文，去掉語助詞）"),
    prices: z.array(z.number()).describe("這句提到的價格數字；沒有就空陣列"),
  })),
});

/** stage 5：口述音軌 → turn 級時間戳的文字 → 簡轉繁 → Spark 抽品名與價格 */
const transcribe: StageFn = async ({ job, jobId, log }) => {
  if (!job.video.audioUrl) {
    await jobs.patch(jobId, { transcript: [] });
    return { note: "無音軌，略過" };
  }
  const wav = Buffer.from(await (await fetch(job.video.audioUrl)).arrayBuffer());
  const keywords = job.categories.flatMap((c) => [c.name, c.phrase]);
  const { result, usd } = await asr(wav, { keywords, languageBias: isEn(job) ? ["English", "Chinese"] : ["Chinese", "English"] });
  const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
  const turns = (result.turns?.length ? result.turns : [{ turnId: 1, startMs: 0, endMs: result.audioDurationMs, transcript: result.transcript }])
    .map((t) => ({ startSec: t.startMs / 1000, endSec: t.endMs / 1000, text: toTW(t.transcript ?? "").trim() }))
    .filter((t) => t.text);
  log(`${turns.length} turns, ${result.audioDurationMs}ms`);
  if (!turns.length) {
    await jobs.patch(jobId, { transcript: [] });
    await jobs.addCost(jobId, usd);
    return { note: "沒有聽到語音" };
  }
  const { data, usd: u2 } = await sparkJSON({
    schema: Out,
    name: "speech_entities",
    effort: PIPE.sparkEffort,
    system: withLang("你是電商上架助理。賣家邊拍商品邊口述品名與價格。從逐句轉寫中抽出商品名稱與價格數字。價格可能說成「三百五」「1980」「兩千」，一律換成阿拉伯數字；「一組」「一個」不是價格。", isEn(job)),
    parts: [{ text: `品類：${job.categories.map((c) => c.name).join("、")}。逐句：\n${turns.map((t, i) => `${i}. [${t.startSec.toFixed(1)}s] ${t.text}`).join("\n")}` }],
  });
  const full: TranscriptTurn[] = turns.map((t, i) => {
    const e = data.turns.find((x) => x.index === i);
    return { ...t, names: e?.names ?? [], prices: e?.prices ?? [] };
  });
  await jobs.patch(jobId, { transcript: full });
  await jobs.addCost(jobId, usd + u2);
  return { note: `${full.length} 句，${full.filter((t) => t.prices.length).length} 句有價格` };
};
export default transcribe;
