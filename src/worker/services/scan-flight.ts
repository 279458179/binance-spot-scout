import { scanMarket } from "./scan";
import type { ScanPayload } from "@/shared/types";

interface Flight {
  payload: ScanPayload;
  expiresAt: number;
}

const FLIGHT_TTL_MS = 30_000;
let inFlight: Promise<ScanPayload> | null = null;
let recent: Flight | null = null;

export async function scanWithSingleFlight(baseUrls?: string): Promise<ScanPayload> {
  const now = Date.now();
  if (recent !== null && recent.expiresAt > now) return recent.payload;
  if (inFlight !== null) return inFlight;

  inFlight = scanMarket(baseUrls)
    .then((payload) => {
      recent = { payload, expiresAt: Date.now() + FLIGHT_TTL_MS };
      return payload;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
