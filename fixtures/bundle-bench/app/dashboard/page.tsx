// Barrel import: pulls the whole components/ui surface into this route.
import { Card } from "@/components/ui";
import { loadRevenue } from "@/lib/analytics-server";

import { RevenuePanel } from "./revenue-panel";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const revenue = await loadRevenue();

  return (
    <section>
      <h1>Dashboard</h1>
      <Card title="Revenue">
        <RevenuePanel series={revenue} />
      </Card>
    </section>
  );
}
