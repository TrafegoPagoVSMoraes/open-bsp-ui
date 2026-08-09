import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import TagChip from "@/components/TagChip";
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useUpdateTag,
} from "@/queries/useTags";
import { removeAccents } from "@/utils/FormatUtils";

export const Route = createFileRoute("/_auth/settings/tags/")({
  component: TagsSettings,
});

const slugify = (value: string) =>
  removeAccents(value)
    .toLocaleLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function TagsSettings() {
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const updateTag = useUpdateTag();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#2563eb");
  const mutationError = createTag.error || updateTag.error || deleteTag.error;

  return (
    <>
      <SectionHeader title="Tags" />
      <SectionBody className="gap-5">
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <h2 className="font-semibold">Nova tag</h2>
          <input className="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="text" placeholder="Descrição opcional" value={description} onChange={(e) => setDescription(e.target.value)} />
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Cor <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button
            type="button"
            className="primary flex items-center justify-center gap-2 px-4"
            disabled={!name.trim() || createTag.isPending}
            onClick={async () => {
              await createTag.mutateAsync({ name: name.trim(), slug: slugify(name), color, description: description.trim() || null });
              setName(""); setDescription("");
            }}
          ><Plus className="h-4 w-4" /> Criar tag</button>
          {mutationError && (
            <p className="text-sm text-destructive">
              {mutationError instanceof Error ? mutationError.message : "Não foi possível salvar a tag."}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              {editingId === tag.id ? (
                <>
                  <input className="text min-w-0 grow" value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Nome da tag" />
                  <input className="text min-w-0 grow" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} aria-label="Descrição da tag" />
                  <input type="color" value={editColor} onChange={(event) => setEditColor(event.target.value)} aria-label="Cor da tag" />
                  <button type="button" title="Salvar tag" disabled={!editName.trim() || updateTag.isPending} onClick={async () => {
                    await updateTag.mutateAsync({ id: tag.id, name: editName.trim(), slug: slugify(editName), description: editDescription.trim() || null, color: editColor });
                    setEditingId(null);
                  }}><Save className="h-4 w-4 text-primary" /></button>
                  <button type="button" title="Cancelar edição" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></button>
                </>
              ) : (
                <>
                  <TagChip tag={tag} />
                  <span className="min-w-0 grow truncate text-[13px] text-muted-foreground">{tag.description || `ID: ${tag.id}`}</span>
                  {!tag.system_key && <button type="button" title="Editar tag" onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditDescription(tag.description || ""); setEditColor(tag.color); }}><Pencil className="h-4 w-4" /></button>}
                  {!tag.system_key && <button type="button" title="Excluir tag" onClick={() => deleteTag.mutate(tag.id)}><Trash2 className="h-4 w-4 text-destructive" /></button>}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="instructions rounded-xl border border-border p-4">
          <h2 className="font-semibold">Integração pela API</h2>
          <p>As tabelas <code>tags</code> e <code>contact_tags</code> usam autenticação e RLS da organização. Associe uma tag informando organization_id, contact_id, tag_id e source.</p>
          <p>A tag automática de opt-out é gerenciada pelo backend. Nenhuma rota pública expõe nomes, telefones ou e-mails.</p>
        </div>
      </SectionBody>
    </>
  );
}
