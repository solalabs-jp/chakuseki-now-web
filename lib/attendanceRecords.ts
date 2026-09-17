import { queryCollectionWhere, type FirestoreDoc } from "./firestoreRest";

/**
 * confirmedAt が当日(JST)範囲内の attendanceRecords を取得する。
 * pages/api/attendance/realtime.ts と stats.ts の両方で必要な処理のため
 * ここに一本化する。
 *
 * attendanceRecords への書き込みはこのリポジトリの外(学生向けアプリ)で
 * 行われており、confirmedAt が Firestore の Timestamp 型で保存されている
 * 前提で範囲クエリしている(型が一致しない値は Firestore 側の比較で
 * ヒットしない)。将来 confirmedAt が文字列(ISO 8601)で書き込まれる経路が
 * 増えた場合に備え、文字列型での範囲クエリも並行して実行し結果を合算する。
 * 文字列型のレコードが見つかった場合は警告ログを出し、想定外のデータ形式
 * が増えていることに気付けるようにする(サイレントな取りこぼしを防ぐ)。
 * @param {Date} start 範囲の開始(含む)。
 * @param {Date} end 範囲の終了(含まない)。
 * @return {Promise<FirestoreDoc[]>} 当日分の attendanceRecords。
 */
export async function queryAttendanceRecordsForDay(
  start: Date,
  end: Date
): Promise<FirestoreDoc[]> {
  const [timestampRecords, stringRecords] = await Promise.all([
    queryCollectionWhere("attendanceRecords", [
      { field: "confirmedAt", op: "GREATER_THAN_OR_EQUAL", value: start },
      { field: "confirmedAt", op: "LESS_THAN", value: end },
    ]),
    queryCollectionWhere("attendanceRecords", [
      { field: "confirmedAt", op: "GREATER_THAN_OR_EQUAL", value: start.toISOString() },
      { field: "confirmedAt", op: "LESS_THAN", value: end.toISOString() },
    ]),
  ]);

  if (stringRecords.length > 0) {
    console.warn(
      "queryAttendanceRecordsForDay: confirmedAtが文字列型のattendanceRecordsを検出しました。" +
        "Timestamp前提の範囲クエリが今後取りこぼす可能性があります。",
      { count: stringRecords.length, ids: stringRecords.map((r) => r.id) }
    );
  }

  const byId = new Map(timestampRecords.map((r) => [r.id, r]));
  for (const r of stringRecords) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return [...byId.values()];
}
