import type { TagRow } from "@/supabase/client";

export default function TagChip({ tag }: { tag: TagRow }) {
  return (
    <span
      className="inline-flex max-w-[160px] items-center truncate rounded-full border px-[8px] py-[2px] text-[11px] font-medium"
      style={{
        borderColor: tag.color,
        color: tag.color,
        backgroundColor: `${tag.color}18`,
      }}
      title={tag.description || tag.name}
    >
      {tag.name}
    </span>
  );
}
