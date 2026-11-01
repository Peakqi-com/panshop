import { z } from "zod";
import { ObjectId } from "mongodb";

/** 音樂曲庫：後台上傳，短片依風格挑；styles 空陣列＝所有風格都可用 */
export const MusicSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  title: z.string().min(1).max(80),
  url: z.string().url(),
  durationSec: z.number().min(1).max(1800),
  styles: z.array(z.string()).default([]),
  license: z.string().max(200).default(""),   // 來源與授權，示範與公開前要能查
  active: z.boolean().default(true),
  createdAt: z.date(),
});
export type Music = z.infer<typeof MusicSchema>;
