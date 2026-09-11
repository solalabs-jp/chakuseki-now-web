/**
 * Formats a BLE beacon ID as a standard UUID (8-4-4-4-12), e.g.
 * "01020304050607080910111213141516" -> "01020304-0506-0708-0910-111213141516".
 * Used both client-side (as-you-type formatting) and server-side (to
 * normalize whatever a client sends before it's stored), so a value can
 * never be saved without dashes and fail to match on the receiving side.
 *
 * Keep this in sync with normalizeBeaconId in functions/src/index.ts —
 * they can't share code directly since functions/ and the web app are
 * separate packages, but both must agree on what counts as an equivalent
 * beacon ID or matching breaks again.
 */
export function formatBeaconId(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 32).toUpperCase();
  const groups = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].filter(Boolean);
  return groups.join('-');
}
