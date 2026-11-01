import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { CommentSchema, type Comment } from "@/models/comment";

const col = async () => (await getDb()).collection<Comment>("comments");

export const comments = {
  async create(input: Omit<Comment, "_id" | "createdAt">) {
    const doc = CommentSchema.parse({ ...input, createdAt: new Date() });
    const r = await (await col()).insertOne(doc);
    return { ...doc, _id: r.insertedId };
  },
  async forJob(jobId: ObjectId, limit = 20) {
    return (await col()).find({ jobId }).sort({ _id: -1 }).limit(limit).toArray();
  },
};
