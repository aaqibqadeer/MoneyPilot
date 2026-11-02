/**
 * Guard for the chat's runAnalyticsQuery tool. Pure (no I/O) so it is unit tested.
 * - collection allowlist (no auth/secret collections)
 * - stage allowlist; dangerous operators rejected anywhere in the tree
 * - forced `{ $match: { userId } }` first, and inside every $lookup / $facet branch
 * - ISO date strings converted to Date, result size capped
 */
export const ANALYTICS_COLLECTIONS = ["transactions", "accounts", "liabilities", "bills", "tags", "tagRules", "claims"] as const;
export type AnalyticsCollection = (typeof ANALYTICS_COLLECTIONS)[number];

const ALLOWED_STAGES = new Set([
  "$match", "$group", "$sort", "$limit", "$skip", "$project", "$addFields", "$set", "$unset", "$unwind",
  "$count", "$bucket", "$bucketAuto", "$sortByCount", "$facet", "$lookup", "$replaceRoot", "$replaceWith", "$densify", "$fill",
]);

const FORBIDDEN_KEYS = new Set([
  "$where", "$function", "$accumulator", "$out", "$merge", "$unionWith", "$graphLookup", "$collStats",
  "$indexStats", "$currentOp", "$listSessions", "$planCacheStats", "$documents", "$changeStream", "$searchMeta", "$search",
]);

/** Fields never exposed to the model. */
const HIDDEN_FIELDS = ["raw", "accessTokenEnc"];

export const MAX_RESULTS = 200;
const MAX_DEPTH = 20;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class AnalyticsQueryError extends Error {}

type Stage = Record<string, unknown>;

function scanValue(v: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new AnalyticsQueryError("Pipeline is nested too deeply");
  if (typeof v === "string") return ISO_DATE.test(v) ? new Date(v) : v;
  if (Array.isArray(v)) return v.map((x) => scanValue(x, depth + 1));
  if (v && typeof v === "object") {
    if (v instanceof Date) return v;
    const o = v as Record<string, unknown>;
    if (Object.keys(o).length === 1 && typeof o.$date === "string") return new Date(o.$date);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) {
      if (FORBIDDEN_KEYS.has(k)) throw new AnalyticsQueryError(`Operator ${k} is not allowed`);
      out[k] = scanValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

function isAllowedCollection(c: unknown): c is AnalyticsCollection {
  return typeof c === "string" && (ANALYTICS_COLLECTIONS as readonly string[]).includes(c);
}

function scopeStages(stages: unknown, userId: string, depth: number): Stage[] {
  if (!Array.isArray(stages)) throw new AnalyticsQueryError("Pipeline must be an array of stages");
  if (stages.length > 30) throw new AnalyticsQueryError("Pipeline has too many stages");
  return stages.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AnalyticsQueryError("Each stage must be an object");
    const keys = Object.keys(raw);
    if (keys.length !== 1) throw new AnalyticsQueryError("Each stage must have exactly one operator");
    const op = keys[0];
    if (!ALLOWED_STAGES.has(op)) throw new AnalyticsQueryError(`Stage ${op} is not allowed`);
    const body = (raw as Stage)[op];

    if (op === "$lookup") {
      const l = body as Record<string, unknown>;
      if (!isAllowedCollection(l.from)) throw new AnalyticsQueryError(`$lookup from ${String(l.from)} is not allowed`);
      const inner = l.pipeline === undefined ? [] : scopeStages(l.pipeline, userId, depth + 1);
      return {
        $lookup: {
          ...(scanValue(l, depth) as Record<string, unknown>),
          pipeline: [{ $match: { userId } }, ...hide(l.from), ...inner],
        },
      };
    }
    if (op === "$facet") {
      const f = body as Record<string, unknown>;
      if (!f || typeof f !== "object") throw new AnalyticsQueryError("$facet must be an object");
      return { $facet: Object.fromEntries(Object.entries(f).map(([k, p]) => [k, scopeStages(p, userId, depth + 1)])) };
    }
    return { [op]: scanValue(body, depth) };
  });
}

const hide = (collection: string): Stage[] =>
  collection === "transactions" || collection === "liabilities" ? [{ $unset: HIDDEN_FIELDS }] : [];

/** Returns a safe pipeline that can only see `userId`'s documents in `collection`. */
export function buildScopedPipeline(collection: unknown, pipeline: unknown, userId: string): Stage[] {
  if (!userId) throw new AnalyticsQueryError("Missing user scope");
  if (!isAllowedCollection(collection)) {
    throw new AnalyticsQueryError(`Collection must be one of: ${ANALYTICS_COLLECTIONS.join(", ")}`);
  }
  const body = scopeStages(pipeline, userId, 0);
  return [{ $match: { userId } }, ...hide(collection), ...body, { $limit: MAX_RESULTS }];
}
