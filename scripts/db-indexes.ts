import { MongoClient } from "mongodb";
import { INDEXES } from "../lib/db/indexes";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("MONGODB_URI not set; nothing to index (demo mode uses memory).");
    return;
  }
  const client = await new MongoClient(uri).connect();
  const db = client.db(process.env.MONGODB_DB || "moneypilot");
  for (const [name, specs] of Object.entries(INDEXES)) {
    if (!specs?.length) continue;
    const names = await db.collection(name).createIndexes(specs);
    console.log(`${name}: ${names.join(", ")}`);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
