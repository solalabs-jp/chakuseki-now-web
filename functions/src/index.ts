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

export const studentAnswer = onRequest(async (request, response) => {
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

  try {
    // 1. 生徒IDの特定
    let studentId: string | null = null;
    const uid = await verifyToken(request);
    if (uid) {
      studentId = uid;
    } else if (body.session === DUMMY_STUDENT_SESSION) {
      studentId = "student-001";
    }

    if (!studentId) {
      response.status(401).json({
        error: "Unauthorized. Invalid or missing token/session.",
      });
      return;
    }

    const questionId = body.questionId;

    // 2. 対象質問 (checkinQuestion) の存在確認と dailySessionId の取得
    const questionDoc = await db.collection("checkinQuestion").doc(questionId).get();
    if (!questionDoc.exists) {
      response.status(404).json({
        error: "Question not found.",
      });
      return;
    }

    const questionData = questionDoc.data();
    const dailySessionId = questionData?.dailySessionId;
    if (!isNonEmptyString(dailySessionId)) {
      response.status(400).json({
        error: "Question does not have a valid dailySessionId.",
      });
      return;
    }

    // 3. 回答 (checkinAnswers) の記録
    const answerRef = db.collection("checkinAnswers").doc();
    const answerData = {
      checkinQuestionId: questionId,
      studentId: studentId,
      answerText: body.answer,
      answeredAt: FieldValue.serverTimestamp(),
    };
    await answerRef.set(answerData);

    // 4. 出席レコード (attendanceRecords) の更新または新規作成
    // dailySession に紐づく scheduleId の取得
    const sessionDoc = await db.collection("dailySessions").doc(dailySessionId).get();
    if (!sessionDoc.exists) {
      response.status(404).json({
        error: "Daily session not found.",
      });
      return;
    }
    const sessionData = sessionDoc.data();
    const scheduleId = sessionData?.scheduleId;
    if (!isNonEmptyString(scheduleId)) {
      response.status(400).json({
        error: "Daily session does not have a valid scheduleId.",
      });
      return;
    }

    // 既存の出席レコードの確認
    const attendanceQuery = await db
      .collection("attendanceRecords")
      .where("studentId", "==", studentId)
      .where("dailySessionId", "==", dailySessionId)
      .limit(1)
      .get();

    if (!attendanceQuery.empty) {
      // 既存レコードがあれば status を "出席" に更新
      const attendanceDocRef = attendanceQuery.docs[0].ref;
      await attendanceDocRef.update({
        status: "出席",
        confirmedAt: FieldValue.serverTimestamp(),
        lastDetectedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // なければ新規作成
      const newAttendance = {
        studentId: studentId,
        dailySessionId: dailySessionId,
        scheduleId: scheduleId,
        status: "出席",
        confirmedAt: FieldValue.serverTimestamp(),
        firstDetectedAt: FieldValue.serverTimestamp(),
        lastDetectedAt: FieldValue.serverTimestamp(),
      };
      await db.collection("attendanceRecords").add(newAttendance);
    }

    logger.info("Student answer and attendance registered successfully", {
      studentId,
      questionId,
      dailySessionId,
      structuredData: true,
    });

    response.status(200).json({
      message: "Answer registered and attendance marked successfully.",
      studentId,
      questionId,
      dailySessionId,
    });

  } catch (err) {
    logger.error("Error processing student answer", { error: err });
    response.status(500).json({ error: "Internal server error." });
  }
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

export const teacherQuestion = onRequest((request, response) => {
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

  logger.info("Teacher question created", {
    content: body.content,
    structuredData: true,
  });

  sendStatus(response, 200);
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
