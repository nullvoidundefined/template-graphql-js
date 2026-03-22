import type { User } from "app/schemas/user.js";

/** Minimal cookie options to avoid importing Express types directly. */
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: number;
  path?: string;
}

export interface GraphQLContext {
  /** The authenticated user for this request, or null if unauthenticated. */
  user: User | null;
  /** Parsed cookies from the incoming request (keyed by cookie name). */
  cookies: Record<string, string | undefined>;
  /** Sets a response cookie. */
  setCookie: (name: string, value: string, options?: CookieOptions) => void;
  /** Clears a response cookie. */
  clearCookie: (name: string) => void;
  /** Client IP address, used for rate limiting and audit logging. */
  ip: string | undefined;
  /** User-Agent header, used for audit logging. */
  userAgent: string | undefined;
}
