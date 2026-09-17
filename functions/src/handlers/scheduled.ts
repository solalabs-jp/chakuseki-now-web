import {onRequest} from "firebase-functions/https";
import {onSchedule} from "firebase-functions/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {db} from "../lib/firebase";
import {sendStatus, setCorsHeaders, isNonEmptyString} from "../lib/http";
import {jstNow, jstTodayDateString} from "../jstDate";

// ─── Scheduled: Generate Daily Sessions ─────────────────────────────────────

type GenerationResult = {
  scheduleCount: number;
  created: number;
  skipped: number;
};

/**
 * 指定した曜日・日付の dailySessions を生成する。generateDailySessions
 * (定期実行)とadminGenerateDailySessions(手動トリガー)が同じ生成ロジック
 * を個別実装していたため、ここに一本化する。
 *
 * 対象日の dailySessions はまとめて1回のクエリで取得し、既に存在する
 * scheduleId の集合を作ってから schedules をループする。schedule 1件
 * ごとに個別の存在確認クエリを投げる(N件のschedulesに対して2N回の
 * 逐次Firestoreラウンドトリップになる)代わりに、クエリ1回 + メモリ上の
 * 判定で済ませる。
 * @param {number} dayOfWeek 対象の曜日(1=月〜5=金、schedules.dayOfWeekと一致)。
 * @param {Timestamp} dateTimestamp 対象日の00:00:00を表すTimestamp。
 * @return {Promise<GenerationResult>} 対象schedule件数・作成・スキップ件数。
 */
async function generateSessionsForDay(
  dayOfWeek: number,
  dateTimestamp: Timestamp
): Promise<GenerationResult> {
  const schedulesSnapshot = await db
    .collection("schedules")
    .where("dayOfWeek", "==", dayOfWeek)
    .get();

  if (schedulesSnapshot.empty) {
    return {scheduleCount: 0, created: 0, skipped: 0};
  }

  const existingSnapshot = await db
    .collection("dailySessions")
    .where("date", "==", dateTimestamp)
    .get();
  const existingScheduleIds = new Set(
    existingSnapshot.docs.map((doc) => doc.data().scheduleId)
  );

  let createdCount = 0;
  let skippedCount = 0;

  for (const scheduleDoc of schedulesSnapshot.docs) {
    const scheduleId = scheduleDoc.id;
    const scheduleData = scheduleDoc.data();

    if (existingScheduleIds.has(scheduleId)) {
      skippedCount++;
      continue;
    }

    const sessionData = {
      scheduleId,
      classId: scheduleData.classId,
      // デフォルトの教師をコピー(旧フィールドへのフォールバック)
      teacherId: scheduleData.defaultTeacherId ?? scheduleData.teacherId,
      date: dateTimestamp,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db.collection("dailySessions").add(sessionData);
    createdCount++;
  }

  return {
    scheduleCount: schedulesSnapshot.size,
    created: createdCount,
    skipped: skippedCount,
  };
}

/**
 * 平日の毎朝 6:00 (JST) に自動実行。
 * 当日の曜日に一致する schedules を取得し、
 * 対応する dailySessions ドキュメントを生成する。
 * - teacherId は schedule のデフォルト値をコピー
 * - 同日・同スケジュールの dailySession が既に存在する場合はスキップ
 */
export const generateDailySessions = onSchedule(
  {
    schedule: "0 6 * * 1-5", // 平日 毎朝 06:00 UTC (JST 15:00) → 下で timeZone 指定
    timeZone: "Asia/Tokyo", // JST 06:00 に実行
    region: "us-central1",
  },
  async () => {
    // 今日の曜日を取得 (1=月 〜 5=金)
    const jstDate = jstNow();
    const jsDay = jstDate.getDay(); // 0=日, 1=月, ..., 6=土

    if (jsDay === 0 || jsDay === 6) {
      logger.info("Today is weekend, skipping daily session generation.");
      return;
    }

    const dayOfWeek = jsDay; // 1=月 〜 5=金 (schedules.dayOfWeek と一致)

    // 今日の日付文字列 (YYYY-MM-DD) を JST で算出
    const todayStr = jstTodayDateString();

    // 今日の 00:00:00 JST を Timestamp に変換
    const todayTimestamp = Timestamp.fromDate(
      new Date(`${todayStr}T00:00:00+09:00`)
    );

    logger.info("Generating daily sessions", {
      dayOfWeek,
      date: todayStr,
      structuredData: true,
    });

    try {
      const result = await generateSessionsForDay(dayOfWeek, todayTimestamp);

      if (result.scheduleCount === 0) {
        logger.info("No schedules found for today.", {dayOfWeek});
        return;
      }

      logger.info("Daily sessions generation completed", {
        date: todayStr,
        created: result.created,
        skipped: result.skipped,
        structuredData: true,
      });
    } catch (err) {
      logger.error("Error generating daily sessions", {error: err});
      throw err; // Cloud Scheduler にリトライさせる
    }
  }
);

/**
 * POST /api/admin/generate-daily-sessions
 * Body: { date?: string } (YYYY-MM-DD形式, 省略時は今日)
 *
 * 手動トリガー用エンドポイント。
 * 指定日の dailySessions を生成する。
 */
export const adminGenerateDailySessions = onRequest(async (
  request, response
) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST to generate daily sessions for a specific date.",
      method: "POST",
      path: "/api/admin/generate-daily-sessions",
      body: {
        date: "2026-06-23",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  // 日付パラメータ (省略時は今日 JST)
  const body = (request.body ?? {}) as { date?: unknown };
  logger.info("Request body:", body);

  let targetDate: Date;

  if (isNonEmptyString(body.date)) {
    // YYYY-MM-DD 形式のバリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      response.status(400).json({error: "date must be YYYY-MM-DD format."});
      return;
    }
    targetDate = new Date(`${body.date}T00:00:00+09:00`);
  } else {
    targetDate = new Date(`${jstTodayDateString()}T00:00:00+09:00`);
  }

  // 常に JST で曜日を判定する
  const jsDay = jstNow(targetDate).getDay();

  if (jsDay === 0 || jsDay === 6) {
    response.status(400).json({error: "Specified date is a weekend."});
    return;
  }

  const dayOfWeek = jsDay; // 1=月 〜 5=金
  const todayTimestamp = Timestamp.fromDate(targetDate);
  const dateStr = jstTodayDateString(targetDate);

  logger.info("adminGenerateDailySessions info", {dateStr, dayOfWeek, jsDay});

  try {
    const result = await generateSessionsForDay(dayOfWeek, todayTimestamp);

    if (result.scheduleCount === 0) {
      response.status(200).json({
        message: "No schedules for this day.",
        created: 0,
        skipped: 0,
      });
      return;
    }

    response.status(200).json({
      message: "Daily sessions generated.",
      date: dateStr,
      dayOfWeek,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (err) {
    logger.error("Error generating daily sessions", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});
