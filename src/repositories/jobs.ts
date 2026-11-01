import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { JobSchema, type Job, type Stage, type StageState } from "@/models/job";

const col = async () => (await getDb()).collection<Job>("jobs");

export const jobs = {
  async create(input: Omit<Job, "_id" | "createdAt" | "updatedAt">) {
    const now = new Date();
    const doc = JobSchema.parse({ ...input, createdAt: now, updatedAt: now });
    const r = await (await col()).insertOne(doc);
    return { ...doc, _id: r.insertedId };
  },
  async byId(id: string | ObjectId) {
    return (await col()).findOne({ _id: new ObjectId(id) });
  },
  async byCode(code: string) {
    return (await col()).findOne({ code });
  },
  async list(limit = 50) {
    return (await col()).find({}).sort({ _id: -1 }).limit(limit).toArray();
  },
  async patch(id: string | ObjectId, set: Record<string, unknown>) {
    await (await col()).updateOne({ _id: new ObjectId(id) }, { $set: { ...set, updatedAt: new Date() } });
  },
  async setStage(id: string | ObjectId, stage: Stage, state: Partial<StageState>) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(state)) set[`stages.${stage}.${k}`] = v;
    await (await col()).updateOne({ _id: new ObjectId(id) }, { $set: set });
  },
  async addCost(id: string | ObjectId, usd: number) {
    await (await col()).updateOne({ _id: new ObjectId(id) }, { $inc: { "metrics.costUsd": usd } });
  },
};
