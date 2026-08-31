import { loadSessions } from "@/lib/analytics-server";

import { RangePicker } from "./range-picker";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const sessions = await loadSessions();

  return (
    <section>
      <h1>Analytics</h1>
      <RangePicker sessions={sessions} />
    </section>
  );
}
