"use server";

import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { collection } from "@/lib/db/client";
import { isThemeName } from "@/lib/themes";

/** Saves the palette on the user doc and in a cookie (read by the root layout before auth). */
export async function setThemeAction(name: string, mode?: "light" | "dark" | "system") {
  if (!isThemeName(name)) return;
  (await cookies()).set("mp_theme", name, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const u = await getCurrentUser();
  if (u) {
    await collection("users").updateOne({ _id: u._id }, { $set: { theme: name, ...(mode ? { mode } : {}), updatedAt: new Date() } });
  }
}
