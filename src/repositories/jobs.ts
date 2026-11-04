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
  async byCodes(codes: string[]) {
    return (await col()).find({ code: { $in: codes } }).sort({ _id: -1 }).toArray();
  },
  async list(limit = 50) {
    return (await col()).find({}).sort({ _id: -1 }).limit(limit).toArray();
  },
  async countFiltered(opts: { status?: string; q?: string } = {}) {
    const f: Record<string, unknown> = {};
    if (opts.status) f.status = opts.status;
    if (opts.q) f.$or = [{ code: opts.q }, { shopName: { $regex: opts.q, $options: "i" } }];
    return (await col()).countDocuments(f);
  },
  async listFiltered(opts: { status?: string; q?: string; limit?: number; skip?: number } = {}) {
    const f: Record<string, unknown> = {};
    if (opts.status) f.status = opts.status;
    if (opts.q) f.$or = [{ code: opts.q }, { shopName: { $regex: opts.q, $options: "i" } }];
    return (await col()).find(f).sort({ _id: -1 }).skip(opts.skip ?? 0).limit(opts.limit ?? 100).toArray();
  },
  async remove(id: string | ObjectId) {
    const db = await getDb();
    const _id = new ObjectId(id);
    await Promise.all([
      db.collection("tracks").deleteMany({ jobId: _id }),
      db.collection("items").deleteMany({ jobId: _id }),
      db.collection("assets").deleteMany({ jobId: _id }),
      db.collection("comments").deleteMany({ jobId: _id }),
    ]);
    await (await col()).deleteOne({ _id });
  },
  /** 後台儀表板用的彙總 */
  async stats() {
    const c = await col();
    const since = new Date(Date.now() - 14 * 86400_000);
    const [byStatus, totals, byDay, failures] = await Promise.all([
      c.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
      c.aggregate<{ _id: null; jobs: number; items: number; cost: number; seconds: number }>([
        { $group: { _id: null, jobs: { $sum: 1 }, items: { $sum: { $ifNull: ["$metrics.itemCount", 0] } }, cost: { $sum: { $ifNull: ["$metrics.costUsd", 0] } }, seconds: { $sum: { $ifNull: ["$video.durationSec", 0] } } } },
      ]).toArray(),
      c.aggregate<{ _id: string; jobs: number; cost: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%m-%d", date: "$createdAt", timezone: "Asia/Taipei" } }, jobs: { $sum: 1 }, cost: { $sum: { $ifNull: ["$metrics.costUsd", 0] } } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      c.find({ status: "failed" }).sort({ _id: -1 }).limit(8).toArray(),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])) as Record<string, number>,
      totals: totals[0] ?? { jobs: 0, items: 0, cost: 0, seconds: 0 },
      byDay, failures,
    };
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
