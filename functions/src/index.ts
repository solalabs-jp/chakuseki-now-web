import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
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
  scheduleId?: unknown;
};

type LoginRequestBody = {
  email?: unknown;
  password?: unknown;
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

const timetableData = [
  {
    day: "Monday",
    class: [
      {
        period: "1",
        subjectName: "ITマネジメント",
        teacherName: "Kota Nemoto",
        location: "101",
      },
      {
        period: "2",
        subjectName: "Webアプリ開発",
        teacherName: "Ayaka Sato",
        location: "204",
      },
    ],
  },
  {
    day: "Tuesday",
    class: [
      {
        period: "1",
        subjectName: "データベース",
        teacherName: "Kota Nemoto",
        location: "302",
      },
    ],
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

export const studentTimetable = onRequest((request, response) => {
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
      message: "Add session query to get timetable.",
      method: "GET",
      path: "/api/student/timetable",
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

  response.status(200).json(timetableData);
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

export const teacherScheduleTeacher = onRequest((request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "PATCH a schedule teacher.",
      method: "PATCH",
      path: "/api/teacher/schedule-teacher",
      body: {
        session: DUMMY_TEACHER_SESSION,
        newTeacherId: "teacher-002",
        scheduleId: "schedule-001",
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
    !isNonEmptyString(body.scheduleId)
  ) {
    sendStatus(response, 400);
    return;
  }

  if (body.session !== DUMMY_TEACHER_SESSION) {
    sendStatus(response, 401);
    return;
  }

  logger.info("Schedule teacher updated", {
    newTeacherId: body.newTeacherId,
    scheduleId: body.scheduleId,
    structuredData: true,
  });

  sendStatus(response, 200);
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
