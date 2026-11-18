/**
 * A numeric id from a request (string or number), or null if it is not one.
 * Kingdom numbers are normalized ('0710' and '710' are the same kingdom).
 */
export function parseFid(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

export function parseKingdom(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return /^\d+$/.test(s) && Number(s) >= 1 ? String(Number(s)) : null;
}
