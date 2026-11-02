import { aggregate, find, update as applyUpdate, Query } from "mingo";
import type { Coll, Filter, FindOpts, Sort, Update, UpdateResult } from "./collection";

type AnyDoc = { _id: string } & Record<string, unknown>;
type Store = Map<string, AnyDoc[]>;

const g = globalThis as unknown as { __mpMemStore?: Store };
export const memStore: Store = (g.__mpMemStore ??= new Map());

function rows(name: string): AnyDoc[] {
  let r = memStore.get(name);
  if (!r) memStore.set(name, (r = []));
  return r;
}

const clone = <T>(v: T): T => structuredClone(v);
const opts = { collectionResolver: (n: string) => rows(n) };

/** Equality fields of a filter, used to seed upserted documents. */
function equalityFields(filter: Filter) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith("$")) continue;
    if (v === null || typeof v !== "object" || v instanceof Date || Array.isArray(v)) out[k] = v;
  }
  return out;
}

function modify(doc: AnyDoc, u: Update) {
  const { $setOnInsert: _ignored, ...rest } = u;
  void _ignored;
  if (Object.keys(rest).length) applyUpdate(doc, rest as never);
}

export class MemoryColl<T extends { _id: string }> implements Coll<T> {
  constructor(readonly name: string) {}

  async find(filter: Filter, o: FindOpts = {}): Promise<T[]> {
    let c = find(rows(this.name), filter as never, o.projection as never, opts);
    if (o.sort) c = c.sort(o.sort as never);
    if (o.skip) c = c.skip(o.skip);
    if (o.limit) c = c.limit(o.limit);
    return clone(c.all()) as unknown as T[];
  }

  async findOne(filter: Filter, o: { sort?: Sort } = {}) {
    return (await this.find(filter, { ...o, limit: 1 }))[0] ?? null;
  }

  async insertOne(doc: T) {
    const r = rows(this.name);
    if (r.some((d) => d._id === doc._id)) throw new Error(`duplicate _id in ${this.name}`);
    r.push(clone(doc) as unknown as AnyDoc);
  }

  async insertMany(docs: T[]) {
    for (const d of docs) await this.insertOne(d);
  }

  private matches(filter: Filter) {
    const q = new Query(filter as never, opts);
    return rows(this.name).filter((d) => q.test(d));
  }

  async updateOne(filter: Filter, u: Update, o: { upsert?: boolean } = {}): Promise<UpdateResult> {
    const doc = this.matches(filter)[0];
    if (doc) {
      modify(doc, u);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    if (!o.upsert) return { matchedCount: 0, modifiedCount: 0 };
    const created = { ...equalityFields(filter), ...(u.$setOnInsert ?? {}) } as AnyDoc;
    created._id ??= crypto.randomUUID();
    modify(created, u);
    rows(this.name).push(created);
    return { matchedCount: 0, modifiedCount: 0, upsertedId: created._id };
  }

  async updateMany(filter: Filter, u: Update): Promise<UpdateResult> {
    const docs = this.matches(filter);
    docs.forEach((d) => modify(d, u));
    return { matchedCount: docs.length, modifiedCount: docs.length };
  }

  async deleteOne(filter: Filter) {
    const doc = this.matches(filter)[0];
    if (!doc) return 0;
    const r = rows(this.name);
    r.splice(r.indexOf(doc), 1);
    return 1;
  }

  async deleteMany(filter: Filter) {
    const hit = new Set(this.matches(filter));
    const r = rows(this.name);
    memStore.set(
      this.name,
      r.filter((d) => !hit.has(d)),
    );
    return hit.size;
  }

  async countDocuments(filter: Filter) {
    return this.matches(filter).length;
  }

  async aggregate<R>(pipeline: Record<string, unknown>[]): Promise<R[]> {
    return clone(aggregate(rows(this.name), pipeline as never, opts)) as R[];
  }
}
