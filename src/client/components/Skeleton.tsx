/**
 * Skeleton placeholders used while a request is in flight, so the app never
 * renders a blank first paint.
 */

const BAR = "animate-pulse rounded-full bg-white/10";

/** A single grey bar. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`${BAR} ${className}`} />;
}

/** Placeholder that mirrors the shape of the decision card. */
export function SkeletonCard() {
  return (
    <div className="panel space-y-5 p-6" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <SkeletonBar className="h-5 w-28" />
        <SkeletonBar className="h-6 w-20" />
      </div>
      <SkeletonBar className="h-10 w-2/3" />
      <SkeletonBar className="h-4 w-1/2" />
      <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2 rounded-2xl bg-white/5 p-3">
            <SkeletonBar className="h-3 w-14" />
            <SkeletonBar className="h-5 w-20" />
          </div>
        ))}
      </div>
      <SkeletonBar className="h-11 w-full" />
    </div>
  );
}

/** Placeholder for a list of history rows. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="panel flex items-center gap-4 p-4">
          <SkeletonBar className="h-5 w-24" />
          <SkeletonBar className="h-5 w-14" />
          <SkeletonBar className="ml-auto h-5 w-16" />
        </div>
      ))}
    </div>
  );
}
