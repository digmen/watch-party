import { describe, expect, test } from "bun:test";
import { hashToken } from "./token.util";

describe("hashToken", () => {
  test("is deterministic for the same input", () => {
    expect(hashToken("same-token")).toBe(hashToken("same-token"));
  });

  test("differs for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  test("never returns the raw token back (one-way)", () => {
    const raw = "super-secret-refresh-token";
    expect(hashToken(raw)).not.toBe(raw);
  });

  test("produces a fixed-length hex digest", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
