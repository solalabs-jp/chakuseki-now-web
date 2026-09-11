import type { NextApiRequest, NextApiResponse } from "next";
import { deleteDocument, queryCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

/**
 * DELETE /api/attendance/[recordId]
 *
 * 開発用の出席履歴クリーンアップ専用。attendanceRecords/{recordId} と、
 * それに紐づく checkinAnswers(attendance_reId == recordId)を削除する。
 * 誤操作で本番データを消さないよう本番環境では無効化する。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).end();
    return;
  }

  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "本番環境では利用できません。" });
    return;
  }

  const recordId = String(req.query.recordId ?? "");
  if (!recordId.trim()) {
    res.status(400).json({ error: "recordId is required." });
    return;
  }

  try {
    // 紐づくチェックイン回答も削除して孤児レコードを残さない。
    const answers = await queryCollection(
      "checkinAnswers",
      "attendance_reId",
      recordId
    );
    await Promise.all(
      answers.map((answer) => deleteDocument("checkinAnswers", answer.id))
    );

    await deleteDocument("attendanceRecords", recordId);

    res.status(200).json({ recordId, deletedAnswers: answers.length });
  } catch (error) {
    console.error("attendance DELETE error", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
