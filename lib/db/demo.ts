import "server-only";
import { collection } from "./client";
import { repos } from "./repos";
import type { User } from "./schemas";

export const DEMO_USER_ID = "demo-user";

let seeding: Promise<User> | null = null;

/** Demo mode only (no MONGODB_URI): one user with ~3 months of sample data, kept in memory. */
export function ensureDemoUser(): Promise<User> {
  return (seeding ??= seed().catch((e) => {
    seeding = null;
    throw e;
  }));
}

/** Deterministic pseudo-random so the demo looks the same every run. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const MERCHANTS: [string, string, number, number][] = [
  // name, category, min cents, max cents
  ["Whole Foods", "FOOD_AND_DRINK", 2500, 14000],
  ["Trader Joe's", "FOOD_AND_DRINK", 1800, 9000],
  ["Chipotle", "FOOD_AND_DRINK", 1100, 2600],
  ["Starbucks", "FOOD_AND_DRINK", 450, 1400],
  ["Olive Garden", "FOOD_AND_DRINK", 3800, 9500],
  ["Uber", "TRANSPORTATION", 900, 4200],
  ["Shell", "TRANSPORTATION", 3500, 6500],
  ["Amazon", "GENERAL_MERCHANDISE", 1200, 18000],
  ["Target", "GENERAL_MERCHANDISE", 1500, 12000],
  ["Netflix", "ENTERTAINMENT", 1549, 1549],
  ["Spotify", "ENTERTAINMENT", 1199, 1199],
  ["CVS Pharmacy", "MEDICAL", 800, 4500],
  ["Planet Fitness", "PERSONAL_CARE", 2499, 2499],
];

async function seed(): Promise<User> {
  const users = collection("users");
  const existing = await users.findOne({ _id: DEMO_USER_ID });
  if (existing) return existing;

  const now = new Date();
  const user: User = {
    _id: DEMO_USER_ID,
    name: "Demo user",
    currency: "USD",
    timezone: "America/New_York",
    theme: "calm",
    mode: "light",
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  const db = repos(DEMO_USER_ID);

  const item = await db.items.insert({
    provider: "plaid",
    providerItemId: "demo-item",
    accessTokenEnc: "demo",
    institutionName: "Demo Bank",
    status: "ok",
    lastSyncedAt: now,
  });
  const [checking, savings, card] = await db.accounts.insertMany([
    { itemId: item._id, providerAccountId: "demo-chk", name: "Everyday Checking", mask: "0001", type: "depository", subtype: "checking", currentCents: 482315, availableCents: 476015, currency: "USD" },
    { itemId: item._id, providerAccountId: "demo-sav", name: "High-Yield Savings", mask: "0002", type: "depository", subtype: "savings", currentCents: 1250000, availableCents: 1250000, currency: "USD" },
    { itemId: item._id, providerAccountId: "demo-cc", name: "Rewards Card", mask: "4242", type: "credit", subtype: "credit card", currentCents: 184377, availableCents: 815623, limitCents: 1000000, currency: "USD" },
  ]);

  const tags = await db.tags.insertMany([
    { name: "Groceries", color: "#16a34a" },
    { name: "Restaurants", color: "#ea580c" },
    { name: "Transport", color: "#2563eb" },
    { name: "Shopping", color: "#9333ea" },
    { name: "Subscriptions", color: "#0891b2" },
    { name: "Health", color: "#dc2626" },
    { name: "Income", color: "#059669" },
  ]);
  const tagFor: Record<string, string> = {
    "Whole Foods": tags[0]._id, "Trader Joe's": tags[0]._id,
    Chipotle: tags[1]._id, Starbucks: tags[1]._id, "Olive Garden": tags[1]._id,
    Uber: tags[2]._id, Shell: tags[2]._id,
    Amazon: tags[3]._id, Target: tags[3]._id,
    Netflix: tags[4]._id, Spotify: tags[4]._id, "Planet Fitness": tags[4]._id,
    "CVS Pharmacy": tags[5]._id,
  };

  const rand = rng(42);
  const txns: Parameters<typeof db.transactions.insertMany>[0] = [];
  for (let d = 95; d >= 0; d--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 12);
    const count = Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const [name, category, min, max] = MERCHANTS[Math.floor(rand() * MERCHANTS.length)];
      const amount = Math.round(min + rand() * (max - min));
      txns.push({
        source: "plaid", accountId: rand() < 0.75 ? card._id : checking._id,
        providerTransactionId: `demo-${d}-${i}`, date: day, amountCents: amount, currency: "USD",
        name: name.toUpperCase(), merchant: name, category, tagIds: tagFor[name] ? [tagFor[name]] : [], pending: d < 2,
      });
    }
    if (day.getDate() === 1 || day.getDate() === 15) {
      txns.push({ source: "plaid", accountId: checking._id, providerTransactionId: `demo-pay-${d}`, date: day, amountCents: -310000, currency: "USD", name: "ACME CORP PAYROLL", merchant: "Acme Corp", category: "INCOME", tagIds: [tags[6]._id], pending: false });
    }
    if (day.getDate() === 9) {
      txns.push({ source: "plaid", accountId: card._id, providerTransactionId: `demo-hulu-${d}`, date: day, amountCents: 1799, currency: "USD", name: "HULU 877-8244858", merchant: "Hulu", category: "ENTERTAINMENT", tagIds: [tags[4]._id], pending: false });
    }
    if (day.getDate() === 18) {
      txns.push({ source: "plaid", accountId: checking._id, providerTransactionId: `demo-net-${d}`, date: day, amountCents: 7999, currency: "USD", name: "COMCAST XFINITY", merchant: "Comcast", category: "RENT_AND_UTILITIES", tagIds: [], pending: false });
    }
    if (day.getDate() === 20) {
      txns.push({ source: "plaid", accountId: checking._id, providerTransactionId: `demo-venmo-${d}`, date: day, amountCents: 4500, currency: "USD", name: "VENMO PAYMENT 1043", merchant: "Venmo", category: "TRANSFER_OUT", tagIds: [], pending: false });
    }
    if (day.getDate() === 5) {
      txns.push({ source: "plaid", accountId: checking._id, providerTransactionId: `demo-rh-${d}`, date: day, amountCents: 20000, currency: "USD", name: "ROBINHOOD DEBITS", merchant: "Robinhood", category: "TRANSFER_OUT", tagIds: [], pending: false });
    }
    if (day.getDate() === 3) {
      txns.push({ source: "plaid", accountId: checking._id, providerTransactionId: `demo-rent-${d}`, date: day, amountCents: 185000, currency: "USD", name: "OAKWOOD APARTMENTS RENT", merchant: "Oakwood Apartments", category: "RENT_AND_UTILITIES", tagIds: [], pending: false });
    }
  }
  await db.transactions.insertMany(txns);

  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 12);
  await db.liabilities.insert({ accountId: card._id, kind: "credit", lastStatementBalanceCents: 162040, minimumPaymentCents: 3500, nextPaymentDueDate: due, aprPercent: 24.99 });
  await db.bills.insertMany([
    { name: "Rewards Card payment", amountCents: 162040, dueDate: due, source: "liability", accountId: card._id, status: "upcoming", recurrence: "monthly" },
    { name: "Oakwood Apartments", amountCents: 185000, dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 3), source: "manual", status: "upcoming", recurrence: "monthly" },
  ]);
  void savings;
  return user;
}
