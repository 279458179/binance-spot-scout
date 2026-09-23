type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Map<string, Bucket>>();

export function rateLimit(scope: string, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const scoped = BUCKETS.get(scope) ?? new Map<string, Bucket>();
  if (!scoped.has(key)) BUCKETS.set(scope, scoped);
  const bucket = scoped.get(key);
  if (!bucket || bucket.resetAt <= now) {
    scoped.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
