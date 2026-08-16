import { createFileRoute, Navigate } from "@tanstack/react-router";
import CampaignWorkspace from "@/components/campaigns/CampaignWorkspace";
import { useCurrentAgent } from "@/queries/useAgents";

export const Route = createFileRoute("/_auth/campaigns/")({
  component: CampaignsRoute,
});

function CampaignsRoute() {
  const { data: agent, isLoading } = useCurrentAgent();
  if (isLoading) return null;
  const isExpert =
    (agent?.extra as { account_type?: string } | null)?.account_type === "expert";
  return isExpert ? <Navigate to="/conversations" /> : <CampaignWorkspace />;
}
