import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

const db = supabase as any;

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  planned_budget: number;
  currency: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type ProjectPerformanceRow = {
  id: string;
  organization_id: string;
  project_id: string;
  metric_date: string;
  spend: number;
  leads: number;
  group_joins: number;
  reach: number;
  notes: string | null;
};

export type ProjectImportAlias = {
  id: string;
  organization_id: string;
  project_id: string;
  alias: string;
  source: string | null;
};

export type ProjectMembership = {
  organization_id: string;
  project_id: string;
  agent_id: string;
  role: "expert" | "manager";
};

export function useProjects() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.all(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from("projects").select("*")
        .eq("organization_id", orgId).order("name");
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useProjectTags(projectId?: string | null) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.tags(orgId, projectId),
    enabled: !!orgId && !!projectId,
    queryFn: async () => {
      const { data, error } = await db.from("project_tags").select("tag_id")
        .eq("organization_id", orgId).eq("project_id", projectId);
      if (error) throw error;
      return (data as Array<{ tag_id: string }>).map((row) => row.tag_id);
    },
  });
}

export function useProjectAliases(projectId?: string | null) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.aliases(orgId, projectId),
    enabled: !!orgId && !!projectId,
    queryFn: async () => {
      const { data, error } = await db.from("project_import_aliases").select("*")
        .eq("organization_id", orgId).eq("project_id", projectId).order("alias");
      if (error) throw error;
      return data as ProjectImportAlias[];
    },
  });
}

export function useProjectPerformance(projectId?: string | null, from?: string, to?: string) {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.performance(orgId, projectId, from, to),
    enabled: !!orgId && !!projectId && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await db.from("project_performance_daily").select("*")
        .eq("organization_id", orgId).eq("project_id", projectId)
        .gte("metric_date", from).lte("metric_date", to).order("metric_date");
      if (error) throw error;
      return data as ProjectPerformanceRow[];
    },
  });
}

export function useProjectMemberships() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.projects.memberships(orgId),
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from("project_memberships").select("*")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data as ProjectMembership[];
    },
  });
}

export function useSetExpertProjects() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agentId, projectIds }: { agentId: string; projectIds: string[] }) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      const { data: currentRows, error: readError } = await db
        .from("project_memberships").select("project_id")
        .eq("organization_id", orgId).eq("agent_id", agentId);
      if (readError) throw readError;
      const current = new Set<string>((currentRows ?? []).map((row: { project_id: string }) => row.project_id));
      const requested = new Set(projectIds);
      const additions = projectIds.filter((projectId) => !current.has(projectId));
      const removals = [...current].filter((projectId) => !requested.has(projectId));
      if (additions.length) {
        const { error } = await db.from("project_memberships").insert(additions.map((projectId) => ({
          organization_id: orgId, project_id: projectId, agent_id: agentId, role: "expert",
        })));
        if (error) throw error;
      }
      if (removals.length) {
        const { error } = await db.from("project_memberships").delete()
          .eq("organization_id", orgId).eq("agent_id", agentId)
          .in("project_id", removals);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.memberships(orgId) }),
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.root(orgId) });
}

export function useSaveProject() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: async (input: Partial<Project> & Pick<Project, "name" | "slug">) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      const payload = {
        organization_id: orgId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        planned_budget: input.planned_budget ?? 0,
        currency: input.currency ?? "BRL",
        status: input.status ?? "active",
      };
      const query = input.id
        ? db.from("projects").update(payload).eq("organization_id", orgId).eq("id", input.id)
        : db.from("projects").insert(payload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: invalidate,
  });
}

export function useSetProjectTags() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, tagIds }: { projectId: string; tagIds: string[] }) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      const { data: currentRows, error: readError } = await db
        .from("project_tags").select("tag_id")
        .eq("organization_id", orgId).eq("project_id", projectId);
      if (readError) throw readError;
      const current = new Set<string>((currentRows ?? []).map((row: { tag_id: string }) => row.tag_id));
      const requested = new Set(tagIds);
      const additions = tagIds.filter((tagId) => !current.has(tagId));
      const removals = [...current].filter((tagId) => !requested.has(tagId));
      if (additions.length) {
        const { error } = await db.from("project_tags").insert(additions.map((tagId) => ({
          organization_id: orgId, project_id: projectId, tag_id: tagId,
        })));
        if (error) throw error;
      }
      if (removals.length) {
        const { error } = await db.from("project_tags").delete()
          .eq("organization_id", orgId).eq("project_id", projectId)
          .in("tag_id", removals);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => queryClient.invalidateQueries({
      queryKey: queryKeys.projects.tags(orgId, variables.projectId),
    }),
  });
}

export function useSaveProjectAlias() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, alias }: { projectId: string; alias: string }) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      const { error } = await db.from("project_import_aliases").insert({
        organization_id: orgId, project_id: projectId, alias: alias.trim(), source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => queryClient.invalidateQueries({
      queryKey: queryKeys.projects.aliases(orgId, variables.projectId),
    }),
  });
}

export function useSaveProjectPerformance() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, rows, mode = "replace" }: { projectId: string; rows: Omit<ProjectPerformanceRow, "id" | "organization_id" | "project_id">[]; mode?: "replace" | "ignore" }) => {
      if (!orgId) throw new Error("Nenhuma organização ativa.");
      if (!rows.length) return;
      const payload = rows.map((row) => ({ ...row, organization_id: orgId, project_id: projectId }));
      const { error } = await db.from("project_performance_daily").upsert(payload, {
        onConflict: "organization_id,project_id,metric_date",
        ignoreDuplicates: mode === "ignore",
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.root(orgId) }),
  });
}

export function useCheckProjectPerformanceDates() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  return useMutation({
    mutationFn: async ({ projectId, dates }: { projectId: string; dates: string[] }) => {
      if (!orgId || !dates.length) return [] as string[];
      const existing = new Set<string>();
      const uniqueDates = [...new Set(dates)];
      for (let offset = 0; offset < uniqueDates.length; offset += 200) {
        const { data, error } = await db.from("project_performance_daily")
          .select("metric_date").eq("organization_id", orgId)
          .eq("project_id", projectId)
          .in("metric_date", uniqueDates.slice(offset, offset + 200));
        if (error) throw error;
        for (const row of data ?? []) existing.add(row.metric_date);
      }
      return [...existing];
    },
  });
}
