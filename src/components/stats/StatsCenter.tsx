import { useLocation } from "@tanstack/react-router";
import StatsQuotas from "./StatsQuotas";
import StatsUsage from "./StatsUsage";
import StatsTracking from "./StatsTracking";

export default function StatsCenter() {
  const pathname = useLocation({ select: (l) => l.pathname });

  if (pathname === "/stats/usage") return <StatsUsage />;
  if (pathname === "/stats/tracking") return <StatsTracking />;
  return <StatsQuotas />;
}
