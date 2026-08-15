import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import type { CampaignImportRecord } from "@/utils/CampaignImportUtils";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "running"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "failed";

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  total: number;
  pending: number;
  accepted: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  created_at: string;
};

export type CampaignTag = { id: string; name: string; color?: string | null; contacts_count?: number };
export type CampaignAudience = {
  total: number;
  eligible: number;
  duplicates: number;
  opted_out: number;
  invalid: number;
  tags?: CampaignTag[];
};

type InvokeBody = Record<string, unknown>;

async function invokeCampaign<T>(body: InvokeBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke("campaign-management", {
    method: "POST",
    body,
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const payload = response ? await response.clone().json().catch(() => null) : null;
    const reason = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : error.message;
    throw new Error(reason);
  }
  if (data?.error) throw new Error(data.error.message || data.error);
  return (data?.data ?? data) as T;
}

export function useCampaigns() {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const projectId = useBoundStore((state) => state.ui.activeProjectId);
  return useQuery({
    queryKey: ["campaigns", organizationId, projectId],
    queryFn: () => invokeCampaign<CampaignSummary[]>({ action: "list_campaigns", organization_id: organizationId, project_id: projectId }),
    enabled: !!organizationId,
    refetchInterval: (query) =>
      query.state.data?.some((campaign) => ["queued", "running", "cancel_requested"].includes(campaign.status))
        ? 5000
        : false,
  });
}

export function useCampaignAudience(
  tagIds: string[],
  excludedTagIds: string[],
  organizationAddress: string,
) {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const projectId = useBoundStore((state) => state.ui.activeProjectId);
  return useQuery({
    queryKey: [
      "campaign-audience",
      organizationId,
      organizationAddress,
      [...tagIds].sort(),
      [...excludedTagIds].sort(),
    ],
    queryFn: () => invokeCampaign<CampaignAudience>({
      action: "audience_preview",
      organization_id: organizationId,
      project_id: projectId,
      organization_address: organizationAddress,
      tag_ids: tagIds,
      exclude_tag_ids: excludedTagIds,
      include_available_tags: true,
    }),
    enabled: !!organizationId,
  });
}

export function useCampaignActions() {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const projectId = useBoundStore((state) => state.ui.activeProjectId);
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });

  const previewImport = useMutation({
    mutationFn: ({ records, organizationAddress }: { records: CampaignImportRecord[]; organizationAddress: string }) => invokeCampaign<CampaignAudience>({
      action: "preview_import",
      organization_id: organizationId,
      project_id: projectId,
      organization_address: organizationAddress,
      records,
    }),
  });
  const createTest = useMutation({
    mutationFn: (payload: InvokeBody) => invokeCampaign<{ id?: string; external_id?: string; status: string }>({
      action: "create_test",
      organization_id: organizationId,
      project_id: projectId,
      ...payload,
    }),
  });
  const createCampaign = useMutation({
    mutationFn: (payload: InvokeBody) => invokeCampaign<{ id: string }>({
      action: "create_campaign",
      organization_id: organizationId,
      project_id: projectId,
      ...payload,
    }),
    onSuccess: invalidate,
  });
  const startCampaign = useMutation({
    mutationFn: (campaignId: string) => invokeCampaign({ action: "start_campaign", organization_id: organizationId, project_id: projectId, campaign_id: campaignId }),
    onSuccess: invalidate,
  });
  const scheduleCampaign = useMutation({
    mutationFn: ({ campaignId, scheduledAt }: { campaignId: string; scheduledAt: string }) =>
      invokeCampaign({
        action: "schedule_campaign",
        organization_id: organizationId,
        project_id: projectId,
        campaign_id: campaignId,
        scheduled_at: scheduledAt,
      }),
    onSuccess: invalidate,
  });
  const cancelCampaign = useMutation({
    mutationFn: (campaignId: string) => invokeCampaign({ action: "cancel_campaign", organization_id: organizationId, project_id: projectId, campaign_id: campaignId }),
    onSuccess: invalidate,
  });

  return { previewImport, createTest, createCampaign, startCampaign, scheduleCampaign, cancelCampaign };
}

export function useCampaignRealtime() {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!organizationId) return;
    const refresh = () => queryClient.invalidateQueries({ queryKey: ["campaigns", organizationId] });
    const channel = supabase
      .channel(`campaigns:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `organization_id=eq.${organizationId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_recipients", filter: `organization_id=eq.${organizationId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [organizationId, queryClient]);
}
