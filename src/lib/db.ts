import { MongoClient, type Db } from "mongodb";

function env() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DATABASE_NAME;
  if (!uri || !dbName) throw new Error("MONGODB_URI / DATABASE_NAME 未設定，請看 .env.example");
  return { uri, dbName };
}

declare global {
  var __mongo: { promise?: Promise<MongoClient> } | undefined;
}
const g = globalThis.__mongo ?? (globalThis.__mongo = {});

/** 取得資料庫；連線 promise 掛在 globalThis，serverless 與熱重載共用 */
export async function getDb(): Promise<Db> {
  const { uri, dbName } = env();
  if (!g.promise) {
    g.promise = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 }).connect();
  }
  const client = await g.promise;
  return client.db(dbName);
}
