import { z } from "zod";
import { ObjectId } from "mongodb";

/** 留言對商品：規則解析的下單（A3+1）或 Muse Spark Open 判斷的提問 */
export const CommentSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  jobId: z.instanceof(ObjectId),
  text: z.string(),
  intent: z.string(),
  itemCode: z.string().nullable(),
  itemId: z.instanceof(ObjectId).nullable(),
  reply: z.string(),
  model: z.string(),
  ms: z.number().optional(),
  buyer: z.string().nullable().optional(),                                   // 「王小美：A3+1」冒號前的名字
  lines: z.array(z.object({ code: z.string(), qty: z.number().int() })).optional(), // 規則解析出的下單品項
  createdAt: z.date(),
});
export type Comment = z.infer<typeof CommentSchema>;
