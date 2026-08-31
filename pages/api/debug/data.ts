import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";

const STATUS_LABELS: Record<string, string> = {
  present: "出席",
  late: "遅刻",
  absent: "欠席",
  excused: "公欠",
  early_leave: "早退",
  mid_absence: "中抜け",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const [
      users,
      classes,
      schedules,
      dailySessions,
      sessions,
      attendanceRecords,
    ] = await Promise.all([
      listCollection("users"),
      listCollection("classes"),
      listCollection("schedules"),
      listCollection("dailySessions"),
      listCollection("sessions"),
      listCollection("attendanceRecords"),
    ]);

    const usersById = new Map(users.map((u) => [u.id, u.data]));
    const classesById = new Map(classes.map((c) => [c.id, c.data]));
    const schedulesById = new Map(schedules.map((s) => [s.id, s.data]));
    const dailySessionsById = new Map(dailySessions.map((d) => [d.id, d.data]));
    const sessionsById = new Map(sessions.map((s) => [s.id, s.data]));

    const attendance = attendanceRecords.map((record) => {
      const data = record.data;
      const session = sessionsById.get(String(data.sessionId ?? ""));
      const dailySessionId = session?.dailySessionsId;
      const dailySession = dailySessionsById.get(String(dailySessionId ?? ""));
      const schedule = schedulesById.get(String(dailySession?.scheduleId ?? ""));
      const cls = classesById.get(String(schedule?.classId ?? ""));
      const student = usersById.get(String(data.userId ?? ""));

      return {
        recordId: record.id,
        date: dailySession?.timestamp ?? null,
        subjectName: schedule?.subjectName ?? null,
        className: cls?.name ?? null,
        studentName: student?.name ?? data.userId,
        status: STATUS_LABELS[String(data.status)] ?? data.status,
        absenceMinutes: data.absenceMinutes ?? 0,
      };
    });

    attendance.sort((a, b) => {
      const dateCompare = String(a.date ?? "").localeCompare(String(b.date ?? ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.studentName ?? "").localeCompare(String(b.studentName ?? ""));
    });

    res.status(200).json({ attendance, userCount: users.length, classCount: classes.length });
  } catch (error) {
    console.error("debug/data error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
