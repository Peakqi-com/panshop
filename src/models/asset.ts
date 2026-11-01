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
  voiceover: z.string().default(""),
  status: z.enum(["pending", "done", "failed"]).default("pending"),
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Asset = z.infer<typeof AssetSchema>;
