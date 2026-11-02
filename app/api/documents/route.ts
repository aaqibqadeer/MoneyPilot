import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { uploadDocument } from "@/lib/documents/service";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

/** Multipart upload (field `file`). Parses right away; the review screen imports. */
export const POST = route(async (req: Request) => {
  const user = await requireApiUser();
  await rateLimit("documents", 10, 60);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  return NextResponse.json(await uploadDocument(user._id, file));
});
