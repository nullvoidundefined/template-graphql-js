import rateLimit from "express-rate-limit";

import { isProduction } from "app/config/env.js";

if (isProduction() && !process.env.RATE_LIMIT_STORAGE_URI) {
  console.warn(
    "WARNING: rate limiter is using in-memory storage in production. " +
      "Set RATE_LIMIT_STORAGE_URI for a persistent store.",
  );
}

/** Global rate limiter applied to all routes. */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter limit for auth mutations to resist credential stuffing.
 * Apply to a dedicated auth REST route, or enforce inside resolvers using a per-IP counter.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
