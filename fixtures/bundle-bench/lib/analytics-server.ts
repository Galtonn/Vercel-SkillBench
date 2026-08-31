import "server-only";

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";

import type { RevenuePoint } from "@/app/dashboard/revenue-panel";
import type { Session } from "@/app/analytics/range-picker";

const s3 = new S3Client({ region: process.env.AWS_REGION });

async function readWarehouseExport(key: string) {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: process.env.WAREHOUSE_BUCKET, Key: key }),
  );
  const body = await object.Body?.transformToString();
  return JSON.parse(body ?? "[]") as Record<string, string | number>[];
}

export async function loadRevenue(): Promise<RevenuePoint[]> {
  const rows = await readWarehouseExport("exports/revenue.json");
  const byMonth = groupBy(rows, (row) => String(row.month));
  return sortBy(
    Object.entries(byMonth).map(([month, entries]) => ({
      month,
      amount: entries.reduce((total, entry) => total + Number(entry.amount), 0),
    })),
    "month",
  );
}

export async function loadSessions(): Promise<Session[]> {
  const rows = await readWarehouseExport("exports/sessions.json");
  return sortBy(
    rows.map((row) => ({ at: String(row.at), count: Number(row.count) })),
    "at",
  );
}
