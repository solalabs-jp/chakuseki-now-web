import {setGlobalOptions} from "firebase-functions";
import {onRequest} from "firebase-functions/https";
import {onSchedule} from "firebase-functions/scheduler";

import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import * as https from "https";
import * as http from "http";

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({maxInstances: 10});

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
  name?: unknown;
  beaconId?: unknown;
};

type DeleteUserRequestBody = {
  uid?: unknown;
};

type UpdateUserRequestBody = {
  uid?: unknown;
  email?: unknown;
  name?: unknown;
  classId?: unknown;
  beaconId?: unknown;
};

type CreateCheckinQuestionRequestBody = {
  sessionId?: unknown;
  teacherId?: unknown;
  questionText?: unknown;
  isSkippable?: unknown;
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
    response.status(400).json({error: "email and password are required."});
    return;
  }

  if (!FIREBASE_API_KEY) {
    logger.error("FIREBASE_API_KEY is not set");
    response.status(500).json({error: "Server configuration error."});
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
      logger.warn("Login failed", {
        code,
        email: body.email,
      });

      if (
        code === "EMAIL_NOT_FOUND" ||
        code === "INVALID_PASSWORD" ||
        code === "INVALID_LOGIN_CREDENTIALS"
      ) {
        response.status(401).json({error: "Invalid email or password."});
      } else {
        response.status(400).json({error: code});
      }
      return;
    }

    const idToken = signInResult.idToken as string;
    const uid = signInResult.localId as string;

    // 2. Firestore の users コレクションから uid でロールを取得
    //    uid が Firestore の doc ID と一致しない場合は email で検索
    let role: string | null = null;
    let userId: string | null = null;
    let displayName: string | null = null;
    let grade: string | null = null;
    let className: string | null = null;
    let email: string | null = null;

    // まず uid で直接引く
    const directDoc = await db.collection("users").doc(uid).get();
    if (directDoc.exists) {
      role = directDoc.data()?.role ?? null;
      userId = uid;
      displayName =
        directDoc.data()?.name ?? directDoc.data()?.displayName ?? null;
      grade = directDoc.data()?.grade ?? null;
      className = directDoc.data()?.className ?? null;
      email = directDoc.data()?.email ?? null;
    } else {
      // uid が Firestore の doc ID と一致しない場合（テストデータ等）は email で検索
      const byEmailSnapshot = await db
        .collection("users")
        .where("email", "==", body.email)
        .limit(1)
        .get();
      if (!byEmailSnapshot.empty) {
        const matchedDoc = byEmailSnapshot.docs[0];
        role = matchedDoc.data()?.role ?? null;
        userId = matchedDoc.id;
        displayName =
          matchedDoc.data()?.name ?? matchedDoc.data()?.displayName ?? null;
        grade = matchedDoc.data()?.grade ?? null;
        className = matchedDoc.data()?.className ?? null;
        email = matchedDoc.data()?.email ?? null;
      }
    }

    if (role !== "teacher") {
      logger.warn("Login rejected: not a teacher account", {uid, role});
      response.status(403).json({error: "教員アカウントのみログインできます。"});
      return;
    }

    logger.info("Login successful", {uid, role, structuredData: true});

    response.status(200).json({
      idToken,
      uid,
      userId,
      role,
      displayName,
      grade,
      className,
      email,
      expiresIn: signInResult.expiresIn as string,
    });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("authLogin error", {error: errObj});
    response.status(500).json({error: "Internal server error."});
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
      const requestPath =
        "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
        "fake-api-key";
      options = {
        hostname,
        port: portStr ? parseInt(portStr, 10) : 9099,
        path: requestPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      };
    } else {
      // 本番: https で Identity Toolkit を叩く
      requester = https;
      const requestPath =
        "/v1/accounts:signInWithPassword?key=" +
        FIREBASE_API_KEY;
      options = {
        hostname: "identitytoolkit.googleapis.com",
        path: requestPath,
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
        password: "password123  ",
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

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as RegisterRequestBody;

  if (
    !isNonEmptyString(body.email) ||
    !isNonEmptyString(body.password) ||
    !isNonEmptyString(body.role)
  ) {
    response.status(400).json({
      error: "email, password, and role are required.",
    });
    return;
  }

  // role は許可された値のみ受け付ける。任意文字列を許すと teacher
  // アカウントから admin 相当のロールを持つユーザーを作成できてしまう。
  const ALLOWED_ROLES = ["teacher", "student"];
  if (!ALLOWED_ROLES.includes(body.role)) {
    response.status(400).json({
      error: `role must be one of: ${ALLOWED_ROLES.join(", ")}.`,
    });
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
    if (isNonEmptyString(body.name)) {
      userData.name = body.name;
    }
    const normalizedBeaconId = isNonEmptyString(body.beaconId) ?
      normalizeBeaconId(body.beaconId) :
      null;
    if (normalizedBeaconId) {
      userData.beaconId = body.beaconId;
      // studentBeacon が全教員を読んでメモリ上で正規化・比較する代わりに
      // 等価クエリで絞り込めるよう、正規化済みの値も保存しておく。
      userData.normalizedBeaconId = normalizedBeaconId;
    }
    userData.email = body.email;

    // beaconId を指定した教員登録の場合、beaconClaims で他の教員と重複
    // していないか原子的に確認する。registerUser は認証済み教員なら誰でも
    // 直接POSTできる公開HTTPSエンドポイントであり、Next.js側
    // (pages/api/teachers)の予約チェックだけでは迂回されてしまうため。
    let claimedBeaconId = false;
    if (normalizedBeaconId && body.role === "teacher") {
      const claimed = await claimBeaconId(normalizedBeaconId, userRecord.uid);
      if (!claimed) {
        await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
        response.status(409).json({
          error: "このビーコンIDは既に他の教員に登録されています。",
        });
        return;
      }
      claimedBeaconId = true;
    }

    try {
      await db.collection("users").doc(userRecord.uid).set(userData);
    } catch (dbErr) {
      // Firestore 書き込み失敗時は Auth アカウントを残さない(孤立防止)。
      // 孤立すると同じメールでの再作成が常に409になり、UIから復旧できない。
      if (claimedBeaconId && normalizedBeaconId) {
        await releaseBeaconClaim(normalizedBeaconId);
      }
      await admin.auth().deleteUser(userRecord.uid).catch(() => undefined);
      throw dbErr;
    }

    logger.info("User registered successfully", {
      uid: userRecord.uid,
      role: body.role,
      structuredData: true,
    });

    response.status(201).json({
      uid: userRecord.uid,
      message: "User registered successfully.",
    });
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("Error registering user", {error: errObj});
    if (String(errObj?.code) === "auth/email-already-exists") {
      response.status(409).json({error: "Email already exists."});
    } else {
      response.status(500).json({error: "Internal server error."});
    }
  }
});

/**
 * POST /api/auth/delete-user
 * Body: { uid: string }
 * Response: { message: string }
 *
 * registerUserと対になる削除処理。Firebase Authアカウントと
 * Firestoreのusersドキュメントの両方を削除する。
 */
export const deleteUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST uid to delete the user.",
      method: "POST",
      path: "/api/auth/delete-user",
      body: {uid: "abc123"},
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as DeleteUserRequestBody;

  if (!isNonEmptyString(body.uid)) {
    response.status(400).json({error: "uid is required."});
    return;
  }

  try {
    const userSnap = await requireTeacherTarget(body.uid);
    if (!userSnap) {
      response.status(404).json({error: "Teacher not found."});
      return;
    }

    const userEmail = userSnap.data()?.email as string | undefined;

    // Authアカウントが既に存在しない場合はエラーにせず、Firestore側の
    // 削除だけ進める(整合性を取り戻す操作として許容する)。
    try {
      await admin.auth().deleteUser(body.uid);
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      if (String(errObj?.code) !== "auth/user-not-found") {
        throw err;
      }
      // Firestoreのdoc IDとAuth UIDが一致しない旧データでは、doc IDでの
      // 削除がuser-not-foundになる。emailから実UIDを解決して孤立Authアカウント
      // を残さないようにする。
      if (isNonEmptyString(userEmail)) {
        try {
          const authUser = await admin.auth().getUserByEmail(userEmail);
          await admin.auth().deleteUser(authUser.uid);
          logger.warn("deleteUser: removed orphan Auth account via email", {
            docId: body.uid,
            authUid: authUser.uid,
          });
        } catch (lookupErr: unknown) {
          const lookupErrObj = lookupErr as Record<string, unknown>;
          if (String(lookupErrObj?.code) !== "auth/user-not-found") {
            throw lookupErr;
          }
          logger.warn("deleteUser: no Auth account found for user", {
            docId: body.uid,
          });
        }
      } else {
        logger.warn("deleteUser: Auth user not found and no email to resolve", {
          docId: body.uid,
        });
      }
    }

    await db.collection("users").doc(body.uid).delete();

    // 削除した教員が beaconId を持っていた場合、beaconClaims の予約を
    // 解放する。deleteUser は認証済み教員なら誰でも直接POSTできる公開
    // HTTPSエンドポイントであり、Next.js側(pages/api/teachers)の解放
    // 処理を経由しない呼び出しだと予約が孤児として残ってしまうため、
    // ここでも解放する。
    const deletedNormalizedBeaconId = isNonEmptyString(
      userSnap.data()?.normalizedBeaconId
    ) ?
      String(userSnap.data()?.normalizedBeaconId) :
      isNonEmptyString(userSnap.data()?.beaconId) ?
        normalizeBeaconId(String(userSnap.data()?.beaconId)) :
        null;
    if (deletedNormalizedBeaconId) {
      await releaseBeaconClaim(deletedNormalizedBeaconId);
    }

    logger.info("User deleted successfully", {
      uid: body.uid,
      structuredData: true,
    });

    response.status(200).json({message: "User deleted successfully."});
  } catch (err: unknown) {
    logger.error("Error deleting user", {error: err});
    response.status(500).json({error: "Internal server error."});
  }
});

/**
 * POST /api/auth/update-user
 * Body: { uid: string, email?: string, name?: string, classId?: string,
 *         beaconId?: string }
 * Response: { message: string }
 *
 * emailが渡された場合はFirebase Authのメールも更新し、Firestoreの
 * usersドキュメントとの乖離を防ぐ。他のフィールドはFirestoreのみ更新。
 */
export const updateUser = onRequest(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      message: "POST uid and the fields to update.",
      method: "POST",
      path: "/api/auth/update-user",
      body: {uid: "abc123", email: "new@example.com", name: "山田 太郎"},
    });
    return;
  }

  if (request.method !== "POST") {
    response.set("Allow", "GET, POST, OPTIONS");
    sendStatus(response, 405);
    return;
  }

  const callerUid = await requireTeacherCaller(request, response);
  if (!callerUid) return;

  const body = (request.body ?? {}) as UpdateUserRequestBody;

  if (!isNonEmptyString(body.uid)) {
    response.status(400).json({error: "uid is required."});
    return;
  }

  if (body.email !== undefined && !isNonEmptyString(body.email)) {
    response.status(400).json({error: "email cannot be empty."});
    return;
  }

  try {
    // 操作対象が teacher であることを確認する(deleteUser と同様の理由)。
    const targetSnap = await requireTeacherTarget(body.uid);
    if (!targetSnap) {
      response.status(404).json({error: "Teacher not found."});
      return;
    }

    if (isNonEmptyString(body.email)) {
      try {
        await admin.auth().updateUser(body.uid, {email: body.email});
      } catch (authErr: unknown) {
        if (
          String((authErr as Record<string, unknown>)?.code) !==
          "auth/user-not-found"
        ) {
          throw authErr;
        }
        // doc ID と Auth UID が不一致の旧データ。Firestore に保存済みの
        // 現メールアドレスから実 UID を解決し、Auth 側も必ず更新する。
        // 解決できなければ Auth と Firestore が乖離して教員がログイン
        // 不能になるため、更新せずエラーにする。
        const currentEmail = targetSnap.data()?.email as string | undefined;
        if (!isNonEmptyString(currentEmail)) {
          throw authErr;
        }
        const authUser = await admin.auth().getUserByEmail(currentEmail);
        await admin.auth().updateUser(authUser.uid, {email: body.email});
        logger.warn("updateUser: resolved Auth UID via email for legacy doc", {
          docId: body.uid,
          authUid: authUser.uid,
        });
      }
    }

    // この教員が以前登録していた beaconId(あれば)。更新成功後、変更された
    // 場合だけ古い予約を解放する。
    const targetData = targetSnap.data() ?? {};
    const previousNormalizedBeaconId = isNonEmptyString(
      targetData.normalizedBeaconId
    ) ?
      String(targetData.normalizedBeaconId) :
      isNonEmptyString(targetData.beaconId) ?
        normalizeBeaconId(String(targetData.beaconId)) :
        null;

    let newNormalizedBeaconId: string | null = null;
    let claimedNewBeaconId = false;

    if (body.beaconId !== undefined) {
      newNormalizedBeaconId = isNonEmptyString(body.beaconId) ?
        normalizeBeaconId(String(body.beaconId)) :
        null;

      if (
        newNormalizedBeaconId &&
        newNormalizedBeaconId !== previousNormalizedBeaconId
      ) {
        // updateUser は認証済み教員なら誰でも直接POSTできる公開HTTPS
        // エンドポイントであり、Next.js側(pages/api/teachers)の予約
        // チェックだけでは迂回されてしまうため、ここでも beaconClaims
        // による重複防止(1ビーコン=1教員)を保証する。
        const claimed = await claimBeaconId(newNormalizedBeaconId, body.uid);
        if (!claimed) {
          response.status(409).json({
            error: "このビーコンIDは既に他の教員に登録されています。",
          });
          return;
        }
        claimedNewBeaconId = true;
      }
    }

    const update: Record<string, unknown> = {};
    if (isNonEmptyString(body.email)) update.email = body.email;
    if (body.name !== undefined) update.name = body.name;
    if (body.classId !== undefined) update.classId = body.classId;
    if (body.beaconId !== undefined) {
      update.beaconId = body.beaconId;
      update.normalizedBeaconId = newNormalizedBeaconId ?? FieldValue.delete();
    }

    if (Object.keys(update).length > 0) {
      try {
        await db.collection("users").doc(body.uid).set(update, {merge: true});
      } catch (updateErr) {
        if (claimedNewBeaconId && newNormalizedBeaconId) {
          await releaseBeaconClaim(newNormalizedBeaconId);
        }
        throw updateErr;
      }
    }

    // 旧 beaconId の予約は更新成功後に解放する(失敗時に巻き戻せるよう順序を保つ)。
    if (
      body.beaconId !== undefined &&
      previousNormalizedBeaconId &&
      previousNormalizedBeaconId !== newNormalizedBeaconId
    ) {
      await releaseBeaconClaim(previousNormalizedBeaconId);
    }

    logger.info("User updated successfully", {
      uid: body.uid,
      structuredData: true,
    });

    response.status(200).json({message: "User updated successfully."});
  } catch (err: unknown) {
    const errObj = err as Record<string, unknown>;
    logger.error("Error updating user", {error: errObj});
    if (String(errObj?.code) === "auth/email-already-exists") {
      response.status(409).json({error: "Email already exists."});
    } else if (String(errObj?.code) === "auth/user-not-found") {
      response.status(404).json({error: "User not found."});
    } else {
      response.status(500).json({error: "Internal server error."});
    }
  }
});

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


// ─── Student endpoints ───────────────────────────────────────────────────────

/**
 * Formats a BLE beacon ID as a standard UUID (8-4-4-4-12), so "01a2-B3.." /
 * "01A2b3.." normalize to the same value before comparison.
 *
 * Keep this in sync with formatBeaconId in lib/beaconId.ts (Next.js side) —
 * they can't share code directly since functions/ and the web app are
 * separate packages, but both must agree on what counts as an equivalent
 * beacon ID or matching breaks again.
 * @param {string} value Raw beacon ID (any case, with or without dashes).
 * @return {string} The normalized 8-4-4-4-12 hex UUID.
 */
function normalizeBeaconId(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, "").slice(0, 32).toUpperCase();
  const groups = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].filter(Boolean);
  return groups.join("-");
}

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
 * beaconClaims/{normalizedBeaconId} の予約を解放する(pages/api/teachers 側の
 * lib/beaconClaims.ts と同じ考え方)。既に無くても呼び出し元は失敗させない。
 * @param {string} normalizedBeaconId 解放する予約の doc ID(正規化済み beaconId)。
 * @return {Promise<void>} 完了を表す Promise。
 */
async function releaseBeaconClaim(normalizedBeaconId: string): Promise<void> {
  try {
    await db.collection("beaconClaims").doc(normalizedBeaconId).delete();
  } catch (error) {
    logger.error("releaseBeaconClaim failed", {normalizedBeaconId, error});
  }
}

/**
 * beaconClaims/{normalizedBeaconId} を teacherId 用に予約する(pages/api/teachers
 * 側の lib/beaconClaims.ts と同じ考え方)。.create() は既存なら失敗するため、
 * query してから write する非アトミックな実装が引き起こす TOCTOU レース
 * (ほぼ同時の2リクエストが両方「重複なし」と判定してしまう)を避けられる。
 *
 * registerUser/updateUser/teacherRegisterBeacon はいずれも、認証済み教員の
 * IDトークンさえあれば直接POSTできる公開HTTPSエンドポイントであり、
 * Next.js側(pages/api/teachers)の予約チェックはこの関数自体を保護しない
 * ため、ここでも同じ不変条件(1ビーコン=1教員)を保証する必要がある。
 * @param {string} normalizedBeaconId 予約する doc ID(正規化済み beaconId)。
 * @param {string} teacherId 予約者の uid。
 * @return {Promise<boolean>} 予約できた(既に自分の予約だった場合を含む)か。
 */
async function claimBeaconId(
  normalizedBeaconId: string,
  teacherId: string
): Promise<boolean> {
  const claimRef = db.collection("beaconClaims").doc(normalizedBeaconId);
  try {
    await claimRef.create({
      teacherId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (createErr) {
    // 既に予約が存在する。所有者が自分自身なら重複ではない。
    const existingClaim = await claimRef.get();
    const owner = existingClaim.exists ?
      existingClaim.data()?.teacherId :
      undefined;
    if (owner !== teacherId) {
      return false;
    }
  }

  // beaconClaims 導入前に登録された beaconId とも衝突していないか確認する。
  const legacySnapshot = await db
    .collection("users")
    .where("role", "==", "teacher")
    .where("normalizedBeaconId", "==", normalizedBeaconId)
    .get();
  const legacyConflict = legacySnapshot.docs.some(
    (doc) => doc.id !== teacherId
  );
  if (legacyConflict) {
    await releaseBeaconClaim(normalizedBeaconId);
    return false;
  }

  return true;
}

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

    // この教員が以前登録していた beaconId(あれば)。更新成功後、変更された
    // 場合だけ古い予約を解放する。
    const previousNormalizedBeaconId = isNonEmptyString(
      targetDocData.normalizedBeaconId
    ) ?
      String(targetDocData.normalizedBeaconId) :
      isNonEmptyString(targetDocData.beaconId) ?
        normalizeBeaconId(String(targetDocData.beaconId)) :
        null;

    let claimedNewBeaconId = false;

    if (normalizedBeaconId !== previousNormalizedBeaconId) {
      // 他の教員が既に同じ(正規化後の)beaconIdを登録していないかを
      // beaconClaims の原子的な予約で確認する(自分自身は除外)。
      // studentBeacon 側は .where("normalizedBeaconId", "==", ...).limit(1)
      // で「beaconId は教員間で一意」という前提に依存しており、重複登録を
      // 許すとスキャンがどちらか一方の教員にしかマッチせず出席・授業記録が
      // 誤帰属する。
      const claimed = await claimBeaconId(normalizedBeaconId, targetDocId);
      if (!claimed) {
        response.status(409).json({
          error: "このビーコンIDは既に他の教員に登録されています。",
        });
        return;
      }

      claimedNewBeaconId = true;
    }

    // beaconId (および session) を更新
    try {
      await targetDocRef.update({
        session: session,
        beaconId: beaconId,
        normalizedBeaconId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (updateErr) {
      if (claimedNewBeaconId) {
        await releaseBeaconClaim(normalizedBeaconId);
      }
      throw updateErr;
    }

    // 旧 beaconId の予約は更新成功後に解放する(失敗時に巻き戻せるよう順序を保つ)。
    if (
      previousNormalizedBeaconId &&
      previousNormalizedBeaconId !== normalizedBeaconId
    ) {
      await releaseBeaconClaim(previousNormalizedBeaconId);
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

  return (
    typeof latitude === "number" &&
    typeof longitude === "number"
  );
};

const verifyToken = async (
  request: FunctionRequest
): Promise<string | null> => {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (err) {
    const errObj = err as Record<string, unknown>;
    logger.warn(
      "Token verification failed",
      {error: errObj}
    );
    return null;
  }
};

/*
 * registerUser/updateUser/deleteUserの保護用。これらはCloud FunctionsのURLに
 * 直接POSTすれば誰でも呼べてしまうため、ラッパーのNext.js API(requireTeacher)
 * とは別に、この関数自体でも呼び出し元がteacherロールでログイン済みかを検証する。
 */
const requireTeacherCaller = async (
  request: FunctionRequest,
  response: FunctionResponse
): Promise<string | null> => {
  const callerUid = await verifyToken(request);
  if (!callerUid) {
    response.status(401).json({error: "Authentication required."});
    return null;
  }

  let callerDoc = await db.collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    // uidがFirestoreのドキュメントIDと一致しない場合(シードデータ等)は
    // emailで検索する。Next.js側のrequireTeacherと同じフォールバック。
    try {
      const authUser = await admin.auth().getUser(callerUid);
      if (authUser.email) {
        const byEmail = await db
          .collection("users")
          .where("email", "==", authUser.email)
          .limit(1)
          .get();
        if (!byEmail.empty) {
          callerDoc = byEmail.docs[0];
        }
      }
    } catch (err) {
      logger.warn("requireTeacherCaller: email fallback failed", {error: err});
    }
  }

  if (!callerDoc.exists || callerDoc.data()?.role !== "teacher") {
    response.status(403).json({error: "Teacher role required."});
    return null;
  }

  return callerUid;
};

/*
 * deleteUser/updateUser の保護用。呼び出し元が teacher であることに加え、
 * 「操作対象」も teacher であることを確認する。これが無いと、teacher
 * トークンを持つ誰でも任意ユーザー(生徒・他教員・管理者)を削除・改変
 * できてしまう。
 */
const requireTeacherTarget = async (
  uid: string
): Promise<FirebaseFirestore.DocumentSnapshot | null> => {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data()?.role !== "teacher") return null;
  return snap;
};
