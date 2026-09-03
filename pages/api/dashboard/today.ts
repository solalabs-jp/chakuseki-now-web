import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

function jstNow(): Date {
  const now = new Date();
  const jstString = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  return new Date(jstString);
}

function jstDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// Firestore's dayOfWeek convention: 1=月...7=日. JS Date#getDay(): 0=日...6=土.
function toScheduleDayOfWeek(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function hhmmToMinutes(value: unknown): number | null {
  if (typeof value !== "number") return null;
  const hours = Math.floor(value / 100);
  const minutes = value % 100;
  return hours * 60 + minutes;
}

function formatHhmm(value: unknown): string {
  if (typeof value !== "number") return "";
  const padded = String(value).padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

const ATTENDED_STATUSES = new Set(["present", "late", "early_leave", "mid_absence"]);

function dailySessionDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = typeof req.query.classId === "string" ? req.query.classId : null;
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : null;

  try {
    const [schedules, periods, classes, users, dailySessions, sessions, attendanceRecords] =
      await Promise.all([
        listCollection("schedules"),
        listCollection("periods"),
        listCollection("classes"),
        listCollection("users"),
        listCollection("dailySessions"),
        listCollection("sessions"),
        listCollection("attendanceRecords"),
      ]);

    const now = jstNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayScheduleDay = toScheduleDayOfWeek(now.getDay());
    const today = jstDateString();

    const periodsById = new Map(periods.map((p) => [p.id, p.data]));
    const classesById = new Map(classes.map((c) => [c.id, c.data]));

    const rosterCountByClassId = new Map<string, number>();
    for (const u of users) {
      if (u.data.role !== "student") continue;
      const classId = String(u.data.classId ?? "");
      rosterCountByClassId.set(classId, (rosterCountByClassId.get(classId) ?? 0) + 1);
    }

    const todaysSchedules = schedules.filter((s) => {
      if (Number(s.data.dayOfWeek) !== todayScheduleDay) return false;
      if (classId) return s.data.classId === classId;
      if (teacherId) return s.data.defaultTeacherId === teacherId;
      return true;
    });

    const items = todaysSchedules
      .map((schedule) => {
        const period = periodsById.get(String(schedule.data.periodId ?? ""));
        const startMinutes = hhmmToMinutes(period?.startAt);
        const endMinutes = hhmmToMinutes(period?.endAt);
        const total = rosterCountByClassId.get(String(schedule.data.classId ?? "")) ?? 0;

        // Find today's dailySession for this schedule, then count today's attendance.
        const dailySession = dailySessions.find(
          (ds) =>
            ds.data.scheduleId === schedule.id &&
            dailySessionDateString(ds.data.date ?? ds.data.timestamp) === today
        );

        let attended = 0;
        if (dailySession) {
          const sessionIds = new Set(
            sessions
              .filter((s) => s.data.dailySessionsId === dailySession.id || s.data.daily_sessionsId === dailySession.id)
              .map((s) => s.id)
          );
          attended = attendanceRecords.filter(
            (r) => sessionIds.has(String(r.data.sessionId ?? "")) && ATTENDED_STATUSES.has(String(r.data.status))
          ).length;
        }

        const cls = classesById.get(String(schedule.data.classId ?? ""));
        const period_ = period?.period ?? null;

        let timeStatus: "past" | "current" | "future" = "future";
        if (startMinutes !== null && endMinutes !== null) {
          if (nowMinutes > endMinutes) timeStatus = "past";
          else if (nowMinutes >= startMinutes) timeStatus = "current";
        }

        return {
          scheduleId: schedule.id,
          subjectName: schedule.data.subjectName,
          className: cls?.name ?? schedule.data.classId,
          period: period_,
          startMinutes,
          start: formatHhmm(period?.startAt),
          end: formatHhmm(period?.endAt),
          timeStatus,
          hasSession: Boolean(dailySession),
          attended,
          total,
        };
      })
      .filter((item) => item.startMinutes !== null)
      .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));

    // Among the non-past, non-current items, the earliest is "next", the rest are "planned".
    let nextAssigned = false;
    const schedule_ = items.map((item) => {
      if (item.timeStatus === "past") return { ...item, status: "past" as const };
      if (item.timeStatus === "current") return { ...item, status: "current" as const };
      if (!nextAssigned) {
        nextAssigned = true;
        return { ...item, status: "next" as const };
      }
      return { ...item, status: "planned" as const };
    });

    res.status(200).json({ classId, teacherId, today, schedule: schedule_ });
  } catch (error) {
    console.error("dashboard/today error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
