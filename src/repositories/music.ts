import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { MusicSchema, type Music } from "@/models/music";

const col = async () => (await getDb()).collection<Music>("music");

export const music = {
  async list() { return (await col()).find({}).sort({ _id: -1 }).toArray(); },
  async active() { return (await col()).find({ active: true }).sort({ _id: 1 }).toArray(); },
  async byId(id: string) { return ObjectId.isValid(id) ? (await col()).findOne({ _id: new ObjectId(id) }) : null; },
  async add(input: Omit<Music, "_id" | "createdAt" | "active">) {
    const doc = MusicSchema.parse({ ...input, active: true, createdAt: new Date() });
    await (await col()).insertOne(doc);
  },
  async update(id: string, set: Partial<Pick<Music, "title" | "styles" | "license" | "active">>) {
    await (await col()).updateOne({ _id: new ObjectId(id) }, { $set: set });
  },
  async remove(id: string) { await (await col()).deleteOne({ _id: new ObjectId(id) }); },
};
