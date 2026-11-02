"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { suggestAutoTags } from "@/app/actions/edits";
import { ChangeProposal, type ProposalOutput } from "@/components/chat/change-proposal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Rules already run on every sync; this asks the AI about whatever is still untagged and previews it grouped by tag. */
export function AutoTagCard({ untagged, llm }: { untagged: number; llm: boolean }) {
  const router = useRouter();
  const [out, setOut] = useState<ProposalOutput | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await suggestAutoTags();
      if ("error" in r && r.error) return void toast.error(r.error);
      setOut(r as ProposalOutput);
    });
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Auto-tag</CardTitle>
        <CardDescription>
          Enabled rules tag new transactions on every sync. {untagged ? `${untagged} transaction${untagged === 1 ? " is" : "s are"} still untagged.` : "Everything is tagged."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {llm ? (
          <Button variant="outline" onClick={run} disabled={pending || !untagged}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Thinking…" : "Suggest tags with AI"}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">AI suggestions are not configured (DEEPSEEK_API_KEY).</p>
        )}
        {out && <ChangeProposal key={out.changeSetId} out={out} onSettled={() => router.refresh()} />}
      </CardContent>
    </Card>
  );
}
