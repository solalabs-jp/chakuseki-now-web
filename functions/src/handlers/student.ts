import {onRequest} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {FieldValue} from "firebase-admin/firestore";
import {db} from "../lib/firebase";
import {
  sendStatus,
  setCorsHeaders,
  isNonEmptyString,
  isLocation,
  getSession,
} from "../lib/http";
import {verifyToken} from "../lib/auth";
import {normalizeBeaconId} from "../lib/beaconClaims";

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

const DUMMY_STUDENT_SESSION = "dummy-session-student-001";

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

// ─── Student endpoints ───────────────────────────────────────────────────────

export const studentBeacon = onRequest(async (request, response) => {
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

  const scannedBeaconId = body.beaconId;
  const normalizedScanned = normalizeBeaconId(scannedBeaconId);

  try {
    // 正規化済みの normalizedBeaconId で絞り込む(等価クエリ、O(1)読み取り)。
    // registerUser/updateUser/teacherRegisterBeacon は書き込み時に必ず
    // normalizedBeaconId も保存するが、それ以前に作成された教員ドキュメント
    // にはこのフィールドが無い場合があるため、ヒットしなければ従来どおり
    // 全件取得してメモリ上で正規化・比較するフォールバックを行う。
    const indexedSnapshot = await db
      .collection("users")
      .where("role", "==", "teacher")
      .where("normalizedBeaconId", "==", normalizedScanned)
      .limit(1)
      .get();

    let matchedTeacher: FirebaseFirestore.QueryDocumentSnapshot | undefined =
      indexedSnapshot.docs[0];

    if (!matchedTeacher) {
      const teachersSnapshot = await db
        .collection("users")
        .where("role", "==", "teacher")
        .get();

      matchedTeacher = teachersSnapshot.docs.find((doc) => {
        const beaconId = doc.data().beaconId;
        return (
          isNonEmptyString(beaconId) &&
          normalizeBeaconId(beaconId) === normalizedScanned
        );
      });
    }

    if (!matchedTeacher) {
      logger.warn("Student beacon: no matching teacher", {
        beaconId: scannedBeaconId,
      });
      // 未設定の部屋などビーコンが未登録でも、生徒クライアントとの
      // 互換性のため200を返し、本文でmatched:falseを示す。
      response.status(200).json({
        matched: false,
        message: "このビーコンIDに対応する先生が見つかりません。",
      });
      return;
    }

    const teacherName =
      matchedTeacher.data().name ?? matchedTeacher.data().displayName ?? "";

    await db.collection("beaconScans").add({
      beaconId: scannedBeaconId,
      teacherId: matchedTeacher.id,
      teacherName,
      location: body.location,
      scannedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Student beacon received and matched", {
      beaconId: scannedBeaconId,
      teacherId: matchedTeacher.id,
      structuredData: true,
    });

    response.status(200).json({
      matched: true,
      message: "Beacon received.",
      teacherId: matchedTeacher.id,
      teacherName,
    });
  } catch (err) {
    logger.error("Error processing student beacon", {error: err});
    // 内部エラー時も生徒クライアント互換のため200を返す(未マッチ時に200へ
    // 戻した修正と同じ理由)。記録漏れは次回ポーリングで回復する。
    response.status(200).json({
      matched: false,
      message: "Beacon received.",
    });
  }
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
      message:
        "Add Authorization header (Bearer token) to get timetable.",
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
    response.status(401).json({
      error: "Unauthorized. Invalid or missing token.",
    });
    return;
  }

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      response.status(404).json({error: "User not found."});
      return;
    }

    const userData = userDoc.data();
    const classId = userData?.classId;

    if (!classId) {
      response.status(404).json({error: "User does not belong to any class."});
      return;
    }

    const timetablesRef = db
      .collection("timetables")
      .where("classId", "==", classId);
    const timetablesSnapshot = await timetablesRef.get();

    if (timetablesSnapshot.empty) {
      response.status(200).json([]);
      return;
    }

    const timetables = timetablesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        subjectName: data.subjectName,
        period: data.period,
        dayOfWeek: data.dayOfWeek,
      };
    });

    response.status(200).json(timetables);
  } catch (err) {
    const errObj = err as Record<string, unknown>;
    logger.error("Error fetching timetable", {error: errObj});
    response.status(500).json({error: "Internal server error."});
  }
});
