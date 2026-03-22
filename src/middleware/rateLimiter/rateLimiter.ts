import { GraphQLError } from "graphql";
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

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store keyed by IP. For production with multiple instances, replace with Redis.
const authAttempts = new Map<string, RateLimitEntry>();

/**
 * Programmatic auth rate limiter for use inside GraphQL resolvers.
 * Throws RATE_LIMITED after AUTH_MAX_ATTEMPTS requests from the same IP within AUTH_WINDOW_MS.
 * Call at the top of login and register resolvers.
 */
export function checkAuthRateLimit(ip: string | undefined): void {
  if (!ip) return;
  const now = Date.now();
  const entry = authAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > AUTH_MAX_ATTEMPTS) {
    throw new GraphQLError("Too many attempts. Please try again later.", {
      extensions: { code: "RATE_LIMITED" },
    });
  }
}
