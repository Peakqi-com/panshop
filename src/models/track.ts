import { z } from "zod";
import { ObjectId } from "mongodb";

export const BoxSchema = z.object({
  t: z.number(),            // 秒
  frame: z.number().int(),  // 4 fps 影片中的影格索引
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
  w: z.number(), h: z.number(),      // 來源影格尺寸
  conf: z.number().optional(),
});
export type Box = z.infer<typeof BoxSchema>;

/** SAM 一條穩定物件 ID 的軌跡；一個品類一次請求，物件出鏡再入鏡可能換 ID */
export const TrackSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  jobId: z.instanceof(ObjectId),
  category: z.string(),          // 目前品類（dedup 驗證後可能改）
  samCategory: z.string().optional(),  // SAM 當初用哪個品類片語抓到的，重跑時從這個重新驗證
  samObjectId: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  boxes: z.array(BoxSchema),
  crops: z.array(z.object({ t: z.number(), url: z.string().url() })).default([]),
  cutouts: z.array(z.object({ t: z.number(), url: z.string().url() })).default([]),
  bestT: z.number().optional(),
  meanConf: z.number().optional(),
  meanArea: z.number().optional(),   // 框面積占畫面比例
  createdAt: z.date(),
});
export type Track = z.infer<typeof TrackSchema>;
