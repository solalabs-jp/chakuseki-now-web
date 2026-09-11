import {onRequest} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../lib/firebase";
import {
  sendStatus,
  setCorsHeaders,
  isNonEmptyString,
  getSession,
} from "../lib/http";
import {verifyToken} from "../lib/auth";
import {
  normalizeBeaconId,
  resolvePreviousNormalizedBeaconId,
  reassignBeaconClaim,
} from "../lib/beaconClaims";

type TeacherAttendanceRecordRequestBody = {
  session?: unknown;
  recordId?: unknown;
  status?: unknown;
  reason?: unknown;
};

type TeacherQuestionRequestBody = {
  session?: unknown;
  content?: unknown;
};

type TeacherScheduleTeacherRequestBody = {
  session?: unknown;
  newTeacherId?: unknown;
  dailySessionId?: unknown;
};

type RegisterBeaconRequestBody = {
  session?: unknown;
  beaconId?: unknown;
  BeaconId?: unknown;
};

type CreateCheckinQuestionRequestBody = {
  sessionId?: unknown;
  teacherId?: unknown;
  questionText?: unknown;
  isSkippable?: unknown;
};

const DUMMY_TEACHER_SESSION = "dummy-session-teacher-001";
const ATTENDANCE_STATUSES = ["遅刻", "欠席", "公欠"];

const isValidAttendanceStatus = (value: unknown): value is string => {
  return isNonEmptyString(value) && ATTENDANCE_STATUSES.includes(value);
};

const attendanceBookData = [
  {
    grade: "2",
    className: "A",
    studentName: "山田 太郎",
    subjectName: "ITマネジメント",
    teacherName: "Kota Nemoto",
    status: "出席",
    period: 1,
  },
  {
    grade: "2",
    className: "A",
    studentName: "鈴木 花子",
    subjectName: "ITマネジメント",
    teacherName: "Kota Nemoto",
    status: "遅刻",
    period: 1,
  },
  {
    grade: "2",
    className: "B",
    studentName: "佐藤 次郎",
    subjectName: "Webアプリ開発",
    teacherName: "Ayaka Sato",
    status: "欠席",
    period: 2,
  },
];

/**
 * POST /api/teacher/question
 * Body: { sessionId: string, teacherId: string, questionText: string,
 *         isSkippable: boolean }
 * Response: { message: string, questionId: string }
 *
 * 毎授業の質問（チェックイン質問）を送信・保存するAPI
 * Firebase Authで先生の認証済みのセッションのみが利用できる。
 */

export const createCheckinQuestion = onRequest(async (request, response) => {
  setCorsHeaders(response);

  // OPTIONS（プリフライト通信）の対応
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  // GET時の仕様案内
  if (request.method === "GET") {
    response.status(200).json({
      message: "POST a new class question.",
      method: "POST",
      path: "/api/teacher/question",
      body: {
        sessionId: "session-abc-123",
        teacherId: "teacher-xyz-789",
        questionText: "今日の授業で一番難しかった部分を教えてください。",
        isSkippable: false,
      },
    });
    return;
  }

  // POST以外のメソッドを拒否
  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as CreateCheckinQuestionRequestBody;

  // 入力データのバリデーション（必須項目・型チェック）
  if (
    !isNonEmptyString(body.sessionId) ||
    !isNonEmptyString(body.teacherId) ||
    !isNonEmptyString(body.questionText) ||
    typeof body.isSkippable !== "boolean"
  ) {
    response.status(400).json({error: "Invalid or missing parameters."});
    return;
  }

  try {
    // CHECKIN_QUESTIONS コレクションに保存する新しいドキュメント参照を作成
    const questionRef = db.collection("CHECKIN_QUESTIONS").doc();

    // ER図の定義通りの型・名前でFirestoreへ書き込み
    await questionRef.set({
      questionId: questionRef.id, // 自動生成された一意のID
      sessionId: body.sessionId,
      teacherId: body.teacherId,
      questionText: body.questionText,
      isSkippable: body.isSkippable,
      sentAt: FieldValue.serverTimestamp(), // 送信日時（サーバー時間）
    });

    logger.info("Checkin question successfully created", {
      questionId: questionRef.id,
      sessionId: body.sessionId,
      structuredData: true,
    });

    // クライアントへ成功レスポンスと生成されたIDを返す
    response.status(200).json({
      message: "Question sent successfully.",
      questionId: questionRef.id,
    });
  } catch (error) {
    logger.error("Failed to save checkin question", error);
    response.status(500).json({error: "Internal server error."});
  }
});

export const teacherAttendanceRecord = onRequest((request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "PATCH a student attendance record.",
      method: "PATCH",
      path: "/api/teacher/attendance-record",
      body: {
        session: DUMMY_TEACHER_SESSION,
        recordId: "record-001",
        status: "遅刻",
        reason: "電車遅延",
      },
    });
    return;
  }

  if (request.method !== "PATCH") {
    response.set("Allow", "GET, PATCH, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as TeacherAttendanceRecordRequestBody;

  if (
    !isNonEmptyString(body.recordId) ||
    !isValidAttendanceStatus(body.status) ||
    !isNonEmptyString(body.reason)
  ) {
    sendStatus(response, 400);
    return;
  }

  if (body.session !== DUMMY_TEACHER_SESSION) {
    sendStatus(response, 401);
    return;
  }

  logger.info("Teacher attendance record updated", {
    recordId: body.recordId,
    status: body.status,
    structuredData: true,
  });

  sendStatus(response, 200);
});

export const teacherQuestion = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST a question.",
      method: "POST",
      path: "/api/teacher/question",
      body: {
        session: DUMMY_TEACHER_SESSION,
        content: "今日の授業で理解できたことを書いてください。",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as TeacherQuestionRequestBody;

  if (!isNonEmptyString(body.content)) {
    sendStatus(response, 400);
    return;
  }

  if (body.session !== DUMMY_TEACHER_SESSION) {
    sendStatus(response, 401);
    return;
  }

  try {
    // ER図の「CHECKIN_QUESTIONS」コレクションへの保存処理
    // 新しいドキュメントへの参照を先に作成（ questionId を取得するため ）
    const questionRef = db.collection("CHECKIN_QUESTIONS").doc();

    await questionRef.set({
      questionId: questionRef.id, // ドキュメントIDをそのまま割り当て
      sessionId: "dummy-session-id-001", // 本来はリクエスト等から受け取る
      teacherId: "dummy-teacher-id-001", // 本来はセッション情報等から特定する
      questionText: body.content, // 先生が入力した質問文
      isSkippable: false, // デフォルトはスキップ不可に設定
      sentAt: FieldValue.serverTimestamp(), // 送信日時
    });

    logger.info("Teacher question created and saved to Firestore", {
      questionId: questionRef.id,
      content: body.content,
      structuredData: true,
    });

    sendStatus(response, 200);
  } catch (error) {
    // データベース保存エラー時の処理
    logger.error("Failed to save question to Firestore", error);
    response.status(500).json({error: "Internal server error."});
  }
});

export const teacherScheduleTeacher = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "PATCH a daily session teacher.",
      method: "PATCH",
      path: "/api/teacher/schedule-teacher",
      body: {
        session: DUMMY_TEACHER_SESSION,
        newTeacherId: "teacher-002",
        dailySessionId: "daily-session-001",
      },
    });
    return;
  }

  if (request.method !== "PATCH") {
    response.set("Allow", "GET, PATCH, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as TeacherScheduleTeacherRequestBody;

  if (
    !isNonEmptyString(body.newTeacherId) ||
    !isNonEmptyString(body.dailySessionId)
  ) {
    response.status(400).json({
      error: "newTeacherId and dailySessionId are required.",
    });
    return;
  }

  try {
    // 1. 操作している教師の userId の取得
    let operatingUserId: string | null = null;
    const uid = await verifyToken(request);
    if (uid) {
      operatingUserId = uid;
    } else if (body.session === DUMMY_TEACHER_SESSION) {
      // ダミーセッション用のデフォルト教師ID
      operatingUserId = "teacher-001";
    }

    if (!operatingUserId) {
      response.status(401).json({
        error: "Unauthorized. Invalid or missing token/session.",
      });
      return;
    }

    // 2. 操作元ユーザーの存在と教師権限チェック
    const userDoc = await db.collection("users").doc(operatingUserId).get();
    if (!userDoc.exists) {
      response.status(404).json({error: "Operating user not found."});
      return;
    }
    const userData = userDoc.data();
    if (userData?.role !== "teacher") {
      response.status(403).json({
        error: "Forbidden. Only teachers can update schedules.",
      });
      return;
    }

    // 3. dailySession の存在確認
    const sessionRef = db.collection("dailySessions").doc(body.dailySessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      response.status(404).json({error: "Daily session not found."});
      return;
    }

    const sessionData = sessionDoc.data();
    const scheduleId = sessionData?.scheduleId;
    if (!scheduleId) {
      response.status(400).json({
        error: "Daily session does not have a scheduleId.",
      });
      return;
    }

    // 4. 紐づく時間割（SCHEDULES）の取得
    const scheduleDoc = await db.collection("schedules").doc(scheduleId).get();
    if (!scheduleDoc.exists) {
      response.status(404).json({error: "Associated schedule not found."});
      return;
    }

    const scheduleData = scheduleDoc.data();
    // ER図の defaultTeacherId または、既存のモックにある teacherId のいずれかを取得
    const defaultTeacherId =
      scheduleData?.defaultTeacherId ?? scheduleData?.teacherId;

    // 5. 操作している本人が「元の先生」または「現在の代理の先生」であることを検証
    const isOriginal = operatingUserId === defaultTeacherId;
    const isCurrent = operatingUserId === sessionData?.teacherId;
    if (!isOriginal && !isCurrent) {
      response.status(403).json({
        error: "Forbidden. You are not authorized to modify this session.",
      });
      return;
    }

    // 6. teacherId を更新 (元のスケジュールは汚さず、その回の授業のみ変更)
    await sessionRef.update({
      teacherId: body.newTeacherId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Daily session teacher updated", {
      dailySessionId: body.dailySessionId,
      newTeacherId: body.newTeacherId,
      updatedBy: operatingUserId,
      structuredData: true,
    });

    response.status(204).send();
  } catch (err) {
    logger.error("Error updating daily session teacher", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});

export const teacherAttendanceBook = onRequest((request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "GET") {
    response.set("Allow", "GET, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const session = getSession(request);
  const date = request.query.date;

  if (!isNonEmptyString(session) || !isNonEmptyString(date)) {
    response.status(200).json({
      message: "Add session and date query to get attendance book.",
      method: "GET",
      path: "/api/teacher/attendance-book",
      query: {
        session: DUMMY_TEACHER_SESSION,
        date: "2026-05-28",
      },
    });
    return;
  }

  if (session !== DUMMY_TEACHER_SESSION) {
    sendStatus(response, 401);
    return;
  }

  response.status(200).json(attendanceBookData);
});

/**
 * POST /api/teacher/register-beacon
 * Body: { session: string, beaconId: string }
 * Response: { message: string, userId: string, beaconId: string }
 *
 * 受け取った session を元に users コレクションから該当の教員ドキュメントを検索し、
 * そのドキュメントに beaconId と session を書き込む。
 */
export const teacherRegisterBeacon = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST session and beaconId to register teacher beacon.",
      method: "POST",
      path: "/api/teacher/register-beacon",
      body: {
        session: DUMMY_TEACHER_SESSION,
        beaconId: "beacon-001",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as RegisterBeaconRequestBody;
  const session = body.session;
  const beaconId = body.beaconId ?? body.BeaconId;

  if (!isNonEmptyString(session) || !isNonEmptyString(beaconId)) {
    response.status(400).json({
      error: "session and beaconId are required.",
    });
    return;
  }

  try {
    let targetDocRef: admin.firestore.DocumentReference | null = null;
    let targetDocData: admin.firestore.DocumentData | null = null;

    // 1. Firebase Auth ID Token として検証を試みる
    try {
      const decodedToken = await admin.auth().verifyIdToken(session);
      const uid = decodedToken.uid;
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        targetDocRef = userDoc.ref;
        targetDocData = userDoc.data() || {};
      }
    } catch (tokenErr) {
      // ID Token ではない、あるいは検証失敗時は次のステップへ
    }

    // 2. ドキュメント ID が直接 session と一致するか検証
    if (!targetDocRef) {
      const directDoc = await db.collection("users").doc(session).get();
      if (directDoc.exists) {
        targetDocRef = directDoc.ref;
        targetDocData = directDoc.data() || {};
      }
    }

    // 3. session フィールドの値が一致するドキュメントを検索
    if (!targetDocRef) {
      const querySnapshot = await db
        .collection("users")
        .where("session", "==", session)
        .limit(1)
        .get();
      if (!querySnapshot.empty) {
        targetDocRef = querySnapshot.docs[0].ref;
        targetDocData = querySnapshot.docs[0].data();
      }
    }

    // 4. ダミーセッションかつ "teacher-001" が存在するか検証
    if (!targetDocRef && session === DUMMY_TEACHER_SESSION) {
      const dummyDoc = await db.collection("users").doc("teacher-001").get();
      if (dummyDoc.exists) {
        targetDocRef = dummyDoc.ref;
        targetDocData = dummyDoc.data() || {};
      }
    }

    if (!targetDocRef || !targetDocData) {
      response.status(404).json({
        error: "Teacher not found with the provided session.",
      });
      return;
    }

    // ロールが教員か検証
    if (targetDocData.role !== "teacher") {
      response.status(403).json({
        error: "Forbidden. Only teacher accounts can register beacon.",
      });
      return;
    }

    const targetDocId = targetDocRef.id;
    const normalizedBeaconId = normalizeBeaconId(beaconId);

    // この教員が以前登録していた beaconId(あれば)。
    const previousNormalizedBeaconId =
      resolvePreviousNormalizedBeaconId(targetDocData);

    // 他の教員が既に同じ(正規化後の)beaconIdを登録していないかを
    // beaconClaims の原子的な予約で確認する(自分自身は除外)。
    // studentBeacon 側は .where("normalizedBeaconId", "==", ...).limit(1)
    // で「beaconId は教員間で一意」という前提に依存しており、重複登録を
    // 許すとスキャンがどちらか一方の教員にしかマッチせず出席・授業記録が
    // 誤帰属する。
    const reassigned = await reassignBeaconClaim(
      targetDocId,
      previousNormalizedBeaconId,
      normalizedBeaconId,
      () =>
        targetDocRef.update({
          session: session,
          beaconId: beaconId,
          normalizedBeaconId,
          updatedAt: FieldValue.serverTimestamp(),
        })
    );
    if (!reassigned) {
      response.status(409).json({
        error: "このビーコンIDは既に他の教員に登録されています。",
      });
      return;
    }

    logger.info("Teacher beacon registered successfully", {
      docId: targetDocRef.id,
      beaconId: beaconId,
      structuredData: true,
    });

    response.status(200).json({
      message: "Beacon registered successfully.",
      userId: targetDocRef.id,
      beaconId: beaconId,
    });
  } catch (err) {
    logger.error("Error registering teacher beacon", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});
