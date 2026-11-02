import "server-only";
import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import { env, features } from "@/lib/env";
import type { Coll, Filter, FindOpts, Sort, Update } from "./collection";
import { MemoryColl } from "./memory";
import type { CollectionName, Doc } from "./schemas";

/** One MongoClient per serverless instance, reused across hot reloads and invocations. */
const g = globalThis as unknown as { __mpMongo?: Promise<MongoClient> };

export function getMongoClient(): Promise<MongoClient> | null {
  if (!env.MONGODB_URI) return null;
  g.__mpMongo ??= new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    appName: "moneypilot",
    ignoreUndefined: true,
  })
    .connect()
    .catch((e) => {
      g.__mpMongo = undefined; // allow retry on next request
      throw e;
    });
  return g.__mpMongo;
}

export async function getDb(): Promise<Db | null> {
  const c = getMongoClient();
  return c ? (await c).db(env.MONGODB_DB) : null;
}

class MongoColl<T extends { _id: string }> implements Coll<T> {
  constructor(
    readonly name: string,
    private c: () => Promise<Collection<Document>>,
  ) {}
  async find(filter: Filter, o: FindOpts = {}) {
    const cur = (await this.c()).find(filter, { projection: o.projection });
    if (o.sort) cur.sort(o.sort);
    if (o.skip) cur.skip(o.skip);
    if (o.limit) cur.limit(o.limit);
    return (await cur.toArray()) as unknown as T[];
  }
  async findOne(filter: Filter, o: { sort?: Sort } = {}) {
    return (await (await this.c()).findOne(filter, { sort: o.sort })) as unknown as T | null;
  }
  async insertOne(doc: T) {
    await (await this.c()).insertOne(doc as unknown as Document);
  }
  async insertMany(docs: T[]) {
    if (docs.length) await (await this.c()).insertMany(docs as unknown as Document[], { ordered: false });
  }
  async updateOne(filter: Filter, u: Update, o: { upsert?: boolean } = {}) {
    const r = await (await this.c()).updateOne(filter, withUpsertId(filter, u, o.upsert), { upsert: o.upsert });
    return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount, upsertedId: r.upsertedId as string | null };
  }
  async updateMany(filter: Filter, u: Update) {
    const r = await (await this.c()).updateMany(filter, u as Document);
    return { matchedCount: r.matchedCount, modifiedCount: r.modifiedCount };
  }
  async bulkUpdate(updates: { filter: Filter; update: Update }[]) {
    if (!updates.length) return 0;
    const r = await (await this.c()).bulkWrite(
      updates.map((x) => ({ updateOne: { filter: x.filter, update: x.update as Document } })),
      { ordered: false },
    );
    return r.matchedCount;
  }
  async deleteOne(filter: Filter) {
    return (await (await this.c()).deleteOne(filter)).deletedCount;
  }
  async deleteMany(filter: Filter) {
    return (await (await this.c()).deleteMany(filter)).deletedCount;
  }
  async countDocuments(filter: Filter) {
    return (await this.c()).countDocuments(filter);
  }
  async aggregate<R>(pipeline: Record<string, unknown>[]) {
    return (await (await this.c()).aggregate(pipeline, { maxTimeMS: 15000 }).toArray()) as R[];
  }
}

/**
 * Upserts must create string ids, never ObjectIds. When the filter already pins
 * `_id`, Mongo uses it for the new doc, and adding another `_id` to
 * `$setOnInsert` fails with "would modify the immutable field '_id'".
 */
export function withUpsertId(filter: Filter, u: Update, upsert?: boolean): Document {
  if (!upsert || typeof filter._id === "string") return u as Document;
  return { ...u, $setOnInsert: { _id: crypto.randomUUID(), ...(u.$setOnInsert ?? {}) } };
}

const cache = new Map<string, Coll<{ _id: string }>>();

/**
 * Raw collection access. Only repositories (lib/db/repos.ts) and auth plumbing
 * should call this; app code must go through userId-scoped repos.
 */
export function collection<C extends CollectionName>(name: C): Coll<Doc<C>> {
  let c = cache.get(name);
  if (!c) {
    c = features.db
      ? new MongoColl(name, async () => (await getDb())!.collection(name))
      : new MemoryColl(name);
    cache.set(name, c);
  }
  return c as unknown as Coll<Doc<C>>;
}

export const newId = () => crypto.randomUUID();
