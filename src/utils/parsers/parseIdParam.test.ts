import { describe, expect, it } from "vitest";

import { parseIdParam } from "app/utils/parsers/parseIdParam.js";
import { uuid } from "app/utils/tests/uuids.js";

describe("parseIdParam", () => {
  it("returns the UUID when given a valid UUID v4 string", () => {
    const id = uuid();
    expect(parseIdParam(id)).toBe(id);
  });

  it("trims whitespace before validating", () => {
    const id = uuid();
    expect(parseIdParam(`  ${id}  `)).toBe(id);
  });

  it("returns null for undefined", () => {
    expect(parseIdParam(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseIdParam("")).toBeNull();
  });

  it("returns null for a non-UUID string", () => {
    expect(parseIdParam("not-a-uuid")).toBeNull();
  });

  it("returns null for a numeric string", () => {
    expect(parseIdParam("12345")).toBeNull();
  });

  it("is case-insensitive for hex digits", () => {
    const id = uuid().toUpperCase();
    expect(parseIdParam(id)).toBe(id.trim());
  });
});
