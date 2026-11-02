import { MongoClient } from "mongodb";
import { INDEXES } from "../lib/db/indexes";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("MONGODB_URI not set; nothing to index (demo mode uses memory).");
    return;
  }
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10000 }).connect();
  const db = client.db(process.env.MONGODB_DB || "moneypilot");
  for (const [name, specs] of Object.entries(INDEXES)) {
    if (!specs?.length) continue;
    const names = await db.collection(name).createIndexes(specs);
    console.log(`${name}: ${names.join(", ")}`);
  }
  await client.close();
}

// --soft (used by the Vercel build): report but never fail the deploy.
const soft = process.argv.includes("--soft");
main().catch((e) => {
  console.error(soft ? `db:indexes skipped: ${e instanceof Error ? e.message : e}` : e);
  process.exit(soft ? 0 : 1);
});
