import "server-only";
import { z } from "zod";

/** Empty strings count as unset so `.env` placeholders never break the app. */
const opt = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: opt(),
  MONGODB_URI: opt(),
  MONGODB_DB: z.string().default("moneypilot"),
  ENCRYPTION_KEY: opt(),
  ALLOW_SIGNUP: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  WEBAUTHN_RP_ID: opt(),
  WEBAUTHN_RP_NAME: z.string().default("MoneyPilot"),
  RESEND_API_KEY: opt(),
  EMAIL_FROM: opt(),
  PLAID_CLIENT_ID: opt(),
  PLAID_SECRET: opt(),
  PLAID_ENV: z.enum(["sandbox", "production"]).catch("sandbox").default("sandbox"),
  PLAID_WEBHOOK_URL: opt(),
  CRON_SECRET: opt(),
  DEEPSEEK_API_KEY: opt(),
  LLM_MODEL: z.string().default("deepseek-flash"),
  LLM_VISION_MODEL: opt(),
  BLOB_READ_WRITE_TOKEN: opt(),
  DEFAULT_CURRENCY: z.string().default("USD"),
  DEFAULT_TIMEZONE: z.string().default("America/New_York"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.warn("[env] invalid values ignored:", z.prettifyError(parsed.error));
}

/** Never throws: invalid or missing values fall back to defaults. */
export const env: Env = parsed.success ? parsed.data : schema.parse({});

/** What is configured. Features check these and degrade gracefully. */
export const features = {
  db: !!env.MONGODB_URI,
  plaidKeys: !!(env.PLAID_CLIENT_ID && env.PLAID_SECRET),
  /** Plaid access tokens are encrypted at rest; production refuses the dev-only fallback key. */
  encryption: !!env.ENCRYPTION_KEY || process.env.NODE_ENV !== "production",
  plaid: !!(env.PLAID_CLIENT_ID && env.PLAID_SECRET) && (!!env.ENCRYPTION_KEY || process.env.NODE_ENV !== "production"),
  llm: !!env.DEEPSEEK_API_KEY,
  email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
  blob: !!env.BLOB_READ_WRITE_TOKEN,
  vision: !!(env.DEEPSEEK_API_KEY && env.LLM_VISION_MODEL),
  cron: !!env.CRON_SECRET,
  /** No database → single demo user with in-memory seeded data, auth bypassed. */
  demo: !env.MONGODB_URI,
} as const;
