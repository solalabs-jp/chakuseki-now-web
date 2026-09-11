import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection, queryCollectionWhere } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

const STATUS_LABELS: Record<string, string> = {
  present: "出席",
  late: "遅刻",
  absent: "欠席",
  excused: "公欠",
  early_leave: "早退",
  mid_absence: "中抜け",
};

function formatTime(iso: unknown): string {
  if (typeof iso !== "string") return "--:--:--";
  const match = iso.match(/T(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : "--:--:--";
}

/**
 * JST での「今日」の 00:00:00〜翌日00:00:00 を表す境界を返す(内部表現は UTC の
 * Date で問題ない。timestampValue として送る際に UTC ISO 文字列化されるため)。
 * confirmedAt は Firestore の Timestamp 型で保存されているので、この範囲で
 * Firestore 側に絞り込ませれば、全期間を読んでメモリ上でフィルタする必要がない。
 * JST は DST が無いため常に +09:00 固定で計算してよい。
 */
function jstDayBoundsUtc(now: Date): { start: Date; end: Date } {
  const jstDateString = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const start = new Date(`${jstDateString}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");

  try {
    const { start, end } = jstDayBoundsUtc(new Date());

    const [users, attendanceRecords, checkinAnswers] = await Promise.all([
      listCollection("users"),
      // 全期間を読んでメモリ上で当日分に絞り込む代わりに、Firestore 側の
      // 範囲クエリ(confirmedAt >= 今日0時 かつ < 翌日0時)で当日分だけを
      // 取得する。過去分が積み上がるほど listCollection の全件読み取りは
      // 重くなるため、ポーリング頻度を上げてもコストが増えないようにする。
      //
      // この範囲クエリは confirmedAt が Firestore の Timestamp 型で保存
      // されている前提(型が一致しない値は Firestore 側の比較でヒットせず
      // 除外され、こちら側からは検知できない)。attendanceRecords への書き込み
      // はこのリポジトリの外(学生向けアプリ側)で行われており、当時点で
      // 全件(22件, うち非null 17件)を確認したところ全て Timestamp だった。
      // もし将来 confirmedAt が文字列等で書き込まれる経路が増えると、
      // このクエリはその分だけ静かに students: [] 側にヒットしなくなる。
      queryCollectionWhere("attendanceRecords", [
        { field: "confirmedAt", op: "GREATER_THAN_OR_EQUAL", value: start },
        { field: "confirmedAt", op: "LESS_THAN", value: end },
      ]),
      listCollection("checkinAnswers"),
    ]);

    const rosterById = new Map(
      users
        .filter((u) => u.data.role === "student" && u.data.classId === classId)
        .map((u) => [u.id, u.data])
    );

    const answerByRecordId = new Map(
      checkinAnswers.map((a) => [String(a.data.attendance_reId ?? ""), a.data])
    );

    const list = attendanceRecords
      .filter((r) => rosterById.has(String(r.data.userId ?? "")))
      .sort((a, b) =>
        String(a.data.confirmedAt ?? "").localeCompare(String(b.data.confirmedAt ?? ""))
      )
      .map((record) => {
        const student = rosterById.get(String(record.data.userId ?? ""));
        const answer = answerByRecordId.get(record.id);
        const comment = answer && !answer.isSkipped ? (answer.answerText as string) : null;

        return {
          recordId: record.id,
          id: String(record.data.userId ?? ""),
          name: student?.name ?? record.data.userId,
          status: STATUS_LABELS[String(record.data.status)] ?? String(record.data.status),
          time: formatTime(record.data.confirmedAt),
          comment,
        };
      });

    res.status(200).json({ classId, students: list });
  } catch (error) {
    console.error("attendance/realtime error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
