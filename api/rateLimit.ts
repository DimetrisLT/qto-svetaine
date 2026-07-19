// Paprastas in-memory „sliding window“ ribotuvas API užklausoms.
// Pakanka vienam procesui; jei būtų kelios instancijos – reikėtų Redis.
import type { Context, Next } from "hono";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Periodinis senų įrašų išvalymas (kas 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
}, 10 * 60 * 1000).unref();

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix?: string }) {
  const { windowMs, max, keyPrefix = "rl" } = opts;
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Per daug užklausų – bandykite vėliau." }, 429);
    }
    await next();
  };
}

// Bazinės saugos antraštės visoms HTML/API atsakymams
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}
