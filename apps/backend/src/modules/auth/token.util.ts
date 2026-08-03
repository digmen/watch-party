import { createHash } from "node:crypto";

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
