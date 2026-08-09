import { useState } from "react";
import { Check, Tags, X } from "lucide-react";
import { useTags } from "@/queries/useTags";
import TagChip from "./TagChip";

export default function TagSelector({
  value,
  onChange,
  label = "Tags",
  compact = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: tags = [] } = useTags();
  const selected = tags.filter((tag) => value.includes(tag.id));

  return (
    <div className={`relative ${compact ? "shrink-0" : ""}`}>
      {!compact && <div className="label">{label}</div>}
      <button
        type="button"
        className={
          compact
            ? "flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[12px] text-muted-foreground hover:bg-muted"
            : "flex min-h-[38px] w-full flex-wrap items-center gap-2 border-b-2 border-transparent pb-1 text-left hover:border-input"
        }
        onClick={() => setOpen((current) => !current)}
      >
        <Tags className="h-4 w-4 shrink-0" />
        {selected.length ? (
          selected.map((tag) => <TagChip key={tag.id} tag={tag} />)
        ) : (
          <span className="text-[14px] text-muted-foreground">
            {compact ? "Adicionar tag" : "Nenhuma tag"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[260px] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 text-[13px] font-medium">
            <span>{label}</span>
            <button type="button" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {tags.map((tag) => {
              const checked = value.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
                  disabled={!!tag.system_key}
                  title={tag.system_key ? "Tag gerenciada automaticamente" : undefined}
                  onClick={() =>
                    onChange(
                      checked
                        ? value.filter((id) => id !== tag.id)
                        : [...value, tag.id],
                    )
                  }
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded border"
                    style={{ borderColor: tag.color, color: tag.color }}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <TagChip tag={tag} />
                  {tag.system_key && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      automática
                    </span>
                  )}
                </button>
              );
            })}
            {!tags.length && (
              <p className="px-2 py-4 text-[13px] text-muted-foreground">
                Cadastre tags em Preferências → Tags.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
