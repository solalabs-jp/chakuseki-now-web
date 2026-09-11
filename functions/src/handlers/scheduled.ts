import {onRequest} from "firebase-functions/https";
import {onSchedule} from "firebase-functions/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {db} from "../lib/firebase";
import {sendStatus, setCorsHeaders, isNonEmptyString} from "../lib/http";

// ─── Scheduled: Generate Daily Sessions ─────────────────────────────────────

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
    const now = new Date();
    // 常に JST で曜日を判定する (now + 9 hours)
    const jstTime = now.getTime() + 9 * 60 * 60 * 1000;
    const jstNow = new Date(jstTime);
    const jsDay = jstNow.getUTCDay(); // 0=日, 1=月, ..., 6=土

    if (jsDay === 0 || jsDay === 6) {
      logger.info("Today is weekend, skipping daily session generation.");
      return;
    }

    const dayOfWeek = jsDay; // 1=月 〜 5=金 (schedules.dayOfWeek と一致)

    // 今日の日付文字列 (YYYY-MM-DD) を JST で算出
    const year = jstNow.getUTCFullYear();
    const month = String(jstNow.getUTCMonth() + 1).padStart(2, "0");
    const day = String(jstNow.getUTCDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

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
      // 1. 当日の曜日に一致する schedules を取得
      const schedulesSnapshot = await db
        .collection("schedules")
        .where("dayOfWeek", "==", dayOfWeek)
        .get();

      if (schedulesSnapshot.empty) {
        logger.info("No schedules found for today.", {dayOfWeek});
        return;
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const scheduleDoc of schedulesSnapshot.docs) {
        const scheduleId = scheduleDoc.id;
        const scheduleData = scheduleDoc.data();

        // 2. 同日・同スケジュールの dailySession が既に存在するかチェック
        const existingSnapshot = await db
          .collection("dailySessions")
          .where("scheduleId", "==", scheduleId)
          .where("date", "==", todayTimestamp)
          .limit(1)
          .get();

        if (!existingSnapshot.empty) {
          skippedCount++;
          continue;
        }

        // 3. dailySession を生成
        const sessionData = {
          scheduleId,
          classId: scheduleData.classId,
          // デフォルトの教師をコピー(旧フィールドへのフォールバック)
          teacherId: scheduleData.defaultTeacherId ?? scheduleData.teacherId,
          date: todayTimestamp,
          createdAt: FieldValue.serverTimestamp(),
        };

        await db.collection("dailySessions").add(sessionData);
        createdCount++;
      }

      logger.info("Daily sessions generation completed", {
        date: todayStr,
        created: createdCount,
        skipped: skippedCount,
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
    const now = new Date();
    const jstNowTime = now.getTime() + 9 * 60 * 60 * 1000;
    const jstNow = new Date(jstNowTime);
    const yyyy = jstNow.getUTCFullYear();
    const mm = String(jstNow.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(jstNow.getUTCDate()).padStart(2, "0");
    targetDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`);
  }

  // 常に JST で曜日を判定する (targetDate + 9 hours)
  const jstTime = targetDate.getTime() + 9 * 60 * 60 * 1000;
  const jstDateForDay = new Date(jstTime);
  const jsDay = jstDateForDay.getUTCDay();

  if (jsDay === 0 || jsDay === 6) {
    response.status(400).json({error: "Specified date is a weekend."});
    return;
  }

  const dayOfWeek = jsDay; // 1=月 〜 5=金
  const todayTimestamp = Timestamp.fromDate(targetDate);
  const dsYyyy = jstDateForDay.getUTCFullYear();
  const dsMm = String(jstDateForDay.getUTCMonth() + 1).padStart(2, "0");
  const dsDd = String(jstDateForDay.getUTCDate()).padStart(2, "0");
  const dateStr = `${dsYyyy}-${dsMm}-${dsDd}`;

  logger.info("adminGenerateDailySessions info", {dateStr, dayOfWeek, jsDay});

  try {
    const schedulesSnapshot = await db
      .collection("schedules")
      .where("dayOfWeek", "==", dayOfWeek)
      .get();

    if (schedulesSnapshot.empty) {
      response.status(200).json({
        message: "No schedules for this day.",
        created: 0,
        skipped: 0,
      });
      return;
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const scheduleDoc of schedulesSnapshot.docs) {
      const scheduleId = scheduleDoc.id;
      const scheduleData = scheduleDoc.data();

      const existingSnapshot = await db
        .collection("dailySessions")
        .where("scheduleId", "==", scheduleId)
        .where("date", "==", todayTimestamp)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        skippedCount++;
        continue;
      }

      const sessionData = {
        scheduleId,
        classId: scheduleData.classId,
        teacherId: scheduleData.defaultTeacherId ?? scheduleData.teacherId,
        date: todayTimestamp,
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection("dailySessions").add(sessionData);
      createdCount++;
    }

    response.status(200).json({
      message: "Daily sessions generated.",
      date: dateStr,
      dayOfWeek,
      created: createdCount,
      skipped: skippedCount,
    });
  } catch (err) {
    logger.error("Error generating daily sessions", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});
