import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";

const DAY_LABELS = ["", "月", "火", "水", "木", "金", "土", "日"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const [classes, users, schedules, periods] = await Promise.all([
      listCollection("classes"),
      listCollection("users"),
      listCollection("schedules"),
      listCollection("periods"),
    ]);

    const periodsById = new Map(periods.map((p) => [p.id, p.data]));

    const result = classes.map((cls) => {
      const studentCount = users.filter(
        (u) => u.data.role === "student" && u.data.classId === cls.id
      ).length;

      const classSchedules = schedules
        .filter((s) => s.data.classId === cls.id)
        .map((s) => {
          const period = periodsById.get(String(s.data.periodId ?? ""));
          return {
            scheduleId: s.id,
            subjectName: s.data.subjectName,
            dayOfWeek: s.data.dayOfWeek,
            dayLabel: DAY_LABELS[Number(s.data.dayOfWeek ?? 0)] ?? "",
            period: period?.period ?? null,
            defaultTeacherId: s.data.defaultTeacherId,
          };
        })
        .sort((a, b) => {
          const dayDiff = Number(a.dayOfWeek ?? 0) - Number(b.dayOfWeek ?? 0);
          if (dayDiff !== 0) return dayDiff;
          return Number(a.period ?? 0) - Number(b.period ?? 0);
        });

      return {
        id: cls.id,
        name: cls.data.name ?? cls.id,
        gradeYear: cls.data.gradeYear ?? null,
        studentCount,
        schedules: classSchedules,
      };
    });

    res.status(200).json({ classes: result });
  } catch (error) {
    console.error("timetable/classes error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
