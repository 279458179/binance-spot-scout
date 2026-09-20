import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { LoadingPaw } from "@/client/components/LoadingPaw";
import { NoTradeCard } from "@/client/components/NoTradeCard";
import { ResultCard } from "@/client/components/ResultCard";
import { ScanButton } from "@/client/components/ScanButton";
import { SkeletonCard } from "@/client/components/Skeleton";
import { WaitPullbackCard } from "@/client/components/WaitPullbackCard";
import { useLatestScan } from "@/client/hooks/useLatestScan";
import { useNow } from "@/client/hooks/useNow";
import { useScan } from "@/client/hooks/useScan";
import { ageMs } from "@/client/lib/format";
import { SCAN_CONFIG } from "@/config/strategy";
import { fadeInUp } from "@/client/animations/variants";
import type { ScanResult } from "@/shared/types";
import type { ScanResponse } from "@/client/lib/api";

/** Picks the card that matches the decision, never the symbol alone. */
function DecisionCard({
  result,
  stale,
  onRescan,
  rescanning,
}: {
  result: ScanResult;
  stale: boolean;
  onRescan: () => void;
  rescanning: boolean;
}): ReactNode {
  if (result.status === "ENTRY_NOW" && result.symbol !== null) {
    return (
      <ResultCard
        result={result}
        stale={stale}
        onRescan={onRescan}
        rescanning={rescanning}
      />
    );
  }

  if (result.status === "WAIT_PULLBACK" && result.symbol !== null) {
    return (
      <WaitPullbackCard
        result={result}
        stale={stale}
        onRescan={onRescan}
        rescanning={rescanning}
      />
    );
  }

  return (
    <NoTradeCard
      result={result}
      stale={stale}
      onRescan={onRescan}
      rescanning={rescanning}
    />
  );
}

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
    <div className="space-y-5">
      <motion.section
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          点击一次，只给你一个候选人
        </h1>
        <p className="text-sm leading-relaxed text-ink-400">
          我会先扫过全市场 USDT 现货合约对，做流动性过滤和技术面初筛，再对少数候选做深度扫描。
          没有值得出手的结构时，我会直接说「今天不出手」。
        </p>
      </motion.section>

      {firstPaint ? (
        <div className="space-y-5">
          <SkeletonCard />
          <LoadingPaw />
        </div>
      ) : (
        <>
          {scan.loading ? <LoadingPaw hint="正在重新扫描全市场…" /> : null}

          <AnimatePresence mode="wait">
            {result !== null ? (
              <DecisionCard
                key={`${result.generatedAt}-${result.status}`}
                result={result}
                stale={stale}
                onRescan={handleScan}
                rescanning={busy}
              />
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

      <ScanButton
        onClick={handleScan}
        loading={busy}
        disabled={latest.loading && result === null}
        label={result === null && error === null ? "帮我选一个" : "重新扫描"}
        loadingLabel="扫描中…"
      />
    </div>
  );
}
