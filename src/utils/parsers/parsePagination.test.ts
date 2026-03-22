import { describe, expect, it } from "vitest";

import { parsePagination } from "app/utils/parsers/parsePagination.js";

describe("parsePagination", () => {
  it("returns default limit and 0 offset when params are undefined", () => {
    expect(parsePagination(undefined, undefined)).toEqual({ limit: 50, offset: 0 });
  });

  it("returns default limit when limit is empty string", () => {
    expect(parsePagination("", undefined)).toEqual({ limit: 50, offset: 0 });
  });

  it("parses valid limit and offset", () => {
    expect(parsePagination(10, 20)).toEqual({ limit: 10, offset: 20 });
  });

  it("clamps limit to a minimum of 1", () => {
    expect(parsePagination(0, 0)).toEqual({ limit: 1, offset: 0 });
    expect(parsePagination(-5, 0)).toEqual({ limit: 1, offset: 0 });
  });

  it("clamps limit to a maximum of 100", () => {
    expect(parsePagination(200, 0)).toEqual({ limit: 100, offset: 0 });
  });

  it("floors fractional limit values", () => {
    expect(parsePagination(10.9, 0)).toEqual({ limit: 10, offset: 0 });
  });

  it("returns default limit for NaN limit", () => {
    expect(parsePagination("abc", 0)).toEqual({ limit: 50, offset: 0 });
  });

  it("clamps offset to a minimum of 0", () => {
    expect(parsePagination(10, -5)).toEqual({ limit: 10, offset: 0 });
  });

  it("floors fractional offset values", () => {
    expect(parsePagination(10, 5.9)).toEqual({ limit: 10, offset: 5 });
  });

  it("returns 0 offset for NaN offset", () => {
    expect(parsePagination(10, "abc")).toEqual({ limit: 10, offset: 0 });
  });

  it("returns 0 offset for empty string offset", () => {
    expect(parsePagination(10, "")).toEqual({ limit: 10, offset: 0 });
  });
});
