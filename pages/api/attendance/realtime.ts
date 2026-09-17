import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { formatJstTime, jstDayBoundsUtc, toJstDateString } from "../../../lib/jstDate";
import { queryAttendanceRecordsForDay } from "../../../lib/attendanceRecords";

import { STATUS_LABELS } from "../../../lib/statusUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");
  const scheduleId = req.query.scheduleId ? String(req.query.scheduleId) : null;

  try {
    const { start, end } = jstDayBoundsUtc(new Date());

    const [users, attendanceRecords, checkinAnswers, dailySessions, sessions] = await Promise.all([
      listCollection("users"),
      // 全期間を読んでメモリ上で当日分に絞り込む代わりに、Firestore 側の
      // 範囲クエリ(confirmedAt >= 今日0時 かつ < 翌日0時)で当日分だけを
      // 取得する。過去分が積み上がるほど listCollection の全件読み取りは
      // 重くなるため、ポーリング頻度を上げてもコストが増えないようにする。
      queryAttendanceRecordsForDay(start, end),
      listCollection("checkinAnswers"),
      scheduleId ? listCollection("dailySessions") : Promise.resolve([]),
      scheduleId ? listCollection("sessions") : Promise.resolve([]),
    ]);

    const rosterById = new Map(
      users
        .filter((u) => u.data.role === "student" && u.data.classId === classId)
        .map((u) => [u.id, u.data])
    );

    const answerByRecordId = new Map(
      checkinAnswers.map((a) => [String(a.data.attendance_reId ?? ""), a.data])
    );

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    // attendanceRecords は queryAttendanceRecordsForDay で既に当日分のみに
    // 絞り込まれているため、あとはクラス名簿とスケジュール指定分の絞り込みだけ行う。
    let filteredRecords = attendanceRecords.filter((r) => rosterById.has(String(r.data.userId ?? "")));

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
        filteredRecords = filteredRecords.filter((r) => sessionIds.has(String(r.data.sessionId ?? "")));
      } else {
        filteredRecords = [];
      }
    }

    const list = filteredRecords
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
          time: formatJstTime(record.data.confirmedAt),
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
