import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { formatJstTime } from "../../../lib/jstDate";

function formatTime(value: unknown): string {
  // startAt/endAt may be an "HHMM" integer (e.g. 915) or an ISO timestamp string.
  if (typeof value === "number") {
    const padded = String(value).padStart(4, "0");
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }
  if (typeof value === "string") {
    if (/T\d{2}:\d{2}/.test(value)) {
      // ISO タイムスタンプ文字列(Firestore Timestamp を REST 経由で取得
      // すると UTC になる)。時刻部分をそのまま切り出すと JST とは9時間
      // ずれるため、タイムゾーン変換してフォーマットする
      // (pages/api/attendance/realtime.ts と同じ問題・同じ対処)。
      return formatJstTime(value, { seconds: false, fallback: "" });
    }
    const hhmmMatch = value.match(/^(\d{1,2})(\d{2})$/);
    if (hhmmMatch) return `${hhmmMatch[1].padStart(2, "0")}:${hhmmMatch[2]}`;
  }
  return "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

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
