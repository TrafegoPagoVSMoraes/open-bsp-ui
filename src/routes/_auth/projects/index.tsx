import { createFileRoute } from "@tanstack/react-router";
import ProjectPerformanceWorkspace from "@/components/projects/ProjectPerformanceWorkspace";

export const Route = createFileRoute("/_auth/projects/")({
  component: ProjectPerformanceWorkspace,
});
