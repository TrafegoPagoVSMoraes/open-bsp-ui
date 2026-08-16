import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export type ExpertManagementInput = {
  action: "create" | "update" | "activate" | "set_password";
  expert_id?: string;
  name?: string;
  email?: string | null;
  project_ids?: string[];
  mode?: "invite" | "password";
  password?: string;
};

async function invokeExpertManagement(organizationId: string, input: ExpertManagementInput) {
  const { data, error } = await supabase.functions.invoke("expert-management", {
    method: "POST",
    body: { organization_id: organizationId, ...input },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.clone().json().catch(() => null) : null;
    throw new Error(payload && typeof payload === "object" && "error" in payload ? String(payload.error) : error.message);
  }
  if (data?.error) throw new Error(data.error.message || data.error);
  return data?.data ?? data;
}

export function useExpertManagement() {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpertManagementInput) => {
      if (!organizationId) throw new Error("Nenhuma organização ativa.");
      return invokeExpertManagement(organizationId, input);
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(organizationId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.memberships(organizationId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.root(organizationId) }),
    ]),
  });
}
