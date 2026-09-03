import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

const STATUS_LABELS: Record<string, string> = {
  present: "出席",
  late: "遅刻",
  absent: "欠席",
  excused: "公欠",
  early_leave: "早退",
  mid_absence: "中抜け",
};

function formatTime(iso: unknown): string {
  if (typeof iso !== "string") return "--:--:--";
  const match = iso.match(/T(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : "--:--:--";
}

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
    const [users, attendanceRecords, checkinAnswers] = await Promise.all([
      listCollection("users"),
      listCollection("attendanceRecords"),
      listCollection("checkinAnswers"),
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

    const list = attendanceRecords
      .filter((r) => rosterById.has(String(r.data.userId ?? "")))
      .filter((r) => toJstDateString(r.data.confirmedAt) === today)
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
          time: formatTime(record.data.confirmedAt),
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
