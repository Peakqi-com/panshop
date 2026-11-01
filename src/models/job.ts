import { z } from "zod";
import { ObjectId } from "mongodb";

import { STAGES, type Stage } from "@/lib/stages";
export { STAGES, AUTO_STAGES, PRODUCE_STAGES, type Stage } from "@/lib/stages";

export const StageStateSchema = z.object({
  status: z.enum(["pending", "running", "done", "failed", "skipped"]).default("pending"),
  startedAt: z.date().optional(),
  finishedAt: z.date().optional(),
  ms: z.number().optional(),
  error: z.string().optional(),
  note: z.string().optional(),
});
export type StageState = z.infer<typeof StageStateSchema>;

export const CategorySchema = z.object({
  name: z.string(),        // 顯示名（中文）
  phrase: z.string(),      // 給 SAM 的英文名詞片語
  estimatedCount: z.number().int().nonnegative().default(0),
});

export const TranscriptTurnSchema = z.object({
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
  names: z.array(z.string()).default([]),
  prices: z.array(z.number()).default([]),
});

export const JobSchema = z.object({
  _id: z.instanceof(ObjectId).optional(),
  code: z.string().min(6),
  status: z.enum(["uploaded", "processing", "review", "producing", "done", "failed"]),
  shopName: z.string().default(""),
  currency: z.string().default("TWD"),
  language: z.string().default("zh-TW"),
  style: z.string().default("lifestyle"),   // 商品圖風格，見 src/lib/config.ts STYLES
  video: z.object({
    originalUrl: z.string().url(),
    fileName: z.string().optional(),
    bytes: z.number().optional(),
    fps4Url: z.string().url().optional(),
    audioUrl: z.string().url().optional(),
    durationSec: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    sourceFps: z.number().optional(),
    procWidth: z.number().optional(),   // fps4 處理版的尺寸（SAM 座標系）
    procHeight: z.number().optional(),
    procFps: z.number().default(4),
  }),
  frames: z.array(z.object({ t: z.number(), url: z.string().url() })).default([]),
  categories: z.array(CategorySchema).default([]),
  transcript: z.array(TranscriptTurnSchema).default([]),
  stages: z.record(z.enum(STAGES), StageStateSchema).default({} as Record<Stage, StageState>),
  metrics: z.object({
    trackCount: z.number().optional(),
    itemCount: z.number().optional(),
    costUsd: z.number().optional(),
    totalMs: z.number().optional(),
    samFrames: z.number().optional(),
  }).default({}),
  catalogCsvUrl: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Job = z.infer<typeof JobSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
