import { z } from "zod";
import { ObjectId } from "mongodb";

/** Demo 用：留言對商品 */
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
  createdAt: z.date(),
});
export type Comment = z.infer<typeof CommentSchema>;
