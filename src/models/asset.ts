import { z } from "zod";
import { ObjectId } from "mongodb";

export const AssetSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  itemId: z.instanceof(ObjectId),
  jobId: z.instanceof(ObjectId),
  cutoutUrl: z.string().url().optional(),     // SAM 遮罩去背（確認表與後台用，不進商品卡）
  shots: z.array(z.object({ kind: z.string(), label: z.string(), url: z.string().url(), qa: z.string().optional() })).default([]),  // 多角度商品圖：front、threeQuarter、side、lifestyle
  brief: z.object({                                   // 視覺簡報（Spark 依裁圖寫，生圖與短片共用）
    subject: z.string(), materialNotes: z.string(), scene: z.string(), props: z.string(), lighting: z.string(), palette: z.string(),
    shots: z.array(z.object({ kind: z.string(), camera: z.string(), scene: z.string() })),
  }).optional(),
  studioUrl: z.string().url().optional(),     // Muse Image 棚拍白底
  lifestyleUrl: z.string().url().optional(),  // Muse Image 情境圖
  coverUrl: z.string().url().optional(),      // Reels 封面
  reelUrl: z.string().url().optional(),
  reelDurationSec: z.number().optional(),
  caption: z.string().default(""),            // 貼文（3 到 4 行）
  captionShort: z.string().default(""),       // 限動一句
  captionLong: z.string().default(""),        // 商品頁完整介紹
  hook: z.string().default(""),               // 短片開頭一句
  sellingPoints: z.array(z.string()).default([]),  // 三個賣點，短片賣點卡用
  voiceover: z.string().default(""),
  history: z.array(z.object({ kind: z.string(), url: z.string(), at: z.date() })).default([]),  // 重做前的舊圖
  status: z.enum(["pending", "done", "failed"]).default("pending"),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Asset = z.infer<typeof AssetSchema>;
