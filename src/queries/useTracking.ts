import { useQuery } from "@tanstack/react-query";
import useBoundStore from "@/stores/useBoundStore";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/db_types";
import { queryKeys } from "./queryKeys";

export type TrackingProject = {
  id: string;
  public_key: string;
  name: string;
  slug: string;
  status: string;
  allowed_origins: string[];
  default_destination_url: string | null;
};

export type TrackingSummary = {
  tracked_links: number;
  opened_links: number;
  open_rate: number;
  unique_visitors: number;
  page_views: number;
  clicks: number;
  conversions: number;
  events: number;
};

export type TrackingSeriesRow = {
  day: string;
  opens: number;
  page_views: number;
  clicks: number;
  conversions: number;
};

export type TrackingEventRow = {
  event_name: string;
  event_type: string;
  total: number;
};

export type TrackingActivityRow = {
  event_id: string;
  project_id: string;
  message_id: string | null;
  event_name: string;
  event_type: string;
  element_id: string | null;
  page_path: string | null;
  occurred_at: string;
  contact_address_masked: string | null;
};

export type TrackingDashboard = {
  summary: TrackingSummary;
  series: TrackingSeriesRow[];
  top_events: TrackingEventRow[];
  recent_activity: TrackingActivityRow[];
  from: string;
  to: string;
};

const EMPTY_SUMMARY: TrackingSummary = {
  tracked_links: 0,
  opened_links: 0,
  open_rate: 0,
  unique_visitors: 0,
  page_views: 0,
  clicks: 0,
  conversions: 0,
  events: 0,
};

function record(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function number(value: Json | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

function string(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function rows(value: Json | undefined) {
  return Array.isArray(value) ? value.map((item) => record(item)) : [];
}

function normalizeDashboard(value: Json | null): TrackingDashboard {
  const root = record(value ?? undefined);
  const summary = record(root.summary);
  return {
    summary: {
      ...EMPTY_SUMMARY,
      tracked_links: number(summary.tracked_links),
      opened_links: number(summary.opened_links),
      open_rate: number(summary.open_rate),
      unique_visitors: number(summary.unique_visitors),
      page_views: number(summary.page_views),
      clicks: number(summary.clicks),
      conversions: number(summary.conversions),
      events: number(summary.events),
    },
    series: rows(root.series).map((row) => ({
      day: string(row.day),
      opens: number(row.opens),
      page_views: number(row.page_views),
      clicks: number(row.clicks),
      conversions: number(row.conversions),
    })),
    top_events: rows(root.top_events).map((row) => ({
      event_name: string(row.event_name),
      event_type: string(row.event_type),
      total: number(row.total),
    })),
    recent_activity: rows(root.recent_activity).map((row) => ({
      event_id: string(row.event_id),
      project_id: string(row.project_id),
      message_id: nullableString(row.message_id),
      event_name: string(row.event_name),
      event_type: string(row.event_type),
      element_id: nullableString(row.element_id),
      page_path: nullableString(row.page_path),
      occurred_at: string(row.occurred_at),
      contact_address_masked: nullableString(row.contact_address_masked),
    })),
    from: string(root.from),
    to: string(root.to),
  };
}

export function useTrackingProjects() {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.tracking.projects(organizationId),
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("tracking_projects")
        .select(
          "id,public_key,name,slug,status,allowed_origins,default_destination_url",
        )
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("name");
      if (error) throw error;
      return data satisfies TrackingProject[];
    },
  });
}

export function useTrackingDashboard(
  projectId: string | null,
  from: string,
  to: string,
) {
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  return useQuery({
    queryKey: queryKeys.tracking.dashboard(organizationId, projectId, from, to),
    enabled: !!organizationId,
    queryFn: async () => {
      if (!organizationId) return normalizeDashboard(null);
      const { data, error } = await supabase.rpc("get_tracking_dashboard", {
        p_organization_id: organizationId,
        p_project_id: projectId ?? undefined,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return normalizeDashboard(data);
    },
  });
}
