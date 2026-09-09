"use client";

import { useQuery } from "@apollo/client/react";

import { currentWealthDashboardQuery } from "@/features/wealth/api/current-wealth";

import { DashboardError, DashboardLoading } from "./dashboard-state";
import { WealthDashboardView } from "./wealth-dashboard-view";

export function WealthDashboard() {
  const { data, error, loading, refetch } = useQuery(currentWealthDashboardQuery, {
    fetchPolicy: "cache-and-network",
  });

  if (loading && !data) {
    return <DashboardLoading />;
  }

  if (error && !data) {
    return <DashboardError retry={() => void refetch()} />;
  }

  if (data) return <WealthDashboardView wealth={data.currentWealth} />;
  return null;
}
