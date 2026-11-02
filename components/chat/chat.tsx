"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Loader2, Paperclip, Pencil, RefreshCw, Sparkles, Square, Wrench } from "lucide-react";
import { uploadFile } from "@/components/documents/uploader";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatUIMessage } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { ChangeProposal, type ProposalOutput } from "./change-proposal";
import { Markdown } from "./markdown";
import { refreshSessions } from "./session-list";
import { TransactionResults, type TxnRow } from "./transaction-results";

const SUGGESTIONS = [
  "What did I spend on restaurants last month vs the month before?",
  "Show my spending by tag as a pie chart",
  "When are my card payments due?",
  "Tag all my Uber rides as Transport",
];

const TOOL_LABEL: Record<string, string> = {
  getAccounts: "Checked accounts",
  getTags: "Read tags",
  searchTransactions: "Searched transactions",
  getSpendingSummary: "Summarized spending",
  getBills: "Checked bills",
  getLiabilities: "Checked card details",
  getConnectedApps: "Checked connected apps",
  getClaims: "Checked claims",
  runAnalyticsQuery: "Ran an analysis",
  proposeChanges: "Prepared changes",
};

const textOf = (m: ChatUIMessage) => m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n");

export function Chat({ id, initialMessages, aiReady }: { id: string; initialMessages: ChatUIMessage[]; aiReady: boolean }) {
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, stop, regenerate, error } = useChat<ChatUIMessage>({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: () => refreshSessions(),
    onError: (e) => toast.error(e.message || "The assistant hit an error"),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (messages.length === 0) window.history.replaceState(null, "", `/chat/${id}`);
    sendMessage({ text: t });
    setInput("");
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const attach = async (file?: File) => {
    if (!file || busy) return;
    setUploading(true);
    try {
      const r = await uploadFile(file);
      if (messages.length === 0) window.history.replaceState(null, "", `/chat/${id}`);
      sendMessage({ text: `I uploaded "${file.name}" (document ${r.id}). What's in it?${input.trim() ? ` ${input.trim()}` : ""}` });
      setInput("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = messages.at(-1)?.role === "assistant" ? messages.at(-1) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-12 pb-6 md:pt-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center pt-[10vh] text-center">
              <div className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-full">
                <Sparkles className="size-6" />
              </div>
              <h2 className="text-xl font-semibold">Ask about your money</h2>
              <p className="text-muted-foreground mt-1 max-w-md text-sm">Answers come from your synced accounts and transactions, with tables, charts and diagrams.</p>
              {!aiReady && (
                <p className="bg-warning/15 mt-4 rounded-lg px-3 py-2 text-xs">AI isn&apos;t configured. Set DEEPSEEK_API_KEY to enable chat.</p>
              )}
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} disabled={!aiReady} onClick={() => send(s)} className="hover:bg-accent rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) => {
                const streamingThis = busy && m.id === messages.at(-1)?.id && m.role === "assistant";
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="group flex flex-col items-end gap-1">
                      {editing === m.id ? (
                        <div className="w-full max-w-[85%] space-y-2">
                          <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-20" autoFocus />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => { sendMessage({ text: editText.trim(), messageId: m.id }); setEditing(null); }} disabled={!editText.trim()}>Send</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap">{textOf(m)}</div>
                      )}
                      {m.id === lastUser?.id && !busy && editing !== m.id && (
                        <Button size="icon" variant="ghost" className="size-7 opacity-100 md:opacity-0 md:group-hover:opacity-100" aria-label="Edit message" onClick={() => { setEditing(m.id); setEditText(textOf(m)); }}>
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="group space-y-2">
                    {m.parts.map((p, i) => {
                      if (p.type === "text") return <Markdown key={i} text={p.text} streaming={streamingThis} />;
                      if (isToolUIPart(p)) {
                        const name = getToolName(p);
                        const done = p.state === "output-available";
                        const out = done ? (p.output as { total?: number; transactions?: TxnRow[]; error?: string }) : undefined;
                        return (
                          <div key={i}>
                            <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                              {done || p.state === "output-error" ? <Wrench className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
                              {TOOL_LABEL[name] ?? name}
                              {p.state === "output-error" && " (failed)"}
                            </span>
                            {name === "searchTransactions" && out?.transactions && <TransactionResults total={out.total ?? 0} transactions={out.transactions} />}
                            {name === "proposeChanges" && done && <ChangeProposal out={p.output as ProposalOutput} />}
                          </div>
                        );
                      }
                      return null;
                    })}
                    {!streamingThis && (
                      <MessageActions text={textOf(m)} tokens={m.metadata?.totalTokens} onRegenerate={m.id === lastAssistant?.id ? () => regenerate() : undefined} />
                    )}
                  </div>
                );
              })}
              {status === "submitted" && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
              {error && !busy && (
                <div className="text-destructive flex items-center gap-2 text-sm">
                  Something went wrong.
                  <Button size="sm" variant="outline" onClick={() => regenerate()}>Retry</Button>
                </div>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <form
        className="bg-background shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <div className="bg-card mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2 shadow-xs">
          <input ref={fileInput} type="file" className="hidden" accept=".csv,.txt,.pdf,.xlsx,.png,.jpg,.jpeg,.webp,.heic" onChange={(e) => attach(e.target.files?.[0])} />
          <Button type="button" size="icon" variant="ghost" disabled={!aiReady || busy || uploading} onClick={() => fileInput.current?.click()} aria-label="Attach a document">
            {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={aiReady ? "Ask about your spending, bills, accounts…" : "Chat needs DEEPSEEK_API_KEY"}
            disabled={!aiReady}
            rows={1}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => stop()} aria-label="Stop"><Square className="size-3.5 fill-current" /></Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || !aiReady} aria-label="Send"><ArrowUp /></Button>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageActions({ text, tokens, onRegenerate }: { text: string; tokens?: number; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("text-muted-foreground flex items-center gap-1 text-xs", "opacity-100 md:opacity-0 md:group-hover:opacity-100")}>
      <Button size="icon" variant="ghost" className="size-7" aria-label="Copy" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      {onRegenerate && (
        <Button size="icon" variant="ghost" className="size-7" aria-label="Regenerate" onClick={onRegenerate}><RefreshCw className="size-3.5" /></Button>
      )}
      {tokens ? <span className="ml-1">{tokens.toLocaleString()} tokens</span> : null}
    </div>
  );
}
