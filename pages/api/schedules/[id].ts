import type { NextApiRequest, NextApiResponse } from "next";
import { deleteDocument, queryCollection } from "../../../lib/firestoreRest";
import { requireTeacher } from "../../../lib/auth";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** JST の本日 0:00 を UTC ミリ秒で返す。 */
function startOfTodayJstMs(): number {
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const [y, m, d] = todayStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = await requireTeacher(req, res);
  if (!uid) return;

  const id = String(req.query.id ?? "");

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).end();
    return;
  }

  if (!isNonEmptyString(id)) {
    res.status(400).json({ error: "id is required." });
    return;
  }

  try {
    // この schedule から生成済みの dailySessions を物理削除で孤児化させない。
    // 当日以降の dailySessions が残っている場合は削除を拒否する
    // (ダッシュボードや教員割り当てが schedule への join を前提にしているため)。
    // scheduleId で絞ったクエリを使い、コレクション全体は読まない。
    const matchingSessions = await queryCollection("dailySessions", "scheduleId", id);
    const threshold = startOfTodayJstMs();
    const hasActiveSession = matchingSessions.some((ds) => {
      const t = new Date(String(ds.data.date)).getTime();
      return !Number.isNaN(t) && t >= threshold;
    });

    if (hasActiveSession) {
      res.status(409).json({
        error: "当日以降の授業が残っているため削除できません。授業終了後に再度お試しください。",
      });
      return;
    }

    await deleteDocument("schedules", id);
    res.status(200).json({ id });
  } catch (error) {
    console.error("schedules DELETE error", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
