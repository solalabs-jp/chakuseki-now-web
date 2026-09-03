import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";

function jstNow(): Date {
  const now = new Date();
  const jstString = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  return new Date(jstString);
}

function jstDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function dailySessionDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

const ATTENDED_STATUSES = new Set(["present", "late", "early_leave", "mid_absence"]);

function mapStatus(status: string): '出席' | '欠席' | '遅刻' | '遅刻15m' | '–' {
  if (status === 'present') return '出席';
  if (status === 'late') return '遅刻';
  if (status === 'absent') return '欠席';
  if (status === 'early_leave' || status === 'mid_absence') return '出席'; // fallback
  return '–';
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#3b82f6', '#7c3aed', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#1d4ed8', '#dc2626', '#b45309', '#6b7280'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "class-2A";

  try {
    const [schedules, periods, users, dailySessions, sessions, attendanceRecords] =
      await Promise.all([
        listCollection("schedules"),
        listCollection("periods"),
        listCollection("users"),
        listCollection("dailySessions"),
        listCollection("sessions"),
        listCollection("attendanceRecords"),
      ]);

    const today = jstDateString();

    // 1. Students in class
    const classStudents = users.filter((u) => u.data.role === "student" && u.data.classId === classId);

    // 2. Schedules for class
    const classSchedules = schedules.filter((s) => s.data.classId === classId);
    const classScheduleIds = new Set(classSchedules.map((s) => s.id));

    // 3. DailySessions & Sessions for class
    const classDailySessions = dailySessions.filter((ds) => classScheduleIds.has(String(ds.data.scheduleId)));
    const classDailySessionIds = new Set(classDailySessions.map((ds) => ds.id));
    const classSessions = sessions.filter((s) => classDailySessionIds.has(String(s.data.dailySessionsId ?? s.data.daily_sessionsId)));
    const classSessionIds = new Set(classSessions.map((s) => s.id));
    const totalSessionsCount = classSessionIds.size;

    // 4. Today's sessions mapped by period
    const periodsById = new Map(periods.map((p) => [p.id, p.data]));
    const periodNumToSessionIds = new Map<number, Set<string>>();
    
    const todayDailySessions = classDailySessions.filter((ds) => dailySessionDateString(ds.data.date ?? ds.data.timestamp) === today);
    for (const ds of todayDailySessions) {
      const scheduleId = String(ds.data.scheduleId);
      const schedule = classSchedules.find(s => s.id === scheduleId);
      if (schedule) {
        const periodId = String(schedule.data.periodId);
        const period = periodsById.get(periodId);
        if (period && typeof period.period === 'number') {
          const dsSessions = classSessions.filter(s => String(s.data.dailySessionsId ?? s.data.daily_sessionsId) === ds.id);
          const pNum = period.period;
          if (!periodNumToSessionIds.has(pNum)) periodNumToSessionIds.set(pNum, new Set());
          for (const sess of dsSessions) {
            periodNumToSessionIds.get(pNum)!.add(sess.id);
          }
        }
      }
    }

    // 5. Aggregate student stats & today's attendance
    let totalClassAttended = 0;
    
    const studentsData = classStudents.map((student, i) => {
      const studentRecords = attendanceRecords.filter(r => String(r.data.userId) === student.id);
      const classRecords = studentRecords.filter(r => classSessionIds.has(String(r.data.sessionId)));
      
      const attendedCount = classRecords.filter(r => ATTENDED_STATUSES.has(String(r.data.status))).length;
      totalClassAttended += attendedCount;

      const absentCount = totalSessionsCount - attendedCount;
      const absenceRate = totalSessionsCount > 0 ? absentCount / totalSessionsCount : 0;
      const attendancePercent = totalSessionsCount > 0 ? Math.round((attendedCount / totalSessionsCount) * 100) : 0;

      // Today's P1-P5
      const getPeriodStatus = (pNum: number): string => {
        const sessionIds = periodNumToSessionIds.get(pNum);
        if (!sessionIds || sessionIds.size === 0) return '–';
        const record = studentRecords.find(r => sessionIds.has(String(r.data.sessionId)));
        if (!record) return '欠席'; // No record means absent if session exists
        return mapStatus(String(record.data.status));
      };

      return {
        id: student.id,
        name: String(student.data.name || 'Unknown'),
        initials: initialsFromName(String(student.data.name || 'U')),
        color: AVATAR_COLORS[i % AVATAR_COLORS.length],
        absenceRate,
        attendancePercent,
        absentCount,
        p1: getPeriodStatus(1),
        p2: getPeriodStatus(2),
        p3: getPeriodStatus(3),
        p4: getPeriodStatus(4),
        p5: getPeriodStatus(5),
      };
    });

    const overallAttendanceRate = (totalSessionsCount * classStudents.length) > 0 
      ? Math.round((totalClassAttended / (totalSessionsCount * classStudents.length)) * 100) 
      : 0;

    // 6. Top 3 students with highest absence rate (Watch List)
    const sortedByAbsence = [...studentsData].sort((a, b) => b.absenceRate - a.absenceRate);
    const watchList = sortedByAbsence.slice(0, 3).map(s => ({
      name: s.name,
      initials: s.initials,
      color: s.color,
      pct: `${s.absentCount}回`,
      note: s.absentCount >= 3 ? '欠席多数' : (s.absentCount > 0 ? '要注意' : '良好'),
    }));

    res.status(200).json({
      overallAttendanceRate,
      watchList,
      studentsData,
    });
  } catch (error) {
    console.error("class/overview error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
