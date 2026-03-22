const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses a value as a UUID string.
 * Returns null if the value is not a valid UUID.
 */
export function parseIdParam(id: string | undefined): string | null {
  const s = typeof id === "string" ? id.trim() : "";
  return s && UUID_REGEX.test(s) ? s : null;
}
