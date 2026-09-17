/**
 * periods.startAt/endAt(HHMM 整数、例: 915 → "09:15")を表示用の "HH:MM" に
 * 変換する。pages/api/dashboard/today.ts と pages/api/timetable/detail.ts の
 * 両方が同じ変換を別々に実装していたため、ここに一本化する。
 */
export function hhmmToLabel(value: number): string {
  const padded = String(value).padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}
