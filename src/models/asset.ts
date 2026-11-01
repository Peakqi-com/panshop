import { z } from "zod";
import { ObjectId } from "mongodb";

export const AssetSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  itemId: z.instanceof(ObjectId),
  jobId: z.instanceof(ObjectId),
  cutoutUrl: z.string().url().optional(),     // SAM 遮罩合成白底（必有）
  studioUrl: z.string().url().optional(),     // Muse Image 棚拍白底
  lifestyleUrl: z.string().url().optional(),  // Muse Image 情境圖
  coverUrl: z.string().url().optional(),      // Reels 封面
  reelUrl: z.string().url().optional(),
  reelDurationSec: z.number().optional(),
  caption: z.string().default(""),
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
