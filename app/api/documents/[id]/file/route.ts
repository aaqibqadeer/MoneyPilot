import { HttpError, route } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/session";
import { repos } from "@/lib/db/repos";
import { features } from "@/lib/env";

/** Streams the private original back to its owner. */
export const GET = route(async (_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) => {
  const user = await requireApiUser();
  const doc = await repos(user._id).documents.byId((await ctx.params).id);
  if (!doc?.blobUrl || !features.blob) throw new HttpError(404, "File not stored");
  const { get } = await import("@vercel/blob");
  const r = await get(doc.blobUrl, { access: "private" });
  if (!r?.stream) throw new HttpError(404, "File not found");
  return new Response(r.stream, {
    headers: { "content-type": doc.mimeType, "content-disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`, "cache-control": "private, no-store" },
  });
});
