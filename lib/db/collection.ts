/**
 * Minimal collection interface used by every repository. Implemented by
 * MongoColl (real MongoDB) and MemoryColl (demo mode, powered by mingo).
 * Keep repositories to this surface so both backends behave the same.
 */
export type Filter = Record<string, unknown>;
export type Update = {
  $set?: Record<string, unknown>;
  $setOnInsert?: Record<string, unknown>;
  $unset?: Record<string, "" | 1 | true>;
  $inc?: Record<string, number>;
  $addToSet?: Record<string, unknown>;
  $pull?: Record<string, unknown>;
  $push?: Record<string, unknown>;
};
export type Sort = Record<string, 1 | -1>;
export interface FindOpts {
  sort?: Sort;
  limit?: number;
  skip?: number;
  projection?: Record<string, 0 | 1>;
}
export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string | null;
}

export interface Coll<T extends { _id: string }> {
  readonly name: string;
  find(filter: Filter, opts?: FindOpts): Promise<T[]>;
  findOne(filter: Filter, opts?: { sort?: Sort }): Promise<T | null>;
  insertOne(doc: T): Promise<void>;
  insertMany(docs: T[]): Promise<void>;
  updateOne(filter: Filter, update: Update, opts?: { upsert?: boolean }): Promise<UpdateResult>;
  updateMany(filter: Filter, update: Update): Promise<UpdateResult>;
  deleteOne(filter: Filter): Promise<number>;
  deleteMany(filter: Filter): Promise<number>;
  countDocuments(filter: Filter): Promise<number>;
  aggregate<R = Record<string, unknown>>(pipeline: Record<string, unknown>[]): Promise<R[]>;
}
