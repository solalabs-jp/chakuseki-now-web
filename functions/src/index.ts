import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import { onSchedule } from "firebase-functions/scheduler";

import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as https from "https";
import * as http from "http";

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

type BeaconRequestBody = {
  beaconId?: unknown;
  session?: unknown;
  location?: unknown;
};

type AnswerAttendanceRequestBody = {
  session?: unknown;
  questionId?: unknown;
  answer?: unknown;
};

type SessionRequestBody = {
  session?: unknown;
};

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

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
};

type RegisterRequestBody = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  classId?: unknown;
};

type CreateCheckinQuestionRequestBody = {
  sessionId?: unknown;
  teacherId?: unknown;
  questionText?: unknown;
  isSkippable?: unknown;
};

type StudentDailyAttendanceQuery = {
  session?: string;
  studentId?: string; // USERS.userId
  date?: string;      // "2026-10-13" 形式の文字列
};

type StudentSubjectHistoryQuery = {
  session?: string;
  scheduleId?: string;
  studentId?: string;
};

type FunctionRequest = Parameters<Parameters<typeof onRequest>[0]>[0];
type FunctionResponse = Parameters<Parameters<typeof onRequest>[0]>[1];

// Firebase Web API Key
// (FIREBASE_ prefix is reserved; use API_KEY instead)
const FIREBASE_API_KEY = process.env.API_KEY ?? "";

const DUMMY_STUDENT_SESSION = "dummy-session-student-001";
const DUMMY_TEACHER_SESSION = "dummy-session-teacher-001";
const ATTENDANCE_STATUSES = ["遅刻", "欠席", "公欠"];

const attendanceCalendarData = [
  {
    date: "2026-05-25",
    subjectName: "ITマネジメント",
    status: "出席",
  },
  {
    date: "2026-05-26",
    subjectName: "Webアプリ開発",
    status: "遅刻",
  },
  {
    date: "2026-05-27",
    subjectName: "データベース",
    status: "欠席",
  },
];

const attendanceSummaryData = [
  {
    subjectName: "ITマネジメント",
    attendedCount: 10,
    totalClassCount: 12,
  },
  {
    subjectName: "Webアプリ開発",
    attendedCount: 8,
    totalClassCount: 12,
  },
  {
    subjectName: "データベース",
    attendedCount: 11,
    totalClassCount: 12,
  },
];



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

// ─── Auth: Login ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Response: { idToken, uid, role, userId }
 *
 * Firebase Identity Toolkit REST API でサインインし、
 * Firestore の users コレクションからロール情報を付加して返す。
 */
export const loginWithEmailPassword = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST email and password to login.",
      method: "POST",
      path: "/api/auth/login",
      body: {
        email: "teacher001@example.com",
        password: "password123",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as LoginRequestBody;

  if (!isNonEmptyString(body.email) || !isNonEmptyString(body.password)) {
    response.status(400).json({ error: "email and password are required." });
    return;
  }

  if (!FIREBASE_API_KEY) {
    logger.error("FIREBASE_API_KEY is not set");
    response.status(500).json({ error: "Server configuration error." });
    return;
  }

  try {
    // 1. Firebase Identity Toolkit で Email/Password サインイン
    const signInResult = await callIdentityToolkit({
      email: body.email,
      password: body.password,
      returnSecureToken: true,
    });

    // エラーレスポンスの確認
    const errorObj = signInResult.error as { message?: string } | undefined;
    if (errorObj) {
      const code = errorObj.message ?? "UNKNOWN";
      logger.warn("Login failed", { code, email: body.email });

      if (code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD" ||
        code === "INVALID_LOGIN_CREDENTIALS") {
        response.status(401).json({ error: "Invalid email or password." });
      } else {
        response.status(400).json({ error: code });
      }
      return;
    }

    const idToken = signInResult.idToken as string;
    const uid = signInResult.localId as string;

    // 2. Firestore の users コレクションから uid でロールを取得
    //    uid が Firestore の doc ID と一致しない場合は email で検索
    let role: string | null = null;
    let userId: string | null = null;

    // まず uid で直接引く
    const directDoc = await db.collection("users").doc(uid).get();
    if (directDoc.exists) {
      role = directDoc.data()?.role ?? null;
      userId = uid;
    }

    logger.info("Login successful", { uid, role, structuredData: true });

    response.status(200).json({
      idToken,
      uid,
      userId,
      role,
      expiresIn: signInResult.expiresIn as string,
    });
  } catch (err) {
    logger.error("authLogin error", err);
    response.status(500).json({ error: "Internal server error." });
  }
});

/**
 * Firebase Identity Toolkit REST API (signInWithPassword) を呼ぶヘルパー
 * エミュレータ環境では FIREBASE_AUTH_EMULATOR_HOST を参照して http で叩く
 * @param {object} payload - サインインリクエストのペイロード
 * @return {Promise<Record<string, unknown>>} Identity Toolkit のレスポンス
 */
function callIdentityToolkit(payload: {
  email: string;
  password: string;
  returnSecureToken: boolean;
}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

    let requester: typeof https | typeof http;
    let options: http.RequestOptions;

    if (emulatorHost) {
      // エミュレータ: http でローカルホストを叩く
      const [hostname, portStr] = emulatorHost.split(":");
      requester = http;
      options = {
        hostname,
        port: portStr ? parseInt(portStr, 10) : 9099,
        path: `/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
    } else {
      // 本番: https で Identity Toolkit を叩く
      requester = https;
      options = {
        hostname: "identitytoolkit.googleapis.com",
        path: `/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
    }

    const req = requester.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Failed to parse Identity Toolkit response"));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * POST /api/auth/register
 * Body: { email: string, password: string, role: string, classId?: string }
 * Response: { uid, message }
 *
 * Firebase Admin SDK を用いてユーザーを作成し、
 * Firestore の users コレクションにロール情報を保存する。
 */
export const registerUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST email, password, and role to register.",
      method: "POST",
      path: "/api/auth/register",
      body: {
        email: "newuser@example.com",
        password: "password123",
        role: "student",
        classId: "class-2A",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as RegisterRequestBody;

  if (!isNonEmptyString(body.email) || !isNonEmptyString(body.password) || !isNonEmptyString(body.role)) {
    response.status(400).json({ error: "email, password, and role are required." });
    return;
  }

  try {
    // 1. Firebase Auth にユーザーを作成
    const userRecord = await admin.auth().createUser({
      email: body.email,
      password: body.password,
    });

    // 2. Firestore の users コレクションに権限などを保存
    const userData: Record<string, unknown> = {
      role: body.role,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (isNonEmptyString(body.classId)) {
      userData.classId = body.classId;
    }

    await db.collection("users").doc(userRecord.uid).set(userData);

    logger.info("User registered successfully", { uid: userRecord.uid, role: body.role, structuredData: true });

    response.status(201).json({
      uid: userRecord.uid,
      message: "User registered successfully.",
    });
  } catch (err: any) {
    logger.error("Error registering user", { error: err });
    if (err.code === "auth/email-already-exists") {
      response.status(409).json({ error: "Email already exists." });
    } else {
      response.status(500).json({ error: "Internal server error." });
    }
  }
});

/**
 * POST /api/teacher/question
 * Body: { sessionId: string, teacherId: string, questionText: string, isSkippable: boolean }
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
    response.status(400).json({ error: "Invalid or missing parameters." });
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
    response.status(500).json({ error: "Internal server error." });
  }
});


// ─── Student endpoints ───────────────────────────────────────────────────────

export const studentBeacon = onRequest((request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST this endpoint every 5 minutes.",
      method: "POST",
      path: "/api/student/beacon",
      body: {
        beaconId: "beacon-001",
        session: DUMMY_STUDENT_SESSION,
        location: {
          latitude: 35.681236,
          longitude: 139.767125,
        },
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as BeaconRequestBody;

  if (!isNonEmptyString(body.beaconId) || !isLocation(body.location)) {
    sendStatus(response, 400);
    return;
  }

  if (body.session !== DUMMY_STUDENT_SESSION) {
    sendStatus(response, 401);
    return;
  }

  logger.info("Student beacon received", {
    beaconId: body.beaconId,
    structuredData: true,
  });

  sendStatus(response, 200);
});

export const studentAnswer = onRequest((request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST an answer to mark attendance.",
      method: "POST",
      path: "/api/student/answer",
      body: {
        session: DUMMY_STUDENT_SESSION,
        questionId: "question-001",
        answer: "回答文",
      },
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const body = (request.body ?? {}) as AnswerAttendanceRequestBody;

  if (
    !isNonEmptyString(body.questionId) ||
    !isNonEmptyString(body.answer)
  ) {
    sendStatus(response, 400);
    return;
  }

  if (body.session !== DUMMY_STUDENT_SESSION) {
    sendStatus(response, 401);
    return;
  }

  logger.info("Student answer attendance received", {
    questionId: body.questionId,
    structuredData: true,
  });

  sendStatus(response, 200);
});

export const studentAttendanceCalendar = onRequest((request, response) => {
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

  if (!isNonEmptyString(session)) {
    response.status(200).json({
      message: "Add session query to get attendance calendar.",
      method: "GET",
      path: "/api/student/attendance-calendar",
      query: {
        session: DUMMY_STUDENT_SESSION,
      },
    });
    return;
  }

  if (session !== DUMMY_STUDENT_SESSION) {
    sendStatus(response, 401);
    return;
  }

  response.status(200).json(attendanceCalendarData);
});

export const studentAttendanceSummary = onRequest((request, response) => {
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

  if (!isNonEmptyString(session)) {
    response.status(200).json({
      message: "Add session query to get attendance summary.",
      method: "GET",
      path: "/api/student/attendance-summary",
      query: {
        session: DUMMY_STUDENT_SESSION,
      },
    });
    return;
  }

  if (session !== DUMMY_STUDENT_SESSION) {
    sendStatus(response, 401);
    return;
  }

  response.status(200).json(attendanceSummaryData);
});

export const studentTimetable = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET" && !request.headers.authorization) {
    response.status(200).json({
      message: "Add Authorization header (Bearer token) to get timetable.",
      method: "GET",
      path: "/api/student/timetable",
    });
    return;
  }

  if (request.method !== "GET") {
    response.set("Allow", "GET, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const uid = await verifyToken(request);
  if (!uid) {
    response.status(401).json({ error: "Unauthorized. Invalid or missing token." });
    return;
  }

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      response.status(404).json({ error: "User not found." });
      return;
    }

    const userData = userDoc.data();
    const classId = userData?.classId;

    if (!classId) {
      response.status(404).json({ error: "User does not belong to any class." });
      return;
    }

    const timetablesSnapshot = await db.collection("timetables").where("classId", "==", classId).get();

    if (timetablesSnapshot.empty) {
      response.status(200).json([]);
      return;
    }

    const timetables = timetablesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        subjectName: data.subjectName,
        period: data.period,
        dayOfWeek: data.dayOfWeek
      };
    });

    response.status(200).json(timetables);
  } catch (err) {
    logger.error("Error fetching timetable", { error: err });
    response.status(500).json({ error: "Internal server error." });
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
      questionId: questionRef.id,            // ドキュメントIDをそのまま割り当て
      sessionId: "dummy-session-id-001",    // 本来はリクエスト等から受け取る
      teacherId: "dummy-teacher-id-001",    // 本来はセッション情報等から特定する
      questionText: body.content,            // 先生が入力した質問文
      isSkippable: false,                    // デフォルトはスキップ不可に設定
      sentAt: FieldValue.serverTimestamp(),  // 送信日時
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
    response.status(500).json({ error: "Internal server error." });
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
      response.status(404).json({ error: "Operating user not found." });
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
      response.status(404).json({ error: "Daily session not found." });
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
      response.status(404).json({ error: "Associated schedule not found." });
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
    logger.error("Error updating daily session teacher", { error: err });
    response.status(500).json({ error: "Internal server error." });
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

    // beaconId (および session) を更新
    await targetDocRef.update({
      session: session,
      beaconId: beaconId,
      updatedAt: FieldValue.serverTimestamp(),
    });

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
    logger.error("Error registering teacher beacon", { error: err });
    response.status(500).json({ error: "Internal server error." });
  }
});

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
    timeZone: "Asia/Tokyo",  // JST 06:00 に実行
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
        logger.info("No schedules found for today.", { dayOfWeek });
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
          teacherId: scheduleData.teacherId, // デフォルトの教師をコピー
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
      logger.error("Error generating daily sessions", { error: err });
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
export const adminGenerateDailySessions = onRequest(async (request, response) => {
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
      response.status(400).json({ error: "date must be YYYY-MM-DD format." });
      return;
    }
    targetDate = new Date(`${body.date}T00:00:00+09:00`);
  } else {
    const now = new Date();
    const jstNowTime = now.getTime() + 9 * 60 * 60 * 1000;
    const jstNow = new Date(jstNowTime);
    targetDate = new Date(
      `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}-${String(jstNow.getUTCDate()).padStart(2, "0")}T00:00:00+09:00`
    );
  }

  // 常に JST で曜日を判定する (targetDate + 9 hours)
  const jstTime = targetDate.getTime() + 9 * 60 * 60 * 1000;
  const jstDateForDay = new Date(jstTime);
  const jsDay = jstDateForDay.getUTCDay();

  if (jsDay === 0 || jsDay === 6) {
    response.status(400).json({ error: "Specified date is a weekend." });
    return;
  }

  const dayOfWeek = jsDay; // 1=月 〜 5=金
  const todayTimestamp = Timestamp.fromDate(targetDate);
  const dateStr = `${jstDateForDay.getUTCFullYear()}-${String(jstDateForDay.getUTCMonth() + 1).padStart(2, "0")}-${String(jstDateForDay.getUTCDate()).padStart(2, "0")}`;

  logger.info("adminGenerateDailySessions info", { dateStr, dayOfWeek, jsDay });

  try {
    const schedulesSnapshot = await db
      .collection("schedules")
      .where("dayOfWeek", "==", dayOfWeek)
      .get();

    if (schedulesSnapshot.empty) {
      response.status(200).json({ message: "No schedules for this day.", created: 0, skipped: 0 });
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
        teacherId: scheduleData.teacherId,
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
    logger.error("Error generating daily sessions", { error: err });
    response.status(500).json({ error: "Internal server error." });
  }
});

const STATUS_MAP_TO_JP: Record<string, string> = {
  present: "出席",
  absent: "欠席",
  late: "遅刻",
  early_leave: "早退",
  mid_absence: "中抜け",
  excused: "公欠"
};

// 4桁の数値（hhmm）を "hh:mm" 形式の文字列に変換するヘルパー
function formatHhmm(timeInt: number | undefined): string {
  if (timeInt === undefined || timeInt === null) return "00:00";
  const str = timeInt.toString().padStart(4, "0");
  return `${str.substring(0, 2)}:${str.substring(2, 4)}`;
}

/**
 * カレンダー用：指定日の授業・出欠一覧API
 * GET /api/attendance/student-daily-report
 * Query: ?session=xxx&studentId=student001&date=2026-10-13
 */
export const getStudentDailyReport = onRequest(async (request, response) => {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.status(204).send(""); return; }
  if (request.method !== "GET") { response.set("Allow", "GET, OPTIONS"); sendStatus(response, 405); return; }

  const query = (request.query ?? {}) as StudentDailyAttendanceQuery;
  const { session, studentId, date } = query;

  if (!session) { response.status(401).json({ error: "Session token is required." }); return; }
  if (!studentId || !date) { response.status(400).json({ error: "studentId and date are required." }); return; }

  try {
    // 1. DAILY_SESSIONS から指定日の授業コマを取得
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const dailySessionsSnapshot = await db.collection("DAILY_SESSIONS")
      .where("date", ">=", admin.firestore.Timestamp.fromDate(startOfDay))
      .where("date", "<=", admin.firestore.Timestamp.fromDate(endOfDay))
      .get();

    if (dailySessionsSnapshot.empty) {
      response.status(200).json({ date, sessions: [] });
      return;
    }

    // 2. マスタデータの一括キャッシュ（N+1問題の防止）
    // SESSIONS（受講情報）の取得
    const studentSessionsSnapshot = await db.collection("SESSIONS")
      .where("studentId", "==", studentId)
      .get();

    const scheduleToSessionMap: Record<string, string> = {};
    studentSessionsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.scheduleId) scheduleToSessionMap[data.scheduleId] = doc.id;
    });

    // ATTENDANCE_RECORDS（出欠レコード）の取得
    const mySessionIds = Object.values(scheduleToSessionMap);
    const attendanceRecordsMap: Record<string, any> = {};

    if (mySessionIds.length > 0) {
      const recordsSnapshot = await db.collection("ATTENDANCE_RECORDS")
        .where("sessionId", "in", mySessionIds)
        .where("userId", "==", studentId)
        .get();

      recordsSnapshot.forEach((doc) => {
        const rData = doc.data();
        if (rData.sessionId) {
          attendanceRecordsMap[rData.sessionId] = rData;
        }
      });
    }

    // PERIODS（時限マスタ）の取得
    const periodsSnapshot = await db.collection("PERIODS").get();
    const periodsMap: Record<string, { startAt: number; endAt: number; period: number }> = {};
    periodsSnapshot.forEach((doc) => {
      const pData = doc.data();
      periodsMap[doc.id] = { startAt: pData.startAt, endAt: pData.endAt, period: pData.period };
    });

    // 3. 各授業コマのデータと各種マスタを紐づける
    const sessionsPromises = dailySessionsSnapshot.docs.map(async (dsDoc) => {
      const dsData = dsDoc.data();
      const scheduleId = dsData.scheduleId;

      let subjectName = "未設定";
      let startTime = "00:00";
      let endTime = "00:00";
      let periodNumber = 1;

      // SCHEDULES を経由して科目名と時限情報を取得
      if (scheduleId) {
        const scheduleDoc = await db.collection("SCHEDULES").doc(scheduleId).get();
        if (scheduleDoc.exists) {
          const sData = scheduleDoc.data();
          subjectName = sData?.subjectName ?? "未設定";

          // PERIODSマスタから時間と何限目かを取得
          const periodId = sData?.periodId;
          if (periodId && periodsMap[periodId]) {
            startTime = formatHhmm(periodsMap[periodId].startAt);
            endTime = formatHhmm(periodsMap[periodId].endAt);
            periodNumber = periodsMap[periodId].period;
          }
        }
      }

      // 出欠データの照合
      const mySessionId = scheduleId ? scheduleToSessionMap[scheduleId] : null;
      const rData = mySessionId ? attendanceRecordsMap[mySessionId] : null;
      const dbStatus = rData?.status ?? "absent";
      const statusJp = STATUS_MAP_TO_JP[dbStatus] ?? "欠席";

      return {
        scheduleId: scheduleId ?? "",
        dailySessionsId: dsDoc.id,
        subjectName,
        startTime,
        endTime,
        period: periodNumber,
        status: statusJp,
      };
    });

    const sessionsData = await Promise.all(sessionsPromises);

    // フロントで時間割順に並び替えやすいようソート
    sessionsData.sort((a, b) => a.period - b.period);

    response.status(200).json({ date, sessions: sessionsData });
  } catch (err) {
    logger.error("getStudentDailyReport error", err);
    response.status(500).json({ error: "Internal server error." });
  }
});

/**
 * 詳細画面用：特定科目の授業履歴・集計API
 * GET /api/attendance/student-subject-history
 * Query: ?session=xxx&scheduleId=schedule101&studentId=student001
 */

export const getStudentSubjectHistory = onRequest(async (request, response) => {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") { response.status(204).send(""); return; }
  if (request.method !== "GET") { response.set("Allow", "GET, OPTIONS"); sendStatus(response, 405); return; }

  const query = (request.query ?? {}) as StudentSubjectHistoryQuery;
  const { session, scheduleId, studentId } = query;

  if (!session) { response.status(401).json({ error: "Session token is required." }); return; }
  if (!scheduleId || !studentId) { response.status(400).json({ error: "scheduleId and studentId are required." }); return; }

  try {
    // 1. SCHEDULES から科目名を取得
    const scheduleDoc = await db.collection("SCHEDULES").doc(scheduleId).get();
    if (!scheduleDoc.exists) { response.status(404).json({ error: "Subject schedule not found." }); return; }
    const subjectName = scheduleDoc.data()?.subjectName ?? "未設定";

    // 2. この科目の全授業コマ（DAILY_SESSIONS）を日付の降順（最新順）で取得
    const dailySessionsSnapshot = await db.collection("DAILY_SESSIONS")
      .where("scheduleId", "==", scheduleId)
      .orderBy("date", "desc")
      .get();

    // 3. SESSIONS から受講セッションを取得
    const studentSessionSnapshot = await db.collection("SESSIONS")
      .where("scheduleId", "==", scheduleId)
      .where("studentId", "==", studentId)
      .limit(1)
      .get();

    let mySessionId: string | null = null;
    if (!studentSessionSnapshot.empty) {
      mySessionId = studentSessionSnapshot.docs[0].id;
    }

    // 4. ATTENDANCE_RECORDS を取得してマップ化
    const attendanceRecordsMap: Record<string, string> = {};
    if (mySessionId) {
      const recordsSnapshot = await db.collection("ATTENDANCE_RECORDS")
        .where("sessionId", "==", mySessionId)
        .where("userId", "==", studentId)
        .get();

      recordsSnapshot.forEach((doc) => {
        const rData = doc.data();
        if (rData.sessionId) {
          attendanceRecordsMap[rData.sessionId] = rData.status ?? "absent";
        }
      });
    }

    // 5. 円グラフ集計用カウンターの初期化
    const stats = {
      出席: 0,
      欠席: 0,
      遅刻: 0,
      公欠: 0,
      早退: 0,
      全授業: dailySessionsSnapshot.size,
    };

    // 6. 授業回数（第10回、第9回…）を含めた履歴配列の生成
    const totalCount = dailySessionsSnapshot.size;
    const history = dailySessionsSnapshot.docs.map((dsDoc, index) => {
      const dsData = dsDoc.data();

      // 今回の最新ER図の関係性に準拠し、受講セッションのステータスを取得
      const dbStatus = mySessionId ? attendanceRecordsMap[mySessionId] : "absent";
      const statusJp = STATUS_MAP_TO_JP[dbStatus] ?? "欠席";

      if (statusJp in stats) {
        stats[statusJp as keyof typeof stats]++;
      }

      // タイムスタンプを "10月22日" のようなフォーマット文字列に変換
      const rawDate = dsData.date ? dsData.date.toDate() : new Date();
      const formattedDate = `${rawDate.getMonth() + 1}月${rawDate.getDate()}日`;

      return {
        dailySessionsId: dsDoc.id,
        count: totalCount - index, // 最新のコマが最大回数（例: 第10回）になるよう降順連番を振る
        date: formattedDate,
        status: statusJp,
      };
    });

    response.status(200).json({
      scheduleId,
      subjectName,
      stats,
      history,
    });
  } catch (err) {
    logger.error("getStudentSubjectHistory error", err);
    response.status(500).json({ error: "Internal server error." });
  }
});

const sendStatus = (
  response: FunctionResponse,
  statusCode: number
): void => {
  response.status(statusCode).send("");
};

const setCorsHeaders = (
  response: FunctionResponse
): void => {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  response.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isValidAttendanceStatus = (value: unknown): value is string => {
  return isNonEmptyString(value) && ATTENDANCE_STATUSES.includes(value);
};

const getSession = (request: FunctionRequest): unknown => {
  const body = (request.body ?? {}) as SessionRequestBody;
  return body.session ?? request.query.session;
};

const isLocation = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const location = value as Record<string, unknown>;
  const latitude = location.latitude ?? location.lat;
  const longitude = location.longitude ?? location.lng;

  return typeof latitude === "number" && typeof longitude === "number";
};

const verifyToken = async (request: FunctionRequest): Promise<string | null> => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (err) {
    logger.warn("Token verification failed", { error: err });
    return null;
  }
};
