import type { NextApiRequest, NextApiResponse } from "next";
import { listCollection, queryCollectionWhere } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";
import { formatJstTime, jstDayBoundsUtc } from "../../../lib/jstDate";

import { STATUS_LABELS } from "../../../lib/statusUtils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const classId = String(req.query.classId ?? "class-2A");

  try {
    const { start, end } = jstDayBoundsUtc(new Date());

    const [users, attendanceRecords, checkinAnswers] = await Promise.all([
      listCollection("users"),
      // 全期間を読んでメモリ上で当日分に絞り込む代わりに、Firestore 側の
      // 範囲クエリ(confirmedAt >= 今日0時 かつ < 翌日0時)で当日分だけを
      // 取得する。過去分が積み上がるほど listCollection の全件読み取りは
      // 重くなるため、ポーリング頻度を上げてもコストが増えないようにする。
      //
      // この範囲クエリは confirmedAt が Firestore の Timestamp 型で保存
      // されている前提(型が一致しない値は Firestore 側の比較でヒットせず
      // 除外され、こちら側からは検知できない)。attendanceRecords への書き込み
      // はこのリポジトリの外(学生向けアプリ側)で行われており、当時点で
      // 全件(22件, うち非null 17件)を確認したところ全て Timestamp だった。
      // もし将来 confirmedAt が文字列等で書き込まれる経路が増えると、
      // このクエリはその分だけ静かに students: [] 側にヒットしなくなる。
      queryCollectionWhere("attendanceRecords", [
        { field: "confirmedAt", op: "GREATER_THAN_OR_EQUAL", value: start },
        { field: "confirmedAt", op: "LESS_THAN", value: end },
      ]),
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

    const list = attendanceRecords
      .filter((r) => rosterById.has(String(r.data.userId ?? "")))
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
          time: formatJstTime(record.data.confirmedAt),
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
