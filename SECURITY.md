# Security Requirements for a Production-Ready GraphQL Backend

---

## 1. Authentication

- Enforce authentication on all queries and mutations unless explicitly marked as public (e.g., login, registration, public content).
- Use short-lived JWTs (access tokens) paired with secure, HTTP-only refresh tokens. Never store tokens in localStorage.
- Validate tokens on every request at the gateway or middleware layer before resolvers execute.
- Support token revocation (e.g., a deny-list in Redis or a `jti` claim check) for logout and compromised credential scenarios.
- Require re-authentication for sensitive operations (password change, email change, account deletion).

## 2. Authorization

- Implement field-level and object-level authorization, not just query-level. A user who can read their own profile should not be able to read another user's private fields.
- Use a dedicated authorization layer (e.g., directive-based `@auth`, middleware, or a policy engine like OPA) rather than scattering permission checks inside individual resolvers.
- Default to deny. If no explicit permission is granted, the field or operation should be inaccessible.
- Audit and test authorization rules against role escalation: can a regular user access admin mutations by crafting a direct request?
- Prevent IDOR (Insecure Direct Object Reference) by validating that the authenticated user has a legitimate relationship to the requested resource, not just a valid ID.

## 3. Query Complexity and Depth Limiting

- Set a maximum query depth (e.g., 10 levels) to prevent deeply nested queries that exploit relational data.
- Assign cost values to fields and enforce a maximum query cost per request. Expensive fields (e.g., `users { posts { comments { author } } }`) should carry higher weights.
- Reject queries that exceed complexity thresholds before execution, returning a clear error.
- Limit the number of aliases allowed per query to prevent alias-based batching attacks (e.g., sending 1,000 aliased password-check mutations in a single request).
- Set a maximum query size in bytes at the HTTP layer to reject absurdly large payloads before they reach the parser.

## 4. Rate Limiting and Throttling

- Apply rate limiting at the IP level, the authenticated-user level, and (if applicable) the API-key level.
- Rate limit by query cost, not just by request count. A single high-cost query should consume more of a user's budget than a simple lookup.
- Implement separate, stricter rate limits for sensitive operations: login attempts, password resets, OTP verification, account creation.
- Return standard `429 Too Many Requests` responses with `Retry-After` headers.
- Consider sliding-window or token-bucket algorithms over fixed-window counters to prevent burst abuse at window boundaries.

## 5. Input Validation and Injection Prevention

- Validate all input arguments with strict type checking, length limits, and format constraints (regex where appropriate) at the schema and resolver level.
- Never interpolate user input directly into SQL, NoSQL queries, or shell commands. Use parameterized queries or an ORM with proper escaping.
- Sanitize string inputs that will be rendered in any downstream context (email templates, PDFs, logs) to prevent injection.
- Validate file uploads (if supported via multipart): check MIME type against an allowlist, enforce size limits, scan for malware, and store files outside the web root with randomized names.
- Reject or strip null bytes and other control characters from string inputs.

## 6. Introspection and Schema Exposure

- Disable introspection in production. Introspection queries (`__schema`, `__type`) expose your entire API surface to attackers.
- If introspection must remain available (e.g., for internal tooling), restrict it to authenticated requests from trusted roles or IP ranges.
- Do not expose field-level deprecation reasons, internal comments, or implementation details in schema descriptions that are accessible to end users.
- Consider field-level visibility: some schema fields should only appear in the introspection response for users with the appropriate role.

## 7. Error Handling and Information Leakage

- Never return raw stack traces, database error messages, or internal service details in production error responses.
- Use a structured error format with a user-facing message and an internal error code. Log the full error server-side with a correlation ID that the client can reference for support.
- Mask resolver errors behind generic messages. "Something went wrong" is better than "Cannot read property 'email' of null from UserService.findById."
- Return consistent error shapes for authentication and authorization failures. Do not leak whether a user account exists via different error messages for "user not found" vs. "wrong password."
- Disable GraphQL suggestions (e.g., "Did you mean 'user'?") in production, as they aid schema enumeration.

## 8. Transport Security

- Enforce HTTPS (TLS 1.2+) for all traffic. Redirect HTTP to HTTPS. Set HSTS headers with a long max-age.
- If the backend sits behind a reverse proxy or load balancer, ensure the proxy terminates TLS and communicates with the backend over a trusted internal network or mutual TLS.
- Set appropriate CORS headers. Restrict `Access-Control-Allow-Origin` to known frontend domains. Never use `*` in production with credentialed requests.
- For WebSocket subscriptions (if used), enforce the same authentication and origin checks on the `connection_init` handshake. Do not trust the upgrade request alone.

## 9. Denial of Service (DoS) Protection

- Set timeouts on resolver execution. A resolver that takes longer than a defined threshold (e.g., 10 seconds) should be killed and return an error.
- Limit request body size at the HTTP server or reverse proxy level (e.g., 1 MB for standard queries).
- Protect against batched query attacks: if your server accepts arrays of operations in a single request, limit the batch size (e.g., max 5 operations per request) or disable batching entirely.
- Implement circuit breakers on downstream service calls so a slow or failing dependency does not cascade into full API unavailability.
- Use persistent query allowlists (APQ / persisted queries) in high-security environments. The server only accepts queries that match a pre-registered hash, completely eliminating arbitrary query execution.

## 10. Logging, Monitoring, and Auditing

- Log all authentication events (login, logout, token refresh, failed attempts) with timestamps, IP addresses, and user agents.
- Log all authorization failures (access denied) with the user ID, requested resource, and the permission that was missing.
- Log query metadata (operation name, complexity cost, execution time, user ID) for every request. Do not log full query bodies in production unless redacted, as they may contain sensitive arguments.
- Redact sensitive fields (passwords, tokens, PII) from all logs.
- Set up alerts for anomalous patterns: sudden spikes in failed auth attempts, unusually high query costs from a single user, or elevated error rates.
- Maintain an immutable audit trail for security-critical mutations (role changes, permission grants, account deletions, data exports).

## 11. Dependency and Supply Chain Security

- Pin all dependency versions. Use a lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`).
- Run automated vulnerability scanning on dependencies in CI (e.g., `npm audit`, Snyk, Socket, Dependabot).
- Review new dependencies before adding them. Evaluate maintenance status, download counts, and known vulnerabilities.
- Keep the GraphQL server library (`apollo-server`, `graphql-yoga`, `mercurius`, etc.) and the `graphql` reference implementation up to date. Security patches in these libraries are critical.
- Do not run production containers as root. Use a minimal base image and a non-root user.

## 12. Secrets Management

- Never hardcode API keys, database credentials, JWT signing secrets, or encryption keys in source code or configuration files checked into version control.
- Use a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager) or encrypted environment variables injected at deploy time.
- Rotate secrets on a defined schedule and immediately after any suspected compromise.
- Use separate secrets for each environment (development, staging, production). A leaked dev secret should not grant access to production.

## 13. Subscription Security (If Applicable)

- Authenticate WebSocket connections during the `connection_init` phase. Reject unauthenticated connections before they can subscribe to any topic.
- Authorize each subscription individually. A user should only receive events for resources they have permission to access.
- Limit the number of concurrent subscriptions per user to prevent resource exhaustion.
- Implement connection timeouts and periodic keep-alive checks. Drop idle or stale connections.
- Validate and sanitize subscription filter arguments with the same rigor as query arguments.

## 14. Data Exposure and Pagination

- Never return unbounded lists. All list fields must support pagination (cursor-based preferred) and enforce a maximum page size (e.g., `first: 100` max).
- Audit the schema for fields that inadvertently expose sensitive data: internal IDs, email addresses, hashed passwords, or metadata intended for admin use.
- Implement field-level cost analysis so that requesting expensive computed fields (e.g., aggregations, counts across large datasets) is accounted for in the query cost budget.
- Avoid returning raw database IDs when opaque, non-sequential identifiers (UUIDs or globally unique Relay-style IDs) are sufficient.

## 15. CSRF and Cross-Origin Protections

- For cookie-based authentication, enforce CSRF protection using the `SameSite` cookie attribute (`Strict` or `Lax`) and a CSRF token header (e.g., `X-CSRF-Token`) validated on every mutation.
- Reject requests with unexpected `Content-Type` headers. GraphQL endpoints should only accept `application/json` (and `multipart/form-data` if file uploads are supported).
- Validate the `Origin` or `Referer` header on mutation requests as a defense-in-depth measure.
- Do not support GET-based queries for mutations. Mutations must use POST to prevent CSRF via link/image tags.
