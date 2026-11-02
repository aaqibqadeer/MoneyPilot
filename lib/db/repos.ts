import "server-only";
import { collection, newId } from "./client";
import type { Filter, FindOpts, Sort, Update } from "./collection";
import { USER_SCOPED, type CollectionName, type Doc } from "./schemas";

type Scoped = (typeof USER_SCOPED)[number];
type NewDoc<C extends CollectionName> = Omit<Doc<C>, "_id" | "userId" | "createdAt" | "updatedAt"> & {
  _id?: string;
  createdAt?: Date;
};

/**
 * Repository bound to one user. Every read, write and aggregation is forced
 * to `userId`, so callers cannot reach another user's data.
 */
export function scopedRepo<C extends Scoped>(name: C, userId: string) {
  if (!userId || typeof userId !== "string") throw new Error("scopedRepo requires userId");
  if (!USER_SCOPED.includes(name)) throw new Error(`${name} is not user-scoped`);
  const c = collection(name);
  const f = (filter: Filter = {}): Filter => ({ ...filter, userId });
  const noUserChange = (u: Update): Update => {
    for (const op of Object.values(u)) if (op && "userId" in op) throw new Error("userId is immutable");
    return { ...u, $set: { ...(u.$set ?? {}), updatedAt: new Date() } };
  };

  return {
    find: (filter?: Filter, o?: FindOpts) => c.find(f(filter), o),
    findOne: (filter?: Filter, o?: { sort?: Sort }) => c.findOne(f(filter), o),
    byId: (id: string) => c.findOne(f({ _id: id })),
    count: (filter?: Filter) => c.countDocuments(f(filter)),
    async insert(doc: NewDoc<C>): Promise<Doc<C>> {
      const now = new Date();
      const full = { createdAt: now, updatedAt: now, ...doc, _id: doc._id ?? newId(), userId } as unknown as Doc<C>;
      await c.insertOne(full);
      return full;
    },
    async insertMany(docs: NewDoc<C>[]) {
      const now = new Date();
      const full = docs.map((d) => ({ createdAt: now, updatedAt: now, ...d, _id: d._id ?? newId(), userId })) as unknown as Doc<C>[];
      await c.insertMany(full);
      return full;
    },
    updateOne: async (filter: Filter, u: Update, o?: { upsert?: boolean }) =>
      c.updateOne(f(filter), o?.upsert ? withInsertDefaults(noUserChange(u), userId) : noUserChange(u), o),
    updateMany: async (filter: Filter, u: Update) => c.updateMany(f(filter), noUserChange(u)),
    bulkUpdate: async (updates: { filter: Filter; update: Update }[]) =>
      c.bulkUpdate(updates.map((x) => ({ filter: f(x.filter), update: noUserChange(x.update) }))),
    deleteOne: (filter: Filter) => c.deleteOne(f(filter)),
    deleteMany: (filter: Filter) => c.deleteMany(f(filter)),
    /** Pipeline always starts with a userId $match. */
    aggregate: <R = Record<string, unknown>>(pipeline: Record<string, unknown>[]) =>
      c.aggregate<R>([{ $match: { userId } }, ...pipeline]),
  };
}

function withInsertDefaults(u: Update, userId: string): Update {
  return { ...u, $setOnInsert: { createdAt: new Date(), ...(u.$setOnInsert ?? {}), userId } };
}

export type ScopedRepo<C extends Scoped> = ReturnType<typeof scopedRepo<C>>;

/** All repositories for one user: `const db = repos(userId); await db.transactions.find()`. */
export function repos(userId: string) {
  const r = <C extends Scoped>(n: C) => scopedRepo(n, userId);
  return {
    passkeys: r("passkeys"),
    sessions: r("sessions"),
    recoveryCodes: r("recoveryCodes"),
    magicLinks: r("magicLinks"),
    items: r("items"),
    accounts: r("accounts"),
    transactions: r("transactions"),
    liabilities: r("liabilities"),
    bills: r("bills"),
    tags: r("tags"),
    tagRules: r("tagRules"),
    claims: r("claims"),
    documents: r("documents"),
    chatSessions: r("chatSessions"),
    chatMessages: r("chatMessages"),
    changeSets: r("changeSets"),
    auditLog: r("auditLog"),
  };
}
export type Repos = ReturnType<typeof repos>;
