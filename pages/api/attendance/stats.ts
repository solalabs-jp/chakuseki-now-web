import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

function toJstDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");

  try {
    const [users, attendanceRecords] = await Promise.all([
      listCollection("users"),
      listCollection("attendanceRecords"),
    ]);

    const rosterIds = new Set(
      users
        .filter((u) => u.data.role === "student" && u.data.classId === classId)
        .map((u) => u.id)
    );

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    const records = attendanceRecords.filter(
      (r) =>
        rosterIds.has(String(r.data.userId ?? "")) &&
        toJstDateString(r.data.confirmedAt) === today
    );

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
