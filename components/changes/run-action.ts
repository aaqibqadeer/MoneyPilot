"use client";

import { toast } from "sonner";
import { undoChange, type ActionResult } from "@/app/actions/edits";

/** Runs an edit action, toasts the result and offers Undo when a change was recorded. */
export async function runAction(p: Promise<ActionResult>, success?: string) {
  const r = await p;
  if (!r.ok) {
    toast.error(r.error);
    return r;
  }
  if (success && r.changeSetId) {
    const id = r.changeSetId;
    toast.success(success, {
      action: {
        label: "Undo",
        onClick: async () => {
          const u = await undoChange(id);
          if (u.ok) toast.success("Undone");
          else toast.error(u.error);
        },
      },
    });
  } else if (success) toast.message(success);
  return r;
}
