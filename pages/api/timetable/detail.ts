import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";

function formatTime(value: unknown): string {
  // startAt/endAt may be an "HHMM" integer (e.g. 915) or an ISO timestamp string.
  if (typeof value === "number") {
    const padded = String(value).padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  if (typeof value === "string") {
    const isoMatch = value.match(/T(\d{2}):(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}:${isoMatch[2]}`;
    const hhmmMatch = value.match(/^(\d{1,2})(\d{2})$/);
    if (hhmmMatch) return `${hhmmMatch[1].padStart(2, "0")}:${hhmmMatch[2]}`;
  }
  return "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const classId = String(req.query.classId ?? "class-2A");

  try {
    const [classes, schedules, periods, users] = await Promise.all([
      listCollection("classes"),
      listCollection("schedules"),
      listCollection("periods"),
      listCollection("users"),
    ]);

    const cls = classes.find((c) => c.id === classId);
    const periodsById = new Map(periods.map((p) => [p.id, p.data]));
    const usersById = new Map(users.map((u) => [u.id, u.data]));

    const classSchedules = schedules
      .filter((s) => s.data.classId === classId)
      .map((s) => {
        const period = periodsById.get(String(s.data.periodId ?? ""));
        const teacher = usersById.get(String(s.data.defaultTeacherId ?? ""));

        return {
          scheduleId: s.id,
          subject: s.data.subjectName,
          teacher: teacher?.name ?? s.data.defaultTeacherId,
          dayOfWeek: Number(s.data.dayOfWeek ?? 0),
          period: Number(period?.period ?? 0),
          periodLabel: period
            ? `${period.period}限（${formatTime(period.startAt)}-${formatTime(period.endAt)}）`
            : "",
        };
      });

    const periodOptions = periods
      .map((p) => ({
        id: p.id,
        period: Number(p.data.period ?? 0),
        label: `${p.data.period}限（${formatTime(p.data.startAt)}-${formatTime(p.data.endAt)}）`,
      }))
      .sort((a, b) => a.period - b.period);

    res.status(200).json({
      classId,
      className: cls?.data.name ?? classId,
      schedules: classSchedules,
      periods: periodOptions,
    });
  } catch (error) {
    console.error("timetable/detail error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
