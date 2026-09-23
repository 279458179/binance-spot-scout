import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { NoTradeCard } from "@/client/components/NoTradeCard";
import { ResultCard } from "@/client/components/ResultCard";
import { ScanAgainButton } from "@/client/components/v11/ScanAgainButton";
import { CandidateHero } from "@/client/components/v11/CandidateHero";
import { HeroIntro } from "@/client/components/v11/HeroIntro";
import { HeroReveal } from "@/client/components/v11/HeroReveal";
import { MarketContext } from "@/client/components/v11/MarketContext";
import { RiskInsights, WhyThisCoin } from "@/client/components/v11/InsightLists";
import { ScanProgress } from "@/client/components/v11/ScanProgress";
import { ScanOrb } from "@/client/components/v11/ScanOrb";
import { SkeletonCard } from "@/client/components/Skeleton";
import { useLatestScan } from "@/client/hooks/useLatestScan";
import { useNow } from "@/client/hooks/useNow";
import { useScan } from "@/client/hooks/useScan";
import { ageMs } from "@/client/lib/format";
import { SCAN_CONFIG } from "@/config/strategy";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResponse } from "@/client/lib/api";

/** Home: one tap, one candidate — or an honest no-trade call. */
export function HomePage(): ReactNode {
  const latest = useLatestScan();
  const scan = useScan();
  const now = useNow(1000);

  const payload: ScanResponse | null = scan.data ?? latest.data;
  const result = payload?.result ?? null;
  const stale =
    result !== null &&
    ageMs(result.generatedAt, now) > SCAN_CONFIG.dataFreshnessMs;
  const busy = scan.loading;
  const error = scan.error ?? latest.error;

  const handleScan = (): void => {
    void scan.run();

    if (latest.error !== null && scan.error === null) {
      latest.reload();
    }
  };

  const firstPaint = latest.loading && scan.data === null && latest.data === null;

  return (
    <div className="space-y-5 pt-2">
      {result !== null ? <MarketContext regime={result.marketRegime} /> : null}

      {firstPaint ? (
        <div className="space-y-5">
          <SkeletonCard />
          <ScanOrb />
        </div>
      ) : (
        <>
          {scan.loading ? <ScanProgress /> : null}

          <AnimatePresence mode="wait">
            {result !== null ? (
              result.status === "MARKET_HALT" || result.symbol === null ? (
                <NoTradeCard result={result} stale={stale} onRescan={handleScan} rescanning={busy} />
              ) : (
                <HeroReveal key={`${result.generatedAt}-${result.status}`} visible>
                  <div className="space-y-4">
                    <CandidateHero result={result} recentPrices={result.recentPrices} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <WhyThisCoin reasons={result.reasons ?? []} />
                      <RiskInsights risks={result.risks ?? []} />
                    </div>
                    <ResultCard result={result} stale={stale} />
                  </div>
                </HeroReveal>
              )
            ) : null}
          </AnimatePresence>

          {error !== null ? (
            <motion.p
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              role="alert"
              className="rounded-2xl bg-coral-950/70 p-4 text-sm leading-relaxed text-coral-300"
            >
              {error}
            </motion.p>
          ) : null}
        </>
      )}

      {result === null ? <HeroIntro /> : null}

      <ScanAgainButton
        onClick={handleScan}
        loading={busy}
        disabled={latest.loading && result === null}
      />
    </div>
  );
}
