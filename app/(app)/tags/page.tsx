import { PageHeader } from "@/components/shell/page-header";
import { AutoTagCard } from "@/components/tags/auto-tag-card";
import { TagsManager } from "@/components/tags/tags-manager";
import { requireUser } from "@/lib/auth/session";
import { features } from "@/lib/env";
import { tagsOverview } from "@/lib/queries";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const user = await requireUser();
  const { tags, rules, untagged } = await tagsOverview(user._id);
  return (
    <>
      <PageHeader title="Tags" description="Your categories and the rules that apply them. Every change can be undone." />
      <AutoTagCard untagged={untagged} llm={features.llm} />
      <TagsManager
        tags={tags.map((t) => ({ _id: t._id, name: t.name, color: t.color, count: t.count }))}
        rules={rules.map((r) => ({ _id: r._id, field: r.field, match: r.match, pattern: r.pattern, tagIds: r.tagIds, enabled: r.enabled }))}
      />
    </>
  );
}
