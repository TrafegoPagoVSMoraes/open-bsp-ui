import { createFileRoute } from "@tanstack/react-router";
import CampaignWorkspace from "@/components/campaigns/CampaignWorkspace";

export const Route = createFileRoute("/_auth/campaigns/")({
  component: CampaignWorkspace,
});
