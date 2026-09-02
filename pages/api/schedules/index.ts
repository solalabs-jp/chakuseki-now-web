import type { NextApiRequest, NextApiResponse } from "next";
import { upsertDocument } from "../../../lib/firestoreRest";

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
    dayOfWeek > 7
  ) {
    res.status(400).json({
      error: "classId, periodId, subjectName, dayOfWeek(1-7) and defaultTeacherId are required.",
    });
    return;
  }

  try {
    const id = `schedule-${Date.now()}`;
    await upsertDocument("schedules", id, {
      classId: body.classId,
      periodId: body.periodId,
      subjectName: body.subjectName,
      dayOfWeek,
      defaultTeacherId: body.defaultTeacherId,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json({ id });
  } catch (error) {
    console.error("schedules POST error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
