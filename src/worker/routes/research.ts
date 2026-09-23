import { Hono } from "hono";
import type { ResearchReport, ResearchWindowStats, ScanStatus } from "@/shared/types";
import type { Env } from "../env";

export const researchRoute = new Hono<{ Bindings: Env }>();

type ResearchRow = {
  status: string;
  sample_size: number;
  hits_3: number;
  hits_5: number;
  median_mfe: number | null;
  median_mae: number | null;
  median_return_24h: number | null;
  average_return_1h: number | null;
  average_return_6h: number | null;
};

function ratio(hits: number, samples: number): number | null {
  return samples === 0 ? null : (hits / samples) * 100;
}

async function windowsFor(db: D1Database, days: 7 | 30): Promise<ResearchWindowStats[]> {
  const sql = `
    SELECT s.status,
           COUNT(*) AS sample_size,
           SUM(CASE WHEN r.target3_hit = 1 THEN 1 ELSE 0 END) AS hits_3,
           SUM(CASE WHEN r.target5_hit = 1 THEN 1 ELSE 0 END) AS hits_5,
           AVG(r.max_gain_24h) AS median_mfe,
           AVG(r.max_drawdown_24h) AS median_mae,
           AVG((r.price_24h / s.price - 1.0) * 100.0) AS median_return_24h,
           AVG((r.price_1h / s.price - 1.0) * 100.0) AS average_return_1h,
           AVG((r.price_6h / s.price - 1.0) * 100.0) AS average_return_6h
    FROM scans AS s
    INNER JOIN scan_results AS r ON r.scan_id = s.id
    WHERE s.symbol IS NOT NULL AND s.price IS NOT NULL
      AND s.created_at >= datetime('now', ?)
    GROUP BY s.status
    ORDER BY s.status
  `;
  const statement = db.prepare(sql).bind(`-${days} days`);
  const { results } = await statement.all<ResearchRow>();
  const statuses: ScanStatus[] = ["BUY_NOW", "BUY_ON_PULLBACK", "WATCH_ONLY"];
  return statuses.flatMap((status) => {
    const row = results.find((result) => result.status === status);
    if (!row || row.sample_size === 0) return [];
    return [{
      status,
      sampleSize: row.sample_size,
      hit3Pct: ratio(row.hits_3, row.sample_size),
      hit5Pct: ratio(row.hits_5, row.sample_size),
      medianMfePct: row.median_mfe,
      medianMaePct: row.median_mae,
      medianReturn24hPct: row.median_return_24h,
      averageReturn1hPct: row.average_return_1h,
      averageReturn6hPct: row.average_return_6h,
    }];
  });
}

researchRoute.get("/", async (c) => {
  const reports: ResearchReport[] = [
    { days: 7, windows: await windowsFor(c.env.DB, 7) },
    { days: 30, windows: await windowsFor(c.env.DB, 30) },
  ];
  return c.json({ ok: true, reports });
});
