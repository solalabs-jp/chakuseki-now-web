import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { jstDayBoundsUtc, toJstDateString } from "../../../lib/jstDate";
import { queryAttendanceRecordsForDay } from "../../../lib/attendanceRecords";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");
  const scheduleId = req.query.scheduleId ? String(req.query.scheduleId) : null;

  try {
    const { start, end } = jstDayBoundsUtc(new Date());

    const [users, attendanceRecords, dailySessions, sessions] = await Promise.all([
      listCollection("users"),
      // pages/api/attendance/realtime.ts と同じ理由で、全期間を読んでメモリ上
      // で当日分に絞り込む代わりに confirmedAt の範囲クエリで当日分だけを
      // 取得する。
      queryAttendanceRecordsForDay(start, end),
      scheduleId ? listCollection("dailySessions") : Promise.resolve([]),
      scheduleId ? listCollection("sessions") : Promise.resolve([]),
    ]);

    const rosterIds = new Set(
      users
        .filter((u) => u.data.role === "student" && u.data.classId === classId)
        .map((u) => u.id)
    );

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    // attendanceRecords は queryAttendanceRecordsForDay で既に当日分のみに
    // 絞り込まれているため、あとはクラス名簿とスケジュール指定分の絞り込みだけ行う。
    let records = attendanceRecords.filter((r) => rosterIds.has(String(r.data.userId ?? "")));

    if (scheduleId) {
      const dailySession = dailySessions.find(
        (ds) =>
          ds.data.scheduleId === scheduleId &&
          toJstDateString(ds.data.date ?? ds.data.timestamp) === today
      );

      if (dailySession) {
        const sessionIds = new Set(
          sessions
            .filter((s) => s.data.dailySessionsId === dailySession.id || s.data.daily_sessionsId === dailySession.id)
            .map((s) => s.id)
        );
        records = records.filter((r) => sessionIds.has(String(r.data.sessionId ?? "")));
      } else {
        records = [];
      }
    }

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
