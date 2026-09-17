/**
 * Formats a BLE beacon ID as a standard UUID (8-4-4-4-12), e.g.
 * "01020304050607080910111213141516" -> "01020304-0506-0708-0910-111213141516".
 * Used both client-side (as-you-type formatting) and server-side (to
 * normalize whatever a client sends before it's stored), so a value can
 * never be saved without dashes and fail to match on the receiving side.
 *
 * functions/src/beaconId.ts is a symlink to this file, so the Cloud
 * Functions runtime and the web app share this single implementation —
 * do not create a second copy there.
 * @param {string} raw Raw beacon ID (any case, with or without dashes).
 * @return {string} The normalized 8-4-4-4-12 hex UUID.
 */
export function formatBeaconId(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 32).toUpperCase();
  const groups = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].filter(Boolean);
  return groups.join("-");
}
