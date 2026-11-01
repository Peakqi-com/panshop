import { z } from "zod";
import { ObjectId } from "mongodb";

/** 去重後的一件實體商品；確認表的一列 */
export const ItemSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  jobId: z.instanceof(ObjectId),
  code: z.string(),                       // A1、A2 …（品類字母 + 序號）
  status: z.enum(["draft", "confirmed", "deleted"]).default("draft"),
  trackIds: z.array(z.instanceof(ObjectId)),
  category: z.string(),
  primaryCropUrls: z.array(z.string().url()).default([]),
  primaryCutoutUrl: z.string().url().optional(),
  heroUrl: z.string().url().optional(),        // 使用者指定的主圖
  title: z.string().default(""),
  color: z.string().default(""),
  material: z.string().default(""),
  price: z.number().nullable().default(null),
  currency: z.string().default("TWD"),
  description: z.string().default(""),
  attributes: z.record(z.string(), z.string()).default({}),
  googleProductCategory: z.string().default(""),
  sceneHint: z.string().default(""),        // 給情境圖的英文場景提示（identify 產生）
  confidence: z.object({
    title: z.number().default(0),
    price: z.number().default(0),
    overall: z.number().default(0),
  }).default({}),
  sources: z.object({ vision: z.boolean().default(true), speech: z.boolean().default(false) }).default({}),
  speechEvidence: z.string().default(""),  // 對到的口述原句
  userEdited: z.record(z.string(), z.boolean()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Item = z.infer<typeof ItemSchema>;

/** 確認表可改的欄位 */
export const ItemPatchSchema = z.object({
  title: z.string().max(200).optional(),
  color: z.string().max(50).optional(),
  material: z.string().max(50).optional(),
  price: z.number().nonnegative().nullable().optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  status: z.enum(["draft", "confirmed", "deleted"]).optional(),
  heroUrl: z.string().url().optional(),
});
