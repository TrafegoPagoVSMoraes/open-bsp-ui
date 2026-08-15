import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  supabase,
  type ContactTagRow,
  type TagInsert,
  type TagUpdate,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export function useTags() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.tags.all(orgId),
    queryFn: async () =>
      await supabase
        .from("tags")
        .select()
        .eq("organization_id", orgId!)
        .order("name")
        .throwOnError(),
    enabled: !!userId && !!orgId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    select: (result) => result.data,
  });
}

export function useContactTagAssignments() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.tags.assignments(orgId),
    queryFn: async () => {
      const assignments: ContactTagRow[] = [];
      const pageSize = 1000;

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("contact_tags")
          .select()
          .eq("organization_id", orgId!)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        assignments.push(...data);
        if (data.length < pageSize) break;
      }

      return assignments;
    },
    enabled: !!userId && !!orgId,
  });
}

export function useContactTags(contactId: string | null | undefined) {
  const tags = useTags();
  const assignments = useContactTagAssignments();
  const assignedIds = new Set(
    assignments.data
      ?.filter((assignment) => assignment.contact_id === contactId)
      .map((assignment) => assignment.tag_id) ?? [],
  );

  return {
    ...tags,
    isLoading: tags.isLoading || assignments.isLoading,
    data: tags.data?.filter((tag) => assignedIds.has(tag.id)) ?? [],
  };
}

function useInvalidateTags() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all(orgId) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.assignments(orgId),
      }),
    ]);
}

export function useCreateTag() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const invalidate = useInvalidateTags();

  return useMutation({
    mutationFn: async (input: Omit<TagInsert, "organization_id">) => {
      if (!orgId) throw new Error("No active organization");
      const { data } = await supabase
        .from("tags")
        .insert({ ...input, organization_id: orgId })
        .select()
        .single()
        .throwOnError();
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTag() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const invalidate = useInvalidateTags();

  return useMutation({
    mutationFn: async ({ id, ...input }: TagUpdate & { id: string }) => {
      if (!orgId) throw new Error("No active organization");
      const { data } = await supabase
        .from("tags")
        .update(input)
        .eq("organization_id", orgId)
        .eq("id", id)
        .select()
        .single()
        .throwOnError();
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTag() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const invalidate = useInvalidateTags();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!orgId) throw new Error("No active organization");
      await supabase
        .from("tags")
        .delete()
        .eq("organization_id", orgId)
        .eq("id", id)
        .is("system_key", null)
        .throwOnError();
    },
    onSuccess: invalidate,
  });
}

export function useSetContactTags() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      tagIds,
    }: {
      contactId: string;
      tagIds: string[];
    }) => {
      if (!orgId) throw new Error("No active organization");

      const { data: current } = await supabase
        .from("contact_tags")
        .select()
        .eq("organization_id", orgId)
        .eq("contact_id", contactId)
        .throwOnError();

      const systemTagIds = new Set(
        (await supabase
          .from("tags")
          .select("id")
          .eq("organization_id", orgId)
          .not("system_key", "is", null)
          .throwOnError()).data.map((tag) => tag.id),
      );
      const currentIds = new Set(current.map((item) => item.tag_id));
      const requestedIds = new Set(tagIds);
      const toDelete = current
        .filter(
          (item) =>
            !requestedIds.has(item.tag_id) && !systemTagIds.has(item.tag_id),
        )
        .map((item) => item.tag_id);
      const toInsert = [...requestedIds].filter((id) => !currentIds.has(id));

      if (toDelete.length) {
        await supabase
          .from("contact_tags")
          .delete()
          .eq("organization_id", orgId)
          .eq("contact_id", contactId)
          .in("tag_id", toDelete)
          .throwOnError();
      }

      if (toInsert.length) {
        await supabase
          .from("contact_tags")
          .upsert(
            toInsert.map((tagId) => ({
              organization_id: orgId,
              contact_id: contactId,
              tag_id: tagId,
              source: "manual",
            })),
            { onConflict: "organization_id,contact_id,tag_id" },
          )
          .throwOnError();
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.assignments(orgId),
      }),
  });
}
