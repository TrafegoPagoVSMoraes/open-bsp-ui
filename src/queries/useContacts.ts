import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ContactAddressInsert,
  type ContactWithAddressesInsert,
  type ContactWithAddressesRow,
  type ContactWithAddressesUpdate,
  supabase,
  type WhatsAppContactAddressExtra,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import {
  normalizePersonName,
  normalizePhoneNumber,
} from "@/utils/FormatUtils";
import { queryKeys } from "./queryKeys";
import type { Database } from "@/supabase/db_types";
import { useProjectScope } from "./useProjects";

type Service = Database["public"]["Enums"]["service"];

// contacts_addresses PK is (organization_id, service, address) — the same
// digits can exist under whatsapp AND whatsapp-web, so lookups key by service.
export function useContactByAddress(
  address: string | null | undefined,
  service: Service | null | undefined,
) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.contacts.byAddress(orgId, service, address),
    queryFn: async () =>
      await supabase
        .from("contacts_addresses")
        .select("*, contact:contacts(*)")
        .eq("organization_id", orgId!)
        .eq("service", service!)
        .eq("address", address!)
        .single()
        .throwOnError(),
    enabled: !!userId && !!orgId && !!service && !!address,
    select: (data) => data.data.contact,
    experimental_prefetchInRender: true,
  });
}

export function useContacts() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const { projectIds, scopeKey, isLoading: scopeLoading } = useProjectScope();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.contacts.all(orgId, scopeKey),
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: ContactWithAddressesRow[] = [];
      let offset = 0;
      let projectContactIds: string[] | null = null;
      if (projectIds !== null) {
        if (projectIds.length === 0) return { data: [] };
        const collected: string[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await (supabase as any)
            .from("project_contacts")
            .select("contact_id")
            .eq("organization_id", orgId!)
            .in("project_id", projectIds)
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          collected.push(...(data ?? []).map((row: { contact_id: string }) => row.contact_id));
          if ((data ?? []).length < PAGE_SIZE) break;
        }
        projectContactIds = [...new Set(collected)];
        if (projectContactIds.length === 0) return { data: [] };
      }

      const loadPage = async (contactIds?: string[]) => {
        let contactsQuery = supabase
          .from("contacts")
          .select("*, addresses:contacts_addresses(*)")
          .eq("organization_id", orgId!)
          .order("name", { ascending: true })
          .order("created_at", {
            referencedTable: "addresses",
            ascending: true,
          })
          .range(contactIds ? 0 : offset, contactIds ? contactIds.length - 1 : offset + PAGE_SIZE - 1);
        if (contactIds) contactsQuery = contactsQuery.in("id", contactIds);
        const { data: page } = await contactsQuery.throwOnError();
        allData = [...allData, ...(page as ContactWithAddressesRow[])];
        return page.length;
      };

      if (projectContactIds) {
        for (let index = 0; index < projectContactIds.length; index += 200) {
          await loadPage(projectContactIds.slice(index, index + 200));
        }
        allData.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "pt-BR"));
      } else while (true) {
        const count = await loadPage();
        if (count < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      // Seed individual contact cache entries
      for (const contact of allData) {
        queryClient.setQueryData(queryKeys.contacts.detail(orgId, contact.id), {
          data: contact,
        });
      }

      return { data: allData };
    },
    enabled: !!userId && !!orgId && !scopeLoading,
    select: (data) => data.data,
  });
}

export function useContact(id: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.contacts.detail(orgId, id),
    queryFn: async () =>
      await supabase
        .from("contacts")
        .select("*, addresses:contacts_addresses(*)")
        .eq("organization_id", orgId!)
        .eq("id", id)
        .order("created_at", { referencedTable: "addresses", ascending: true })
        .single()
        .throwOnError(),
    enabled: !!userId && !!orgId && !!id,
    select: (data) => data.data as ContactWithAddressesRow,
    experimental_prefetchInRender: true,
  });
}

export function useContactProjects(contactId: string | null | undefined) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.contacts.projects(orgId, contactId),
    enabled: !!orgId && !!contactId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_contacts")
        .select("project_id")
        .eq("organization_id", orgId)
        .eq("contact_id", contactId);
      if (error) throw error;
      return [...new Set((data ?? []).map((row: { project_id: string }) => row.project_id))] as string[];
    },
  });
}

export function useSetContactProjects() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, projectIds }: { contactId: string; projectIds: string[] }) => {
      if (!orgId) throw new Error("No active organization");
      const { error } = await (supabase as any).rpc("set_contact_manual_projects", {
        p_organization_id: orgId,
        p_contact_id: contactId,
        p_project_ids: projectIds,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.projects(orgId, variables.contactId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.root(orgId) }),
    ]),
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: ContactWithAddressesInsert) => {
      if (!orgId) throw new Error("No active organization");

      const { addresses, ...contactData } = data;
      const normalizedContactData = {
        ...contactData,
        email: (contactData.email ?? contactData.extra?.email)?.trim().toLocaleLowerCase() || null,
        name: normalizePersonName(contactData.name) || null,
        extra: contactData.extra
          ? {
              ...contactData.extra,
              email: contactData.extra.email?.trim().toLocaleLowerCase(),
            }
          : contactData.extra,
      };

      // Create contact
      const { data: contact } = await supabase
        .from("contacts")
        .insert({ ...normalizedContactData, organization_id: orgId })
        .select()
        .single()
        .throwOnError();

      // Link addresses to contact (deduplicate by normalized address)
      const toLink = addresses
        .filter((a) => Boolean(a.address))
        .map((a) => ({ ...a, address: normalizePhoneNumber(a.address!) }))
        .filter(
          (a, i, arr) => arr.findIndex((x) => x.address === a.address) === i,
        );

      toLink.length &&
        (await supabase
          .from("contacts_addresses")
          .upsert(
            toLink.map(
              (a) =>
                ({
                  ...a,
                  organization_id: orgId,
                  service: "whatsapp" as const,
                  contact_id: contact.id,
                }) as ContactAddressInsert,
            ),
            {
              // PK is (organization_id, service, address)
              onConflict: "organization_id, service, address",
              defaultToNull: false,
            },
          )
          .throwOnError());

      return contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.root(orgId),
      });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (data: ContactWithAddressesUpdate) => {
      if (!orgId) throw new Error("No active organization");
      if (!data.id) throw new Error("No contact id");

      const { addresses: rawNewAddresses, ...newContact } = data;
      const normalizedContact = {
        ...newContact,
        email: (newContact.email ?? newContact.extra?.email)?.trim().toLocaleLowerCase() || null,
        name:
          newContact.name === undefined
            ? undefined
            : normalizePersonName(newContact.name) || null,
        extra: newContact.extra
          ? {
              ...newContact.extra,
              email: newContact.extra.email?.trim().toLocaleLowerCase(),
            }
          : newContact.extra,
      };

      const { data: contact } = await supabase
        .from("contacts")
        .update(normalizedContact)
        .eq("id", data.id)
        .select()
        .single()
        .throwOnError();

      const cached = queryClient.getQueryData<{
        data: ContactWithAddressesRow;
      }>(queryKeys.contacts.detail(orgId, data.id));
      const oldAddresses = cached?.data?.addresses ?? [];

      const oldAddressesString = oldAddresses.map((a) => a.address) ?? [];

      const newAddresses = rawNewAddresses.map((a) => ({
        ...a,
        address: normalizePhoneNumber(a.address!),
      }));

      const newAddressesString = [
        ...new Set(
          newAddresses.map((a) => a.address).filter(Boolean) as string[],
        ),
      ];

      // Upsert addresses to link (set contact_id)
      // Note: If address exists in another contact, it will be reassigned (TODO: show warning)
      const toLink = newAddressesString
        .filter((a) => !oldAddressesString.includes(a))
        .map((address) => {
          const addressObject = newAddresses.find((a) => a.address === address);

          return {
            ...addressObject,
            organization_id: orgId,
            service: "whatsapp" as const,
            contact_id: data.id,
          } as ContactAddressInsert;
        });

      // Unlink removed addresses (set contact_id to null)
      // DB trigger will delete if no conversations reference them
      const toUnlink = oldAddressesString
        .filter((a) => !newAddressesString.includes(a))
        .map((address) => {
          const addressObject = oldAddresses.find((a) => a.address === address);

          return {
            ...addressObject,
            contact_id: null,
          } as ContactAddressInsert;
        });

      // The insert policy prevents the creation of synced address by the users.
      // The update policy allows synced address to be updated.
      // Upsert with extra.synced.action='add' in payload fails even if the row exists,
      // because PostgreSQL checks INSERT policy BEFORE conflict detection.
      const toUpsert = [...toLink, ...toUnlink].filter(
        (a) =>
          !(
            (a.extra as WhatsAppContactAddressExtra | undefined)?.synced
              ?.action === "add"
          ),
      );
      const toUpdate = [...toLink, ...toUnlink].filter(
        (a) =>
          (a.extra as WhatsAppContactAddressExtra | undefined)?.synced
            ?.action === "add",
      );

      await Promise.all([
        // Upsert non-synced addresses
        toUpsert.length > 0 &&
          supabase
            .from("contacts_addresses")
            .upsert(toUpsert, {
              // PK is (organization_id, service, address)
              onConflict: "organization_id, service, address",
              defaultToNull: false,
            })
            .throwOnError(),
        // Update synced addresses individually (no mass update in Supabase)
        ...toUpdate.map((a) =>
          supabase
            .from("contacts_addresses")
            .update(a)
            .eq("organization_id", a.organization_id)
            .eq("service", a.service)
            .eq("address", a.address)
            .throwOnError(),
        ),
      ]);

      return contact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.root(orgId),
      });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No active organization");

      await supabase.from("contacts").delete().eq("id", id).throwOnError();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contacts.root(orgId),
      });
    },
  });
}
