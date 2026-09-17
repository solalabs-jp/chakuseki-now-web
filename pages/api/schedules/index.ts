import type { NextApiRequest, NextApiResponse } from "next";
import { createDocument } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { isNonEmptyString } from "../../../lib/validation";

type ScheduleInput = {
  classId?: unknown;
  periodId?: unknown;
  subjectName?: unknown;
  dayOfWeek?: unknown;
  defaultTeacherId?: unknown;
};

/**
 * 同一コマ(classId + dayOfWeek + periodId)を表す決定的な doc ID を作る。
 * createDocument の「既に存在すれば失敗する」性質と組み合わせることで、
 * コレクション全体を読まずに重複登録を検知でき、同時作成による
 * TOCTOU レース(2つのPOSTが両方「重複なし」と判定してしまう)も防げる。
 */
function scheduleDocId(classId: string, dayOfWeek: number, periodId: string): string {
  const sanitize = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_");
  return `schedule-${sanitize(classId)}-${dayOfWeek}-${sanitize(periodId)}`;
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
    const id = scheduleDocId(body.classId, dayOfWeek, body.periodId);
    const result = await createDocument("schedules", id, {
      classId: body.classId,
      periodId: body.periodId,
      subjectName: body.subjectName,
      dayOfWeek,
      defaultTeacherId: body.defaultTeacherId,
      createdAt: new Date(),
    });

    if (!result.created) {
      res.status(409).json({ error: "この曜日・時限には既に授業が登録されています。" });
      return;
    }

    res.status(201).json({ id });
  } catch (error) {
    console.error("schedules POST error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
