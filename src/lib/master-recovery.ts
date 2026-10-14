import { timingSafeEqual } from "node:crypto";

/** Master-only spare login. The code lives in env and is never shown in the app. */
export function masterRecoveryMatches(input: string): boolean {
  const code = process.env.MASTER_RECOVERY_CODE ?? "";
  if (code.length < 8 || input.length === 0) return false;
  const given = Buffer.from(input);
  const expected = Buffer.from(code);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
