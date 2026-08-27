import mongoose from "mongoose";

import { getServerEnvironment } from "@/config/env";

type MongoCache = { connection: typeof mongoose | null; pending: Promise<typeof mongoose> | null };

const globalMongo = globalThis as typeof globalThis & { __zmzaiWorkosMongo?: MongoCache };
const cache = globalMongo.__zmzaiWorkosMongo ?? { connection: null, pending: null };
globalMongo.__zmzaiWorkosMongo = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  const environment = getServerEnvironment();
  if (!environment) throw new Error("[workos] env 未配置（MONGODB_URI 缺失），无法连接数据库");
  if (cache.connection) return cache.connection;
  cache.pending ??= mongoose.connect(environment.MONGODB_URI, { serverSelectionTimeoutMS: 8_000 });
  try {
    cache.connection = await cache.pending;
    return cache.connection;
  } finally {
    cache.pending = null;
  }
}
