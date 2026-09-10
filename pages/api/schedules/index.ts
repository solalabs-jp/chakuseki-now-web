import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection, upsertDocument } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

type ScheduleInput = {
  classId?: unknown;
  periodId?: unknown;
  subjectName?: unknown;
  dayOfWeek?: unknown;
  defaultTeacherId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const body = (req.body ?? {}) as ScheduleInput;
  const dayOfWeek = Number(body.dayOfWeek);

  if (
    !isNonEmptyString(body.classId) ||
    !isNonEmptyString(body.periodId) ||
    !isNonEmptyString(body.subjectName) ||
    !isNonEmptyString(body.defaultTeacherId) ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 1 ||
    dayOfWeek > 5
  ) {
    res.status(400).json({
      error: "classId, periodId, subjectName, dayOfWeek(1-5) and defaultTeacherId are required.",
    });
    return;
  }

  try {
    // 同一コマ(classId + dayOfWeek + periodId)の重複登録を防ぐ。
    // 重複すると UI では片方しか描画されないが、日次セッション生成で
    // 同じコマに dailySessions が2件作られてしまう。
    const existing = await listCollection("schedules");
    const duplicate = existing.some(
      (doc) =>
        doc.data.classId === body.classId &&
        Number(doc.data.dayOfWeek) === dayOfWeek &&
        doc.data.periodId === body.periodId
    );
    if (duplicate) {
      res.status(409).json({ error: "この曜日・時限には既に授業が登録されています。" });
      return;
    }

    const id = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await upsertDocument("schedules", id, {
      classId: body.classId,
      periodId: body.periodId,
      subjectName: body.subjectName,
      dayOfWeek,
      defaultTeacherId: body.defaultTeacherId,
      createdAt: new Date(),
    });
    res.status(201).json({ id });
  } catch (error) {
    console.error("schedules POST error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
