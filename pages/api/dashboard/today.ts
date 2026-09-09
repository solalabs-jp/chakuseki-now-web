import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { jstDateString, dailySessionDateString } from "../../../lib/dateUtils";
import { ATTENDED_STATUSES } from "../../../lib/statusUtils";
import { requireTeacher } from "../../../lib/auth";

function getJstNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(now);

  const hourStr = parts.find((p) => p.type === "hour")?.value || "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value || "0";
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value || "Sun";

  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minuteStr, 10);
  
  // Firestore convention: 1=Mon, 2=Tue, ..., 7=Sun
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let dayOfWeek = days.indexOf(weekdayStr) + 1;
  if (dayOfWeek === 0) dayOfWeek = 7; // Fallback to Sun if not found

  return { hour, minute, dayOfWeek };
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

    const jstParts = getJstNowParts();
    const nowMinutes = jstParts.hour * 60 + jstParts.minute;
    const todayScheduleDay = jstParts.dayOfWeek;
    const today = jstDateString();

    const periodsById = new Map(periods.map((p) => [p.id, p.data]));
    const classesById = new Map(classes.map((c) => [c.id, c.data]));

    const rosterCountByClassId = new Map<string, number>();
    for (const u of users) {
      if (u.data.role !== "student") continue;
      const userClassId = String(u.data.classId ?? "");
      rosterCountByClassId.set(userClassId, (rosterCountByClassId.get(userClassId) ?? 0) + 1);
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
