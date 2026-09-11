import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection, queryCollectionWhere } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { jstDayBoundsUtc } from "../../../lib/jstDate";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");

  try {
    const { start, end } = jstDayBoundsUtc(new Date());

    const [users, attendanceRecords] = await Promise.all([
      listCollection("users"),
      // pages/api/attendance/realtime.ts と同じ理由で、全期間を読んでメモリ上
      // で当日分に絞り込む代わりに confirmedAt(Firestore Timestamp)の範囲
      // クエリで当日分だけを取得する。
      queryCollectionWhere("attendanceRecords", [
        { field: "confirmedAt", op: "GREATER_THAN_OR_EQUAL", value: start },
        { field: "confirmedAt", op: "LESS_THAN", value: end },
      ]),
    ]);

    const rosterIds = new Set(
      users
        .filter((u) => u.data.role === "student" && u.data.classId === classId)
        .map((u) => u.id)
    );

    const records = attendanceRecords.filter((r) => rosterIds.has(String(r.data.userId ?? "")));

    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    for (const r of records) {
      switch (r.data.status) {
        case "present":
        case "early_leave":
        case "mid_absence":
          present += 1;
          break;
        case "late":
          late += 1;
          break;
        case "absent":
          absent += 1;
          break;
        case "excused":
          excused += 1;
          break;
        default:
          break;
      }
    }

    const total = records.length;
    const rosterSize = rosterIds.size;
    const attendanceRate = rosterSize > 0 ? Math.round(((present + late) / rosterSize) * 100) : 0;

    res.status(200).json({
      classId,
      attendanceRate,
      present,
      absent,
      late,
      excused,
      total,
    });
  } catch (error) {
    console.error("attendance/stats error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
