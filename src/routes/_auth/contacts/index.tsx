import { useState } from "react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { useContacts } from "@/queries/useContacts";
import SectionItem from "@/components/SectionItem";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import Avatar from "@/components/Avatar";
import { formatPhoneNumber } from "@/utils/FormatUtils";
import SearchBar from "@/components/SearchBar";
import Fuse from "fuse.js";
import { useContactTagAssignments, useTags } from "@/queries/useTags";

export const Route = createFileRoute("/_auth/contacts/")({
  component: ListContacts,
});

function ListContacts() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: contacts } = useContacts();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const { data: tags = [] } = useTags();
  const { data: assignments = [] } = useContactTagAssignments();

  let filtered = contacts ?? [];
  if (search) {
    const fuse = new Fuse(filtered, {
      threshold: 0.4,
      keys: ["name", "addresses.address"],
    });
    filtered = fuse.search(search).map((r) => r.item);
  }
  if (tagFilter) {
    const taggedContactIds = new Set(
      assignments
        .filter((assignment) => assignment.tag_id === tagFilter)
        .map((assignment) => assignment.contact_id),
    );
    filtered = filtered.filter((contact) => taggedContactIds.has(contact.id));
  }

  return (
    <>
      <SectionHeader title={t("Contactos")} />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder={t("Buscar contactos")}
      />

      <div className="px-[20px] pb-2">
        <select
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="">Todas as tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>

      <SectionBody>
        <SectionItem
          title={t("Agregar contacto")}
          aside={
            <div className="p-[8px] bg-primary/10 rounded-full">
              <Plus className="w-[24px] h-[24px] text-primary" />
            </div>
          }
          onClick={() =>
            navigate({
              to: "/contacts/new",
              hash: (prevHash) => prevHash!,
            })
          }
        />
        {search && filtered.length === 0 && (
          <div className="py-[32px] text-center text-muted-foreground text-[14px]">
            {t("Sin resultados para")} "{search}"
          </div>
        )}
        {filtered.map((contact) => (
          <SectionItem
            key={contact.id}
            title={contact.name || t("Sin nombre")}
            description={
              contact.addresses?.at(0)?.address
                ? formatPhoneNumber(contact.addresses.at(0)!.address)
                : t("Sin dirección")
            }
            aside={
              <Avatar
                fallback={contact.name?.substring(0, 2).toUpperCase() || "?"}
                size={40}
                className="bg-muted text-muted-foreground"
              />
            }
            onClick={() =>
              navigate({
                to: `/contacts/${contact.id}`,
                hash: (prevHash) => prevHash!,
              })
            }
          />
        ))}
      </SectionBody>
    </>
  );
}
