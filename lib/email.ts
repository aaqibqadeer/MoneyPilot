import "server-only";
import { env, features } from "@/lib/env";

/** Sends one email through Resend's REST API. Returns false when email is not configured or sending fails. */
export async function sendEmail(m: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  if (!features.email) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...m }),
    });
    if (!r.ok) console.error("[email] send failed", r.status);
    return r.ok;
  } catch (e) {
    console.error("[email] send failed", (e as Error).message);
    return false;
  }
}
