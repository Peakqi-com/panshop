import { z } from "zod";
import type { StageFn } from "@/lib/pipeline";
import { sparkJSON } from "@/lib/meta";
import { jobs } from "@/repositories/jobs";
import { PIPE } from "@/lib/config";

const Out = z.object({
  categories: z.array(z.object({
    name: z.string().describe("繁體中文品類名，例如 馬克杯"),
    phrase: z.string().describe("給分割模型的英文名詞片語，單數、不含形容詞與顏色，例如 mug"),
    estimatedCount: z.number().int().describe("整段影片中這個品類大約有幾件不同的商品"),
  })),
});

/** stage 2：看總覽影格，列出畫面中的商品品類（SAM 一次只吃一個名詞片語，所以先分品類） */
const discover: StageFn = async ({ job, jobId, log }) => {
  if (!job.frames.length) throw new Error("沒有總覽影格");
  const { data, usd } = await sparkJSON({
    schema: Out,
    name: "categories",
    effort: PIPE.sparkEffort,
    system: "你是電商上架助理。使用者對著桌上或架上的商品拍影片，你要列出影片裡『要賣的商品』的品類，供後續逐品類分割。",
    parts: [
      { text: `這是同一段影片均勻取出的 ${job.frames.length} 張影格。請列出畫面中要賣的商品品類，最多 ${PIPE.maxCategories} 類；忽略桌面、背景、手、手機、包裝紙等非商品。phrase 要是分割模型容易理解的通用英文名詞（例如 mug、book、handbag、sneaker、bottle），同一品類只列一次。` },
      ...job.frames.map((f) => ({ imageUrl: f.url })),
    ],
  });
  const cats = data.categories.slice(0, PIPE.maxCategories).map((c) => ({ ...c, phrase: c.phrase.toLowerCase().trim(), estimatedCount: Math.max(0, c.estimatedCount) }));
  if (!cats.length) throw new Error("沒有辨識到任何商品品類");
  await jobs.patch(jobId, { categories: cats });
  await jobs.addCost(jobId, usd);
  log(cats.map((c) => `${c.name}(${c.phrase})≈${c.estimatedCount}`).join(", "));
  return { note: cats.map((c) => `${c.name}≈${c.estimatedCount}`).join("、") };
};
export default discover;
